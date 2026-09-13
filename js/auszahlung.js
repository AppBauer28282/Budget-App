/* =============================================================================
   AUSZAHLUNGS-TRACKER
   Eigenständiges Werkzeug hinter dem Balken-Symbol rechts oben. Erfasst je
   Jahr Gruppen (z. B. Tagesgeld, ETF, Depot) mit Positionen und zwölf
   Monatswerten. Dazu ein davon getrennter Block historischer Zeiträume, der
   ausschließlich über den Import gefüllt wird — die Vorlage hatte dafür keine
   Bedienoberfläche und das soll so bleiben.

   Ausgewertet wird über vier Unterfenster: Jahrestabelle, Gesamtübersicht und
   zwei Balkendiagramme. Dazu Sicherung als Datei (Export/Import).

   Bewusst getrennt vom Budget: eigener Speicherschlüssel, keine Berührung mit
   allData. Wie die übrigen Werkzeuge holt sich das Modul alle Elemente selbst
   und startet nur, wenn wirklich alle da sind — so kann eine ältere,
   zwischengespeicherte Datei die App nicht lahmlegen.

   KEINE Vorbelegung mit echten Daten im Quelltext: Dieses Repository ist
   öffentlich einsehbar. Nicht nur Beträge, auch Positionsnamen verraten
   Banken, Broker und Anlagen. Der Tracker startet deshalb vollständig leer;
   der eigene Stand kommt über den Cloud-Abgleich oder über "Import".

   Alle IDs sind mit "az-" vorangestellt. Aufbau aller Listen und Tabellen
   über die DOM-API statt über innerHTML, wie überall sonst in dieser App —
   die Vorlage baute Zeichenketten zusammen und hatte dabei eine Lücke bei den
   Spaltenköpfen der Gesamtübersicht.
   ============================================================================= */
import { openOverlay, closeOverlay } from './overlays.js?v=25';

const STORE_KEY = 'auszahlungen.v1';
const SVG_NS = 'http://www.w3.org/2000/svg';

const MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

// Obergrenzen: fangen unsinnige Eingaben und aufgeblähte Importdateien ab,
// bevor sie den Speicher oder die Darstellung sprengen.
const MAX_TEXT = 80;
const MAX_JAHRE = 20;
const MAX_GRUPPEN = 30;
const MAX_POSITIONEN = 50;
const MAX_PERIODEN = 20;
const MAX_BETRAG = 1000000;
const MIN_JAHR = 1900;
const MAX_JAHR = 2200;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/* ---------- Elemente ---------- */
const $ = (id) => document.getElementById(id);

const azBtn        = $('auszahlung-btn');
const azOverlay    = $('auszahlung-overlay');
const azClose      = $('auszahlung-close');
const azWarn       = $('az-warn');
const azMonth      = $('az-month');
const azYear       = $('az-year');
const azGrandTotal = $('az-grand-total');
const azGroups     = $('az-groups');
const azAddGroup   = $('az-add-group');
const azSave       = $('az-save');
const azSaveStatus = $('az-save-status');
const azMsg        = $('az-msg');
const azOverviewBtn      = $('az-overview-btn');
const azTotalOverviewBtn = $('az-total-overview-btn');
const azChartBtn         = $('az-chart-btn');
const azTotalChartBtn    = $('az-total-chart-btn');
const azExport     = $('az-export');
const azFile       = $('az-file');
const azOverviewTable = $('az-overview-table');
const azOverviewSum   = $('az-overview-sum');
const azTotalTable    = $('az-total-table');
const azTotalSum      = $('az-total-sum');
const azChart         = $('az-chart');
const azTotalChart    = $('az-total-chart');
const azExportStatus  = $('az-export-status');
const azExportText    = $('az-export-text');
const azDownloadAgain = $('az-download-again');
const azCopyExport    = $('az-copy-export');

const azDlgOverview   = $('az-dlg-overview');
const azDlgTotal      = $('az-dlg-total');
const azDlgChart      = $('az-dlg-chart');
const azDlgTotalChart = $('az-dlg-totalchart');
const azDlgExport     = $('az-dlg-export');

