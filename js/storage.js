/* =============================================================================
   DATENMODELL + VALIDIERUNG + SPEICHERN/LADEN
   Jeder Monat hat: salary (Cent oder null), checked[], categories{}, saving{},
   forecast{}. Alles, was aus localStorage oder einer Importdatei kommt, läuft
   durch sanitize* — dadurch können fremde Dateien weder unbekannte Felder
   einschleusen noch den Prototyp verändern (Prototype Pollution), da nur
   bekannte Schlüssel kopiert werden.

   allData und currentMonthKey sind der zentrale, geteilte Zustand der App.
   Andere Module importieren sie als lebende Bindungen (ES-Module halten
   Referenzen aktuell) und lesen sie direkt — reassignen dürfen sie nur über
   die hier exportierten Funktionen (replaceAllData/setCurrentMonthKey), da
   ein importiertes Binding von außen nicht neu zugewiesen werden kann.
   ============================================================================= */
import {
  items, categoryDefs, savingDefs, MONTHS, FC_DEFS, fcKeys,
  STORAGE_KEY, SALARY_MIN_CENTS, SALARY_MAX_CENTS, AMOUNT_MAX_CENTS,
  MAX_ENTRIES_PER_KEY, MAX_TEXT_LENGTH, MAX_NOTE_LENGTH, MAX_MONTH_ENTRIES,
  CARD_TOTAL_CENTS
} from './constants.js?v=12';
import { clamp, monthKey } from './utils.js?v=12';
// Zirkulärer Import: backup.js importiert umgekehrt allData/saveAll/sanitizeAll
// aus diesem Modul. Das ist sicher, weil beide Seiten die importierten
// Funktionen erst später (in Event-Handlern bzw. hier im catch-Block) und nie
// beim Modul-Start selbst aufrufen — zu diesem Zeitpunkt sind beide Module
// bereits vollständig ausgewertet.
import { showBackupMsg } from './backup.js?v=12';

export function emptyMonthData(){
  const categories = Object.create(null);
  categoryDefs.forEach(c => { categories[c.key] = []; });
  const saving = Object.create(null);
  savingDefs.forEach(c => { saving[c.key] = []; });
  const forecast = Object.create(null);
  fcKeys.forEach(k => { forecast[k] = 0; });
  return {
    salary: null,
    checked: new Array(items.length).fill(false),
    categories,
    saving,
    forecast,
    forecastNote: '',
    // Restsaldo der Kreditkarte, vom Nutzer eingetragen (Cent) — null = noch
    // nicht erfasst. Der Gesamtsaldo selbst ist eine feste Konstante
    // (CARD_TOTAL_CENTS), wird also nicht pro Monat gespeichert.
    card: { restsaldoCents: null }
  };
}

// Prüft eine Eintragsliste. withName=true → Einträge haben eine Bezeichnung.
export function sanitizeEntries(rawList, withName){
  const out = [];
  if(!Array.isArray(rawList)) return out;
  for(const raw of rawList){
    if(out.length >= MAX_ENTRIES_PER_KEY) break;
    if(!raw || typeof raw !== 'object') continue;

    // Beträge dürfen als Cent (neu) oder Euro (alt) vorliegen.
    let cents = null;
    if(Number.isFinite(raw.cents)) cents = Math.round(raw.cents);
    else if(Number.isFinite(raw.amount)) cents = Math.round(raw.amount * 100);
    if(cents === null || cents <= 0 || cents > AMOUNT_MAX_CENTS) continue;

    const entry = { cents };
    if(withName){
      const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, MAX_TEXT_LENGTH) : '';
      entry.name = name || 'Ohne Bezeichnung';
    }
    out.push(entry);
  }
  return out;
}

