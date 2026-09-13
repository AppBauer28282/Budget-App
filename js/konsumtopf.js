/* =============================================================================
   KONSUMTOPF
   Eigenständiges Planungswerkzeug hinter dem Geldsack-Symbol rechts oben.
   Verwaltet mehrere Jahre: je Jahr ein Startguthaben und zwölf Monate mit
   Zufluss und geplanten Ausgabenposten. Der Rest eines Monats wandert als
   Übertrag in den Folgemonat, der Endstand eines Jahres lässt sich als
   Startguthaben ins Folgejahr übernehmen. Dazu eine Beleg-Ansicht über alle
   Posten eines Jahres und eine davon unabhängige Bucket-List.

   Bewusst getrennt vom Budget: eigener Speicherschlüssel, keine Berührung
   mit allData. Wie beim Gehaltsrechner holt sich das Modul alle Elemente
   selbst (statt über dom.js) und startet nur, wenn wirklich alle da sind —
   so kann eine ältere, zwischengespeicherte Datei die App nicht lahmlegen.

   KEINE Vorbelegung mit echten Daten im Quelltext: Dieses Repository ist
   öffentlich einsehbar. Der Konsumtopf startet immer leer; die eigene
   Jahresplanung kommt über den Cloud-Abgleich oder über "Import".

   Alle IDs sind mit "kt-" vorangestellt, damit sie nicht mit der Budget-
   Oberfläche kollidieren. Aufbau der Listen über die DOM-API statt über
   innerHTML, wie überall sonst in dieser App.
   ============================================================================= */
import { openOverlay, closeOverlay } from './overlays.js?v=24';

const STORE_KEY = 'konsumtopf.v3';
const STORE_VERSION = 2;

const MON = ['Januar','Februar','März','April','Mai','Juni','Juli',
             'August','September','Oktober','November','Dezember'];

// Obergrenzen: fangen unsinnige Eingaben und aufgeblähte Importdateien ab,
// bevor sie den Speicher oder die Darstellung sprengen.
const MAX_TEXT = 80;
const MAX_POSTEN = 200;          // je Monat
const MAX_BUCKET = 200;
const MAX_JAHRE = 20;
const MAX_BETRAG = 1000000;      // 1.000.000 € je Einzelposten
const MIN_JAHR = 1900;
const MAX_JAHR = 2200;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/* ---------- Elemente ---------- */
const $ = (id) => document.getElementById(id);

const ktBtn          = $('konsum-btn');
const ktOverlay      = $('konsum-overlay');
const ktClose        = $('konsum-close');
const ktWarn         = $('kt-warn');
const ktJahr         = $('kt-jahr');
const ktStart        = $('kt-start');
const ktVorjahrText  = $('kt-vorjahr-text');
const ktUebernehmen  = $('kt-uebernehmen');
const ktTopfPlan     = $('kt-topf-plan');
const ktSumZu        = $('kt-sum-zu');
const ktSumAus       = $('kt-sum-aus');
const ktMonate       = $('kt-monate');
const ktBelegBtn     = $('kt-beleg-btn');
const ktBelegCard    = $('kt-beleg-card');
const ktBelegListe   = $('kt-beleg-liste');
const ktBelegSum     = $('kt-beleg-sum');
const ktBucket       = $('kt-bucket');
const ktBlName       = $('kt-bl-name');
const ktBlKosten     = $('kt-bl-kosten');
const ktBlAdd        = $('kt-bl-add');
const ktBlSum        = $('kt-bl-sum');
const ktExport       = $('kt-export');
const ktImport       = $('kt-import');
const ktFile         = $('kt-file');