/* ---------- Hilfsfunktionen ---------- */
function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
// Nimmt deutsche Eingaben entgegen (Komma als Dezimaltrennzeichen). "-" und ""
// sind gültige Zwischenzustände beim Tippen und ergeben 0.
function num(v){
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  if(v === null || v === undefined) return 0;
  const s = String(v).slice(0, 32).trim().replace(',', '.');
  if(s === '' || s === '-') return 0;
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function klemme(v){
  const n = num(v);
  if(n > MAX_BETRAG) return MAX_BETRAG;
  if(n < -MAX_BETRAG) return -MAX_BETRAG;
  return n;
}
function fmt(n){
  return (Math.round(n * 100) / 100)
    .toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}
function elem(tag, className, text){
  const el = document.createElement(tag);
  if(className) el.className = className;
  if(text !== undefined && text !== null) el.textContent = text;
  return el;
}
function svgEl(tag, attrs){
  const el = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(k => el.setAttribute(k, attrs[k]));
  return el;
}
function zeigeMeldung(text, istFehler){
  azMsg.textContent = text || '';
  azMsg.classList.toggle('error', !!istFehler);
}

/* ---------- Zustand ----------
   Die Form bleibt bewusst deckungsgleich mit der Exportdatei der Vorlage,
   damit eine dort erzeugte Sicherung hier eingelesen werden kann.
   WICHTIG: kein Feld "data" auf oberster Ebene — js/cloud-sync.js erkennt
   daran Dokumente im alten Umschlagformat. */
function leererStand(){
  const jetzt = new Date();
  const jahr = jetzt.getFullYear();
  const years = {};
  years[String(jahr)] = { groups: [] };
  return {
    currentYear: jahr,
    currentMonth: jetzt.getMonth(),
    years,
    historical: { periods: [], groups: [] }
  };
}

let state = leererStand();
let storageOk = true;

function leerePositionen(anzahl, roh){
  const liste = Array.isArray(roh) ? roh.slice(0, MAX_POSITIONEN) : [];
  return liste.map(p => {
    p = p || {};
    const werte = Array.isArray(p.values) ? p.values : [];
    const values = [];
    for(let i = 0; i < anzahl; i++) values.push(klemme(werte[i]));
    return {
      id: String(p.id || uid()).slice(0, 24),
      name: String(p.name || '').slice(0, MAX_TEXT),
      values
    };
  });
}
function leereGruppen(anzahl, roh){
  const liste = Array.isArray(roh) ? roh.slice(0, MAX_GRUPPEN) : [];
  return liste.map(g => {
    g = g || {};
    return {
      id: String(g.id || uid()).slice(0, 24),
      name: String(g.name || '').slice(0, MAX_TEXT),
      positions: leerePositionen(anzahl, g.positions)
    };
  });
}

/* Alles, was hereinkommt, wird geprüft und begrenzt — beschädigte oder
   manipulierte Daten dürfen die Oberfläche nicht durcheinanderbringen.
   Gilt für den lokalen Speicher, den Stand aus der Cloud und Importdateien
   gleichermaßen. Rückgabe: true, wenn die Daten verwertbar waren. */
function applyData(d){
  if(!d || typeof d !== 'object' || !d.years || typeof d.years !== 'object'
     || d.currentYear === undefined){
    return false;
  }
  try{
    const sauber = { currentYear: 0, currentMonth: 0, years: {}, historical: { periods: [], groups: [] } };

    Object.keys(d.years)
      .filter(k => /^\d{4}$/.test(k) && Number(k) >= MIN_JAHR && Number(k) <= MAX_JAHR)
      .sort((a, b) => Number(a) - Number(b))
      .slice(-MAX_JAHRE)                 // bei Überlänge die neuesten Jahre behalten
      .forEach(k => {
        const jahr = d.years[k] || {};
        sauber.years[k] = { groups: leereGruppen(12, jahr.groups) };
      });

    const hist = (d.historical && typeof d.historical === 'object') ? d.historical : {};
    const perioden = Array.isArray(hist.periods) ? hist.periods.slice(0, MAX_PERIODEN) : [];
    sauber.historical.periods = perioden.map(p => String(p === null || p === undefined ? '' : p).slice(0, MAX_TEXT));
    sauber.historical.groups = leereGruppen(sauber.historical.periods.length, hist.groups);

    const jahr = parseInt(d.currentYear, 10);
    sauber.currentYear = (isFinite(jahr) && jahr >= MIN_JAHR && jahr <= MAX_JAHR)
      ? jahr
      : new Date().getFullYear();
    if(!sauber.years[String(sauber.currentYear)]) sauber.years[String(sauber.currentYear)] = { groups: [] };

    const monat = parseInt(d.currentMonth, 10);
    sauber.currentMonth = (isFinite(monat) && monat >= 0 && monat <= 11) ? monat : new Date().getMonth();

    state = sauber;
    return true;
  }catch(e){
    return false;                        // beschädigte Daten: bisherigen Stand behalten
  }
}

function jahresDaten(jahr){
  const k = String(jahr);
  if(!state.years[k]) state.years[k] = { groups: [] };
  return state.years[k];
}

/* ---------- Speichern ---------- */
function zeigeWarnung(){
  azWarn.hidden = storageOk;
  if(storageOk || azWarn.childNodes.length) return;
  azWarn.appendChild(elem('div', 'az-warn',
    'Speichern im Browser nicht möglich (privater Modus oder blockierte '
    + 'Website-Daten). Änderungen gelten nur für diese Sitzung — bitte über '
    + '"Export" sichern.'));
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
  // Cloud-Abgleich: außerhalb dieses Moduls gesetzter Hook, sobald eingeloggt
  // (siehe js/cloud-sync.js). Lokales Speichern bleibt davon unberührt.
  if(typeof window.__onAuszahlungLocalSave === 'function'){
    try{ window.__onAuszahlungLocalSave(state); }catch(e){ /* nächste Änderung versucht es erneut */ }
  }
  return true;
}
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 250);
  azSaveStatus.textContent = '';
  azSaveStatus.classList.remove('saved');
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

