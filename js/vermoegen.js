/* =============================================================================
   VERMÖGENS-TRACKER
   Eigenständiges Werkzeug hinter dem Trendpfeil rechts oben. Erfasst je Monat
   Positionen mit Anlageklasse, Bezeichnung und Betrag und wertet daraus
   Gesamtvermögen und Veränderung, Meilensteine samt Wachstumsprognose sowie
   Aufteilung nach Klassen und Beschreibungen aus. Dazu eine Monatsansicht und
   Sicherung als Datei (Export/Import).

   Bewusst getrennt vom Budget: eigener Speicherschlüssel, keine Berührung mit
   allData. Wie die übrigen Werkzeuge holt sich das Modul alle Elemente selbst
   und startet nur, wenn wirklich alle da sind.

   KEINE Vorbelegung mit echten Daten im Quelltext: Dieses Repository ist
   öffentlich einsehbar, und aus Monatsständen ließe sich das gesamte Vermögen
   ablesen. Der Tracker startet vollständig leer — ohne Monate und ohne
   Anlageklassen; der eigene Stand kommt über den Cloud-Abgleich oder über
   "Daten laden".

   Die Vorlage war dunkel gehalten; hier ist alles auf die iOS-Optik der App
   umgestellt und nutzt deren Design-Tokens. Der Aufbau läuft wie in der
   Vorlage vollständig über die DOM-API, nicht über innerHTML.

   Alle IDs sind mit "vt-" vorangestellt. Die kleinen Dialoge hängen an
   document.body und liegen über dem Fenster (siehe styles.css).
   ============================================================================= */
import { openOverlay, closeOverlay } from './overlays.js?v=26';

const STORE_KEY = 'vermoegen.v1';

// Obergrenzen: fangen unsinnige Eingaben und aufgeblähte Importdateien ab.
const MAX_MONATE = 600;
const MAX_POS = 100;
const MAX_KLASSEN = 40;
const MAX_TEXT = 80;
const MAX_CENTS = 100000000000;      // 1 Mrd. €
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Diagrammfarben aus der iOS-Systempalette, passend zu SLICE_COLORS.
const FARBEN = ['#0a84ff','#34c759','#ff9500','#af52de','#ff2d55',
                '#32ade6','#ffcc00','#ff3b30','#5856d6','#64d2ff'];

/* ---------- Elemente ---------- */
const $ = (id) => document.getElementById(id);

const vtBtn       = $('vermoegen-btn');
const vtOverlay   = $('vermoegen-overlay');
const vtClose     = $('vermoegen-close');
const vtWarn      = $('vt-warn');
const vtMsg       = $('vt-msg');
const vtBack      = $('vt-back');
const vtBrand     = $('vt-brand');
const vtTopAction = $('vt-top-action');
const vtApp       = $('vt-app');
const vtFile      = $('vt-file');

/* ---------- Zustand ----------
   WICHTIG: kein Feld "data" auf oberster Ebene — js/cloud-sync.js erkennt
   daran Dokumente im alten Umschlagformat. */
function leererStand(){
  return { klassen: [], monate: [], wachstumsraten: { gesamt: null, teil: null, tagesgeld: null } };
}
let state = leererStand();
let storageOk = true;

let route = { screen:"start", id:null };
let ausKlassen = new Set();   // abgewählte Klassen (nur Ansicht)
let ausTexte   = new Set();   // abgewählte Beschreibungen (nur Ansicht)
let analyseOffen = true;      // Auf/Zu-Zustand des Analysebereichs auf der Startseite
let meilensteinOffenSet = new Set(); // Indizes der aufgeklappten, nicht-aktuellen Meilensteine

const MEILENSTEINE = [
  { name:"Meilenstein 1", betrag:  2500000 },  //  25.000 €
  { name:"Meilenstein 2", betrag:  5000000 },  //  50.000 €
  { name:"Meilenstein 3", betrag:  7500000 },  //  75.000 €
  { name:"Meilenstein 4", betrag: 10000000 },  // 100.000 €
  { name:"Meilenstein 5", betrag: 25000000 },  // 250.000 €
  { name:"Meilenstein 6", betrag: 50000000 },  // 500.000 €
  { name:"Meilenstein 7", betrag:100000000 }   //  1.000.000 €
];
const MS_TEIL_KLASSEN = ["ETF","Aktien","Bitcoin"];
function teilSumme(m){
  return m.pos.filter(p => MS_TEIL_KLASSEN.indexOf(p.klasse) > -1).reduce((s,p)=> s + (p.cents||0), 0);
}
function tagesgeldSumme(m){
  return m.pos.filter(p => p.klasse === "Tagesgeld").reduce((s,p)=> s + (p.cents||0), 0);
}

