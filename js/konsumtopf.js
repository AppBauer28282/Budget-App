/* =============================================================================
   KONSUMTOPF
   Eigenständiges Planungswerkzeug hinter der Konsumtopf-Kachel.
   Verwaltet mehrere Jahre mit je ZWEI Töpfen — "Konsum" und
   "Gesundheit/Lifestyle". Jeder Topf hat ein eigenes Startguthaben und
   zwölf Monate mit Zufluss und geplanten Ausgabenposten. Der Rest eines
   Monats wandert als Übertrag in den Folgemonat, der Endstand eines Jahres
   lässt sich je Topf als Startguthaben ins Folgejahr übernehmen.

   Oberfläche: drei aufklappbare Bereiche. In den beiden Töpfen werden nur
   Ausgaben eingetragen (je Monat ein gelber "Notizzettel"); die Zuflüsse
   beider Töpfe pflegt der dritte Bereich "Zufluss" für alle Monate an einer
   Stelle. Dazu eine Beleg-Ansicht über alle Posten eines Jahres und eine
   davon unabhängige Bucket-List.

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
import { openAppScreen, closeAppScreen } from './overlays.js?v=29';

const STORE_KEY = 'konsumtopf.v3';
const STORE_VERSION = 3;

// Die beiden Töpfe. "kurz" steht dort, wo wenig Platz ist (Zufluss-Kacheln).
const TOEPFE = [
  { key: 'konsum',    name: 'Konsum',               kurz: 'Konsum' },
  { key: 'lifestyle', name: 'Gesundheit/Lifestyle', kurz: 'Lifestyle' }
];

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
// Kachelseite, zu der dieses Werkzeug beim Öffnen/Schließen wechselt (siehe
// openAppScreen/closeAppScreen in js/overlays.js).
const homeScreenEl   = $('home-screen');
const ktWarn         = $('kt-warn');
const ktJahr         = $('kt-jahr');
const ktTopfPlan     = $('kt-topf-plan');
const ktSumZu        = $('kt-sum-zu');
const ktSumAus       = $('kt-sum-aus');
const ktBereiche     = $('kt-bereiche');
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
function leererTopf(){
  const monate = [];
  for(let i = 0; i < 12; i++) monate.push({ zufluss: 0, posten: [] });
  return { start: 0, monate };
}
function leeresJahr(){
  const toepfe = {};
  TOEPFE.forEach(t => { toepfe[t.key] = leererTopf(); });
  return { toepfe };
}
function leererStand(){
  const jetzt = new Date().getFullYear();
  const jahre = {};
  jahre[String(jetzt)] = leeresJahr();
  return { version: STORE_VERSION, aktiv: jetzt, jahre, bucket: [] };
}

let state = leererStand();
let aktiv = state.aktiv;
// Welcher der drei Bereiche offen ist: null, 'konsum', 'lifestyle' oder
// 'zufluss'. Immer höchstens einer — wie bei den Monaten.
let bereich = null;
let offen = {};          // aufgeklappte Monate, Schlüssel "topf-monat"
// Halb getippte Eingaben der "neue Ausgabe"-Zeile je Topf und Monat. Die
// Liste wird bei jeder Änderung neu aufgebaut — ohne diesen Zwischenspeicher
// wäre eine angefangene Eingabe danach weg.
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
      const roh = (d.jahre[k] && typeof d.jahre[k] === 'object') ? d.jahre[k] : {};
      const jahr = leeresJahr();
      if(roh.toepfe && typeof roh.toepfe === 'object'){
        TOEPFE.forEach(t => { jahr.toepfe[t.key] = pruefeTopf(roh.toepfe[t.key]); });
      } else {
        // Altes Format (bis v2, ein einziger Topf: {start, monate}) — der
        // komplette Bestand wird zum Topf "Konsum", Lifestyle bleibt leer.
        // So funktionieren der bisherige lokale Stand, der Cloud-Stand und
        // alte Exportdateien ohne Zutun weiter.
        jahr.toepfe.konsum = pruefeTopf(roh);
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

// Prüft einen einzelnen Topf {start, monate[12]} — alles Fremde fällt weg,
// Beträge werden begrenzt.
function pruefeTopf(roh){
  const topf = leererTopf();
  if(!roh || typeof roh !== 'object') return topf;
  topf.start = klemme(roh.start);
  const monate = Array.isArray(roh.monate) ? roh.monate : [];
  for(let i = 0; i < 12; i++){
    const m = (monate[i] && typeof monate[i] === 'object') ? monate[i] : {};
    topf.monate[i].zufluss = klemme(m.zufluss);
    topf.monate[i].posten = Array.isArray(m.posten)
      ? m.posten.slice(0, MAX_POSTEN).map(p => ({
          id: String((p && p.id) || newId()).slice(0, 24),
          name: String((p && p.name) || '').slice(0, MAX_TEXT),
          betrag: klemme(p && p.betrag)
        }))
      : [];
  }
  return topf;
}

function J(){
  const k = String(aktiv);
  if(!state.jahre[k]) state.jahre[k] = leeresJahr();
  return state.jahre[k];
}
function T(key){ return J().toepfe[key]; }

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
function berechneFuer(jahr, key){
  const j = state.jahre[String(jahr)];
  const topf = j ? j.toepfe[key] : null;
  const out = [];
  let uebertrag = topf ? topf.start : 0;
  for(let i = 0; i < 12; i++){
    const m = (topf && topf.monate[i]) ? topf.monate[i] : { zufluss: 0, posten: [] };
    let aus = 0;
    m.posten.forEach(p => { aus += p.betrag; });
    const rest = uebertrag + m.zufluss - aus;
    out.push({ i, ue: uebertrag, zu: m.zufluss, aus, rest });
    uebertrag = rest;
  }
  return out;
}
function berechne(key){ return berechneFuer(aktiv, key); }

// Letzter Monat (0–11), der für "Drin / Verplant" zählt: im laufenden Jahr
// der aktuelle Kalendermonat, in vergangenen Jahren alle zwölf, in künftigen
// Jahren keiner (-1).
function bezugsMonat(){
  const heute = new Date();
  const jahr = heute.getFullYear();
  if(aktiv < jahr) return 11;
  if(aktiv > jahr) return -1;
  return heute.getMonth();
}

// Kennzahlen eines Topfs bis einschließlich Bezugsmonat:
// drin = Startguthaben + Zuflüsse, verplant = Ausgaben, rest = drin − verplant.
function kennzahlen(key){
  const bis = bezugsMonat();
  const topf = T(key);
  let drin = topf.start, verplant = 0;
  for(let i = 0; i <= bis; i++){
    drin += topf.monate[i].zufluss;
    topf.monate[i].posten.forEach(p => { verplant += p.betrag; });
  }
  return { drin, verplant, rest: drin - verplant };
}

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
}

// Topfstand-Karte: Summe beider Töpfe.
function renderTopf(){
  let ende = 0, zu = 0, aus = 0;
  TOEPFE.forEach(t => {
    ende += berechne(t.key)[11].rest;
    T(t.key).monate.forEach(m => {
      zu += m.zufluss;
      m.posten.forEach(p => { aus += p.betrag; });
    });
  });
  ktTopfPlan.textContent = eur(ende);
  ktSumZu.textContent = eur(zu);
  ktSumAus.textContent = eur(aus);
}

function summenZeile(label, wert, klasse){
  const row = elem('div', klasse ? 'kt-sum ' + klasse : 'kt-sum');
  row.appendChild(elem('span', null, label));
  row.appendChild(elem('b', null, wert));
  return row;
}

// Aufklappbarer Kopf (Bereich oder Monat): Tastatur wie ein Knopf.
function klappKopf(klasse, offenJetzt, umschalten){
  const head = elem('div', klasse);
  head.tabIndex = 0;
  head.setAttribute('role', 'button');
  head.setAttribute('aria-expanded', offenJetzt ? 'true' : 'false');
  head.addEventListener('click', umschalten);
  head.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); umschalten(); }
  });
  return head;
}

// Betragsfeld, das schon beim Tippen übernimmt (nicht erst beim Verlassen —
// sonst ginge eine Eingabe verloren, die nie den Fokus abgibt).
function betragsFeld(id, wert, label, beiEingabe){
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.id = id;
  inp.inputMode = 'decimal';
  inp.maxLength = 12;
  inp.autocomplete = 'off';
  inp.placeholder = '0';
  inp.value = wert ? String(Math.round(wert)) : '';
  if(label) inp.setAttribute('aria-label', label);
  inp.addEventListener('input', () => {
    beiEingabe(klemme(inp.value));
    save();
    renderAbgeleitet();
  });
  return inp;
}

function kennzahlZeile(k){
  const z = elem('div', 'kt-kz');
  const feld = (label, wert, klasse) => {
    const f = elem('div', 'kt-kz-f' + (klasse ? ' ' + klasse : ''));
    f.appendChild(elem('span', null, label));
    f.appendChild(elem('b', null, eur(wert)));
    return f;
  };
  z.appendChild(feld('Drin', k.drin));
  z.appendChild(feld('Verplant', k.verplant));
  z.appendChild(feld('Rest', k.rest, k.rest < 0 ? 'neg' : 'pos'));
  return z;
}

// --- Inhalt eines Topfs: Startguthaben + zwölf Monate mit Notizzetteln ---
function topfInhalt(t){
  const topf = T(t.key);
  const box = elem('div', 'kt-bbody');

  // Startguthaben dieses Topfs, samt Übernahme des eigenen Vorjahresendstands.
  const startFeld = elem('div', 'kt-startfeld');
  const startId = 'kt-start-' + t.key;
  const lab = elem('label', null, 'Startguthaben ' + aktiv + ' (Übertrag)');
  lab.setAttribute('for', startId);
  startFeld.appendChild(lab);
  startFeld.appendChild(betragsFeld(startId, topf.start, null, v => { topf.start = v; }));
  const hint = elem('div', 'kt-hint');
  if(state.jahre[String(aktiv - 1)]){
    const rest = berechneFuer(aktiv - 1, t.key)[11].rest;
    hint.appendChild(document.createTextNode('Endstand ' + (aktiv - 1) + ' (geplant): ' + eur(rest) + ' · '));
    const ueb = elem('button', 'kt-gh', 'übernehmen');
    ueb.type = 'button';
    ueb.id = 'kt-uebernehmen-' + t.key;
    ueb.addEventListener('click', () => {
      topf.start = berechneFuer(aktiv - 1, t.key)[11].rest;
      save();
      render();
    });
    hint.appendChild(ueb);
  } else {
    hint.textContent = 'Kein Vorjahr vorhanden – Startguthaben manuell eintragen.';
  }
  startFeld.appendChild(hint);
  box.appendChild(startFeld);

  berechne(t.key).forEach(x => {
    const m = topf.monate[x.i];
    const okey = t.key + '-' + x.i;
    const card = elem('div', 'kt-card kt-monat');

    const head = klappKopf('kt-mhead', offen[okey], () => { offen[okey] = !offen[okey]; renderBereiche(); });
    const name = elem('div', 'kt-mname', MON[x.i]);
    name.appendChild(elem('small', null, 'Übertrag ' + eur(x.ue) + ' · Zufluss ' + eur(x.zu)));
    head.appendChild(name);
    head.appendChild(elem('div', 'kt-badge' + (x.rest < 0 ? ' neg' : ''), eur(x.rest)));
    card.appendChild(head);

    if(offen[okey]){
      const body = elem('div', 'kt-mbody open');

      // Notizzettel: alle Ausgaben des Monats auf einem gelben Zettel,
      // unten die Summe.
      const zettel = elem('div', 'kt-zettel');
      if(m.posten.length === 0){
        zettel.appendChild(elem('div', 'kt-zettel-leer', 'Noch keine Ausgaben in diesem Monat.'));
      }
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
        zettel.appendChild(row);
      });
      const summe = elem('div', 'kt-zettel-sum');
      summe.appendChild(elem('span', null, 'Summe ' + MON[x.i]));
      summe.appendChild(elem('b', null, eur(x.aus)));
      zettel.appendChild(summe);
      body.appendChild(zettel);

      // --- Neue Ausgabe ---
      const add = elem('div', 'kt-add');
      const skizze = entwurf[okey] || { name: '', betrag: '' };
      const an = document.createElement('input');
      an.type = 'text';
      an.id = 'kt-add-name-' + okey;
      an.className = 'kt-n';
      an.maxLength = MAX_TEXT;
      an.autocomplete = 'off';
      an.placeholder = 'Ausgabe';
      an.value = skizze.name;
      an.setAttribute('aria-label', 'Bezeichnung der Ausgabe');
      const ab = document.createElement('input');
      ab.type = 'text';
      ab.id = 'kt-add-betrag-' + okey;
      ab.className = 'kt-b';
      ab.inputMode = 'decimal';
      ab.maxLength = 12;
      ab.autocomplete = 'off';
      ab.placeholder = '€';
      ab.value = skizze.betrag;
      ab.setAttribute('aria-label', 'Betrag der Ausgabe');
      const merke = () => { entwurf[okey] = { name: an.value, betrag: ab.value }; };
      an.addEventListener('input', merke);
      ab.addEventListener('input', merke);
      const addBtn = elem('button', 'kt-pri', '+');
      addBtn.type = 'button';
      addBtn.setAttribute('aria-label', 'Ausgabe hinzufügen');

      function postenAnlegen(){
        const n = an.value.trim();
        const b = klemme(ab.value);
        if(!n && !b) return;
        if(m.posten.length >= MAX_POSTEN) return;
        m.posten.push({ id: newId(), name: (n || 'Ausgabe').slice(0, MAX_TEXT), betrag: b });
        delete entwurf[okey];
        offen[okey] = true;
        // Fokus vorher lösen: sonst schriebe die Fokus-Rettung in
        // renderBereiche den eben getippten Text ins frisch geleerte Feld.
        if(document.activeElement) document.activeElement.blur();
        save();
        render();
        const neu = document.getElementById('kt-add-name-' + okey);
        if(neu) neu.focus();
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
      card.appendChild(body);
    }
    box.appendChild(card);
  });
  return box;
}

// --- Inhalt "Zufluss": alle Monate untereinander, je zwei Kacheln ---
function zuflussInhalt(){
  const box = elem('div', 'kt-bbody');
  box.appendChild(elem('div', 'kt-hint kt-zu-hint',
    'Zufluss je Monat in den Topf. In den Töpfen selbst werden nur Ausgaben eingetragen.'));
  for(let i = 0; i < 12; i++){
    const row = elem('div', 'kt-zu-row');
    row.appendChild(elem('div', 'kt-zu-mon', MON[i]));
    const kacheln = elem('div', 'kt-zu-kacheln');
    TOEPFE.forEach(t => {
      const m = T(t.key).monate[i];
      const kachel = elem('div', 'kt-zu-kachel kt-zu-' + t.key);
      const id = 'kt-zu-' + t.key + '-' + i;
      const lab = elem('label', null, t.kurz);
      lab.setAttribute('for', id);
      kachel.appendChild(lab);
      kachel.appendChild(betragsFeld(id, m.zufluss, null, v => { m.zufluss = v; }));
      kacheln.appendChild(kachel);
    });
    row.appendChild(kacheln);
    box.appendChild(row);
  }
  return box;
}

function renderBereiche(){
  // Der Neuaufbau ersetzt auch das Feld, in dem gerade getippt wird. Fokus,
  // getippter Text und Cursorposition werden deshalb gemerkt und unten
  // wiederhergestellt — der Text wörtlich, damit z. B. ein halb getipptes
  // "12," nicht zu "12" umgeschrieben wird.
  const aktivesEl = document.activeElement;
  const fokusId = (aktivesEl && ktBereiche.contains(aktivesEl)) ? aktivesEl.id : null;
  let cursorVon = null, cursorBis = null, fokusWert = null;
  if(fokusId){
    if(aktivesEl.tagName === 'INPUT') fokusWert = aktivesEl.value;
    try{ cursorVon = aktivesEl.selectionStart; cursorBis = aktivesEl.selectionEnd; }catch(e){ /* kein Textfeld */ }
  }

  const frag = document.createDocumentFragment();

  TOEPFE.forEach(t => {
    const auf = bereich === t.key;
    const card = elem('div', 'kt-bereich kt-bereich-' + t.key + (auf ? ' open' : ''));
    const head = klappKopf('kt-bhead', auf, () => { bereich = auf ? null : t.key; renderBereiche(); });
    head.id = 'kt-bereich-' + t.key;
    const titel = elem('div', 'kt-btitel');
    titel.appendChild(elem('span', null, t.name));
    titel.appendChild(elem('span', 'kt-pfeil', auf ? '▾' : '▸'));
    head.appendChild(titel);
    head.appendChild(kennzahlZeile(kennzahlen(t.key)));
    card.appendChild(head);
    if(auf) card.appendChild(topfInhalt(t));
    frag.appendChild(card);
  });

  // Dritter Bereich: Zufluss
  const zuAuf = bereich === 'zufluss';
  const zuCard = elem('div', 'kt-bereich kt-bereich-zufluss' + (zuAuf ? ' open' : ''));
  const zuHead = klappKopf('kt-bhead', zuAuf, () => { bereich = zuAuf ? null : 'zufluss'; renderBereiche(); });
  zuHead.id = 'kt-bereich-zufluss';
  const zuTitel = elem('div', 'kt-btitel');
  zuTitel.appendChild(elem('span', null, 'Zufluss'));
  zuTitel.appendChild(elem('span', 'kt-pfeil', zuAuf ? '▾' : '▸'));
  zuHead.appendChild(zuTitel);
  const zuZeile = elem('div', 'kt-kz');
  TOEPFE.forEach(t => {
    let summe = 0;
    T(t.key).monate.forEach(m => { summe += m.zufluss; });
    const f = elem('div', 'kt-kz-f');
    f.appendChild(elem('span', null, t.kurz + ' ' + aktiv));
    f.appendChild(elem('b', null, eur(summe)));
    zuZeile.appendChild(f);
  });
  zuHead.appendChild(zuZeile);
  zuCard.appendChild(zuHead);
  if(zuAuf) zuCard.appendChild(zuflussInhalt());
  frag.appendChild(zuCard);

  ktBereiche.replaceChildren(frag);

  if(fokusId){
    const wieder = document.getElementById(fokusId);
    if(wieder){
      if(fokusWert !== null) wieder.value = fokusWert;
      wieder.focus();
      if(cursorVon !== null){
        try{ wieder.setSelectionRange(cursorVon, cursorBis); }catch(e){ /* kein Textfeld */ }
      }
    }
  }
}