/* ---------- Zwei-Klick-Löschen (kein nativer Dialog) ---------- */
function armDelete(btn, fn){
  if(btn.dataset.armed){ fn(); return; }
  btn.dataset.armed = '1';
  if(btn.dataset.originalText === undefined) btn.dataset.originalText = btn.textContent;
  btn.textContent = 'Sicher?';
  btn.classList.add('armed');
  setTimeout(() => {
    if(!btn.isConnected) return;
    delete btn.dataset.armed;
    btn.textContent = btn.dataset.originalText;
    btn.classList.remove('armed');
  }, 3000);
}

/* ---------- Eingabe-Ansicht (ein Monat) ---------- */
// Hat ein Jahr mindestens einen Eintrag ungleich 0?
function jahrHatEintraege(jahr){
  const jd = state.years[String(jahr)];
  if(!jd) return false;
  return jd.groups.some(g => g.positions.some(p => p.values.some(v => (v || 0) !== 0)));
}

function renderKopf(){
  const jahre = Object.keys(state.years).map(Number).sort((a, b) => a - b);
  const maxJahr = jahre.length ? Math.max(...jahre) : state.currentYear;
  // Folgejahr erst anbieten, wenn im letzten Jahr wirklich etwas eingetragen wurde
  const menge = {};
  jahre.forEach(j => { menge[j] = true; });
  if(jahrHatEintraege(maxJahr)) menge[maxJahr + 1] = true;
  menge[state.currentYear] = true;

  const jf = document.createDocumentFragment();
  Object.keys(menge).map(Number).sort((a, b) => a - b).forEach(j => {
    const opt = elem('option', null, String(j));
    opt.value = String(j);
    if(j === state.currentYear) opt.selected = true;
    jf.appendChild(opt);
  });
  azYear.replaceChildren(jf);

  const mf = document.createDocumentFragment();
  MONTHS.forEach((m, i) => {
    const opt = elem('option', null, m);
    opt.value = String(i);
    if(i === state.currentMonth) opt.selected = true;
    mf.appendChild(opt);
  });
  azMonth.replaceChildren(mf);

  azOverviewBtn.textContent = 'Übersicht ' + state.currentYear;
  azChartBtn.textContent = 'Diagramm ' + state.currentYear;
}