const nfEur = new Intl.NumberFormat("de-DE",{style:"currency",currency:"EUR"});
const nfNum = new Intl.NumberFormat("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2});
const nfPct = new Intl.NumberFormat("de-DE",{minimumFractionDigits:1,maximumFractionDigits:1});

const eur = c => nfEur.format((c||0)/100);
const eurKurz = c => nfEur.format(Math.round((c||0)/100));
const uid = () => Math.random().toString(36).slice(2,10);

function parseBetrag(s){
  if(typeof s !== "string") return 0;
  let t = s.replace(/[^0-9,.\-]/g,"").trim();
  if(!t) return 0;
  const neg = t.indexOf("-") === 0;
  t = t.replace(/-/g,"");
  if(t.indexOf(",") > -1){
    t = t.replace(/\./g,"").replace(",",".");
  } else {
    const p = t.split(".");
    if(p.length > 1){
      const last = p[p.length-1];
      t = last.length === 3 ? p.join("") : p.slice(0,-1).join("") + "." + last;
    }
  }
  const v = Number(t);
  if(!isFinite(v)) return 0;
  return Math.round(v*100) * (neg ? -1 : 1);
}

function monatLabel(id){
  const y = Number(id.slice(0,4)), m = Number(id.slice(5,7));
  return new Date(y, m-1, 1).toLocaleDateString("de-DE",{month:"long",year:"numeric"});
}
function monatKurz(id){
  const y = Number(id.slice(0,4)), m = Number(id.slice(5,7));
  return new Date(y, m-1, 1).toLocaleDateString("de-DE",{month:"short"}).replace(/\.$/,"");
}
function naechsterMonat(id){
  let y = Number(id.slice(0,4)), m = Number(id.slice(5,7)) + 1;
  if(m > 12){ m = 1; y++; }
  return y + "-" + String(m).padStart(2,"0");
}
function addMonate(id, n){
  let y = Number(id.slice(0,4));
  let m = Number(id.slice(5,7)) + n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return y + "-" + String(m).padStart(2,"0");
}
function durchschnittWachstum(werteFn, monate){
  if(monate.length < 2) return null;
  let summeDelta = 0;
  for(let i = 1; i < monate.length; i++){
    summeDelta += werteFn(monate[i]) - werteFn(monate[i-1]);
  }
  return summeDelta / (monate.length - 1);
}
function angewandtesWachstum(schluessel, berechnet){
  const manuell = state.wachstumsraten ? state.wachstumsraten[schluessel] : null;
  return (manuell === null || manuell === undefined) ? berechnet : manuell;
}
function heutigerMonat(){
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}
const sortiert = () => state.monate.slice().sort((a,b)=> a.id < b.id ? -1 : 1);
const findeMonat = id => state.monate.find(m => m.id === id);
const summe = m => m ? m.pos.reduce((s,p)=> s + (p.cents||0), 0) : 0;
function vormonatVon(id){
  const list = sortiert();
  const i = list.findIndex(m => m.id === id);
  return i > 0 ? list[i-1] : null;
}
function klasseFarbe(name){
  const i = state.klassen.indexOf(name);
  return FARBEN[(i < 0 ? state.klassen.length : i) % FARBEN.length];
}
function ueberschriftGruppe(klasse){
  if(klasse === "Aktien" || klasse === "Bitcoin") return "Aktien & Bitcoin";
  return klasse;
}

/* ---------- Prüftrichter ----------
   Alles, was hereinkommt — lokaler Speicher, Cloud und Importdatei — läuft
   durch diese eine Stelle. Beschädigte oder manipulierte Daten dürfen die
   Oberfläche nicht durcheinanderbringen. Rückgabe: true bei verwertbaren
   Daten, sonst bleibt der bisherige Stand stehen. */
function textOderLeer(v){
  if(v === null || v === undefined) return '';
  return String(v).trim().slice(0, MAX_TEXT);
}
function centsOderNull(v){
  const n = Math.trunc(Number(v));
  if(!Number.isFinite(n)) return 0;
  if(n > MAX_CENTS) return MAX_CENTS;
  if(n < -MAX_CENTS) return -MAX_CENTS;
  return n;
}
function rateOderNull(v){
  if(v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if(!Number.isFinite(n)) return null;
  if(n > MAX_CENTS) return MAX_CENTS;
  if(n < -MAX_CENTS) return -MAX_CENTS;
  return n;
}

function applyData(d){
  if(!d || typeof d !== 'object' || !Array.isArray(d.monate)) return false;
  try{
    const sauber = leererStand();

    // Anlageklassen: getrimmt, entdoppelt, begrenzt.
    const klassen = [];
    (Array.isArray(d.klassen) ? d.klassen : []).forEach(k => {
      const t = textOderLeer(k);
      if(t && klassen.indexOf(t) < 0 && klassen.length < MAX_KLASSEN) klassen.push(t);
    });
    sauber.klassen = klassen;

    const gesehenMonate = Object.create(null);
    const gesehenIds = Object.create(null);

    d.monate.slice(0, MAX_MONATE).forEach(m => {
      if(!m || typeof m !== 'object') return;
      const id = String(m.id || '');
      if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(id)) return;   // unbrauchbare Kennung
      if(gesehenMonate[id]) return;                      // Dublette
      gesehenMonate[id] = true;

      const pos = [];
      (Array.isArray(m.pos) ? m.pos : []).slice(0, MAX_POS).forEach(p => {
        if(!p || typeof p !== 'object') return;
        let pid = String(p.id || '');
        if(!/^[A-Za-z0-9_-]{1,24}$/.test(pid) || gesehenIds[pid]) pid = uid();
        gesehenIds[pid] = true;

        const klasse = textOderLeer(p.klasse);
        if(klasse && sauber.klassen.indexOf(klasse) < 0 && sauber.klassen.length < MAX_KLASSEN){
          sauber.klassen.push(klasse);                   // unbekannte Klasse nachtragen
        }
        pos.push({ id: pid, klasse, text: textOderLeer(p.text), cents: centsOderNull(p.cents) });
      });

      sauber.monate.push({ id, offen: m.offen === true, pos });
    });

    sauber.monate.sort((a, b) => a.id < b.id ? -1 : 1);

    const w = (d.wachstumsraten && typeof d.wachstumsraten === 'object') ? d.wachstumsraten : {};
    sauber.wachstumsraten = {
      gesamt: rateOderNull(w.gesamt),
      teil: rateOderNull(w.teil),
      tagesgeld: rateOderNull(w.tagesgeld)
    };

    state = sauber;
    return true;
  }catch(e){
    return false;
  }
}

/* ---------- Speichern ---------- */
function zeigeWarnung(){
  vtWarn.hidden = storageOk;
  if(storageOk || vtWarn.childNodes.length) return;
  vtWarn.appendChild(el('div', 'vt-warn',
    'Speichern im Browser nicht möglich (privater Modus oder blockierte '
    + 'Website-Daten). Änderungen gelten nur für diese Sitzung — bitte über '
    + '"Daten sichern" eine Datei ablegen.'));
}

// Gebündelt wie in den übrigen Werkzeugen: beim Tippen feuert 'input'
// dutzendfach, ohne Bündelung würde jedes Mal der ganze Stand serialisiert.
let saveTimer = null;

function writeNow(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    storageOk = true;
    zeigeWarnung();
  }catch(e){
    storageOk = false;
    zeigeWarnung();
    return false;
  }
  if(typeof window.__onVermoegenLocalSave === 'function'){
    try{ window.__onVermoegenLocalSave(state); }catch(e){ /* nächste Änderung versucht es erneut */ }
  }
  return true;
}
// Heißt in der Vorlage "sichern" und wird von den Ansichten überall aufgerufen.
function sichern(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 250);
}
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
  try{ applyData(JSON.parse(roh)); }catch(e){ /* beschädigt: leerer Stand bleibt */ }
}