/* ---------- Hilfsfunktionen ---------- */
// Nimmt deutsche Eingaben entgegen: Punkt als Tausender-, Komma als
// Dezimaltrennzeichen. Ungültiges wird zu 0, damit nie NaN weitergereicht wird.
function num(v){
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  if(v === null || v === undefined) return 0;
  const s = String(v).slice(0, 32)
    .replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function klemme(v){
  const n = num(v);
  if(n > MAX_BETRAG) return MAX_BETRAG;
  if(n < -MAX_BETRAG) return -MAX_BETRAG;
  return n;
}
function eur(n){
  const v = Math.round(n);
  return (v === 0 ? 0 : v).toLocaleString('de-DE') + ' €';
}
function newId(){
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function elem(tag, className, text){
  const el = document.createElement(tag);
  if(className) el.className = className;
  if(text !== undefined && text !== null) el.textContent = text;
  return el;
}

/* ---------- Zustand ----------
   WICHTIG: kein Feld "data" auf oberster Ebene. js/cloud-sync.js erkennt an
   "raw.data && typeof raw.data === 'object'", ob ein Firestore-Dokument im
   neuen Umschlagformat vorliegt — ein gleichnamiges Feld hier würde diese
   Erkennung in die Irre führen. */
function leeresJahr(){
  const monate = [];
  for(let i = 0; i < 12; i++) monate.push({ zufluss: 0, posten: [] });
  return { start: 0, monate };
}
function leererStand(){
  const jetzt = new Date().getFullYear();
  const jahre = {};
  jahre[String(jetzt)] = leeresJahr();
  return { version: STORE_VERSION, aktiv: jetzt, jahre, bucket: [] };
}

let state = leererStand();
let aktiv = state.aktiv;
let offen = {};          // aufgeklappte Monate
// Halb getippte Eingaben der "neue Ausgabe"-Zeile je Monat. Die Monatsliste
// wird bei jeder Änderung neu aufgebaut — ohne diesen Zwischenspeicher wäre
// eine angefangene Eingabe danach weg.
let entwurf = {};
let blEditId = null;     // Bucket-Eintrag, der gerade den Ist-Betrag abfragt
let storageOk = true;

/* Alles, was hereinkommt, wird geprüft und begrenzt — beschädigte oder
   manipulierte Daten dürfen die Oberfläche nicht durcheinanderbringen.
   Gilt für den lokalen Speicher, den Stand aus der Cloud und Importdateien
   gleichermaßen, deshalb steckt die Prüfung in einer eigenen Funktion.
   Rückgabe: true, wenn die Daten verwertbar waren. */
function applyData(d){
  if(!d || typeof d !== 'object' || !d.jahre || typeof d.jahre !== 'object'){
    return false;
  }
  const sauber = { version: STORE_VERSION, aktiv: new Date().getFullYear(), jahre: {}, bucket: [] };
  try{
    const schluessel = Object.keys(d.jahre)
      .filter(k => /^\d{4}$/.test(k) && Number(k) >= MIN_JAHR && Number(k) <= MAX_JAHR)
      .sort((a, b) => Number(a) - Number(b))
      .slice(-MAX_JAHRE);          // bei Überlänge die neuesten Jahre behalten

    schluessel.forEach(k => {
      const roh = d.jahre[k] || {};
      const jahr = leeresJahr();
      jahr.start = klemme(roh.start);
      const monate = Array.isArray(roh.monate) ? roh.monate : [];
      for(let i = 0; i < 12; i++){
        const m = monate[i] || {};
        jahr.monate[i].zufluss = klemme(m.zufluss);
        jahr.monate[i].posten = Array.isArray(m.posten)
          ? m.posten.slice(0, MAX_POSTEN).map(p => ({
              id: String((p && p.id) || newId()).slice(0, 24),
              name: String((p && p.name) || '').slice(0, MAX_TEXT),
              betrag: klemme(p && p.betrag)
            }))
          : [];
      }
      sauber.jahre[k] = jahr;
    });

    if(Array.isArray(d.bucket)){
      sauber.bucket = d.bucket.slice(0, MAX_BUCKET).map(b => {
        b = b || {};
        const erledigt = b.erledigt === true;
        return {
          id: String(b.id || newId()).slice(0, 24),
          titel: String(b.titel || '').slice(0, MAX_TEXT),
          kosten: klemme(b.kosten),
          erledigt,
          ist: erledigt ? klemme(b.ist) : null
        };
      });
    }

    const gewuenscht = parseInt(d.aktiv, 10);
    sauber.aktiv = (isFinite(gewuenscht) && gewuenscht >= MIN_JAHR && gewuenscht <= MAX_JAHR)
      ? gewuenscht
      : new Date().getFullYear();
    if(!sauber.jahre[String(sauber.aktiv)]) sauber.jahre[String(sauber.aktiv)] = leeresJahr();

    state = sauber;
    aktiv = sauber.aktiv;
    return true;
  }catch(e){
    return false;                  // beschädigte Daten: bisherigen Stand behalten
  }
}

function J(){
  const k = String(aktiv);
  if(!state.jahre[k]) state.jahre[k] = leeresJahr();
  return state.jahre[k];
}

/* ---------- Speichern ---------- */
function zeigeWarnung(){
  if(storageOk){ ktWarn.hidden = true; return; }
  ktWarn.hidden = false;
  if(ktWarn.childNodes.length) return;
  ktWarn.appendChild(elem('div', 'kt-warn',
    'Speichern im Browser nicht möglich (privater Modus oder blockierte '
    + 'Website-Daten). Änderungen gelten nur für diese Sitzung — bitte über '
    + '"Export" sichern.'));
}

// Gebündelt wie im Budget: beim Tippen feuert 'input' dutzendfach, ohne
// Bündelung würde jedes Mal der ganze Zustand serialisiert.
let saveTimer = null;

function writeNow(){
  state.aktiv = aktiv;
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    storageOk = true;
  }catch(e){
    storageOk = false;
    zeigeWarnung();
    return false;
  }
  // Cloud-Sync: außerhalb dieses Moduls gesetzter Hook, sobald eingeloggt
  // (siehe js/cloud-sync.js). Lokales Speichern bleibt davon unberührt und
  // läuft immer sofort, unabhängig vom Internetzugang — genau wie beim
  // Budget selbst.
  if(typeof window.__onKonsumtopfLocalSave === 'function'){
    try{ window.__onKonsumtopfLocalSave(state); }catch(e){ /* nächste Änderung versucht es erneut */ }
  }
  return true;
}
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 250);
}
// Sicherheitsnetz beim Verlassen/Ausblenden der Seite.
function flush(){
  if(saveTimer !== null){
    clearTimeout(saveTimer);
    saveTimer = null;
    writeNow();
  }
}