function renderGruppen(){
  const jd = jahresDaten(state.currentYear);
  const monat = state.currentMonth;
  const frag = document.createDocumentFragment();
  let gesamt = 0;

  jd.groups.forEach(group => {
    let zwischen = 0;
    const card = elem('div', 'az-group-card');

    const head = elem('div', 'az-group-head');
    const gName = document.createElement('input');
    gName.type = 'text';
    gName.className = 'az-group-name';
    gName.maxLength = MAX_TEXT;
    gName.autocomplete = 'off';
    gName.value = group.name;
    gName.setAttribute('aria-label', 'Name der Gruppe');
    gName.addEventListener('input', () => {
      group.name = gName.value.slice(0, MAX_TEXT);
      save();
    });
    head.appendChild(gName);

    const addPos = elem('button', 'az-small az-subtle', '+ Position');
    addPos.type = 'button';
    addPos.addEventListener('click', () => {
      if(group.positions.length >= MAX_POSITIONEN) return;
      group.positions.push({ id: uid(), name: 'Neue Position', values: Array(12).fill(0) });
      save();
      renderGruppen();
    });
    head.appendChild(addPos);

    const delGroup = elem('button', 'az-small az-danger', 'Löschen');
    delGroup.type = 'button';
    delGroup.addEventListener('click', () => armDelete(delGroup, () => {
      jd.groups = jd.groups.filter(g => g.id !== group.id);
      save();
      renderGruppen();
    }));
    head.appendChild(delGroup);
    card.appendChild(head);

    group.positions.forEach(pos => {
      const wert = pos.values[monat] || 0;
      zwischen += wert;

      const row = elem('div', 'az-pos-row');

      const pName = document.createElement('input');
      pName.type = 'text';
      pName.className = 'az-pos-name';
      pName.maxLength = MAX_TEXT;
      pName.autocomplete = 'off';
      pName.value = pos.name;
      pName.setAttribute('aria-label', 'Name der Position');
      pName.addEventListener('input', () => {
        pos.name = pName.value.slice(0, MAX_TEXT);
        save();
      });
      row.appendChild(pName);

      const sign = elem('button', 'az-sign-btn', '±');
      sign.type = 'button';
      sign.title = 'Vorzeichen umkehren';
      sign.setAttribute('aria-label', 'Vorzeichen umkehren');
      row.appendChild(sign);

      const val = document.createElement('input');
      val.type = 'text';
      val.className = 'az-val-cell';
      val.inputMode = 'decimal';
      val.maxLength = 14;
      val.autocomplete = 'off';
      val.value = String(wert);
      val.setAttribute('aria-label', 'Betrag');
      // Beim Tippen nur den Stand und die Summen anfassen, nie die Liste neu
      // aufbauen — sonst geht der Eingabefokus verloren.
      val.addEventListener('input', () => {
        pos.values[monat] = klemme(val.value);
        aktualisiereSummen();
        save();
      });
      row.appendChild(val);

      sign.addEventListener('click', () => {
        pos.values[monat] = -(pos.values[monat] || 0);
        val.value = String(pos.values[monat]);
        aktualisiereSummen();
        save();
      });

      const del = elem('button', 'az-del-btn', '✕');
      del.type = 'button';
      del.title = 'Position löschen';
      del.setAttribute('aria-label', 'Position löschen');
      del.addEventListener('click', () => armDelete(del, () => {
        group.positions = group.positions.filter(p => p.id !== pos.id);
        save();
        renderGruppen();
      }));
      row.appendChild(del);

      card.appendChild(row);
    });

    gesamt += zwischen;

    const sub = elem('div', 'az-subtotal');
    sub.appendChild(elem('span', null, 'Zwischensumme'));
    const subVal = elem('span', null, fmt(zwischen));
    subVal.dataset.azSubtotal = group.id;
    sub.appendChild(subVal);
    card.appendChild(sub);

    frag.appendChild(card);
  });

  azGroups.replaceChildren(frag);

  azGrandTotal.replaceChildren();
  azGrandTotal.appendChild(elem('span', null, 'Gesamt ' + MONTHS[monat] + ' ' + state.currentYear));
  const gv = elem('span', null, fmt(gesamt));
  gv.id = 'az-grand-total-value';
  azGrandTotal.appendChild(gv);
}

// Aktualisiert nur die Summenanzeigen, ohne die Eingabefelder neu zu erzeugen.
function aktualisiereSummen(){
  const jd = jahresDaten(state.currentYear);
  const monat = state.currentMonth;
  let gesamt = 0;

  jd.groups.forEach(group => {
    let zwischen = 0;
    group.positions.forEach(pos => { zwischen += pos.values[monat] || 0; });
    gesamt += zwischen;
    const el = azGroups.querySelector('[data-az-subtotal="' + CSS.escape(group.id) + '"]');
    if(el) el.textContent = fmt(zwischen);
  });

  const gv = document.getElementById('az-grand-total-value');
  if(gv) gv.textContent = fmt(gesamt);
}

function render(){
  renderKopf();
  renderGruppen();
}

/* ---------- Übersicht (volles Jahr) ---------- */
function zelle(text, klasse){
  const td = elem('td', klasse || null, text);
  return td;
}