/* ---------- Helfer ---------- */
function el(tag, cls, text){
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text !== undefined) n.textContent = text;
  return n;
}
function schliesseAlleModals(){
  document.querySelectorAll('.vt-modal-overlay').forEach(ov => ov.remove());
}
let toastTimer = null;
function toast(msg){
  const alt = document.querySelector(".vt-toast");
  if(alt) alt.remove();
  const t = el("div","vt-toast",msg);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.remove(), 3200);
}
function modal(opts){
  const ov = el("div","vt-modal-overlay");
  const box = el("div","vt-modal");
  box.appendChild(el("h3", null, opts.titel));
  if(opts.text) box.appendChild(el("p", null, opts.text));
  if(opts.inhalt) box.appendChild(opts.inhalt);
  const act = el("div","modal-actions");
  const abbrechen = el("button","btn","Abbrechen");
  const ok = el("button","btn btn-primary", opts.ok || "Bestätigen");
  act.append(abbrechen, ok);
  box.appendChild(act);
  ov.appendChild(box);
  document.body.appendChild(ov);
  const zu = ()=>{ ov.remove(); document.removeEventListener("keydown", esc); };
  const esc = e =>{ if(e.key === "Escape") zu(); };
  document.addEventListener("keydown", esc);
  abbrechen.onclick = zu;
  ov.addEventListener("mousedown", e =>{ if(e.target === ov) zu(); });
  ok.onclick = ()=>{ if(opts.aktion() !== false) zu(); };
  setTimeout(()=>{ const f = box.querySelector("input,select"); (f || ok).focus(); }, 30);
}

/* ---------- Ansicht: Übersicht ---------- */
function zeigeStart(){
  route = { screen:"start", id:null };
  vtBack.hidden = true;
  // Auf der Übersicht bleibt der Unterkopf leer — die Fensterüberschrift sagt
  // bereits "Vermögen". In der Monatsansicht steht hier der Monat.
  vtBrand.textContent = "";
  const top = vtTopAction;
  top.hidden = false;
  top.textContent = "Monat öffnen";
  top.className = "btn btn-sm btn-primary";
  top.onclick = dialogNeuerMonat;

  const app = vtApp;
  app.textContent = "";
  const list = sortiert();
  const letzter = list[list.length-1];

  const hero = el("section","hero");
  hero.appendChild(el("div","label", letzter ? "Gesamtvermögen · " + monatLabel(letzter.id) : "Gesamtvermögen"));
  hero.appendChild(el("div","sum num", eur(summe(letzter))));
  if(letzter){
    const vor = vormonatVon(letzter.id);
    if(vor){
      const d = summe(letzter) - summe(vor);
      const zeile = el("div","delta");
      const wert = el("span", d >= 0 ? "up" : "down", (d >= 0 ? "+" : "−") + eur(Math.abs(d)).replace("-",""));
      zeile.append(wert, document.createTextNode(" gegenüber " + monatLabel(vor.id)));
      hero.appendChild(zeile);
    }
  }
  app.appendChild(hero);

  if(!list.length){
    const leer = el("div","empty");
    leer.appendChild(el("strong", null, "Noch kein Monat angelegt"));
    leer.appendChild(document.createTextNode("Öffne deinen ersten Monat und trage Anlageklasse, Beschreibung und Betrag ein."));
    app.appendChild(leer);
  } else {
    app.appendChild(el("div","section-title","Monate"));
    const box = el("div","monate");
    list.slice().reverse().forEach(m =>{
      const b = el("button","monat-card");
      const links = el("div");
      const name = el("div","m-name");
      name.appendChild(document.createTextNode(monatLabel(m.id)));
      name.appendChild(el("span", m.offen ? "pill offen" : "pill", m.offen ? "Offen" : "Abgeschlossen"));
      links.appendChild(name);
      links.appendChild(el("div","m-meta", m.pos.length + (m.pos.length === 1 ? " Position" : " Positionen")));
      const rechts = el("div","m-sum num", eur(summe(m)));
      const vor = vormonatVon(m.id);
      if(vor){
        const d = summe(m) - summe(vor);
        rechts.appendChild(el("div","m-delta num", (d >= 0 ? "+" : "−") + eurKurz(Math.abs(d))));
      }
      b.append(links, rechts);
      b.onclick = ()=> zeigeMonat(m.id);
      box.appendChild(b);
    });
    app.appendChild(box);
  }

  if(list.length >= 2){
    app.appendChild(analyseBereich(list));
  }

  if(list.length){
    app.appendChild(meilensteinBereich(list));
    app.appendChild(einstellungenBereich(list));
  }

  const f = el("footer","tools");
  const exp = el("button","btn btn-sm","Daten sichern");
  exp.onclick = exportieren;
  const imp = el("button","btn btn-sm","Daten laden");
  imp.onclick = ()=> vtFile.click();
  f.append(exp, imp);
  app.appendChild(f);
}

function dialogNeuerMonat(){
  const list = sortiert();
  const letzter = list[list.length-1];
  const vorschlag = letzter ? naechsterMonat(letzter.id) : heutigerMonat();

  const inhalt = document.createDocumentFragment();
  const f1 = el("label","field");
  f1.appendChild(el("span", null, "Monat"));
  const inp = document.createElement("input");
  inp.type = "month";
  inp.value = vorschlag;
  f1.appendChild(inp);
  inhalt.appendChild(f1);

  let uebernehmen = null;
  if(letzter){
    const row = el("label","check-row");
    uebernehmen = document.createElement("input");
    uebernehmen.type = "checkbox";
    uebernehmen.checked = true;
    row.append(uebernehmen, document.createTextNode("Positionen aus " + monatLabel(letzter.id) + " übernehmen"));
    inhalt.appendChild(row);
  }

  modal({
    titel:"Monat öffnen",
    text:"Trag danach die Beträge für diesen Monat ein.",
    inhalt: inhalt,
    ok:"Monat öffnen",
    aktion(){
      const id = inp.value;
      if(!/^\d{4}-\d{2}$/.test(id)){ toast("Bitte einen Monat wählen."); return false; }
      if(findeMonat(id)){ toast(monatLabel(id) + " gibt es schon."); return false; }
      const pos = (uebernehmen && uebernehmen.checked && letzter)
        ? letzter.pos.map(p => ({ id: uid(), klasse: p.klasse, text: p.text, cents: p.cents }))
        : [];
      state.monate.push({ id: id, offen: true, pos: pos });
      sichern();
      zeigeMonat(id);
    }
  });
}