function load(){
  let roh = null;
  try{
    roh = localStorage.getItem(STORE_KEY);
  }catch(e){
    storageOk = false;
    return;
  }
  if(!roh) return;
  try{
    applyData(JSON.parse(roh));
  }catch(e){ /* beschädigte Daten ignorieren, leerer Stand bleibt */ }
}

/* ---------- Berechnung ---------- */
function berechneFuer(jahr){
  const j = state.jahre[String(jahr)];
  const out = [];
  let uebertrag = j ? j.start : 0;
  for(let i = 0; i < 12; i++){
    const m = (j && j.monate[i]) ? j.monate[i] : { zufluss: 0, posten: [] };
    let aus = 0;
    m.posten.forEach(p => { aus += p.betrag; });
    const rest = uebertrag + m.zufluss - aus;
    out.push({ i, ue: uebertrag, zu: m.zufluss, aus, rest });
    uebertrag = rest;
  }
  return out;
}
function berechne(){ return berechneFuer(aktiv); }

/* Zwei-Klick-Löschen: kein nativer Dialog, der erste Klick schärft nur. */
function armDelete(btn, fn){
  if(btn.dataset.armed){ fn(); return; }
  btn.dataset.armed = '1';
  btn.classList.add('arm');
  btn.textContent = 'Löschen?';
  setTimeout(() => {
    if(!btn.isConnected) return;
    delete btn.dataset.armed;
    btn.classList.remove('arm');
    btn.textContent = '✕';
  }, 3000);
}