function renderUebersicht(){
  const jahr = state.currentYear;
  const jd = jahresDaten(jahr);
  const jetzt = new Date();
  const istAktuellesJahr = jetzt.getFullYear() === jahr;
  const aktuellerMonat = jetzt.getMonth();
  const hell = (i) => (istAktuellesJahr && i === aktuellerMonat) ? 'az-current-month' : null;

  document.getElementById('az-dlg-overview-title').textContent = 'Übersicht ' + jahr;

  const thead = elem('thead');
  const kopf = elem('tr');
  kopf.appendChild(elem('th', 'az-label', 'Position'));
  MONTHS.forEach((m, i) => kopf.appendChild(elem('th', hell(i), m)));
  kopf.appendChild(elem('th', null, 'Gesamt'));
  thead.appendChild(kopf);

  const tbody = elem('tbody');
  const gesamtSpalten = Array(12).fill(0);

  jd.groups.forEach(group => {
    const zwischen = Array(12).fill(0);

    group.positions.forEach(pos => {
      const tr = elem('tr');
      tr.appendChild(elem('td', 'az-label', pos.name));
      let zeilenSumme = 0;
      for(let i = 0; i < 12; i++){
        const v = pos.values[i] || 0;
        zwischen[i] += v;
        gesamtSpalten[i] += v;
        zeilenSumme += v;
        tr.appendChild(zelle(fmt(v), hell(i)));
      }
      tr.appendChild(zelle(fmt(zeilenSumme), 'az-row-sum'));
      tbody.appendChild(tr);
    });

    const trSum = elem('tr', 'az-subtotal-row');
    trSum.appendChild(elem('td', 'az-label', group.name + ' — Summe'));
    let gruppenSumme = 0;
    zwischen.forEach((v, i) => {
      gruppenSumme += v;
      trSum.appendChild(zelle(fmt(v), hell(i)));
    });
    trSum.appendChild(zelle(fmt(gruppenSumme)));
    tbody.appendChild(trSum);
  });

  const trGes = elem('tr', 'az-grand-total-row');
  trGes.appendChild(elem('td', 'az-label', 'Gesamt'));
  gesamtSpalten.forEach(v => trGes.appendChild(zelle(fmt(v))));
  const summe = gesamtSpalten.reduce((a, b) => a + b, 0);
  trGes.appendChild(zelle(fmt(summe)));
  tbody.appendChild(trGes);

  azOverviewTable.replaceChildren(thead, tbody);

  azOverviewSum.replaceChildren();
  azOverviewSum.appendChild(elem('span', null, 'Gesamtsumme'));
  azOverviewSum.appendChild(elem('span', null, fmt(summe)));
}

/* ---------- Übersicht Total (Zeiträume + Jahre) ---------- */
function jahresSpaltenWert(posName, jahr){
  const jd = state.years[String(jahr)];
  if(!jd) return 0;
  const istEchtesAktuellesJahr = jahr === new Date().getFullYear();
  const bisMonat = istEchtesAktuellesJahr ? new Date().getMonth() + 1 : 12;
  let summe = 0;
  jd.groups.forEach(g => {
    const pos = g.positions.find(p => p.name === posName);
    if(pos){
      for(let i = 0; i < bisMonat; i++) summe += pos.values[i] || 0;
    }
  });
  return summe;
}

function spaltenBeschriftungen(){
  const jahre = Object.keys(state.years).map(Number).sort((a, b) => a - b);
  const echtesJahr = new Date().getFullYear();
  return {
    jahre,
    labels: [
      ...state.historical.periods,
      ...jahre.map(j => j === echtesJahr ? (j + ' (YTD)') : String(j))
    ]
  };
}

function renderGesamtuebersicht(){
  const hist = state.historical;
  const { jahre, labels } = spaltenBeschriftungen();
  const spalten = labels.length;

  const thead = elem('thead');
  const kopf = elem('tr');
  kopf.appendChild(elem('th', 'az-label', 'Position'));
  labels.forEach(l => kopf.appendChild(elem('th', null, l)));
  kopf.appendChild(elem('th', null, 'Gesamt'));
  thead.appendChild(kopf);

  const tbody = elem('tbody');
  const gesamtSpalten = Array(spalten).fill(0);

  hist.groups.forEach(group => {
    const zwischen = Array(spalten).fill(0);

    group.positions.forEach(pos => {
      const tr = elem('tr');
      tr.appendChild(elem('td', 'az-label', pos.name));
      let zeilenSumme = 0;

      hist.periods.forEach((p, i) => {
        const v = pos.values[i] || 0;
        zwischen[i] += v;
        gesamtSpalten[i] += v;
        zeilenSumme += v;
        tr.appendChild(zelle(fmt(v)));
      });
      jahre.forEach((j, k) => {
        const v = jahresSpaltenWert(pos.name, j);
        const idx = hist.periods.length + k;
        zwischen[idx] += v;
        gesamtSpalten[idx] += v;
        zeilenSumme += v;
        tr.appendChild(zelle(fmt(v)));
      });

      tr.appendChild(zelle(fmt(zeilenSumme), 'az-row-sum'));
      tbody.appendChild(tr);
    });

    const trSum = elem('tr', 'az-subtotal-row');
    trSum.appendChild(elem('td', 'az-label', group.name + ' — Summe'));
    let gruppenSumme = 0;
    zwischen.forEach(v => { gruppenSumme += v; trSum.appendChild(zelle(fmt(v))); });
    trSum.appendChild(zelle(fmt(gruppenSumme)));
    tbody.appendChild(trSum);
  });

  const trGes = elem('tr', 'az-grand-total-row');
  trGes.appendChild(elem('td', 'az-label', 'Gesamt'));
  gesamtSpalten.forEach(v => trGes.appendChild(zelle(fmt(v))));
  const summe = gesamtSpalten.reduce((a, b) => a + b, 0);
  trGes.appendChild(zelle(fmt(summe)));
  tbody.appendChild(trGes);

  azTotalTable.replaceChildren(thead, tbody);

  azTotalSum.replaceChildren();
  azTotalSum.appendChild(elem('span', null, 'Gesamtsumme'));
  azTotalSum.appendChild(elem('span', null, fmt(summe)));
}