/* ---------- Ansicht: Monat ---------- */
function zeigeMonat(id){
  route = { screen:"monat", id:id };
  ausKlassen = new Set();
  ausTexte = new Set();
  const m = findeMonat(id);
  if(!m){ zeigeStart(); return; }

  const back = vtBack;
  back.hidden = false;
  back.onclick = zeigeStart;
  vtBrand.textContent = monatLabel(id);
  const top = vtTopAction;
  top.hidden = false;
  top.className = "btn btn-sm" + (m.offen ? "" : " btn-primary");
  top.textContent = m.offen ? "Monat abschließen" : "Monat wieder öffnen";
  top.onclick = ()=>{ m.offen = !m.offen; sichern(); zeigeMonat(id); };

  const app = vtApp;
  app.textContent = "";

  const hero = el("section","hero");
  hero.appendChild(el("div","label", m.offen ? "Summe · offen" : "Summe · abgeschlossen"));
  const sum = el("div","sum num", eur(summe(m)));
  sum.id = "monatSumme";
  hero.appendChild(sum);
  const vor = vormonatVon(id);
  if(vor){
    const d = summe(m) - summe(vor);
    const zeile = el("div","delta");
    zeile.id = "monatDelta";
    zeile.append(
      el("span", d >= 0 ? "up" : "down", (d >= 0 ? "+" : "−") + eur(Math.abs(d))),
      document.createTextNode(" gegenüber " + monatLabel(vor.id))
    );
    hero.appendChild(zeile);
  }
  app.appendChild(hero);

  const kopf = el("div","pos-head");
  kopf.appendChild(el("h2", null, "Positionen"));
  app.appendChild(kopf);

  const liste = el("div","pos-list");
  liste.id = "posListe";
  app.appendChild(liste);
  zeichnePositionen(m);

  if(m.offen){
    const act = el("div","actions");
    const add = el("button","btn","+ Position");
    add.onclick = ()=>{
      m.pos.push({ id: uid(), klasse: state.klassen[0], text:"", cents:0 });
      sichern();
      zeichnePositionen(m);
      aktualisiere(m);
      const inputs = liste.querySelectorAll(".pos .text");
      if(inputs.length) inputs[inputs.length-1].focus();
    };
    const speichern = el("button","btn btn-sm","Speichern");
    speichern.onclick = ()=>{
      flush();
      toast(writeNow() ? "Gespeichert." : 'Speichern fehlgeschlagen — bitte „Daten sichern" nutzen.');
    };
    const del = el("button","btn-danger btn-sm","Monat löschen");
    del.onclick = ()=> modal({
      titel:"Monat löschen",
      text: monatLabel(id) + " wird mit allen Positionen entfernt. Das lässt sich nicht rückgängig machen.",
      ok:"Löschen",
      aktion(){
        state.monate = state.monate.filter(x => x.id !== id);
        sichern();
        zeigeStart();
      }
    });
    act.append(add, speichern, del);
    app.appendChild(act);
  }

  const a1 = el("section","analyse");
  a1.id = "analyseKlassen";
  app.appendChild(a1);
  const a2 = el("section","analyse");
  a2.id = "analyseTexte";
  app.appendChild(a2);
  zeichneAnalysen(m);
}

function zeichnePositionen(m){
  const liste = document.getElementById("posListe");
  liste.textContent = "";

  if(!m.pos.length){
    const leer = el("div","empty");
    leer.appendChild(el("strong", null, "Noch keine Positionen"));
    leer.appendChild(document.createTextNode(m.offen
      ? "Füge deine erste Anlage hinzu: Klasse, Beschreibung, Betrag."
      : "Öffne den Monat wieder, um Positionen einzutragen."));
    liste.appendChild(leer);
    return;
  }

  m.pos.forEach(p =>{
    if(!m.offen){
      const row = el("div","pos locked");
      const links = el("div","l-links");
      links.appendChild(el("div","l-klasse", p.klasse));
      if(p.text) links.appendChild(el("div","l-text", p.text));
      row.append(links, el("div","l-betrag num", eur(p.cents)));
      liste.appendChild(row);
      return;
    }

    const row = el("div","pos");

    const sel = document.createElement("select");
    sel.className = "klasse";
    state.klassen.forEach(k =>{
      const o = document.createElement("option");
      o.value = k; o.textContent = k;
      if(k === p.klasse) o.selected = true;
      sel.appendChild(o);
    });
    if(state.klassen.indexOf(p.klasse) < 0){
      const o = document.createElement("option");
      o.value = p.klasse; o.textContent = p.klasse; o.selected = true;
      sel.insertBefore(o, sel.firstChild);
    }
    const neu = document.createElement("option");
    neu.value = "__neu"; neu.textContent = "+ Neue Klasse …";
    sel.appendChild(neu);
    sel.onchange = ()=>{
      if(sel.value === "__neu"){ sel.value = p.klasse; dialogNeueKlasse(m, p); return; }
      p.klasse = sel.value;
      sichern();
      aktualisiere(m);
    };

    const txt = document.createElement("input");
    txt.className = "text";
    txt.type = "text";
    txt.placeholder = "Beschreibung, z. B. MSCI World";
    txt.value = p.text || "";
    txt.oninput = ()=>{ p.text = txt.value; sichern(); spaeter(m); };

    const bet = document.createElement("input");
    bet.className = "betrag num";
    bet.type = "text";
    bet.inputMode = "decimal";
    bet.placeholder = "0,00";
    bet.value = p.cents ? nfNum.format(p.cents/100) : "";
    bet.oninput = ()=>{ p.cents = parseBetrag(bet.value); sichern(); spaeter(m); };
    bet.onblur = ()=>{ bet.value = p.cents ? nfNum.format(p.cents/100) : ""; };
    bet.onfocus = ()=> bet.select();

    const del = el("button","del","×");
    del.title = "Position löschen";
    del.setAttribute("aria-label","Position löschen");
    del.onclick = ()=>{
      m.pos = m.pos.filter(x => x.id !== p.id);
      sichern();
      zeichnePositionen(m);
      aktualisiere(m);
    };

    row.append(sel, txt, bet, del);
    liste.appendChild(row);
  });
}

function dialogNeueKlasse(m, p){
  const f = el("label","field");
  f.appendChild(el("span", null, "Name der Anlageklasse"));
  const inp = document.createElement("input");
  inp.type = "text";
  inp.placeholder = "z. B. Immobilien";
  f.appendChild(inp);
  modal({
    titel:"Neue Anlageklasse",
    ok:"Hinzufügen",
    inhalt:f,
    aktion(){
      const name = inp.value.trim();
      if(!name){ toast("Bitte einen Namen eingeben."); return false; }
      if(state.klassen.indexOf(name) < 0) state.klassen.push(name);
      p.klasse = name;
      sichern();
      zeichnePositionen(m);
      aktualisiere(m);
    }
  });
}