/* ---------- Anzeige ---------- */
function renderKopf(){
  const jetzt = new Date().getFullYear();
  const menge = {};
  Object.keys(state.jahre).forEach(k => { menge[Number(k)] = true; });
  for(let a = jetzt - 3; a <= jetzt + 3; a++) menge[a] = true;
  menge[aktiv] = true;

  const frag = document.createDocumentFragment();
  Object.keys(menge).map(Number).sort((a, b) => a - b).forEach(j => {
    const opt = elem('option', null, String(j));
    opt.value = String(j);
    if(j === aktiv) opt.selected = true;
    frag.appendChild(opt);
  });
  ktJahr.replaceChildren(frag);

  ktStart.value = J().start ? String(Math.round(J().start)) : '';

  if(state.jahre[String(aktiv - 1)]){
    const rest = berechneFuer(aktiv - 1)[11].rest;
    ktVorjahrText.textContent = 'Endstand ' + (aktiv - 1) + ' (geplant): ' + eur(rest) + ' · ';
    ktUebernehmen.hidden = false;
  } else {
    ktVorjahrText.textContent = 'Kein Vorjahr vorhanden – Startguthaben manuell eintragen.';
    ktUebernehmen.hidden = true;
  }
}

function renderTopf(){
  const c = berechne();
  let zu = 0, aus = 0;
  J().monate.forEach(m => {
    zu += m.zufluss;
    m.posten.forEach(p => { aus += p.betrag; });
  });
  ktTopfPlan.textContent = eur(c[11].rest);
  ktSumZu.textContent = eur(zu);
  ktSumAus.textContent = eur(aus);
}

function summenZeile(label, wert, klasse){
  const row = elem('div', klasse ? 'kt-sum ' + klasse : 'kt-sum');
  row.appendChild(elem('span', null, label));
  row.appendChild(elem('b', null, wert));
  return row;
}

