/* =============================================================================
   PEN-TRACKER
   Eigenständiges Werkzeug hinter dem Waagen-Symbol rechts oben. Erfasst Pens
   (Preis, Einheiten, wöchentlich entnommene Einheiten) und das Körpergewicht
   und rechnet daraus Kosten pro Dosis, Kosten pro Kilo, BMI, Zielfortschritt
   und eine Prognose.

   Bewusst getrennt vom Budget: eigener Speicherschlüssel, keine Berührung mit
   allData, keine Cloud-Übertragung. Wie beim Gehaltsrechner und beim
   Konsumtopf holt sich das Modul alle Elemente selbst (statt über dom.js) und
   startet nur, wenn wirklich alle da sind — so kann eine ältere, zwischen-
   gespeicherte Datei die App nicht lahmlegen.

   Alle IDs sind mit "pt-" vorangestellt. Der Aufbau aller Listen läuft über
   die DOM-API statt über innerHTML, wie überall sonst in dieser App: die
   Vorlage arbeitete durchgehend mit innerHTML und Template-Strings, was mit
   selbst eingegebenen Texten grundsätzlich angreifbar wäre.

   Geldbeträge liegen wie im Budget als ganze Cent im Speicher, Gewichte als
   ganze Gramm — so entstehen beim Rechnen keine Rundungsfehler.
   ============================================================================= */
import { openOverlay, closeOverlay } from './overlays.js?v=17';

/* ---------- Konstanten ---------- */
const STORE_KEY = 'pentracker.v1';
const STORE_VERSION = 1;

const UNITS_PER_FULL_DOSE = 60;      // 1 volle Dosis = 60 Einheiten
const DOSE_STEPS = [2.5, 5, 7.5, 10, 12.5, 15];

const CHART_STEP_KG = 10;            // Abstand der Gitterlinien
const CHART_BASE_KG = 60;            // Y-Achse beginnt hier, nicht bei 0
const CHART_HEIGHT_PX = 180;
const CHART_COL_WIDTH = 14;
const CHART_COL_GAP = 3;
const FORECAST_WEEKS = 12;
const AVG_WINDOW = 4;                // Prognose auf Basis der letzten 4 Einträge

// Obergrenzen: fangen unsinnige Eingaben und aufgeblähte Importdateien ab,
// bevor sie den Speicher oder die Darstellung sprengen.
const MAX_PENS = 200;
const MAX_ENTRIES_PER_PEN = 500;
const MAX_WEIGHTS = 2000;
const MAX_PRICE_CENTS = 100000000;   // 1.000.000 €
const MAX_UNITS = 5000;
const MAX_GRAMS = 500000;            // 500 kg
const MAX_HEIGHT_CM = 260;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Gedeckte Farben passend zur Papier-Optik der App (die Vorlage kam aus einem
// dunklen Layout, deren Signalfarben würden hier herausstechen).
const DOSE_COLORS = ['#3c6e4f', '#a8783f', '#4a6b82', '#7f5a2e', '#8f6b9c', '#9c3b2e', '#5c7a4a', '#6b6b8f'];
const FORECAST_COLOR = '#8b949c';
const NO_DOSE_COLOR = '#b9bfc4';
const BMI_LIMIT = 30;                // Grenze, ab der die BMI-Linie eingezeichnet wird

const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

/* ---------- Elemente ---------- */
const ptBtn        = document.getElementById('pentracker-btn');
const ptOverlay    = document.getElementById('pentracker-overlay');
const ptClose      = document.getElementById('pentracker-close');
const ptWarning    = document.getElementById('pt-storage-warning');

const kpiWeight     = document.getElementById('pt-kpi-weight');
const kpiChange     = document.getElementById('pt-kpi-change');
const kpiChangePct  = document.getElementById('pt-kpi-change-pct');
const kpiAvg        = document.getElementById('pt-kpi-avg');
const kpiBmi        = document.getElementById('pt-kpi-bmi');
const kpiRest       = document.getElementById('pt-kpi-rest');
const kpiProgress   = document.getElementById('pt-kpi-progress');
const kpiTargetDate = document.getElementById('pt-kpi-target-date');
const kpiWeeks      = document.getElementById('pt-kpi-weeks');
const kpiCostDose   = document.getElementById('pt-kpi-cost-dose');
const kpiCostKg     = document.getElementById('pt-kpi-cost-kg');
const kpiTotalCost  = document.getElementById('pt-kpi-total-cost');

const penCount    = document.getElementById('pt-pen-count');
const penList     = document.getElementById('pt-pen-list');
const newPenBtn   = document.getElementById('pt-new-pen');
const weightCount = document.getElementById('pt-weight-count');
const weightList  = document.getElementById('pt-weight-list');
const newWeightBtn= document.getElementById('pt-new-weight');
const chartBox    = document.getElementById('pt-chart');
const chartLegend = document.getElementById('pt-chart-legend');

const showPricesBtn     = document.getElementById('pt-show-prices');
const showPriceTableBtn = document.getElementById('pt-show-price-table');
const settingsBtn       = document.getElementById('pt-settings-btn');
const exportBtn         = document.getElementById('pt-export');
const importFile        = document.getElementById('pt-import-file');
const backupMsg         = document.getElementById('pt-backup-msg');

const dlgPen       = document.getElementById('pt-dlg-pen');
const doseGrid     = document.getElementById('pt-dose-grid');
const penStart     = document.getElementById('pt-pen-start');
const penPrice     = document.getElementById('pt-pen-price');
const penUnits     = document.getElementById('pt-pen-units');
const penError     = document.getElementById('pt-pen-error');
const penSave      = document.getElementById('pt-pen-save');

const dlgWeek      = document.getElementById('pt-dlg-week');
const weekTitle    = document.getElementById('pt-week-title');
const weekDate     = document.getElementById('pt-week-date');
const weekLabelEl  = document.getElementById('pt-week-label');
const weekUnits    = document.getElementById('pt-week-units');
const weekError    = document.getElementById('pt-week-error');
const weekSave     = document.getElementById('pt-week-save');

const dlgWeight    = document.getElementById('pt-dlg-weight');
const weightDate   = document.getElementById('pt-weight-date');
const weightLabelEl= document.getElementById('pt-weight-label');
const weightValue  = document.getElementById('pt-weight-value');
const weightError  = document.getElementById('pt-weight-error');
const weightSave   = document.getElementById('pt-weight-save');

const dlgSettings  = document.getElementById('pt-dlg-settings');
const setHeight    = document.getElementById('pt-set-height');
const setStartW    = document.getElementById('pt-set-start-weight');
const setStartDate = document.getElementById('pt-set-start-date');
const setGoal      = document.getElementById('pt-set-goal');
const setError     = document.getElementById('pt-set-error');
const setSave      = document.getElementById('pt-set-save');
const resetAllBtn  = document.getElementById('pt-reset-all');

const dlgPrices      = document.getElementById('pt-dlg-prices');
const pricesImg      = document.getElementById('pt-prices-img');
const dlgPriceTable  = document.getElementById('pt-dlg-pricetable');
const priceTableImg  = document.getElementById('pt-pricetable-img');

const dlgConfirm   = document.getElementById('pt-dlg-confirm');
const confirmText  = document.getElementById('pt-confirm-text');
const confirmOk    = document.getElementById('pt-confirm-ok');
const confirmCancel= document.getElementById('pt-confirm-cancel');

/* ---------- Zustand ---------- */
function emptyState(){
  return {
    version: STORE_VERSION,
    pens: [],
    weights: [],
    settings: { heightCm: null, startGrams: null, goalGrams: null, startDate: null },
    nextPenId: 1,
    nextEntryId: 1
  };
}

// Bewusst KEINE Vorbelegung mit echten Gesundheitsdaten im Quellcode: dieses
// Repository ist öffentlich einsehbar, alles, was hier als Konstante steht,
// wäre für jeden im Internet lesbar (auch dauerhaft in der Git-Historie).
// Der bisherige Verlauf lässt sich stattdessen einmalig über "Daten aus
// Datei laden" einspielen (Einstellungen & Sicherung) — landet dann nur in
// Firestore/localStorage, beides durch den PIN-Login geschützt.

let state = emptyState();

/* ---------- Speicher ---------- */
function showWarning(text){
  ptWarning.textContent = text;
  ptWarning.hidden = false;
}
function clearWarning(){
  ptWarning.hidden = true;
}

function save(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    // Manche Umgebungen nehmen setItem an, speichern aber nichts — deshalb
    // gegenlesen statt blind auf Erfolg zu vertrauen.
    if(localStorage.getItem(STORE_KEY) == null) throw new Error('nicht übernommen');
    clearWarning();
  }catch(err){
    showWarning('Daten können auf diesem Gerät nicht gespeichert werden — Änderungen gehen beim Schließen verloren. '
      + 'Mögliche Ursache: privater Modus oder blockierte Website-Daten.');
    return false;
  }
  // Cloud-Sync: außerhalb dieses Moduls gesetzter Hook, sobald eingeloggt
  // (siehe js/cloud-sync.js). Lokales Speichern bleibt davon unberührt und
  // läuft immer sofort, unabhängig vom Internetzugang — genau wie bei
  // Budget und Konsumtopf.
  if(typeof window.__onPentrackerLocalSave === 'function'){
    try{ window.__onPentrackerLocalSave(state); }catch(err){ /* nächste Änderung versucht es erneut */ }
  }
  return true;
}