let updTimer = null;
function spaeter(m){
  clearTimeout(updTimer);
  updTimer = setTimeout(()=> aktualisiere(m), 320);
}
function aktualisiere(m){
  const s = document.getElementById("monatSumme");
  if(s) s.textContent = eur(summe(m));
  const d = document.getElementById("monatDelta");
  const vor = vormonatVon(m.id);
  if(d && vor){
    const diff = summe(m) - summe(vor);
    d.textContent = "";
    d.append(
      el("span", diff >= 0 ? "up" : "down", (diff >= 0 ? "+" : "−") + eur(Math.abs(diff))),
      document.createTextNode(" gegenüber " + monatLabel(vor.id))
    );
  }
  zeichneAnalysen(m);
}

function meilensteinBereich(list){
  const letzter = list[list.length-1];
  const gesamtWert = summe(letzter);
  const teilWert = teilSumme(letzter);
  const tgWert = tagesgeldSumme(letzter);
  const teilWachstum = angewandtesWachstum("teil", durchschnittWachstum(m => teilSumme(m), list));
  const tgWachstum = angewandtesWachstum("tagesgeld", durchschnittWachstum(m => tagesgeldSumme(m), list));
  const gesamtWachstum = (teilWachstum === null || tgWachstum === null) ? null : teilWachstum + tgWachstum;

  // Ein Meilenstein ist erst erreicht, wenn BEIDE Werte das Ziel erreicht haben.
  let aktuellIdx = MEILENSTEINE.findIndex(ms => !(gesamtWert >= ms.betrag && teilWert >= ms.betrag));
  if(aktuellIdx === -1) aktuellIdx = MEILENSTEINE.length - 1;

  const box = el("section","meilenstein-box");
  box.id = "meilensteinBox";
  box.appendChild(el("div","section-title","Meilensteine"));

  MEILENSTEINE.forEach((ms, i) =>{
    const erreicht = gesamtWert >= ms.betrag && teilWert >= ms.betrag;
    const istAktuell = i === aktuellIdx;
    box.appendChild(meilensteinKarte(
      ms, i, istAktuell, erreicht,
      gesamtWert, teilWert, tgWert,
      gesamtWachstum, teilWachstum, tgWachstum,
      letzter.id
    ));
  });

  return box;
}

function meilensteinKarte(ms, idx, istAktuell, erreicht, gesamtWert, teilWert, tgWert, gesamtWachstum, teilWachstum, tgWachstum, letzterMonatId){
  const offen = istAktuell || meilensteinOffenSet.has(idx);
  const karte = el("div", "ms-karte" + (offen ? "" : " eingeklappt"));

  const nameWrap = el("div","ms-name-wrap");
  nameWrap.appendChild(el("span","ms-name", ms.name));
  if(erreicht) nameWrap.appendChild(el("span","pill erreicht","Erreicht"));

  let kopf;
  if(istAktuell){
    kopf = el("div","ms-kopf");
    kopf.append(nameWrap, el("span","ms-ziel num", eur(ms.betrag)));
  } else {
    kopf = el("button","ms-kopf ms-kopf-klick");
    kopf.type = "button";
    kopf.setAttribute("aria-expanded", offen ? "true" : "false");
    const rechts = el("span","ms-kopf-rechts");
    rechts.append(el("span","ms-ziel num", eur(ms.betrag)), el("span","chevron","⌄"));
    kopf.append(nameWrap, rechts);
  }
  karte.appendChild(kopf);

  const inhalt = el("div","ms-inhalt");
  inhalt.hidden = !offen;

  const balkenGruppe = el("div","ms-balken-gruppe");
  balkenGruppe.appendChild(msBalkenZeile("Gesamt", gesamtWert, ms.betrag, "gesamt"));
  balkenGruppe.appendChild(msBalkenZeile("ETF+Aktien+BTC", teilWert, ms.betrag, "teil"));
  balkenGruppe.appendChild(msBalkenZeile("Tagesgeld", tgWert, ms.betrag, "tagesgeld"));
  inhalt.appendChild(balkenGruppe);

  const prognose = el("div","ms-prognose");
  prognose.appendChild(msPrognoseZeile("Gesamt", gesamtWert, ms.betrag, gesamtWachstum, letzterMonatId));
  prognose.appendChild(msPrognoseZeile("ETF+Aktien+BTC", teilWert, ms.betrag, teilWachstum, letzterMonatId));
  prognose.appendChild(msPrognoseZeile("Tagesgeld", tgWert, ms.betrag, tgWachstum, letzterMonatId));
  inhalt.appendChild(prognose);

  karte.appendChild(inhalt);

  if(!istAktuell){
    kopf.onclick = ()=>{
      const jetztOffen = !meilensteinOffenSet.has(idx);
      if(jetztOffen) meilensteinOffenSet.add(idx); else meilensteinOffenSet.delete(idx);
      inhalt.hidden = !jetztOffen;
      karte.classList.toggle("eingeklappt", !jetztOffen);
      kopf.setAttribute("aria-expanded", jetztOffen ? "true" : "false");
    };
  }

  return karte;
}

function msBalkenZeile(label, wert, ziel, art){
  const pctRoh = ziel > 0 ? wert / ziel * 100 : 0;
  const pctAnzeige = Math.min(100, Math.max(0, pctRoh));
  const zeile = el("div","ms-balken-zeile");
  zeile.appendChild(el("div","ms-balken-label", label));
  const track = el("div","ms-track");
  const fill = el("div", "ms-fill" + (art === "gesamt" ? "" : " " + art));
  fill.style.width = pctAnzeige + "%";
  track.appendChild(fill);
  zeile.appendChild(track);
  zeile.appendChild(el("div","ms-pct num", nfPct.format(pctAnzeige) + " %"));
  return zeile;
}

function msPrognoseZeile(label, wert, ziel, wachstum, letzterMonatId){
  const zeile = el("div");
  if(wert >= ziel){
    zeile.append(label + ": ", el("strong",null,"bereits erreicht"));
    return zeile;
  }
  if(wachstum === null || wachstum <= 0){
    zeile.append(label + ": Prognose nicht möglich (kein Wachstum in den bisherigen Monaten)");
    return zeile;
  }
  const monate = Math.ceil((ziel - wert) / wachstum);
  const zielId = addMonate(letzterMonatId, monate);
  zeile.append(
    label + ": ca. ",
    el("strong",null, monatLabel(zielId)),
    " (Ø +" + eurKurz(wachstum) + "/Monat)"
  );
  return zeile;
}