function renderMonate(){
  const c = berechne();
  const j = J();
  const frag = document.createDocumentFragment();

  // Der Neuaufbau ersetzt auch das Feld, in dem gerade getippt wird. Fokus
  // und Cursorposition werden deshalb gemerkt und unten wiederhergestellt.
  const aktivesEl = document.activeElement;
  const fokusId = (aktivesEl && ktMonate.contains(aktivesEl)) ? aktivesEl.id : null;
  let cursorVon = null, cursorBis = null;
  if(fokusId){
    try{ cursorVon = aktivesEl.selectionStart; cursorBis = aktivesEl.selectionEnd; }catch(e){ /* kein Textfeld */ }
  }

  c.forEach(x => {
    const m = j.monate[x.i];
    const card = elem('div', 'kt-card');

    // --- Kopfzeile (klappt den Monat auf/zu) ---
    const head = elem('div', 'kt-mhead');
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    head.setAttribute('aria-expanded', offen[x.i] ? 'true' : 'false');

    const name = elem('div', 'kt-mname', MON[x.i]);
    name.appendChild(elem('small', null,
      'Übertrag ' + eur(x.ue) + ' · Zufluss ' + eur(x.zu)));
    head.appendChild(name);
    head.appendChild(elem('div', 'kt-badge' + (x.rest < 0 ? ' neg' : ''), eur(x.rest)));

    const umschalten = () => { offen[x.i] = !offen[x.i]; renderMonate(); };
    head.addEventListener('click', umschalten);
    head.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); umschalten(); }
    });
    card.appendChild(head);

    // --- Rumpf ---
    const body = elem('div', 'kt-mbody' + (offen[x.i] ? ' open' : ''));

    if(offen[x.i]){
      const zuFeld = elem('div');
      const zuLabel = elem('label', null, 'Zufluss in den Topf');
      const zuId = 'kt-zufluss-' + x.i;
      zuLabel.setAttribute('for', zuId);
      zuFeld.appendChild(zuLabel);
      const zi = document.createElement('input');
      zi.type = 'text';
      zi.id = zuId;
      zi.inputMode = 'decimal';
      zi.maxLength = 12;
      zi.autocomplete = 'off';
      zi.placeholder = '0';
      zi.value = m.zufluss ? String(Math.round(m.zufluss)) : '';
      // Schon beim Tippen übernehmen, nicht erst beim Verlassen des Feldes —
      // sonst ginge eine Eingabe verloren, die nie den Fokus abgibt. Der
      // Neuaufbau der Liste ist dank Fokus-Rettung oben unkritisch.
      zi.addEventListener('input', () => {
        m.zufluss = klemme(zi.value);
        save();
        renderAbgeleitet();
      });
      zuFeld.appendChild(zi);
      body.appendChild(zuFeld);

      const liste = elem('div', 'kt-posten-liste');
      m.posten.forEach(p => {
        const row = elem('div', 'kt-posten');
        row.appendChild(elem('div', 'kt-nm', p.name));
        row.appendChild(elem('div', 'kt-bt', eur(p.betrag)));
        const del = elem('button', 'kt-del', '✕');
        del.type = 'button';
        del.setAttribute('aria-label', 'Posten "' + p.name + '" löschen');
        del.addEventListener('click', () => armDelete(del, () => {
          m.posten = m.posten.filter(q => q.id !== p.id);
          save();
          render();
        }));
        row.appendChild(del);
        liste.appendChild(row);
      });
      body.appendChild(liste);

      // --- Neuer Posten ---
      const add = elem('div', 'kt-add');
      const skizze = entwurf[x.i] || { name: '', betrag: '' };
      const an = document.createElement('input');
      an.type = 'text';
      an.id = 'kt-add-name-' + x.i;
      an.className = 'kt-n';
      an.maxLength = MAX_TEXT;
      an.autocomplete = 'off';
      an.placeholder = 'Ausgabe';
      an.value = skizze.name;
      an.setAttribute('aria-label', 'Bezeichnung der Ausgabe');
      const ab = document.createElement('input');
      ab.type = 'text';
      ab.id = 'kt-add-betrag-' + x.i;
      ab.className = 'kt-b';
      ab.inputMode = 'decimal';
      ab.maxLength = 12;
      ab.autocomplete = 'off';
      ab.placeholder = '€';
      ab.value = skizze.betrag;
      ab.setAttribute('aria-label', 'Betrag der Ausgabe');
      an.addEventListener('input', () => {
        entwurf[x.i] = { name: an.value, betrag: ab.value };
      });
      ab.addEventListener('input', () => {
        entwurf[x.i] = { name: an.value, betrag: ab.value };
      });
      const addBtn = elem('button', 'kt-pri', '+');
      addBtn.type = 'button';
      addBtn.setAttribute('aria-label', 'Ausgabe hinzufügen');

      function postenAnlegen(){
        const n = an.value.trim();
        const b = klemme(ab.value);
        if(!n && !b) return;
        if(m.posten.length >= MAX_POSTEN) return;
        m.posten.push({ id: newId(), name: (n || 'Ausgabe').slice(0, MAX_TEXT), betrag: b });
        delete entwurf[x.i];
        offen[x.i] = true;
        save();
        render();
      }
      addBtn.addEventListener('click', postenAnlegen);
      [an, ab].forEach(node => {
        node.addEventListener('keydown', (e) => {
          if(e.key === 'Enter'){ e.preventDefault(); postenAnlegen(); }
        });
      });
      add.appendChild(an);
      add.appendChild(ab);
      add.appendChild(addBtn);
      body.appendChild(add);

      // --- Monatsrechnung ---
      const s = elem('div', 'kt-msum');
      s.appendChild(summenZeile('Übertrag Vormonat', eur(x.ue)));
      s.appendChild(summenZeile('+ Zufluss', eur(x.zu)));
      s.appendChild(summenZeile('− Ausgaben', eur(x.aus)));
      s.appendChild(summenZeile('Rest → Folgemonat', eur(x.rest), 'tot'));
      body.appendChild(s);
    }

    card.appendChild(body);
    frag.appendChild(card);
  });

  ktMonate.replaceChildren(frag);

  if(fokusId){
    const wieder = document.getElementById(fokusId);
    if(wieder){
      wieder.focus();
      if(cursorVon !== null){
        try{ wieder.setSelectionRange(cursorVon, cursorBis); }catch(e){ /* kein Textfeld */ }
      }
    }
  }
}