/* ---------- Balkendiagramme ---------- */
function baueBalkenDiagramm(labels, values, hervorIdx, avgIdx){
  const W = Math.max(480, labels.length * 70);
  const H = 300;
  const padL = 55, padR = 15, padT = 28, padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  const spanne = (maxV - minV) || 1;
  const scaleY = plotH / spanne;
  const zeroY = padT + maxV * scaleY;

  const slot = plotW / values.length;
  const barW = Math.min(48, slot * 0.6);

  const svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
  svg.appendChild(svgEl('title', {})).textContent = 'Balkendiagramm der Auszahlungen';

  const nullLinieY = minV < 0 ? zeroY : (padT + plotH);
  svg.appendChild(svgEl('line', {
    x1: padL, y1: nullLinieY.toFixed(1), x2: W - padR, y2: nullLinieY.toFixed(1),
    stroke: '#999', 'stroke-width': '1'
  }));

  values.forEach((v, i) => {
    const cx = padL + slot * i + slot / 2;
    const barX = cx - barW / 2;
    const barTop = v >= 0 ? zeroY - v * scaleY : zeroY;
    const barH = Math.max(1, Math.abs(v) * scaleY);
    const istAvg = avgIdx !== undefined && i === avgIdx;
    const farbe = istAvg ? '#d97706' : (v >= 0 ? '#1f3057' : '#a33333');
    const istHervor = !istAvg && hervorIdx !== undefined && i === hervorIdx;

    if(istAvg){
      const dx = padL + slot * i;
      svg.appendChild(svgEl('line', {
        x1: dx.toFixed(1), y1: padT, x2: dx.toFixed(1), y2: (padT + plotH).toFixed(1),
        stroke: '#ccc', 'stroke-width': '1', 'stroke-dasharray': '4,3'
      }));
    }

    const rect = svgEl('rect', {
      x: barX.toFixed(1), y: barTop.toFixed(1),
      width: barW.toFixed(1), height: barH.toFixed(1),
      rx: '3', fill: farbe
    });
    if(istHervor){
      rect.setAttribute('stroke', '#d9ead3');
      rect.setAttribute('stroke-width', '3');
    }
    svg.appendChild(rect);

    const labelY = v >= 0 ? (barTop - 6) : (barTop + barH + 14);
    const wertText = svgEl('text', {
      x: cx.toFixed(1), y: labelY.toFixed(1), 'font-size': '11',
      'text-anchor': 'middle', fill: '#1a1a1a', 'font-weight': '600'
    });
    wertText.textContent = fmt(v);
    svg.appendChild(wertText);

    const achsText = svgEl('text', {
      x: cx.toFixed(1), y: (H - padB + 18).toFixed(1), 'font-size': '12',
      'text-anchor': 'middle', fill: istAvg ? '#d97706' : '#555',
      'font-weight': istAvg ? '700' : '400'
    });
    achsText.textContent = String(labels[i]);
    svg.appendChild(achsText);
  });

  return svg;
}

function renderDiagramm(){
  const jahr = state.currentYear;
  const jd = jahresDaten(jahr);
  const jetzt = new Date();
  const istAktuellesJahr = jetzt.getFullYear() === jahr;
  const aktuellerMonat = jetzt.getMonth();

  document.getElementById('az-dlg-chart-title').textContent = 'Diagramm ' + jahr;

  const monatsSummen = Array(12).fill(0);
  jd.groups.forEach(g => g.positions.forEach(p => {
    for(let i = 0; i < 12; i++) monatsSummen[i] += p.values[i] || 0;
  }));

  const bisMonat = istAktuellesJahr ? aktuellerMonat + 1 : 12;
  const avg = monatsSummen.slice(0, bisMonat).reduce((a, b) => a + b, 0) / bisMonat;

  const labels = [...MONTHS, 'Ø'];
  const values = [...monatsSummen, avg];

  azChart.replaceChildren(baueBalkenDiagramm(
    labels, values, istAktuellesJahr ? aktuellerMonat : undefined, labels.length - 1));
}