function aktualisiereMeilensteine(){
  const alteBox = document.getElementById("meilensteinBox");
  if(!alteBox) return;
  const liste = sortiert();
  if(!liste.length) return;
  const neueBox = meilensteinBereich(liste);
  alteBox.replaceWith(neueBox);
}

function einstellungenBereich(list){
  const box = el("section","analyse");
  box.appendChild(el("h2", null, "Einstellungen"));
  box.appendChild(el("p","hint", "Eigene Wachstumsrate je Monat für die Meilenstein-Prognose. Leer lassen für automatische Berechnung. Gesamt ergibt sich als Summe aus beiden."));

  const felder = [
    { key:"teil",      label:"ETF+Aktien+BTC",  fn: m => teilSumme(m) },
    { key:"tagesgeld", label:"Tagesgeld",       fn: m => tagesgeldSumme(m) }
  ];

  const liste = el("div","ms-rate-liste");
  felder.forEach(f =>{
    const berechnet = durchschnittWachstum(f.fn, list);
    const zeile = el("div","ms-rate-zeile");
    zeile.appendChild(el("div","ms-rate-label", f.label));

    const input = document.createElement("input");
    input.className = "ms-rate-input";
    input.type = "text";
    input.inputMode = "decimal";
    input.placeholder = "automatisch";
    const manuell = state.wachstumsraten ? state.wachstumsraten[f.key] : null;
    input.value = (manuell === null || manuell === undefined) ? "" : nfNum.format(manuell/100);

    const hinweis = el("div","ms-rate-berechnet",
      berechnet === null ? "berechnet: –" :
      "berechnet: " + (berechnet >= 0 ? "+" + eurKurz(berechnet) : "−" + eurKurz(Math.abs(berechnet))) + "/Monat");

    input.oninput = ()=>{
      const roh = input.value.trim();
      if(!state.wachstumsraten) state.wachstumsraten = { teil:null, tagesgeld:null };
      state.wachstumsraten[f.key] = roh === "" ? null : parseBetrag(roh);
      sichern();
      clearTimeout(rateTimer);
      rateTimer = setTimeout(()=>{ aktualisiereMeilensteine(); aktualisiereGesamtAnzeige(); }, 320);
    };
    input.onblur = ()=>{
      const v = state.wachstumsraten ? state.wachstumsraten[f.key] : null;
      input.value = (v === null || v === undefined) ? "" : nfNum.format(v/100);
    };
    input.onfocus = ()=> input.select();

    zeile.append(input, hinweis);
    liste.appendChild(zeile);
  });
  box.appendChild(liste);

  const gesamtZeile = el("div","ms-rate-zeile ms-rate-gesamt");
  gesamtZeile.id = "msRateGesamtZeile";
  gesamtZeile.appendChild(el("div","ms-rate-label","Gesamt"));
  gesamtZeile.appendChild(gesamtAnzeigeText(list));
  box.appendChild(gesamtZeile);

  const aktionen = el("div","ms-rate-aktionen");
  const speichern = el("button","btn btn-sm","Speichern");
  speichern.onclick = ()=>{
    clearTimeout(rateTimer);
    aktualisiereMeilensteine();
    flush();
    toast(writeNow() ? "Gespeichert." : 'Speichern fehlgeschlagen — bitte „Daten sichern" nutzen.');
  };
  aktionen.appendChild(speichern);
  box.appendChild(aktionen);

  return box;
}
let rateTimer = null;

function gesamtAnzeigeText(list){
  const teilWachstum = angewandtesWachstum("teil", durchschnittWachstum(m => teilSumme(m), list));
  const tgWachstum = angewandtesWachstum("tagesgeld", durchschnittWachstum(m => tagesgeldSumme(m), list));
  const gesamtWachstum = (teilWachstum === null || tgWachstum === null) ? null : teilWachstum + tgWachstum;
  const text = gesamtWachstum === null ? "–" :
    (gesamtWachstum >= 0 ? "+" + eurKurz(gesamtWachstum) : "−" + eurKurz(Math.abs(gesamtWachstum))) + "/Monat";
  return el("div","ms-rate-gesamt-wert num", text);
}

function aktualisiereGesamtAnzeige(){
  const zeile = document.getElementById("msRateGesamtZeile");
  if(!zeile) return;
  const liste = sortiert();
  if(!liste.length) return;
  const alt = zeile.querySelector(".ms-rate-gesamt-wert");
  if(alt) alt.replaceWith(gesamtAnzeigeText(liste));
}

function analyseBereich(list){
  const box = el("section", "analyse-bereich" + (analyseOffen ? "" : " eingeklappt"));

  const kopf = el("button","analyse-kopf");
  kopf.type = "button";
  kopf.setAttribute("aria-expanded", analyseOffen ? "true" : "false");
  kopf.append(el("span",null,"Analysen"), el("span","chevron","⌄"));

  const inhalt = el("div","analyse-inhalt");
  inhalt.hidden = !analyseOffen;
  inhalt.appendChild(monatsVerlaufAnalyse(list));

  kopf.onclick = ()=>{
    analyseOffen = !analyseOffen;
    inhalt.hidden = !analyseOffen;
    box.classList.toggle("eingeklappt", !analyseOffen);
    kopf.setAttribute("aria-expanded", analyseOffen ? "true" : "false");
  };

  box.append(kopf, inhalt);
  return box;
}

function monatsVerlaufAnalyse(monate){
  const box = el("section","analyse");
  box.appendChild(el("h2", null, "Veränderung je Monat"));

  const basis = monate[0];
  const xMonate = monate.slice(1); // alle außer der Basis
  box.appendChild(el("p","hint", "Gesamtveränderung gegenüber dem Vormonat · " + monatLabel(basis.id) + " als Basis"));

  if(!xMonate.length){
    box.appendChild(el("div","empty","Noch zu wenige Monate für einen Verlauf."));
    return box;
  }

  const werte = [];
  for(let i = 1; i < monate.length; i++){
    werte.push(summe(monate[i]) - summe(monate[i-1]));
  }
  const xLabels = xMonate.map(m => monatKurz(m.id));
  box.appendChild(monatsBalken(xLabels, werte));
  return box;
}