function load(){
  let raw = null;
  try{
    raw = localStorage.getItem(STORE_KEY);
  }catch(err){
    showWarning('Auf den Speicher dieses Geräts kann nicht zugegriffen werden — Änderungen gehen beim Schließen verloren.');
    return emptyState();
  }
  if(!raw) return emptyState();
  try{
    return sanitize(JSON.parse(raw));
  }catch(err){
    return emptyState();
  }
}

/* Prüft fremde/alte Daten Feld für Feld. Alles, was nicht passt, fällt weg —
   damit eine kaputte oder manipulierte Datei die Anzeige nicht durcheinander-
   bringen kann. */
function intOrNull(value, min, max){
  if(typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if(rounded < min || rounded > max) return null;
  return rounded;
}
function isIsoDate(value){
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
/* Liest den Wert eines Datumsfelds robust aus: normalerweise liefert
   <input type="date"> bereits ISO (JJJJ-MM-TT), aber falls der Browser das
   Feld als reinen Textinput behandelt (fehlende Unterstützung, In-App-
   Browser o. Ä.), kommt oft TT.MM.JJJJ wie eingetippt zurück. Beides wird
   hier auf ISO normalisiert; alles andere ergibt ''. */
function normalizeDateInput(value){
  if(typeof value !== 'string') return '';
  const v = value.trim();
  if(v === '') return '';
  if(isIsoDate(v)) return v;
  const m = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if(m){
    const iso = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if(isIsoDate(iso)) return iso;
  }
  return '';
}

export function sanitize(raw){
  const clean = emptyState();
  if(!raw || typeof raw !== 'object') return clean;

  const pens = Array.isArray(raw.pens) ? raw.pens.slice(0, MAX_PENS) : [];
  let maxPenId = 0;
  let maxEntryId = 0;

  pens.forEach(pen => {
    if(!pen || typeof pen !== 'object') return;
    const id = intOrNull(pen.id, 1, Number.MAX_SAFE_INTEGER);
    const priceCents = intOrNull(pen.priceCents, 0, MAX_PRICE_CENTS);
    const totalUnits = intOrNull(pen.totalUnits, 1, MAX_UNITS);
    const doseMg = DOSE_STEPS.includes(pen.doseMg) ? pen.doseMg : null;
    if(id === null || priceCents === null || totalUnits === null || doseMg === null) return;
    if(clean.pens.some(p => p.id === id)) return;   // doppelte IDs verwerfen

    const entries = [];
    const rawEntries = Array.isArray(pen.entries) ? pen.entries.slice(0, MAX_ENTRIES_PER_PEN) : [];
    rawEntries.forEach(entry => {
      if(!entry || typeof entry !== 'object') return;
      const eid = intOrNull(entry.id, 1, Number.MAX_SAFE_INTEGER);
      const units = intOrNull(entry.units, 1, MAX_UNITS);
      if(eid === null || units === null || !isIsoDate(entry.date)) return;
      if(entries.some(e => e.id === eid)) return;
      entries.push({ id: eid, date: entry.date, units });
      if(eid > maxEntryId) maxEntryId = eid;
    });

    clean.pens.push({
      id,
      doseMg,
      startDate: isIsoDate(pen.startDate) ? pen.startDate : null,
      priceCents,
      totalUnits,
      closed: pen.closed === true,
      uiOpen: pen.uiOpen === true,
      entries
    });
    if(id > maxPenId) maxPenId = id;
  });

  const weights = Array.isArray(raw.weights) ? raw.weights.slice(0, MAX_WEIGHTS) : [];
  weights.forEach(entry => {
    if(!entry || typeof entry !== 'object') return;
    const id = intOrNull(entry.id, 1, Number.MAX_SAFE_INTEGER);
    const grams = intOrNull(entry.grams, 1, MAX_GRAMS);
    if(id === null || grams === null || !isIsoDate(entry.date)) return;
    if(clean.weights.some(w => w.id === id)) return;
    clean.weights.push({ id, date: entry.date, grams });
    if(id > maxEntryId) maxEntryId = id;
  });

  const s = (raw.settings && typeof raw.settings === 'object') ? raw.settings : {};
  clean.settings.heightCm   = intOrNull(s.heightCm, 1, MAX_HEIGHT_CM);
  clean.settings.startGrams = intOrNull(s.startGrams, 1, MAX_GRAMS);
  clean.settings.goalGrams  = intOrNull(s.goalGrams, 1, MAX_GRAMS);
  clean.settings.startDate  = isIsoDate(s.startDate) ? s.startDate : null;

  clean.nextPenId   = Math.max(maxPenId + 1, intOrNull(raw.nextPenId, 1, Number.MAX_SAFE_INTEGER) || 1);
  clean.nextEntryId = Math.max(maxEntryId + 1, intOrNull(raw.nextEntryId, 1, Number.MAX_SAFE_INTEGER) || 1);
  return clean;
}

function nextEntryId(){
  return state.nextEntryId++;
}

/* ---------- Kalenderwoche & Datum ---------- */
function isoWeekInfo(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);   // Donnerstag dieser Woche
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if(target.getDay() !== 4){
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const week = 1 + Math.round((firstThursday - target.valueOf()) / (7 * 24 * 3600 * 1000));
  // Das Jahr der Kalenderwoche ist das Jahr ihres Donnerstags, nicht des Datums.
  return { year: new Date(firstThursday).getFullYear(), week };
}
function weekKey(dateStr){
  const info = isoWeekInfo(dateStr);
  return info.year + '-W' + String(info.week).padStart(2, '0');
}
function weekLabel(dateStr){
  const info = isoWeekInfo(dateStr);
  return 'KW ' + info.week + ' / ' + info.year;
}
function todayStr(){
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;   // lokales Datum, nicht UTC
}
function addDaysStr(dateStr, days){
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}
function daysBetween(fromStr, toStr){
  const a = new Date(fromStr + 'T00:00:00').getTime();
  const b = new Date(toStr + 'T00:00:00').getTime();
  return Math.round((b - a) / (24 * 3600 * 1000));
}
function fmtDate(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return String(d.getDate()).padStart(2, '0') + '.'
       + String(d.getMonth() + 1).padStart(2, '0') + '.'
       + d.getFullYear();
}

/* ---------- Zahlen ---------- */
const eurFormatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtEur(cents){
  if(cents == null || !Number.isFinite(cents)) return '–';
  return eurFormatter.format(cents / 100) + ' €';
}
function fmtNum(value, digits){
  if(value == null || !Number.isFinite(value)) return '–';
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtKg(grams, digits){
  if(grams == null || !Number.isFinite(grams)) return '–';
  return fmtNum(grams / 1000, digits === undefined ? 1 : digits) + ' kg';
}
// Akzeptiert Komma wie Punkt, wie überall sonst in der App.
function parseDecimal(raw){
  if(typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if(normalized === '') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
function parseGrams(raw){
  const value = parseDecimal(raw);
  if(value === null || value <= 0) return null;
  const grams = Math.round(value * 1000);
  return (grams >= 1 && grams <= MAX_GRAMS) ? grams : null;
}
function parseCents(raw){
  const value = parseDecimal(raw);
  if(value === null || value < 0) return null;
  const cents = Math.round(value * 100);
  return (cents >= 0 && cents <= MAX_PRICE_CENTS) ? cents : null;
}

/* ---------- Berechnungen ---------- */
function pricePerUnitCents(pen){
  if(!pen.priceCents || !pen.totalUnits) return 0;
  return pen.priceCents / pen.totalUnits;
}
function penUsedUnits(pen){
  return pen.entries.reduce((sum, e) => sum + e.units, 0);
}
function penRemainingUnits(pen){
  return Math.max(0, pen.totalUnits - penUsedUnits(pen));
}
function sortedEntries(pen){
  return [...pen.entries].sort((a, b) => a.date.localeCompare(b.date));
}

// Wie lange der Pen noch reicht — auf Basis der zuletzt eingetragenen
// Wochenmenge, nicht des Durchschnitts (die Dosis wird ja hochgesetzt).
function penForecast(pen){
  if(pen.closed || !pen.entries.length) return null;
  const remaining = penRemainingUnits(pen);
  if(remaining <= 0) return null;
  const entries = sortedEntries(pen);
  const last = entries[entries.length - 1];
  if(!last.units || last.units <= 0) return null;
  const weeksLeft = remaining / last.units;
  return { date: addDaysStr(last.date, Math.round(weeksLeft * 7)), weeksLeft };
}

function totalSpentCents(){
  return state.pens.reduce((sum, pen) => sum + penUsedUnits(pen) * pricePerUnitCents(pen), 0);
}
function totalDoses(){
  return state.pens.reduce((sum, pen) => sum + pen.entries.length, 0);
}
function costPerDoseCents(){
  const doses = totalDoses();
  return doses > 0 ? totalSpentCents() / doses : null;
}

function sortedWeights(){
  return [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
}
function startGrams(){
  if(state.settings.startGrams != null) return state.settings.startGrams;
  const w = sortedWeights();
  return w.length ? w[0].grams : null;
}
function currentGrams(){
  const w = sortedWeights();
  return w.length ? w[w.length - 1].grams : null;
}
function bmi(grams){
  const h = state.settings.heightCm;
  if(!grams || !h) return null;
  const m = h / 100;
  return (grams / 1000) / (m * m);
}
// Gewicht, ab dem der BMI die Grenze von 30 überschreitet.
function bmiLimitGrams(){
  const h = state.settings.heightCm;
  if(!h) return null;
  const m = h / 100;
  return Math.round(BMI_LIMIT * m * m * 1000);
}

/* windowSize = Anzahl der letzten Einträge. Ohne Angabe zählt der gesamte
   Zeitraum, dann bildet das fest hinterlegte Startgewicht den Anfang. */
function avgLossPerWeekGrams(windowSize){
  const all = sortedWeights();
  if(all.length < 2 && !(state.settings.startGrams != null && state.settings.startDate && all.length >= 1)) return null;

  let start, end;
  if(windowSize){
    const w = all.slice(-windowSize);
    if(w.length < 2) return null;
    start = w[0];
    end = w[w.length - 1];
  } else {
    end = all[all.length - 1];
    const hasFixedStart = state.settings.startGrams != null && state.settings.startDate != null;
    start = hasFixedStart
      ? { date: state.settings.startDate, grams: state.settings.startGrams }
      : all[0];
  }
  if(!start || !end || start.date === end.date) return null;

  const weeks = Math.max(1, Math.round(daysBetween(start.date, end.date) / 7));
  return (start.grams - end.grams) / weeks;
}

function goalProgressPct(){
  const start = startGrams();
  const now = currentGrams();
  const goal = state.settings.goalGrams;
  if(start == null || now == null || goal == null) return null;
  const toLose = start - goal;
  if(toLose <= 0) return null;
  return Math.max(0, Math.min(100, ((start - now) / toLose) * 100));
}

/* Hinweis zum Abgleich mit der Vorlage: dort wurde der Zieltermin als
   Zeitstempel mit Bruchteilen eines Tages gerechnet und beim Anzeigen auf den
   angefangenen Tag abgeschnitten. Hier wird auf ganze Tage gerundet — bei
   einem halben Tag Rest kann der Termin deshalb einen Tag später liegen als
   in der Vorlage. Alle übrigen Kennzahlen stimmen aufs Zeichen überein. */
function forecastGoal(avgLoss){
  const now = currentGrams();
  const goal = state.settings.goalGrams;
  if(now == null || goal == null || avgLoss == null || avgLoss <= 0) return null;
  const remaining = now - goal;
  if(remaining <= 0) return { reached: true };
  const weeks = remaining / avgLoss;
  const w = sortedWeights();
  return { reached: false, date: addDaysStr(w[w.length - 1].date, Math.round(weeks * 7)), weeks };
}

/* ---------- Kleine DOM-Helfer ---------- */
function elem(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function clear(node){
  while(node.firstChild) node.removeChild(node.firstChild);
}
function emptyBox(titleText, hintText){
  const box = elem('div', 'pt-empty');
  box.appendChild(elem('strong', null, titleText));
  box.appendChild(elem('span', null, hintText));
  return box;
}

/* ---------- Kennzahlen ---------- */
function renderKpis(){
  const start = startGrams();
  const now = currentGrams();

  kpiWeight.textContent = now != null ? fmtKg(now) : '–';

  let delta = null;
  if(start != null && now != null && start > 0){
    delta = start - now;
    const sign = delta >= 0 ? '−' : '+';
    kpiChange.textContent = sign + fmtKg(Math.abs(delta));
    kpiChangePct.textContent = sign + fmtNum(Math.abs(delta / start) * 100, 1) + ' %';
  } else {
    kpiChange.textContent = '–';
    kpiChangePct.textContent = '–';
  }

  const avgAll = avgLossPerWeekGrams();
  kpiAvg.textContent = avgAll != null ? fmtKg(avgAll) : '–';

  const nowBmi = bmi(now);
  kpiBmi.textContent = nowBmi != null ? fmtNum(nowBmi, 1) : '–';

  const goal = state.settings.goalGrams;
  const pct = goalProgressPct();
  kpiProgress.textContent = pct != null ? fmtNum(pct, 0) + ' %' : '–';

  if(goal == null || now == null){
    kpiRest.textContent = '–';
  } else {
    kpiRest.textContent = fmtKg(Math.max(0, now - goal));
  }

  const fc = forecastGoal(avgLossPerWeekGrams(AVG_WINDOW));
  if(goal == null){
    kpiTargetDate.textContent = '–';
    kpiWeeks.textContent = '–';
  } else if(!fc){
    kpiTargetDate.textContent = 'Zu wenig Daten';
    kpiWeeks.textContent = '–';
  } else if(fc.reached){
    kpiTargetDate.textContent = 'Ziel erreicht';
    kpiWeeks.textContent = '0';
  } else {
    kpiTargetDate.textContent = fmtDate(fc.date);
    kpiWeeks.textContent = String(Math.ceil(fc.weeks));
  }

  const perDose = costPerDoseCents();
  kpiCostDose.textContent = perDose != null ? fmtEur(perDose) : '–';

  const spent = totalSpentCents();
  kpiCostKg.textContent = (delta != null && delta > 0 && spent > 0)
    ? fmtEur(spent / (delta / 1000)) + '/kg'
    : '–';
  kpiTotalCost.textContent = spent > 0 ? fmtEur(spent) : '–';
}

/* ---------- Pens ---------- */
function penStatRow(labelText, valueText){
  const box = elem('div', 'pt-stat');
  box.appendChild(elem('span', 'pt-stat-label', labelText));
  box.appendChild(elem('span', 'pt-stat-value', valueText));
  return box;
}

function buildPenCard(pen, showForecast){
  const used = penUsedUnits(pen);
  const remaining = penRemainingUnits(pen);
  const fillPct = pen.totalUnits ? Math.max(0, Math.min(100, (remaining / pen.totalUnits) * 100)) : 0;
  const ppu = pricePerUnitCents(pen);

  const card = elem('div', 'pt-pen-card' + (pen.closed ? ' closed' : '') + (pen.uiOpen ? ' open' : ''));

  /* Kopf: anklickbar zum Auf-/Zuklappen */
  const head = elem('button', 'pt-pen-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', pen.uiOpen ? 'true' : 'false');

  const idRow = elem('span', 'pt-pen-id');
  const vial = elem('span', 'pt-vial');
  const vialFill = elem('span', 'pt-vial-fill');
  vialFill.style.height = fillPct.toFixed(1) + '%';
  vial.appendChild(vialFill);
  idRow.appendChild(vial);

  const titles = elem('span', 'pt-pen-titles');
  titles.appendChild(elem('span', 'pt-pen-title', 'Pen #' + pen.id + ' · ' + fmtNum(pen.doseMg, 1) + ' mg'));
  titles.appendChild(elem('span', 'pt-pen-meta', remaining + ' / ' + pen.totalUnits + ' Einheiten übrig'));
  idRow.appendChild(titles);
  head.appendChild(idRow);

  const statusWrap = elem('span', 'pt-pen-status-wrap');
  statusWrap.appendChild(elem('span', 'pt-pen-status ' + (pen.closed ? 'closed' : 'active'), pen.closed ? 'Geschlossen' : 'Aktiv'));
  statusWrap.appendChild(elem('span', 'pt-chevron', '▾'));
  head.appendChild(statusWrap);

  head.addEventListener('click', () => {
    pen.uiOpen = !pen.uiOpen;
    save();
    renderPens();
  });
  card.appendChild(head);

  /* Körper */
  const body = elem('div', 'pt-pen-body');

  const stats = elem('div', 'pt-stats');
  stats.appendChild(penStatRow('Preis', fmtEur(pen.priceCents)));
  stats.appendChild(penStatRow('€ / Einheit', fmtEur(ppu)));
  stats.appendChild(penStatRow('€ / volle Dosis', fmtEur(ppu * UNITS_PER_FULL_DOSE)));
  const avgUnits = pen.entries.length ? used / pen.entries.length : null;
  stats.appendChild(penStatRow('€ / Dosis dieses Pens', avgUnits ? fmtEur(ppu * avgUnits) : '–'));
  body.appendChild(stats);

  /* Gesamteinheiten nachträglich korrigieren */
  const unitsField = elem('div', 'pt-field');
  const unitsLabel = elem('label', 'pt-label', 'Gesamteinheiten im Pen');
  const unitsInputId = 'pt-total-units-' + pen.id;
  unitsLabel.setAttribute('for', unitsInputId);
  unitsField.appendChild(unitsLabel);

  const unitsRow = elem('div', 'pt-inline-row');
  const unitsInput = document.createElement('input');
  unitsInput.type = 'number';
  unitsInput.step = '1';
  unitsInput.min = '1';
  unitsInput.id = unitsInputId;
  unitsInput.value = String(pen.totalUnits);
  const unitsBtn = elem('button', 'pt-btn pt-btn-ghost pt-btn-sm', 'Speichern');
  unitsBtn.type = 'button';
  unitsRow.appendChild(unitsInput);
  unitsRow.appendChild(unitsBtn);
  unitsField.appendChild(unitsRow);

  const unitsError = elem('p', 'pt-error');
  unitsError.hidden = true;
  unitsField.appendChild(unitsError);
  unitsField.appendChild(elem('p', 'pt-hint', 'Nachträglich änderbar, falls der Pen mehr oder weniger Einheiten enthält als angenommen.'));

  unitsBtn.addEventListener('click', () => {
    const value = parseInt(unitsInput.value, 10);
    if(!Number.isFinite(value) || value < 1 || value > MAX_UNITS){
      unitsError.textContent = 'Bitte eine gültige Zahl eingeben.';
      unitsError.hidden = false;
      return;
    }
    if(value < used){
      unitsError.textContent = 'Aus diesem Pen wurden bereits ' + used + ' Einheiten entnommen — die Gesamtzahl kann nicht darunter liegen.';
      unitsError.hidden = false;
      return;
    }
    unitsError.hidden = true;
    pen.totalUnits = value;
    pen.uiOpen = true;
    renderAll();
  });
  body.appendChild(unitsField);

  /* Wocheneinträge */
  const weeks = elem('div', 'pt-week-list');
  const entries = sortedEntries(pen);
  if(!entries.length){
    weeks.appendChild(elem('p', 'pt-hint', 'Noch keine wöchentlichen Einträge.'));
  } else {
    entries.forEach(entry => {
      const row = elem('div', 'pt-week-row');
      // Datum und Menge liegen in einem eigenen Kasten, damit sie auf
      // schmalen Displays gemeinsam umbrechen und das Löschkreuz stehen bleibt.
      const inner = elem('span', 'pt-week-inner');
      inner.appendChild(elem('span', 'pt-week-when', weekLabel(entry.date) + ' · ' + fmtDate(entry.date)));
      const mg = (entry.units / UNITS_PER_FULL_DOSE) * pen.doseMg;
      const amount = elem('span', 'pt-week-units', entry.units + ' E. · ' + fmtNum(mg, 2) + ' mg');
      amount.appendChild(elem('span', 'pt-week-cost', ' · ' + fmtEur(entry.units * ppu)));
      inner.appendChild(amount);
      row.appendChild(inner);

      const del = elem('button', 'pt-del', '✕');
      del.type = 'button';
      del.setAttribute('aria-label', 'Eintrag vom ' + fmtDate(entry.date) + ' löschen');
      del.addEventListener('click', () => {
        askConfirm('Diesen Wochen-Eintrag löschen?', 'Löschen').then(ok => {
          if(!ok) return;
          pen.entries = pen.entries.filter(e => e.id !== entry.id);
          pen.closed = false;      // Pen ist danach nicht mehr leer
          pen.uiOpen = true;
          renderAll();
        });
      });
      row.appendChild(del);
      weeks.appendChild(row);
    });
  }
  body.appendChild(weeks);

  /* Aktionen */
  const actions = elem('div', 'pt-pen-actions');
  const addBtn = elem('button', 'pt-btn pt-btn-accent pt-btn-sm', '+ Woche eintragen');
  addBtn.type = 'button';
  addBtn.addEventListener('click', () => openWeekDialog(pen.id));
  actions.appendChild(addBtn);

  const toggleBtn = elem('button', 'pt-btn pt-btn-ghost pt-btn-sm', pen.closed ? 'Wieder öffnen' : 'Pen schließen');
  toggleBtn.type = 'button';
  toggleBtn.addEventListener('click', () => {
    pen.closed = !pen.closed;
    pen.uiOpen = true;
    renderAll();
  });
  actions.appendChild(toggleBtn);

  const delPen = elem('button', 'pt-btn pt-btn-danger pt-btn-sm', 'Löschen');
  delPen.type = 'button';
  delPen.addEventListener('click', () => {
    askConfirm('Pen #' + pen.id + ' mit allen Einträgen wirklich löschen?', 'Löschen').then(ok => {
      if(!ok) return;
      state.pens = state.pens.filter(p => p.id !== pen.id);
      renderAll();
    });
  });
  actions.appendChild(delPen);
  body.appendChild(actions);

  if(showForecast){
    const fc = penForecast(pen);
    if(fc){
      const info = isoWeekInfo(fc.date);
      body.appendChild(elem('p', 'pt-pen-forecast', 'Reicht voraussichtlich bis KW ' + info.week + ' · ' + fmtDate(fc.date)));
    }
  }

  card.appendChild(body);
  return card;
}

function renderPens(){
  penCount.textContent = state.pens.length ? String(state.pens.length) : '';
  clear(penList);

  if(!state.pens.length){
    penList.appendChild(emptyBox('Noch kein Pen angelegt', 'Lege den ersten Pen an, um Dosis und Kosten zu erfassen.'));
    return;
  }

  // Offene Pens oben, darin der zuletzt begonnene zuerst.
  const sorted = [...state.pens].sort((a, b) => {
    if(a.closed !== b.closed) return a.closed ? 1 : -1;
    return b.id - a.id;
  });
  const open = state.pens.filter(p => !p.closed);
  const latestOpenId = open.length ? open.reduce((max, p) => (p.id > max.id ? p : max), open[0]).id : null;

  const fragment = document.createDocumentFragment();
  sorted.forEach(pen => fragment.appendChild(buildPenCard(pen, pen.id === latestOpenId)));
  penList.appendChild(fragment);
}

/* ---------- Gewicht ---------- */
function renderWeights(){
  const list = sortedWeights();
  weightCount.textContent = list.length ? String(list.length) : '';
  clear(weightList);

  if(!list.length){
    weightList.appendChild(emptyBox('Noch kein Gewicht erfasst', 'Trage dein Startgewicht ein, um den Verlauf zu sehen.'));
    return;
  }

  const card = elem('div', 'pt-weight-card');
  const fragment = document.createDocumentFragment();

  for(let i = list.length - 1; i >= 0; i--){
    const entry = list[i];
    const prev = i > 0 ? list[i - 1].grams : state.settings.startGrams;
    const row = elem('div', 'pt-weight-row');
    row.appendChild(elem('span', 'pt-weight-when', weekLabel(entry.date)));

    const valueWrap = elem('span', 'pt-weight-values');
    valueWrap.appendChild(elem('span', 'pt-weight-kg', fmtKg(entry.grams, 2)));
    if(prev != null){
      const diff = entry.grams - prev;
      valueWrap.appendChild(elem('span', 'pt-weight-trend' + (diff <= 0 ? ' down' : ' up'),
        (diff > 0 ? '+' : '−') + fmtKg(Math.abs(diff))));
    }
    row.appendChild(valueWrap);

    const del = elem('button', 'pt-del', '✕');
    del.type = 'button';
    del.setAttribute('aria-label', 'Gewichtseintrag vom ' + fmtDate(entry.date) + ' löschen');
    del.addEventListener('click', () => {
      askConfirm('Diesen Gewichtseintrag löschen?', 'Löschen').then(ok => {
        if(!ok) return;
        state.weights = state.weights.filter(w => w.id !== entry.id);
        renderAll();
      });
    });
    row.appendChild(del);
    fragment.appendChild(row);
  }

  card.appendChild(fragment);
  weightList.appendChild(card);
}

/* ---------- Verlaufsdiagramm ----------
   Balken pro Gewichtseintrag, eingefärbt nach der in dieser Kalenderwoche
   verabreichten Dosis; dahinter zwölf Prognosewochen. Gitter-, Ziel- und
   BMI-Linie liegen absolut über der scrollbaren Balkenfläche. */
function weekDoseMap(){
  const map = Object.create(null);
  state.pens.forEach(pen => {
    pen.entries.forEach(entry => {
      const key = weekKey(entry.date);
      const mg = (entry.units / UNITS_PER_FULL_DOSE) * pen.doseMg;
      map[key] = (map[key] || 0) + mg;
    });
  });
  return map;
}

function renderChart(){
  clear(chartBox);
  clear(chartLegend);

  const weights = sortedWeights();
  if(weights.length < 2){
    chartBox.appendChild(elem('p', 'pt-chart-empty', 'Mindestens zwei Gewichtseinträge nötig, um den Verlauf zu zeichnen.'));
    return;
  }

  const doseMap = weekDoseMap();
  const pointDoses = weights.map(entry => {
    const mg = doseMap[weekKey(entry.date)];
    return mg != null ? Math.round(mg * 100) / 100 : null;
  });
  const uniqueDoses = [...new Set(pointDoses.filter(d => d != null))].sort((a, b) => a - b);
  const colorFor = Object.create(null);
  uniqueDoses.forEach((dose, i) => { colorFor[dose] = DOSE_COLORS[i % DOSE_COLORS.length]; });

  /* Prognose */
  const avg = avgLossPerWeekGrams(AVG_WINDOW);
  const last = weights[weights.length - 1];
  const forecast = [];
  if(avg != null && avg > 0){
    let grams = last.grams;
    let date = last.date;
    for(let i = 1; i <= FORECAST_WEEKS; i++){
      grams -= avg;
      date = addDaysStr(date, 7);
      forecast.push({ date, grams });
    }
  }

  const goal = state.settings.goalGrams;
  const bmiGrams = bmiLimitGrams();

  /* Y-Achse: feste Basis 60 kg, 10-kg-Schritte, oben bis über den höchsten Wert */
  const values = [
    ...weights.map(w => w.grams),
    ...forecast.map(p => p.grams),
    ...(goal != null ? [goal] : []),
    ...(bmiGrams != null ? [bmiGrams] : [])
  ];
  const baseG = CHART_BASE_KG * 1000;
  const stepG = CHART_STEP_KG * 1000;
  const highest = Math.max(...values, baseG + stepG);
  const lowest = Math.min(...values, baseG);
  const topG = Math.ceil(highest / stepG) * stepG;
  const bottomG = Math.min(baseG, Math.floor(lowest / stepG) * stepG);
  const rangeG = Math.max(stepG, topG - bottomG);
  const gramsToPx = g => Math.max(0, ((g - bottomG) / rangeG) * CHART_HEIGHT_PX);

  const totalCols = weights.length + forecast.length;
  const totalWidth = totalCols * CHART_COL_WIDTH + Math.max(0, totalCols - 1) * CHART_COL_GAP;

  /* Kopfzeile */
  const summary = elem('div', 'pt-chart-summary');
  const startG = startGrams();
  const leftBox = elem('div');
  leftBox.appendChild(elem('span', 'pt-chart-summary-label', 'Zeitraum gesamt'));
  leftBox.appendChild(elem('span', 'pt-chart-summary-value',
    startG != null ? '−' + fmtKg(startG - last.grams) : '–'));
  summary.appendChild(leftBox);
  const rightBox = elem('div', 'pt-chart-summary-right');
  rightBox.appendChild(elem('span', 'pt-chart-summary-label', 'Aktuell'));
  rightBox.appendChild(elem('span', 'pt-chart-summary-value', fmtKg(last.grams)));
  summary.appendChild(rightBox);
  chartBox.appendChild(summary);

  /* Achse und Balkenfläche */
  const wrap = elem('div', 'pt-chart-wrap');
  // Die Beschriftung sitzt absolut auf derselben Höhe wie ihre Gitterlinie.
  // Gleichmäßig verteilte Beschriftungen liefen sonst gegenüber den Linien
  // aus dem Tritt, weil Achse und Balkenfläche unterschiedlich hoch sind.
  const axis = elem('div', 'pt-chart-axis');
  const steps = Math.round(rangeG / stepG);
  for(let s = steps; s >= 0; s--){
    const value = bottomG + s * stepG;
    const label = elem('span', null, String(value / 1000));
    label.style.top = (CHART_HEIGHT_PX - gramsToPx(value)).toFixed(0) + 'px';
    axis.appendChild(label);
  }
  wrap.appendChild(axis);

  const bars = elem('div', 'pt-chart-bars');

  for(let s = steps; s >= 0; s--){
    const line = elem('div', 'pt-gridline');
    line.style.top = (CHART_HEIGHT_PX - gramsToPx(bottomG + s * stepG)).toFixed(0) + 'px';
    line.style.width = totalWidth + 'px';
    bars.appendChild(line);
  }
  if(goal != null && goal >= bottomG && goal <= topG){
    const line = elem('div', 'pt-goalline');
    line.style.top = (CHART_HEIGHT_PX - gramsToPx(goal)).toFixed(0) + 'px';
    line.style.width = totalWidth + 'px';
    line.appendChild(elem('span', 'pt-line-label goal', 'Ziel ' + fmtKg(goal)));
    bars.appendChild(line);
  }
  if(bmiGrams != null && bmiGrams >= bottomG && bmiGrams <= topG){
    const line = elem('div', 'pt-bmiline');
    line.style.top = (CHART_HEIGHT_PX - gramsToPx(bmiGrams)).toFixed(0) + 'px';
    line.style.width = totalWidth + 'px';
    line.appendChild(elem('span', 'pt-line-label bmi', 'BMI ' + BMI_LIMIT + ' · ' + fmtKg(bmiGrams)));
    bars.appendChild(line);
  }

  const seenMonths = new Set();
  function monthLabelFor(dateStr){
    const d = new Date(dateStr + 'T00:00:00');
    const key = d.getFullYear() + '-' + d.getMonth();
    if(seenMonths.has(key)) return null;
    seenMonths.add(key);
    return MONTHS_SHORT[d.getMonth()];
  }

  function addColumn(dateStr, grams, color, isForecast, forceStart, titleExtra){
    const label = monthLabelFor(dateStr);
    let cls = 'pt-bar-col';
    if(isForecast) cls += ' forecast';
    if(forceStart) cls += ' forecast-start';
    else if(label) cls += ' month-start';

    const col = elem('div', cls);
    col.title = (isForecast ? 'Prognose ' : '') + weekLabel(dateStr) + ': ' + fmtKg(grams) + (titleExtra || '');
    const bar = elem('div', 'pt-bar' + (isForecast ? ' forecast-bar' : ''));
    bar.style.height = Math.max(2, gramsToPx(grams)).toFixed(0) + 'px';
    bar.style.background = color;
    col.appendChild(bar);
    if(label) col.appendChild(elem('span', 'pt-bar-month', label));
    bars.appendChild(col);
  }

  weights.forEach((entry, i) => {
    const dose = pointDoses[i];
    addColumn(entry.date, entry.grams, dose != null ? colorFor[dose] : NO_DOSE_COLOR, false, false,
      dose != null ? ' · ' + fmtNum(dose, 2) + ' mg/Woche' : '');
  });
  forecast.forEach((point, i) => addColumn(point.date, point.grams, FORECAST_COLOR, true, i === 0, ''));

  wrap.appendChild(bars);
  chartBox.appendChild(wrap);

  /* Legende */
  uniqueDoses.forEach(dose => {
    const item = elem('span', 'pt-legend-item');
    const swatch = elem('span', 'pt-legend-swatch');
    swatch.style.background = colorFor[dose];
    item.appendChild(swatch);
    item.appendChild(elem('span', null, fmtNum(dose, 2) + ' mg / Woche'));
    chartLegend.appendChild(item);
  });
  if(pointDoses.some(d => d == null)){
    const item = elem('span', 'pt-legend-item');
    const swatch = elem('span', 'pt-legend-swatch');
    swatch.style.background = NO_DOSE_COLOR;
    item.appendChild(swatch);
    item.appendChild(elem('span', null, 'keine Dosis erfasst'));
    chartLegend.appendChild(item);
  }
  if(forecast.length){
    const item = elem('span', 'pt-legend-item');
    const swatch = elem('span', 'pt-legend-swatch');
    swatch.style.background = FORECAST_COLOR;
    item.appendChild(swatch);
    item.appendChild(elem('span', null, 'Prognose (' + FORECAST_WEEKS + ' Wochen)'));
    chartLegend.appendChild(item);
  }
}

function renderAll(){
  renderKpis();
  renderPens();
  renderWeights();
  renderChart();
  save();
}

/* ---------- Dialoge ---------- */
let lastFocus = null;

function openDialog(dialog, focusEl){
  lastFocus = document.activeElement;
  dialog.hidden = false;
  if(focusEl) focusEl.focus();
}
function closeDialog(dialog){
  dialog.hidden = true;
  if(lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
}
function closeAllDialogs(){
  [dlgPen, dlgWeek, dlgWeight, dlgSettings, dlgPrices, dlgPriceTable].forEach(d => { d.hidden = true; });
}
function topDialog(){
  return [dlgConfirm, dlgPen, dlgWeek, dlgWeight, dlgSettings, dlgPrices, dlgPriceTable].find(d => !d.hidden) || null;
}

/* Eigener Bestätigungsdialog: window.confirm wird in manchen In-App-Browsern
   stillschweigend unterdrückt und liefert sofort false — Löschen liefe dort
   nie. Dieser Dialog ist reines DOM und funktioniert überall. */
let confirmResolve = null;
function askConfirm(text, okLabel){
  return new Promise(resolve => {
    confirmResolve = resolve;
    confirmText.textContent = text;
    confirmOk.textContent = okLabel || 'Bestätigen';
    dlgConfirm.hidden = false;
    confirmOk.focus();
  });
}
function settleConfirm(result){
  dlgConfirm.hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  if(resolve) resolve(result);
}

function showError(node, text){
  node.textContent = text;
  node.hidden = false;
}

/* ---------- Neuer Pen ---------- */
let selectedDose = null;

function markDose(value){
  selectedDose = value;
  doseGrid.querySelectorAll('.pt-dose').forEach(btn => {
    const isSelected = parseFloat(btn.dataset.dose) === value;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });
}

function openPenDialog(preset){
  markDose(preset ? preset.doseMg : null);
  penStart.value = todayStr();
  penPrice.value = preset ? (preset.priceCents / 100).toFixed(2).replace('.', ',') : '';
  penUnits.value = preset ? String(preset.totalUnits) : '';
  penError.hidden = true;
  openDialog(dlgPen, penPrice);
}

/* ---------- Woche eintragen ---------- */
let activePenId = null;

function openWeekDialog(penId){
  activePenId = penId;
  weekTitle.textContent = 'Einheiten eintragen · Pen #' + penId;
  const today = todayStr();
  weekDate.value = today;
  weekLabelEl.textContent = weekLabel(today);
  weekUnits.value = '';
  weekError.hidden = true;
  openDialog(dlgWeek, weekUnits);
}

/* ---------- Sichern / Laden ---------- */
function showBackupMsg(text, isError){
  backupMsg.textContent = text;
  backupMsg.className = isError ? 'pt-msg error' : 'pt-msg';
}

/* ---------- Start ---------- */
function init(){
  state = load();

  // Schnittstelle für den Cloud-Abgleich (siehe js/cloud-sync.js): erlaubt,
  // den Stand nach dem Laden aus Firestore zu ersetzen, und liefert einen
  // Schnappschuss zum Hochladen. Gegenstück zu window.__budgetCloud und
  // window.__konsumtopfCloud. Erst hier definiert (nicht auf Modulebene),
  // damit ein Aufruf nie auf fehlende Elemente treffen kann, falls
  // alleElementeDa unten scheitert.
  window.__pentrackerCloud = {
    replaceAllData(newData){
      state = sanitize(newData);
      // renderAll() baut die Ansicht neu auf und speichert lokal (inkl.
      // Cloud-Push, der während dieses Aufrufs von außen unterdrückt wird).
      renderAll();
    },
    getSnapshot(){
      return JSON.parse(JSON.stringify(state));
    }
  };

  /* Fenster */
  ptBtn.addEventListener('click', () => {
    openOverlay(ptOverlay, ptClose);
    renderAll();
  });
  function closePenTracker(){
    closeAllDialogs();
    settleConfirm(false);
    closeOverlay(ptOverlay, ptBtn);
  }
  ptClose.addEventListener('click', closePenTracker);
  ptOverlay.addEventListener('click', e => {
    if(e.target === ptOverlay) closePenTracker();
  });

  /* Ein Escape schließt immer nur die oberste Ebene. */
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape' || ptOverlay.hidden) return;
    if(!dlgConfirm.hidden){ settleConfirm(false); return; }
    const open = topDialog();
    if(open){ closeDialog(open); return; }
    closePenTracker();
  });

  /* Gemeinsames Schließen aller kleinen Dialoge */
  document.querySelectorAll('[data-pt-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dialog = btn.closest('.pt-dialog');
      if(dialog) closeDialog(dialog);
    });
  });
  [dlgPen, dlgWeek, dlgWeight, dlgSettings, dlgPrices, dlgPriceTable].forEach(dialog => {
    dialog.addEventListener('click', e => {
      if(e.target === dialog) closeDialog(dialog);
    });
  });
  dlgConfirm.addEventListener('click', e => {
    if(e.target === dlgConfirm) settleConfirm(false);
  });
  confirmOk.addEventListener('click', () => settleConfirm(true));
  confirmCancel.addEventListener('click', () => settleConfirm(false));

  /* Neuer Pen */
  newPenBtn.addEventListener('click', () => openPenDialog(null));
  doseGrid.addEventListener('click', e => {
    const btn = e.target.closest('.pt-dose');
    if(btn) markDose(parseFloat(btn.dataset.dose));
  });

  penSave.addEventListener('click', () => {
    if(selectedDose === null){ showError(penError, 'Bitte eine Dosis auswählen.'); return; }
    const penStartDate = normalizeDateInput(penStart.value);
    if(!penStartDate){ showError(penError, 'Bitte ein gültiges Startdatum wählen (TT.MM.JJJJ).'); return; }
    const cents = parseCents(penPrice.value);
    if(cents === null || cents <= 0){ showError(penError, 'Bitte einen gültigen Preis eingeben.'); return; }
    const units = parseInt(penUnits.value, 10);
    if(!Number.isFinite(units) || units < 1 || units > MAX_UNITS){
      showError(penError, 'Bitte eine gültige Anzahl Einheiten eingeben.');
      return;
    }
    if(state.pens.length >= MAX_PENS){
      showError(penError, 'Es sind bereits sehr viele Pens angelegt — bitte zuerst alte löschen.');
      return;
    }

    state.pens.forEach(p => { p.uiOpen = false; });
    state.pens.push({
      id: state.nextPenId++,
      doseMg: selectedDose,
      startDate: penStartDate,
      priceCents: cents,
      totalUnits: units,
      closed: false,
      uiOpen: true,
      entries: []
    });
    penError.hidden = true;
    closeDialog(dlgPen);
    renderAll();
  });

  /* Woche eintragen */
  weekDate.addEventListener('change', () => {
    const d = normalizeDateInput(weekDate.value);
    weekLabelEl.textContent = d ? weekLabel(d) : '';
  });
  weekSave.addEventListener('click', () => {
    const pen = state.pens.find(p => p.id === activePenId);
    if(!pen){ closeDialog(dlgWeek); return; }
    const date = normalizeDateInput(weekDate.value);
    if(!date){ showError(weekError, 'Bitte ein gültiges Datum wählen (TT.MM.JJJJ).'); return; }
    const units = parseInt(weekUnits.value, 10);
    if(!Number.isFinite(units) || units < 1 || units > MAX_UNITS){
      showError(weekError, 'Bitte eine gültige Einheitenzahl eingeben.');
      return;
    }
    if(pen.entries.length >= MAX_ENTRIES_PER_PEN){
      showError(weekError, 'Für diesen Pen sind bereits sehr viele Einträge erfasst.');
      return;
    }
    const key = weekKey(date);
    if(pen.entries.some(e => weekKey(e.date) === key)){
      showError(weekError, 'Für diese Kalenderwoche gibt es bei diesem Pen bereits einen Eintrag.');
      return;
    }
    const remaining = penRemainingUnits(pen);
    if(units > remaining){
      showError(weekError, 'Im Pen sind nur noch ' + remaining + ' Einheiten übrig — bitte prüfen.');
      return;
    }

    pen.entries.push({ id: nextEntryId(), date, units });
    weekError.hidden = true;
    closeDialog(dlgWeek);

    // Ist der Pen damit leer, schließt er sich und der nächste wird
    // vorausgefüllt angeboten.
    let nextPreset = null;
    if(penRemainingUnits(pen) <= 0){
      pen.closed = true;
      if(!state.pens.some(p => !p.closed && p.id !== pen.id)) nextPreset = pen;
    }
    renderAll();
    if(nextPreset) openPenDialog(nextPreset);
  });

  /* Gewicht */
  newWeightBtn.addEventListener('click', () => {
    const today = todayStr();
    weightDate.value = today;
    weightLabelEl.textContent = weekLabel(today);
    weightValue.value = '';
    weightError.hidden = true;
    openDialog(dlgWeight, weightValue);
  });
  weightDate.addEventListener('change', () => {
    const d = normalizeDateInput(weightDate.value);
    weightLabelEl.textContent = d ? weekLabel(d) : '';
  });
  weightSave.addEventListener('click', () => {
    const date = normalizeDateInput(weightDate.value);
    if(!date){ showError(weightError, 'Bitte ein gültiges Datum wählen (TT.MM.JJJJ).'); return; }
    const grams = parseGrams(weightValue.value);
    if(grams === null){ showError(weightError, 'Bitte ein gültiges Gewicht eingeben.'); return; }
    if(state.weights.length >= MAX_WEIGHTS){
      showError(weightError, 'Es sind bereits sehr viele Gewichtseinträge erfasst.');
      return;
    }
    const key = weekKey(date);
    if(state.weights.some(w => weekKey(w.date) === key)){
      showError(weightError, 'Für diese Kalenderwoche gibt es bereits einen Gewichtseintrag.');
      return;
    }
    state.weights.push({ id: nextEntryId(), date, grams });
    weightError.hidden = true;
    closeDialog(dlgWeight);
    renderAll();
  });

  /* Einstellungen */
  settingsBtn.addEventListener('click', () => {
    setHeight.value = state.settings.heightCm != null ? String(state.settings.heightCm) : '';
    setStartW.value = state.settings.startGrams != null ? fmtNum(state.settings.startGrams / 1000, 1) : '';
    setGoal.value   = state.settings.goalGrams  != null ? fmtNum(state.settings.goalGrams / 1000, 1) : '';
    setStartDate.value = state.settings.startDate || '';
    setError.hidden = true;
    openDialog(dlgSettings, setHeight);
  });
  setSave.addEventListener('click', () => {
    const heightRaw = setHeight.value.trim();
    let heightCm = null;
    if(heightRaw !== ''){
      const value = parseDecimal(heightRaw);
      if(value === null || value <= 0 || value > MAX_HEIGHT_CM){
        showError(setError, 'Bitte eine gültige Körpergröße in cm eingeben.');
        return;
      }
      heightCm = Math.round(value);
    }
    let start = null;
    if(setStartW.value.trim() !== ''){
      start = parseGrams(setStartW.value);
      if(start === null){ showError(setError, 'Bitte ein gültiges Startgewicht eingeben.'); return; }
    }
    let goal = null;
    if(setGoal.value.trim() !== ''){
      goal = parseGrams(setGoal.value);
      if(goal === null){ showError(setError, 'Bitte ein gültiges Zielgewicht eingeben.'); return; }
    }
    const startDate = normalizeDateInput(setStartDate.value);
    if(setStartDate.value.trim() !== '' && !startDate){
      showError(setError, 'Bitte ein gültiges Startdatum wählen (TT.MM.JJJJ).');
      return;
    }

    state.settings.heightCm   = heightCm;
    state.settings.startGrams = start;
    state.settings.goalGrams  = goal;
    state.settings.startDate  = startDate || null;
    setError.hidden = true;
    closeDialog(dlgSettings);
    renderAll();
  });

  resetAllBtn.addEventListener('click', () => {
    askConfirm('Wirklich alle Pen-Tracker-Daten löschen? Das lässt sich nicht rückgängig machen. '
      + 'Die Budget-Daten bleiben unberührt.', 'Alles löschen').then(ok => {
      if(!ok) return;
      try{ localStorage.removeItem(STORE_KEY); }catch(err){ /* nicht schlimm: state wird ohnehin ersetzt */ }
      state = emptyState();
      closeDialog(dlgSettings);
      renderAll();
    });
  });

  /* Preisbilder: erst beim Öffnen laden, damit sie den Start der App nicht
     ausbremsen (zusammen rund 450 kB). */
  showPricesBtn.addEventListener('click', () => {
    if(!pricesImg.getAttribute('src')) pricesImg.src = 'assets/pt-preise.jpg';
    openDialog(dlgPrices, null);
  });
  showPriceTableBtn.addEventListener('click', () => {
    if(!priceTableImg.getAttribute('src')) priceTableImg.src = 'assets/pt-preistabelle.jpg';
    openDialog(dlgPriceTable, null);
  });

  /* Sichern / Laden — die Daten liegen nur lokal, deshalb ist die Datei die
     einzige Möglichkeit, sie auf ein anderes Gerät zu bringen. */
  exportBtn.addEventListener('click', () => {
    try{
      const payload = { app: 'pentracker', version: STORE_VERSION, exportedAt: new Date().toISOString(), data: state };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pen-tracker-sicherung.json';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showBackupMsg('Datei erzeugt. Über „In Dateien sichern“ ablegen.', false);
    }catch(err){
      showBackupMsg('Sicherung konnte nicht erstellt werden.', true);
    }
  });

  importFile.addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    if(file.size > MAX_IMPORT_BYTES){
      showBackupMsg('Datei ist zu groß (max. 2 MB).', true);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      showBackupMsg('Datei konnte nicht gelesen werden.', true);
      e.target.value = '';
    };
    reader.onload = () => {
      try{
        const parsed = JSON.parse(String(reader.result));
        const raw = (parsed && typeof parsed === 'object' && parsed.data) ? parsed.data : parsed;
        const clean = sanitize(raw);
        if(!clean.pens.length && !clean.weights.length) throw new Error('keine verwertbaren Daten');
        state = clean;
        renderAll();
        showBackupMsg('Sicherung wurde eingelesen: ' + clean.pens.length + ' Pens, ' + clean.weights.length + ' Gewichtseinträge.', false);
      }catch(err){
        showBackupMsg('Diese Datei enthält keine gültige Pen-Tracker-Sicherung.', true);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
}

/* Der Pen-Tracker ist ein Zusatzwerkzeug — er darf den Start der App unter
   keinen Umständen verhindern. Fehlt eines seiner Elemente (etwa weil der
   Browser noch eine ältere index.html aus dem Zwischenspeicher anzeigt), wird
   er still übersprungen und das Budget läuft normal weiter. */
const alleElementeDa = [
  ptBtn, ptOverlay, ptClose, ptWarning,
  kpiWeight, kpiChange, kpiChangePct, kpiAvg, kpiBmi, kpiRest, kpiProgress,
  kpiTargetDate, kpiWeeks, kpiCostDose, kpiCostKg, kpiTotalCost,
  penCount, penList, newPenBtn, weightCount, weightList, newWeightBtn,
  chartBox, chartLegend,
  showPricesBtn, showPriceTableBtn, settingsBtn, exportBtn, importFile, backupMsg,
  dlgPen, doseGrid, penStart, penPrice, penUnits, penError, penSave,
  dlgWeek, weekTitle, weekDate, weekLabelEl, weekUnits, weekError, weekSave,
  dlgWeight, weightDate, weightLabelEl, weightValue, weightError, weightSave,
  dlgSettings, setHeight, setStartW, setStartDate, setGoal, setError, setSave, resetAllBtn,
  dlgPrices, pricesImg, dlgPriceTable, priceTableImg,
  dlgConfirm, confirmText, confirmOk, confirmCancel
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