export function sanitizeMonthData(raw){
  const month = emptyMonthData();
  if(!raw || typeof raw !== 'object') return month;

  // Gehalt liegt bereits in Cent vor (so speichert die App es auch).
  let salaryCents = null;
  if(Number.isFinite(raw.salary)){
    salaryCents = Math.round(raw.salary);
  }
  if(salaryCents !== null){
    month.salary = clamp(salaryCents, SALARY_MIN_CENTS, SALARY_MAX_CENTS);
  }

  // Checkboxen: strikt auf echte true-Werte und die richtige Länge normiert.
  if(Array.isArray(raw.checked)){
    for(let i = 0; i < items.length; i++){
      month.checked[i] = raw.checked[i] === true;
    }
  }

  const rawCats = (raw.categories && typeof raw.categories === 'object') ? raw.categories : {};
  categoryDefs.forEach(def => {
    month.categories[def.key] = sanitizeEntries(rawCats[def.key], true);
  });

  const rawSav = (raw.saving && typeof raw.saving === 'object') ? raw.saving : {};
  savingDefs.forEach(def => {
    month.saving[def.key] = sanitizeEntries(rawSav[def.key], false);
  });

  const rawFc = (raw.forecast && typeof raw.forecast === 'object') ? raw.forecast : {};
  FC_DEFS.forEach(def => {
    let cents = null;
    if(Number.isFinite(rawFc[def.key])) cents = Math.round(rawFc[def.key]);
    month.forecast[def.key] = cents === null ? 0 : clamp(cents, 0, def.maxCents);
  });

  month.forecastNote = typeof raw.forecastNote === 'string'
    ? raw.forecastNote.slice(0, MAX_NOTE_LENGTH) : '';

  // Kreditkarten-Restsaldo: auf sinnvollen Bereich begrenzt (0 bis zum
  // Gesamtsaldo).
  const rawCard = (raw.card && typeof raw.card === 'object') ? raw.card : {};
  let cardCents = null;
  if(Number.isFinite(rawCard.restsaldoCents)) cardCents = Math.round(rawCard.restsaldoCents);
  if(cardCents !== null){
    month.card.restsaldoCents = clamp(cardCents, 0, CARD_TOTAL_CENTS);
  }

  return month;
}

// Prüft und normiert einen einzelnen Monats-Eintrag (Jahr, Monat, Status,
// Zeitstempel + die eigentlichen Budget-Daten). Der Schlüssel wird immer
// aus year/monthIndex neu gebildet statt aus der rohen Datei übernommen —
// so kann eine manipulierte Datei keinen Eintrag unter falschem Schlüssel
// einschleusen.
export function sanitizeMonthEntry(raw){
  if(!raw || typeof raw !== 'object') return null;
  const monthIndex = Number.isInteger(raw.monthIndex) && raw.monthIndex >= 0 && raw.monthIndex <= 11
    ? raw.monthIndex : null;
  const year = Number.isInteger(raw.year) && raw.year >= 2000 && raw.year <= 2100
    ? raw.year : null;
  if(monthIndex === null || year === null) return null;

  const status = raw.status === 'closed' ? 'closed' : 'open';
  return {
    year, monthIndex, monthName: MONTHS[monthIndex],
    status,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    closedAt: status === 'closed'
      ? (Number.isFinite(raw.closedAt) ? raw.closedAt : Date.now())
      : null,
    data: sanitizeMonthData(raw.data)
  };
}

// Nur gültige Monats-Einträge werden übernommen — alles andere (inkl. des
// alten Datenformats ohne Jahr) wird verworfen.
export function sanitizeAll(raw){
  const clean = { monthEntries: Object.create(null) };
  if(!raw || typeof raw !== 'object' || !raw.monthEntries || typeof raw.monthEntries !== 'object'){
    return clean;
  }
  let count = 0;
  for(const rawKey of Object.keys(raw.monthEntries)){
    if(count >= MAX_MONTH_ENTRIES) break;
    const entry = sanitizeMonthEntry(raw.monthEntries[rawKey]);
    if(entry){
      clean.monthEntries[monthKey(entry.year, entry.monthIndex)] = entry;
      count++;
    }
  }
  return clean;
}