function monatsBalken(xLabels, werte){
  const NS = "http://www.w3.org/2000/svg";
  // Systemblau für Zuwachs, Systemrot für Rückgang — wie im Rest der App.
  const MINT = "#0a84ff", DANGER = "#ff3b30";
  const n = xLabels.length;
  const W = 300, H = 154, padL = 16, padR = 16, padT = 20, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  let maxV = Math.max(0, ...werte), minV = Math.min(0, ...werte);
  if(maxV === minV){ maxV = 1; minV = -1; }
  const spanne = maxV - minV;
  const y = v => padT + plotH * (maxV - v) / spanne;

  const gruppenBreite = plotW / n;
  const balkenBreite = Math.min(34, gruppenBreite * 0.55);

  const svg = document.createElementNS(NS,"svg");
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Gesamtveränderung je Monat als Balkendiagramm");
  svg.style.width = "100%";
  svg.style.display = "block";

  const nullY = y(0);
  const nulllinie = document.createElementNS(NS,"line");
  nulllinie.setAttribute("x1", String(padL)); nulllinie.setAttribute("x2", String(W - padR));
  nulllinie.setAttribute("y1", String(nullY)); nulllinie.setAttribute("y2", String(nullY));
  nulllinie.setAttribute("stroke","rgba(255,255,255,.14)");
  nulllinie.setAttribute("stroke-width","1");
  svg.appendChild(nulllinie);

  werte.forEach((w,i) =>{
    const cx = padL + i * gruppenBreite + gruppenBreite/2;
    const bx = cx - balkenBreite/2;
    const by0 = y(0), by1 = y(w);
    const rectY = Math.min(by0, by1);
    const rectH = Math.max(1, Math.abs(by1 - by0));
    const farbe = w >= 0 ? MINT : DANGER;

    const rect = document.createElementNS(NS,"rect");
    rect.setAttribute("x", String(bx));
    rect.setAttribute("y", String(rectY));
    rect.setAttribute("width", String(balkenBreite));
    rect.setAttribute("height", String(rectH));
    rect.setAttribute("rx","3");
    rect.setAttribute("fill", farbe);
    svg.appendChild(rect);

    const wert = document.createElementNS(NS,"text");
    wert.setAttribute("x", String(cx));
    wert.setAttribute("y", String(w >= 0 ? rectY - 4 : rectY + rectH + 11));
    wert.setAttribute("text-anchor","middle");
    wert.setAttribute("fill", farbe);
    wert.setAttribute("font-size","9.5");
    wert.setAttribute("font-weight","650");
    wert.textContent = (w >= 0 ? "+" : "−") + eurKurz(Math.abs(w));
    svg.appendChild(wert);

    const monLbl = document.createElementNS(NS,"text");
    monLbl.setAttribute("x", String(cx));
    monLbl.setAttribute("y", String(H - 6));
    monLbl.setAttribute("text-anchor","middle");
    monLbl.setAttribute("fill","#6b6b70");
    monLbl.setAttribute("font-size","9.5");
    monLbl.textContent = xLabels[i];
    svg.appendChild(monLbl);
  });

  const box = el("div","linechart");
  box.appendChild(svg);
  return box;
}

/* ---------- Analysen (pro Monat) ---------- */
function gruppiere(m, feld){
  const map = new Map();
  m.pos.forEach(p =>{
    const key = feld === "klasse" ? (p.klasse || "Ohne Klasse") : ((p.text || "").trim() || "Ohne Beschreibung");
    map.set(key, (map.get(key) || 0) + (p.cents || 0));
  });
  return Array.from(map, ([name, cents]) => ({ id: name, name, cents })).sort((a,b)=> b.cents - a.cents);
}

function gruppiereBeschreibung(m){
  const map = new Map();
  m.pos.forEach(p =>{
    const text = (p.text || "").trim() || "Ohne Beschreibung";
    const klasse = p.klasse || "Ohne Klasse";
    const key = klasse + "\u0001" + text;
    const cur = map.get(key) || { id: key, name: text, klasse: klasse, cents: 0 };
    cur.cents += p.cents || 0;
    map.set(key, cur);
  });
  const idx = k =>{ const i = state.klassen.indexOf(k); return i < 0 ? state.klassen.length : i; };
  return Array.from(map.values()).sort((a,b)=> idx(a.klasse) - idx(b.klasse) || b.cents - a.cents);
}

function zeichneAnalysen(m){
  baueAnalyse({
    ziel: document.getElementById("analyseKlassen"),
    titel: "Verteilung nach Anlageklasse",
    hinweis: "Häkchen entfernen, um eine Klasse aus der Verteilung zu nehmen.",
    daten: gruppiere(m, "klasse"),
    aus: ausKlassen,
    farbe: d => klasseFarbe(d.name),
    m: m
  });
  baueAnalyse({
    ziel: document.getElementById("analyseTexte"),
    titel: "Verteilung nach Beschreibung",
    hinweis: "Nach Anlageklasse sortiert und farblich zugeordnet.",
    daten: gruppiereBeschreibung(m),
    aus: ausTexte,
    farbe: d => klasseFarbe(d.klasse),
    gruppiertNachKlasse: true,
    m: m
  });
}