function renderGesamtDiagramm(){
  const hist = state.historical;
  const { jahre, labels } = spaltenBeschriftungen();

  const periodenSummen = hist.periods.map((_, i) => {
    let s = 0;
    hist.groups.forEach(g => g.positions.forEach(p => { s += p.values[i] || 0; }));
    return s;
  });
  const jahresSummen = jahre.map(j => {
    let s = 0;
    const jd = state.years[String(j)];
    if(jd) jd.groups.forEach(g => g.positions.forEach(p => { s += jahresSpaltenWert(p.name, j); }));
    return s;
  });

  const werte = [...periodenSummen, ...jahresSummen];
  const avg = werte.length ? werte.reduce((a, b) => a + b, 0) / werte.length : 0;

  azTotalChart.replaceChildren(baueBalkenDiagramm(
    [...labels, 'Ø'], [...werte, avg], undefined, werte.length));
}

/* ---------- Unterfenster ---------- */
function oeffneDialog(dlg){
  dlg.hidden = false;
}
function schliesseDialog(dlg){
  dlg.hidden = true;
}
function obersterDialog(){
  const offen = [azDlgOverview, azDlgTotal, azDlgChart, azDlgTotalChart, azDlgExport]
    .filter(d => !d.hidden);
  return offen.length ? offen[offen.length - 1] : null;
}
function schliesseAlleDialoge(){
  [azDlgOverview, azDlgTotal, azDlgChart, azDlgTotalChart, azDlgExport]
    .forEach(d => { d.hidden = true; });
}

/* ---------- Sichern / Laden als Datei ---------- */
function exportJson(){
  return JSON.stringify(state, null, 2);
}
function dateiHerunterladen(text){
  try{
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auszahlungs-tracker-' + new Date().toISOString().slice(0, 10) + '.json';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }catch(e){
    return false;
  }
}