function renderBeleg(){
  const j = J();
  const frag = document.createDocumentFragment();
  let summe = 0;

  j.monate.forEach((m, i) => {
    m.posten.forEach(p => {
      summe += p.betrag;
      const row = elem('div', 'kt-posten');
      const nm = elem('div', 'kt-nm');
      // Monatsnummer als eigenes Element, der Name als reiner Text —
      // selbst eingegebene Bezeichnungen dürfen kein Markup erzeugen.
      nm.appendChild(elem('span', 'kt-idx', '[' + String(i + 1).padStart(2, '0') + ']'));
      nm.appendChild(document.createTextNode(' ' + p.name));
      row.appendChild(nm);
      row.appendChild(elem('div', 'kt-bt', eur(p.betrag)));
      frag.appendChild(row);
    });
  });

  if(!frag.childNodes.length){
    frag.appendChild(elem('div', 'kt-hint', 'Keine Ausgaben erfasst.'));
  }
  ktBelegListe.replaceChildren(frag);
  ktBelegSum.textContent = eur(summe);
}

function renderBucket(){
  const frag = document.createDocumentFragment();
  let offenSumme = 0;

  state.bucket.forEach(b => {
    if(!b.erledigt) offenSumme += b.kosten || 0;

    const row = elem('div', 'kt-bl-row' + (b.erledigt ? ' done' : ''));

    const check = elem('button', 'kt-chk' + (b.erledigt ? ' on' : ''), '✓');
    check.type = 'button';
    check.setAttribute('aria-pressed', b.erledigt ? 'true' : 'false');
    check.setAttribute('aria-label', b.erledigt
      ? '"' + b.titel + '" wieder offen'
      : '"' + b.titel + '" als erledigt eintragen');
    check.addEventListener('click', () => {
      if(b.erledigt){
        b.erledigt = false;
        b.ist = null;
        save();
        render();
      } else {
        blEditId = b.id;
        render();
      }
    });
    row.appendChild(check);
    row.appendChild(elem('div', 'kt-t', b.titel));

    const betrag = elem('div', 'kt-bt');
    if(b.erledigt){
      if(b.kosten) betrag.appendChild(elem('span', 'kt-plan strike', eur(b.kosten)));
      betrag.appendChild(elem('span', 'kt-ist', eur(b.ist || 0)));
    } else if(b.kosten){
      betrag.textContent = eur(b.kosten);
    }
    row.appendChild(betrag);

    const del = elem('button', 'kt-del', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', '"' + b.titel + '" löschen');
    del.addEventListener('click', () => armDelete(del, () => {
      state.bucket = state.bucket.filter(q => q.id !== b.id);
      if(blEditId === b.id) blEditId = null;
      save();
      render();
    }));
    row.appendChild(del);
    frag.appendChild(row);

    // Abfrage des tatsächlichen Betrags beim Abhaken — bewusst als Zeile in
    // der Liste statt als nativer Dialog.
    if(blEditId === b.id){
      const er = elem('div', 'kt-ist-row');
      const lb = elem('div', 'kt-hint', 'Ist-Betrag für „' + b.titel + '“');
      const ii = document.createElement('input');
      ii.type = 'text';
      ii.inputMode = 'decimal';
      ii.maxLength = 12;
      ii.autocomplete = 'off';
      ii.placeholder = '€';
      ii.value = b.kosten ? String(Math.round(b.kosten)) : '';
      ii.setAttribute('aria-label', 'Tatsächliche Kosten');
      const ok = elem('button', 'kt-pri', '✓');
      ok.type = 'button';
      const ab = elem('button', null, 'Abbr.');
      ab.type = 'button';

      function bestaetigen(){
        b.ist = klemme(ii.value);
        b.erledigt = true;
        blEditId = null;
        save();
        render();
      }
      ok.addEventListener('click', bestaetigen);
      ab.addEventListener('click', () => { blEditId = null; render(); });
      ii.addEventListener('keydown', (e) => {
        if(e.key === 'Enter'){ e.preventDefault(); bestaetigen(); }
        if(e.key === 'Escape'){ e.preventDefault(); blEditId = null; render(); }
      });

      er.appendChild(lb);
      er.appendChild(ii);
      er.appendChild(ok);
      er.appendChild(ab);
      frag.appendChild(er);
      setTimeout(() => { if(ii.isConnected){ ii.focus(); ii.select(); } }, 0);
    }
  });

  ktBucket.replaceChildren(frag);
  ktBlSum.textContent = eur(offenSumme);
}

// Ohne renderKopf: der Kopf enthält das Startguthaben-Feld, dessen Wert beim
// Tippen nicht überschrieben werden darf.
function renderAbgeleitet(){
  renderTopf();
  renderMonate();
  renderBeleg();
}
function render(){
  renderKopf();
  renderAbgeleitet();
  renderBucket();
}

/* ---------- Sichern / Laden als Datei ---------- */
function bucketAnlegen(){
  const titel = ktBlName.value.trim();
  if(!titel) return;
  if(state.bucket.length >= MAX_BUCKET) return;
  state.bucket.push({
    id: newId(),
    titel: titel.slice(0, MAX_TEXT),
    kosten: klemme(ktBlKosten.value),
    erledigt: false,
    ist: null
  });
  ktBlName.value = '';
  ktBlKosten.value = '';
  save();
  render();
}

/* ---------- Start ---------- */
function init(){
  load();
  zeigeWarnung();

  // Schnittstelle für den Cloud-Abgleich (siehe js/cloud-sync.js): erlaubt,
  // den Stand nach dem Laden aus Firestore zu ersetzen, und liefert einen
  // Schnappschuss zum Hochladen. Bewusst schmal gehalten wie das Gegenstück
  // beim Budget (window.__budgetCloud). Erst hier definiert, nicht auf
  // Modulebene — sonst könnte ein Aufruf auf fehlende Elemente treffen,
  // falls alleElementeDa unten scheitert.
  window.__konsumtopfCloud = {
    replaceAllData(newData){
      // Dokumente aus der Vorgängerversion haben eine andere Form
      // ({months: [...]}) und werden von applyData abgelehnt. Dann bleibt der
      // leere neue Stand stehen und wird sofort hochgeladen — das Dokument
      // heilt sich damit selbst, statt die Oberfläche zu blockieren.
      applyData(newData);
      offen = {};
      entwurf = {};
      blEditId = null;
      writeNow();
      render();
    },
    getSnapshot(){
      state.aktiv = aktiv;
      return JSON.parse(JSON.stringify(state));
    }
  };

  /* --- Kopf: Jahr & Startguthaben --- */
  ktJahr.addEventListener('change', () => {
    const gewaehlt = parseInt(ktJahr.value, 10);
    if(!isFinite(gewaehlt) || gewaehlt < MIN_JAHR || gewaehlt > MAX_JAHR) return;
    aktiv = gewaehlt;
    state.aktiv = aktiv;
    if(!state.jahre[String(aktiv)]) state.jahre[String(aktiv)] = leeresJahr();
    offen = {};
    entwurf = {};
    save();
    render();
  });
  ktStart.addEventListener('input', () => {
    J().start = klemme(ktStart.value);
    save();
    renderAbgeleitet();
  });
  ktStart.addEventListener('change', () => { render(); });
  ktUebernehmen.addEventListener('click', () => {
    if(!state.jahre[String(aktiv - 1)]) return;
    J().start = berechneFuer(aktiv - 1)[11].rest;
    save();
    render();
  });

  /* --- Beleg --- */
  ktBelegBtn.addEventListener('click', () => {
    const sichtbar = !ktBelegCard.hidden;
    ktBelegCard.hidden = sichtbar;
    ktBelegBtn.textContent = sichtbar ? 'Beleg anzeigen' : 'Beleg ausblenden';
    ktBelegBtn.setAttribute('aria-expanded', sichtbar ? 'false' : 'true');
  });

  /* --- Bucket-List --- */
  ktBlAdd.addEventListener('click', bucketAnlegen);
  [ktBlName, ktBlKosten].forEach(node => {
    node.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); bucketAnlegen(); }
    });
  });

  /* --- Sichern / Laden --- */
  ktExport.addEventListener('click', () => {
    try{
      flush();
      state.aktiv = aktiv;
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'konsumtopf-' + new Date().toISOString().slice(0, 10) + '.json';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(e){ /* Sicherung nicht möglich — Anzeige bleibt unverändert */ }
  });
  ktImport.addEventListener('click', () => ktFile.click());
  ktFile.addEventListener('change', (e) => {
    const datei = e.target.files && e.target.files[0];
    if(!datei) return;
    if(datei.size > MAX_IMPORT_BYTES){
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => { e.target.value = ''; };
    reader.onload = () => {
      try{
        const geparst = JSON.parse(String(reader.result));
        // Sowohl der blanke Stand als auch ein Umschlag mit "data" werden
        // angenommen — je nachdem, woher die Datei stammt.
        const roh = (geparst && typeof geparst === 'object' && geparst.data && !geparst.jahre)
          ? geparst.data
          : geparst;
        if(applyData(roh)){
          offen = {};
          entwurf = {};
          blEditId = null;
          writeNow();
          render();
        }
      }catch(err){ /* ungültige Datei: bisheriger Stand bleibt */ }
      e.target.value = '';
    };
    reader.readAsText(datei);
  });

  /* --- Fenster --- */
  function openKonsum(){ openOverlay(ktOverlay, ktClose); }
  function closeKonsum(){
    blEditId = null;
    closeOverlay(ktOverlay, ktBtn);
  }
  ktBtn.addEventListener('click', openKonsum);
  ktClose.addEventListener('click', closeKonsum);
  ktOverlay.addEventListener('click', (e) => {
    if(e.target === ktOverlay) closeKonsum();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !ktOverlay.hidden) closeKonsum();
  });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') flush();
  });

  render();
}

// Der Konsumtopf ist ein Zusatzwerkzeug — er darf den Start der App unter
// keinen Umständen verhindern. Fehlt eines seiner Elemente (etwa weil der
// Browser noch eine ältere index.html aus dem Zwischenspeicher anzeigt),
// wird er still übersprungen und das Budget läuft normal weiter.
const alleElementeDa = [
  ktBtn, ktOverlay, ktClose, ktWarn, ktJahr, ktStart, ktVorjahrText, ktUebernehmen,
  ktTopfPlan, ktSumZu, ktSumAus, ktMonate,
  ktBelegBtn, ktBelegCard, ktBelegListe, ktBelegSum,
  ktBucket, ktBlName, ktBlKosten, ktBlAdd, ktBlSum,
  ktExport, ktImport, ktFile
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
