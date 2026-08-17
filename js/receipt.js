/* =============================================================================
   BELEGANSICHT
   Baut einen kassenbon-artigen Überblick: zuerst was wirklich passiert ist
   (abgehakte Fixkosten + eingetragene Ausgaben/Sparen), danach was noch
   offen bzw. nur simuliert ist (offene Fixkosten + Forecast-Regler).
   Auch hier ausschließlich DOM-API/textContent, kein innerHTML.
   Wird auch für abgeschlossene Monate genutzt — dort ist es die einzige
   noch zugängliche Ansicht (siehe navigation.js openMonthDetail).
   ============================================================================= */
import { items, categoryDefs, savingDefs, fcKeys, FC_LABELS } from './constants.js?v=9';
import { el } from './dom.js?v=9';
import { formatCents } from './utils.js?v=9';
import { computeTotals } from './compute.js?v=9';
import { getMonthData, currentMonthKey, currentMonthLabelText } from './storage.js?v=9';
import { openOverlay, closeOverlay } from './overlays.js?v=9';
// Zirkulärer Import: navigation.js importiert umgekehrt openReceipt aus
// diesem Modul. Sicher, siehe Kommentar in navigation.js.
import { showOverview } from './navigation.js?v=9';

function addReceiptSectionTitle(container, text){
  const h = document.createElement('p');
  h.className = 'receipt-section-title';
  h.textContent = text;
  container.appendChild(h);
}
function addReceiptSubgroup(container, text){
  const p = document.createElement('p');
  p.className = 'receipt-subgroup';
  p.textContent = text;
  container.appendChild(p);
}
function addReceiptLine(container, label, cents, isIncome){
  const line = document.createElement('div');
  line.className = 'receipt-line';
  const l = document.createElement('span');
  l.className = 'receipt-line-label';
  l.textContent = label;
  const a = document.createElement('span');
  a.className = 'receipt-line-amount' + (isIncome ? ' income' : '');
  a.textContent = (isIncome ? '+ ' : '') + formatCents(cents);
  line.append(l, a);
  container.appendChild(line);
}
function addReceiptEmptyNote(container, text){
  const p = document.createElement('p');
  p.className = 'receipt-empty-note';
  p.textContent = text;
  container.appendChild(p);
}
function addReceiptTotal(container, label, cents, isGrand){
  const line = document.createElement('div');
  line.className = 'receipt-total-line' + (isGrand ? ' grand' : '');
  const l = document.createElement('span');
  l.textContent = label;
  const a = document.createElement('span');
  a.textContent = cents === null ? '–' : formatCents(cents);
  line.append(l, a);
  container.appendChild(line);
}

function buildReceipt(){
  const m = getMonthData(currentMonthKey);
  const t = computeTotals();
  const frag = document.createDocumentFragment();

  const monthLine = document.createElement('p');
  monthLine.className = 'receipt-month';
  monthLine.textContent = currentMonthLabelText();
  frag.appendChild(monthLine);

  // --- Einnahmen ---
  addReceiptSectionTitle(frag, 'Einnahmen');
  if(m.salary === null){
    addReceiptEmptyNote(frag, 'Kein Gehalt gespeichert.');
  } else {
    addReceiptLine(frag, 'Gehalt', m.salary);
  }

  // --- Bereits passiert (echte Buchungen) ---
  addReceiptSectionTitle(frag, 'Bereits passiert');

  addReceiptSubgroup(frag, 'Fixkosten (abgehakt)');
  items.forEach((item, i) => {
    if(m.checked[i]) addReceiptLine(frag, item.name, item.cents);
  });

  addReceiptSubgroup(frag, 'Sonstige Ausgaben');
  let anyCat = false;
  categoryDefs.forEach(def => {
    m.categories[def.key].forEach(entry => {
      addReceiptLine(frag, def.name + ': ' + entry.name, entry.cents);
      anyCat = true;
    });
  });
  if(!anyCat) addReceiptEmptyNote(frag, 'Noch keine Einträge.');

  addReceiptSubgroup(frag, 'Sparen');
  let anySav = false;
  savingDefs.forEach(def => {
    m.saving[def.key].forEach(entry => {
      addReceiptLine(frag, def.name, entry.cents, def.key === 'aufloesung');
      anySav = true;
    });
  });
  if(!anySav) addReceiptEmptyNote(frag, 'Noch keine Einträge.');

  addReceiptTotal(frag, 'Verbleibend', t.remaining, false);

  // --- Noch offen (Simulation) ---
  addReceiptSectionTitle(frag, 'Noch offen (Simulation)');

  addReceiptSubgroup(frag, 'Fixkosten (offen)');
  items.forEach((item, i) => {
    if(!m.checked[i]) addReceiptLine(frag, item.name, item.cents);
  });

  addReceiptSubgroup(frag, 'Forecast-Planung');
  fcKeys.forEach(k => {
    addReceiptLine(frag, FC_LABELS[k], m.forecast[k]);
  });

  addReceiptTotal(frag, 'Voraussichtlich verbleibend', t.forecast, true);

  el.receiptBody.replaceChildren(frag);
}

// returnToOverview=true, wenn der Beleg direkt aus der Übersicht für einen
// abgeschlossenen Monat geöffnet wurde — dann führt Schließen zurück zur
// Übersicht statt zum (in diesem Fall gar nicht sichtbaren) sheet.
let receiptReturnsToOverview = false;
export function openReceipt(returnToOverview){
  receiptReturnsToOverview = !!returnToOverview;
  buildReceipt();
  openOverlay(el.receiptOverlay, el.receiptClose);
}
function closeReceipt(){
  closeOverlay(el.receiptOverlay, el.receiptBtn, receiptReturnsToOverview ? () => {
    receiptReturnsToOverview = false;
    showOverview();
  } : null);
}

el.receiptBtn.addEventListener('click', () => openReceipt(false));
el.receiptClose.addEventListener('click', closeReceipt);
// Klick auf den abgedunkelten Hintergrund (nicht auf die Karte selbst) schließt.
el.receiptOverlay.addEventListener('click', (e) => {
  if(e.target === el.receiptOverlay) closeReceipt();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !el.receiptOverlay.hidden) closeReceipt();
});