/* ---------- Start ---------- */
function init(){
  load();
  zeigeWarnung();

  // Schnittstelle für den Cloud-Abgleich (siehe js/cloud-sync.js): erlaubt,
  // den Stand nach dem Laden aus Firestore zu ersetzen, und liefert einen
  // Schnappschuss zum Hochladen. Erst hier definiert, nicht auf Modulebene —
  // sonst könnte ein Aufruf auf fehlende Elemente treffen.
  window.__auszahlungCloud = {
    replaceAllData(newData){
      // Passt die Form nicht, bleibt der bisherige Stand stehen und wird beim
      // nächsten Speichern hochgeladen — das Dokument heilt sich damit selbst.
      applyData(newData);
      schliesseAlleDialoge();
      zeigeMeldung('');
      writeNow();
      render();
    },
    getSnapshot(){
      return JSON.parse(JSON.stringify(state));
    }
  };

  /* --- Kopf --- */
  azYear.addEventListener('change', () => {
    const j = parseInt(azYear.value, 10);
    if(!isFinite(j) || j < MIN_JAHR || j > MAX_JAHR) return;
    state.currentYear = j;
    jahresDaten(j);
    save();
    render();
  });
  azMonth.addEventListener('change', () => {
    const m = parseInt(azMonth.value, 10);
    if(!isFinite(m) || m < 0 || m > 11) return;
    state.currentMonth = m;
    save();
    renderGruppen();
  });

  /* --- Gruppen --- */
  azAddGroup.addEventListener('click', () => {
    const jd = jahresDaten(state.currentYear);
    if(jd.groups.length >= MAX_GRUPPEN) return;
    jd.groups.push({
      id: uid(), name: 'Neue Gruppe',
      positions: [{ id: uid(), name: 'Neue Position', values: Array(12).fill(0) }]
    });
    save();
    renderGruppen();
  });

  azSave.addEventListener('click', () => {
    flush();
    writeNow();
    renderKopf();          // Folgejahr kann jetzt in der Auswahl erscheinen
    azSaveStatus.textContent = 'Gespeichert ✓';
    azSaveStatus.classList.add('saved');
  });

  /* --- Auswertungen --- */
  azOverviewBtn.addEventListener('click', () => { renderUebersicht(); oeffneDialog(azDlgOverview); });
  azTotalOverviewBtn.addEventListener('click', () => { renderGesamtuebersicht(); oeffneDialog(azDlgTotal); });
  azChartBtn.addEventListener('click', () => { renderDiagramm(); oeffneDialog(azDlgChart); });
  azTotalChartBtn.addEventListener('click', () => { renderGesamtDiagramm(); oeffneDialog(azDlgTotalChart); });

  document.querySelectorAll('[data-az-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dlg = btn.closest('.az-dialog');
      if(dlg) schliesseDialog(dlg);
    });
  });
  [azDlgOverview, azDlgTotal, azDlgChart, azDlgTotalChart, azDlgExport].forEach(dlg => {
    dlg.addEventListener('click', e => {
      if(e.target === dlg) schliesseDialog(dlg);
    });
  });

  /* --- Sichern / Laden --- */
  azExport.addEventListener('click', () => {
    flush();
    const text = exportJson();
    const ok = dateiHerunterladen(text);
    azExportText.value = text;
    azExportStatus.textContent = ok
      ? 'Datei-Download wurde gestartet. Falls nichts passiert: Text unten kopieren und selbst als .json-Datei speichern.'
      : 'Automatischer Download ist hier nicht möglich. Bitte Text unten kopieren und selbst als .json-Datei speichern.';
    oeffneDialog(azDlgExport);
  });
  azDownloadAgain.addEventListener('click', () => { dateiHerunterladen(azExportText.value); });
  azCopyExport.addEventListener('click', () => {
    const ta = azExportText;
    ta.focus();
    ta.select();
    const melde = () => {
      azCopyExport.textContent = 'Kopiert ✓';
      setTimeout(() => { azCopyExport.textContent = 'Text kopieren'; }, 2000);
    };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(ta.value).then(melde).catch(() => {});
    }
  });

  azFile.addEventListener('change', e => {
    const datei = e.target.files && e.target.files[0];
    if(!datei) return;
    if(datei.size > MAX_IMPORT_BYTES){
      zeigeMeldung('Datei ist zu groß (höchstens 2 MB).', true);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      zeigeMeldung('Datei konnte nicht gelesen werden.', true);
      e.target.value = '';
    };
    reader.onload = () => {
      try{
        const geparst = JSON.parse(String(reader.result));
        // Sowohl der blanke Stand als auch ein Umschlag mit "data" wird
        // angenommen — je nachdem, woher die Datei stammt.
        const roh = (geparst && typeof geparst === 'object' && geparst.data && !geparst.years)
          ? geparst.data
          : geparst;
        if(applyData(roh)){
          schliesseAlleDialoge();
          writeNow();
          render();
          zeigeMeldung('Sicherung wurde eingelesen.', false);
        } else {
          zeigeMeldung('Diese Datei enthält keine gültige Sicherung dieses Werkzeugs.', true);
        }
      }catch(err){
        zeigeMeldung('Diese Datei enthält keine gültige Sicherung dieses Werkzeugs.', true);
      }
      e.target.value = '';
    };
    reader.readAsText(datei);
  });

  /* --- Fenster --- */
  function oeffneTracker(){
    zeigeMeldung('');
    azSaveStatus.textContent = '';
    azSaveStatus.classList.remove('saved');
    openOverlay(azOverlay, azClose);
    render();
  }
  function schliesseTracker(){
    schliesseAlleDialoge();
    closeOverlay(azOverlay, azBtn);
  }
  azBtn.addEventListener('click', oeffneTracker);
  azClose.addEventListener('click', schliesseTracker);
  azOverlay.addEventListener('click', e => {
    if(e.target === azOverlay) schliesseTracker();
  });

  // Escape schließt immer nur die oberste Ebene.
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape' || azOverlay.hidden) return;
    const oben = obersterDialog();
    if(oben){ schliesseDialog(oben); return; }
    schliesseTracker();
  });

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') flush();
  });

  render();
}

// Der Auszahlungs-Tracker ist ein Zusatzwerkzeug — er darf den Start der App
// unter keinen Umständen verhindern. Fehlt eines seiner Elemente (etwa weil
// der Browser noch eine ältere index.html aus dem Zwischenspeicher anzeigt),
// wird er still übersprungen und das Budget läuft normal weiter.
const alleElementeDa = [
  azBtn, azOverlay, azClose, azWarn, azMonth, azYear, azGrandTotal, azGroups,
  azAddGroup, azSave, azSaveStatus, azMsg,
  azOverviewBtn, azTotalOverviewBtn, azChartBtn, azTotalChartBtn,
  azExport, azFile,
  azOverviewTable, azOverviewSum, azTotalTable, azTotalSum,
  azChart, azTotalChart,
  azExportStatus, azExportText, azDownloadAgain, azCopyExport,
  azDlgOverview, azDlgTotal, azDlgChart, azDlgTotalChart, azDlgExport
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