function renderBeleg(){
  const frag = document.createDocumentFragment();
  let summe = 0;

  TOEPFE.forEach(t => {
    let topfSumme = 0;
    const gruppe = document.createDocumentFragment();
    T(t.key).monate.forEach((m, i) => {
      m.posten.forEach(p => {
        topfSumme += p.betrag;
        const row = elem('div', 'kt-posten');
        const nm = elem('div', 'kt-nm');
        // Monatsnummer als eigenes Element, der Name als reiner Text —
        // selbst eingegebene Bezeichnungen dürfen kein Markup erzeugen.
        nm.appendChild(elem('span', 'kt-idx', '[' + String(i + 1).padStart(2, '0') + ']'));
        nm.appendChild(document.createTextNode(' ' + p.name));
        row.appendChild(nm);
        row.appendChild(elem('div', 'kt-bt', eur(p.betrag)));
        gruppe.appendChild(row);
      });
    });
    if(!gruppe.childNodes.length) return;
    frag.appendChild(elem('div', 'kt-beleg-topf', t.name));
    frag.appendChild(gruppe);
    frag.appendChild(summenZeile('Summe ' + t.name, eur(topfSumme)));
    summe += topfSumme;
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

function renderAbgeleitet(){
  renderTopf();
  renderBereiche();
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
      bereich = null;
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

  /* --- Kopf: Jahr (Startguthaben steht je Topf im aufgeklappten Topf) --- */
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
          bereich = null;
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

  /* --- Fenster ---
     Öffnet sich als eigener Bildschirm anstelle der Kachelseite — nicht mehr
     als schwebendes Overlay darüber (siehe js/overlays.js). */
  function openKonsum(){ openAppScreen(ktOverlay, homeScreenEl, ktClose); }
  function closeKonsum(){
    blEditId = null;
    closeAppScreen(ktOverlay, homeScreenEl, ktBtn);
  }
  ktBtn.addEventListener('click', openKonsum);
  ktClose.addEventListener('click', closeKonsum);
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
  ktBtn, ktOverlay, ktClose, homeScreenEl, ktWarn, ktJahr,
  ktTopfPlan, ktSumZu, ktSumAus, ktBereiche,
  ktBelegBtn, ktBelegCard, ktBelegListe, ktBelegSum,
  ktBucket, ktBlName, ktBlKosten, ktBlAdd, ktBlSum,
  ktExport, ktImport, ktFile
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