/* ---------------------------------------------------------------------------
   SPEICHERN / LADEN
   localStorage kann fehlschlagen (privater Modus, Speicher voll). Deshalb
   sind alle Zugriffe abgesichert — die App läuft dann ohne Speicherung
   weiter, statt mit einem Fehler stehenzubleiben.
   --------------------------------------------------------------------------- */

function loadAll(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { monthEntries: Object.create(null) };
    return sanitizeAll(JSON.parse(raw));
  }catch(err){
    // Kaputte oder unlesbare Daten: mit leerem Stand starten.
    return { monthEntries: Object.create(null) };
  }
}

export let allData = loadAll();
// Schlüssel (z. B. "2026-08") des Monats, der gerade in der Detailansicht
// oder Belegansicht offen ist. null, solange die Übersicht sichtbar ist.
export let currentMonthKey = null;

// Andere Module dürfen die importierten Bindings oben nicht direkt neu
// zuweisen (ES-Module-Regel) — dafür diese beiden Funktionen.
export function setCurrentMonthKey(key){
  currentMonthKey = key;
}
export function replaceAllData(newData){
  allData = sanitizeAll(newData);
}
// Für Aufrufer, die bereits selbst sanitizeAll() aufgerufen haben (z. B. der
// Import-Dialog) — vermeidet doppeltes Sanitizing derselben Daten.
export function setAllData(sanitizedData){
  allData = sanitizedData;
}

// Schreibvorgänge werden gebündelt: Beim Ziehen eines Reglers feuert 'input'
// dutzendfach pro Sekunde. Ohne Bündelung würde jedes Mal das gesamte
// Datenobjekt serialisiert und geschrieben — das ruckelt spürbar.
let saveTimer = null;
export function writeStorage(){
  saveTimer = null;
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
  }catch(err){
    showBackupMsg('Speichern im Browser fehlgeschlagen (Speicher voll oder privater Modus). Bitte über "Sichern" eine Datei anlegen.', true);
  }
  // Cloud-Sync: außerhalb dieses Moduls gesetzter Hook, sobald eingeloggt
  // (siehe js/cloud-sync.js "window.__onLocalSave"). Lokales Speichern
  // bleibt davon unberührt und läuft immer sofort, unabhängig vom
  // Internetzugang.
  if(typeof window.__onLocalSave === 'function'){
    try{ window.__onLocalSave(allData); }catch(e){}
  }
}
export function saveAll(immediate){
  if(saveTimer !== null) clearTimeout(saveTimer);
  if(immediate){ writeStorage(); return; }
  saveTimer = setTimeout(writeStorage, 300);
}
// Sicherheitsnetz: Beim Verlassen/Ausblenden der Seite sofort schreiben,
// damit keine gebündelte Änderung verloren geht.
window.addEventListener('pagehide', () => { if(saveTimer !== null) saveAll(true); });
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden' && saveTimer !== null) saveAll(true);
});

// Liefert die Budget-Daten eines Monats-Eintrags. Wird nur aufgerufen,
// während currentMonthKey auf einen tatsächlich existierenden, über die
// Übersicht angelegten Eintrag zeigt (siehe navigation.js openMonthDetail).
export function getMonthData(key){
  return allData.monthEntries[key].data;
}
export function getMonthEntry(key){
  return allData.monthEntries[key];
}
export function countOpenMonths(){
  return Object.keys(allData.monthEntries)
    .filter(k => allData.monthEntries[k].status === 'open').length;
}

// Anzeigename des aktuell geöffneten Monats, z. B. "August 2026".
export function currentMonthLabelText(){
  const entry = currentMonthKey ? allData.monthEntries[currentMonthKey] : null;
  return entry ? entry.monthName + ' ' + entry.year : '';
}