function baueAnalyse(o){
  const ziel = o.ziel;
  if(!ziel) return;
  ziel.textContent = "";
  ziel.appendChild(el("h2", null, o.titel));
  ziel.appendChild(el("p","hint", o.hinweis));

  const aktiv = o.daten.filter(d => !o.aus.has(d.id) && d.cents > 0);
  const gesamt = aktiv.reduce((s,d)=> s + d.cents, 0);

  const body = el("div","analyse-body");
  body.appendChild(donut(aktiv, gesamt, o.farbe));

  const ul = el("ul","filter");
  if(!o.daten.length){
    const li = el("li");
    li.appendChild(el("div","f-name","Noch keine Daten"));
    ul.appendChild(li);
  }
  let letzteGruppe = null;
  const gruppenSummen = new Map();
  if(o.gruppiertNachKlasse){
    o.daten.forEach(d =>{
      if(!o.aus.has(d.id) && d.cents > 0){
        const g = ueberschriftGruppe(d.klasse);
        gruppenSummen.set(g, (gruppenSummen.get(g) || 0) + d.cents);
      }
    });
  }
  o.daten.forEach(d =>{
    if(o.gruppiertNachKlasse && ueberschriftGruppe(d.klasse) !== letzteGruppe){
      letzteGruppe = ueberschriftGruppe(d.klasse);
      const summeCents = gruppenSummen.get(letzteGruppe) || 0;
      const summePct = (gesamt > 0 && summeCents > 0) ? nfPct.format(summeCents/gesamt*100) + " %" : "–";
      const kopf = el("li","filter-gruppe");
      const marke = el("span","gruppe-marke");
      marke.style.background = klasseFarbe(d.klasse);
      kopf.append(marke, el("span","gruppe-label", letzteGruppe), el("span","gruppe-summe", summePct));
      ul.appendChild(kopf);
    }
    const an = !o.aus.has(d.id);
    const li = el("li", an ? "" : "off");
    const lab = el("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = an;
    cb.onchange = ()=>{
      if(cb.checked) o.aus.delete(d.id); else o.aus.add(d.id);
      zeichneAnalysen(o.m);
    };
    const pct = (an && gesamt > 0 && d.cents > 0) ? nfPct.format(d.cents/gesamt*100) + " %" : "–";
    lab.append(
      cb,
      el("span","dot"),
      el("span","f-name", d.name),
      el("span","f-val", eurKurz(d.cents)),
      el("span","f-pct", pct)
    );
    lab.querySelector(".dot").style.background = o.farbe(d);
    li.appendChild(lab);
    ul.appendChild(li);
  });
  body.appendChild(ul);
  ziel.appendChild(body);
}

function donut(aktiv, gesamt, farbe){
  const NS = "http://www.w3.org/2000/svg";
  const box = el("div","donut");
  const svg = document.createElementNS(NS,"svg");
  svg.setAttribute("viewBox","0 0 120 120");
  svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Verteilung als Ringdiagramm");

  const r = 44, dicke = 15, C = 2 * Math.PI * r;

  const grund = document.createElementNS(NS,"circle");
  grund.setAttribute("cx","60"); grund.setAttribute("cy","60"); grund.setAttribute("r", String(r));
  grund.setAttribute("fill","none");
  grund.setAttribute("stroke","rgba(255,255,255,.07)");
  grund.setAttribute("stroke-width", String(dicke));
  svg.appendChild(grund);

  let offset = 0;
  if(gesamt > 0){
    aktiv.forEach(d =>{
      const len = d.cents / gesamt * C;
      const seg = document.createElementNS(NS,"circle");
      seg.setAttribute("cx","60"); seg.setAttribute("cy","60"); seg.setAttribute("r", String(r));
      seg.setAttribute("fill","none");
      seg.setAttribute("stroke", farbe(d));
      seg.setAttribute("stroke-width", String(dicke));
      seg.setAttribute("stroke-dasharray", len + " " + (C - len));
      seg.setAttribute("stroke-dashoffset", String(-offset));
      seg.setAttribute("transform","rotate(-90 60 60)");
      svg.appendChild(seg);
      offset += len;
    });
  }

  const t1 = document.createElementNS(NS,"text");
  t1.setAttribute("x","60"); t1.setAttribute("y","58");
  t1.setAttribute("text-anchor","middle");
  t1.setAttribute("fill","#1c1c1e");
  t1.setAttribute("font-size","13");
  t1.setAttribute("font-weight","650");
  t1.textContent = eurKurz(gesamt);
  const t2 = document.createElementNS(NS,"text");
  t2.setAttribute("x","60"); t2.setAttribute("y","72");
  t2.setAttribute("text-anchor","middle");
  t2.setAttribute("fill","#6b6b70");
  t2.setAttribute("font-size","9");
  t2.textContent = "Auswahl";
  svg.append(t1, t2);

  box.appendChild(svg);
  return box;
}

/* ---------- Sichern / Laden als Datei ---------- */
function exportieren(){
  flush();
  try{
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vermoegen-' + heutigerMonat() + '.json';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Datei gesichert.');
  }catch(e){
    toast('Sicherung konnte nicht erstellt werden.');
  }
}

function importieren(datei){
  if(!datei) return;
  if(datei.size > MAX_IMPORT_BYTES){
    toast('Datei ist zu groß (höchstens 2 MB).');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => toast('Datei konnte nicht gelesen werden.');
  reader.onload = () => {
    try{
      const geparst = JSON.parse(String(reader.result));
      // Sowohl der blanke Stand als auch ein Umschlag mit "data" wird
      // angenommen — je nachdem, woher die Datei stammt.
      const roh = (geparst && typeof geparst === 'object' && geparst.data && !geparst.monate)
        ? geparst.data
        : geparst;
      if(applyData(roh)){
        writeNow();
        zeigeStart();
        toast('Daten geladen.');
      } else {
        toast('Die Datei passt nicht zu diesem Werkzeug.');
      }
    }catch(e){
      toast('Die Datei passt nicht zu diesem Werkzeug.');
    }
  };
  reader.readAsText(datei);
}

/* ---------- Start ---------- */
function init(){
  load();
  zeigeWarnung();

  // Schnittstelle für den Cloud-Abgleich (siehe js/cloud-sync.js).
  window.__vermoegenCloud = {
    replaceAllData(newData){
      // Passt die Form nicht, bleibt der bisherige Stand stehen und wird beim
      // nächsten Speichern hochgeladen — das Dokument heilt sich selbst.
      applyData(newData);
      schliesseAlleModals();
      writeNow();
      zeigeStart();
    },
    getSnapshot(){
      return JSON.parse(JSON.stringify(state));
    }
  };

  vtFile.addEventListener('change', (e) => {
    importieren(e.target.files && e.target.files[0]);
    e.target.value = '';
  });

  /* --- Fenster --- */
  function oeffnen(){
    vtMsg.textContent = '';
    openOverlay(vtOverlay, vtClose);
    zeigeStart();
  }
  function schliessen(){
    schliesseAlleModals();
    closeOverlay(vtOverlay, vtBtn);
  }
  vtBtn.addEventListener('click', oeffnen);
  vtClose.addEventListener('click', schliessen);
  vtOverlay.addEventListener('click', (e) => {
    if(e.target === vtOverlay) schliessen();
  });

  // Escape schließt immer nur die oberste Ebene: erst ein offenes Modal,
  // dann das Werkzeug selbst. Die Modals bringen einen eigenen Handler mit,
  // der zuerst greift — hier bleibt der Fall "kein Modal offen".
  document.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape' || vtOverlay.hidden) return;
    if(document.querySelector('.vt-modal-overlay')) return;
    schliessen();
  });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') flush();
  });

  zeigeStart();
}

// Der Vermögens-Tracker ist ein Zusatzwerkzeug — er darf den Start der App
// unter keinen Umständen verhindern. Fehlt eines seiner Elemente, wird er
// still übersprungen und das Budget läuft normal weiter.
const alleElementeDa = [
  vtBtn, vtOverlay, vtClose, vtWarn, vtMsg,
  vtBack, vtBrand, vtTopAction, vtApp, vtFile
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
