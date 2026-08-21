/* =============================================================================
   NAVIGATION / ÜBERSICHT
   Nach dem Login ist die Übersicht der Startbildschirm. Von dort aus wird
   entweder ein offener Monat editierbar geöffnet (sheet) oder bei einem
   abgeschlossenen Monat direkt die schreibgeschützte Belegansicht gezeigt —
   ein editierbares "sheet" existiert für abgeschlossene Monate gar nicht.
   ============================================================================= */
import { MONTHS, MAX_OPEN_MONTHS } from './constants.js?v=11';
import { el } from './dom.js?v=11';
import { monthKey } from './utils.js?v=11';
import { allData, saveAll, countOpenMonths, emptyMonthData, setCurrentMonthKey, currentMonthKey } from './storage.js?v=11';
import { renderMonth } from './render.js?v=11';
// Zirkulärer Import: receipt.js importiert umgekehrt showOverview aus diesem
// Modul (für den Rückweg von der Belegansicht eines abgeschlossenen Monats
// zur Übersicht). Sicher, weil beide Seiten die importierte Funktion erst
// in späteren Event-Handlern aufrufen, nie beim Modul-Start.
import { openReceipt } from './receipt.js?v=11';

export function showOverview(){
  el.sheet.hidden = true;
  el.overviewScreen.hidden = false;
  setCurrentMonthKey(null);
  renderOverview();
}

function renderMonthListItems(listEl, entries, emptyText){
  const fragment = document.createDocumentFragment();
  if(entries.length === 0){
    const li = document.createElement('li');
    li.className = 'month-list-empty';
    li.textContent = emptyText;
    fragment.appendChild(li);
  } else {
    entries.forEach(entry => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'month-list-item';
      btn.textContent = entry.monthName + ' ' + entry.year;
      btn.dataset.key = monthKey(entry.year, entry.monthIndex);
      li.appendChild(btn);
      fragment.appendChild(li);
    });
  }
  listEl.replaceChildren(fragment);
}

export function renderOverview(){
  const entries = Object.keys(allData.monthEntries)
    .map(k => allData.monthEntries[k])
    .sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  renderMonthListItems(el.openMonthList, entries.filter(e => e.status === 'open'),
    'Noch keine offenen Monate.');
  renderMonthListItems(el.closedMonthList, entries.filter(e => e.status === 'closed'),
    'Noch keine abgeschlossenen Monate.');
}

export function openMonthDetail(key){
  const entry = allData.monthEntries[key];
  if(!entry) return;
  setCurrentMonthKey(key);
  el.overviewScreen.hidden = true;
  if(entry.status === 'closed'){
    // Abgeschlossene Monate sind nur noch über die Belegansicht einsehbar —
    // keine Bearbeitung mehr möglich.
    openReceipt(true);
  } else {
    el.sheet.hidden = false;
    renderMonth();
  }
}

function handleMonthListClick(e){
  const btn = e.target.closest('.month-list-item');
  if(!btn) return;
  openMonthDetail(btn.dataset.key);
}
el.openMonthList.addEventListener('click', handleMonthListClick);
el.closedMonthList.addEventListener('click', handleMonthListClick);

function handleAddMonth(){
  const monthIndex = Number(el.addMonthSelect.value);
  const year = Number(el.addYearSelect.value);
  if(!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11 || !Number.isInteger(year)){
    el.addMonthError.textContent = 'Ungültige Auswahl.';
    return;
  }
  const key = monthKey(year, monthIndex);
  if(allData.monthEntries[key]){
    el.addMonthError.textContent = 'Dieser Monat ist bereits vorhanden.';
    return;
  }
  if(countOpenMonths() >= MAX_OPEN_MONTHS){
    el.addMonthError.textContent = 'Es können maximal 3 Monate gleichzeitig offen sein. Bitte zuerst einen Monat abschließen.';
    return;
  }
  el.addMonthError.textContent = '';
  allData.monthEntries[key] = {
    year, monthIndex, monthName: MONTHS[monthIndex],
    status: 'open', createdAt: Date.now(), closedAt: null,
    data: emptyMonthData()
  };
  saveAll(true);
  renderOverview();
}
el.addMonthBtn.addEventListener('click', handleAddMonth);

function handleCloseMonth(){
  const entry = allData.monthEntries[currentMonthKey];
  if(!entry) return;
  if(!confirm('Monat abschließen? Danach sind keine Änderungen mehr möglich.')) return;
  entry.status = 'closed';
  entry.closedAt = Date.now();
  saveAll(true);
  showOverview();
}
el.closeMonthBtn.addEventListener('click', handleCloseMonth);
el.backToOverviewBtn.addEventListener('click', showOverview);
