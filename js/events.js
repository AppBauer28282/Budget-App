/* =============================================================================
   EREIGNISSE (Detailansicht)
   Für die Listen wird Event-Delegation genutzt: ein Listener am Container
   statt einer pro Zeile. Das spart Speicher und muss beim Neuaufbau der
   Liste nicht erneut angehängt werden.
   ============================================================================= */
import {
  SALARY_MIN_CENTS, SALARY_MAX_CENTS, CARD_TOTAL_CENTS,
  MAX_TEXT_LENGTH, MAX_ENTRIES_PER_KEY, MAX_NOTE_LENGTH,
  items, categoryDefs, savingDefs, fcKeys, FC_MAX
} from './constants.js?v=29';
import { el, fcSliders, fcVals } from './dom.js?v=29';
import { clamp, parseAmountToCents, parseNonNegativeAmountToCents, parseEuroInputToCents, formatCents } from './utils.js?v=29';
import { getMonthData, currentMonthKey, saveAll } from './storage.js?v=29';
import { refreshTotals, renderCatList, renderSavList, renderCardElternList, showSalaryFixed, showSalarySlider } from './render.js?v=29';

// --- Gehalt (Textfeld statt Regler: exakte Eingabe) ---
el.salarySlider.addEventListener('input', () => {
  // Nur Anzeige aktualisieren; gespeichert wird erst per Klick auf Speichern.
  const cents = parseEuroInputToCents(el.salarySlider.value);
  el.salaryValue.textContent = cents === null ? 'noch nicht gespeichert' : formatCents(cents);
  el.salaryError.textContent = '';
});

function saveSalary(){
  const cents = parseEuroInputToCents(el.salarySlider.value);
  if(cents === null){
    el.salaryError.textContent = 'Bitte einen gültigen Betrag eingeben.';
    return;
  }
  if(cents < SALARY_MIN_CENTS || cents > SALARY_MAX_CENTS){
    el.salaryError.textContent = 'Das Gehalt muss zwischen ' + formatCents(SALARY_MIN_CENTS) +
      ' und ' + formatCents(SALARY_MAX_CENTS) + ' liegen.';
    return;
  }
  el.salaryError.textContent = '';
  getMonthData(currentMonthKey).salary = cents;
  saveAll(true);
  refreshTotals();
  // Eingabefeld verschwindet sofort, Gehalt steht als fixierte Zeile
  // direkt über "Verbleibend".
  showSalaryFixed(cents);
}
el.salarySaveBtn.addEventListener('click', saveSalary);
el.salarySlider.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); saveSalary(); }
});

el.salaryDeleteBtn.addEventListener('click', () => {
  getMonthData(currentMonthKey).salary = null;
  saveAll(true);
  refreshTotals();
  // Eingabefeld wieder einblenden, damit ein neues Gehalt eingetragen werden kann.
  el.salarySlider.value = '';
  el.salaryValue.textContent = 'noch nicht gespeichert';
  el.salaryError.textContent = '';
  showSalarySlider();
  el.salarySlider.focus();
});

// --- Kreditkarte: Restsaldo speichern ---
function saveCardRestsaldo(){
  const cents = parseNonNegativeAmountToCents(el.cardRestsaldo.value);
  if(cents === null){
    el.cardError.textContent = 'Bitte einen gültigen Betrag eingeben.';
    return;
  }
  if(cents > CARD_TOTAL_CENTS){
    el.cardError.textContent = 'Restsaldo kann nicht größer als der Gesamtsaldo (2.000 €) sein.';
    return;
  }
  el.cardError.textContent = '';
  getMonthData(currentMonthKey).card.restsaldoCents = cents;
  saveAll(true);
  refreshTotals();
}
el.cardSaveBtn.addEventListener('click', saveCardRestsaldo);
el.cardRestsaldo.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); saveCardRestsaldo(); }
});

// --- Kreditkarte: Ausgaben für Eltern hinzufügen (wie Sonstige Ausgaben,
// aber ohne Kategorie — es gibt nur diese eine Liste). ---
function addCardElternEntry(){
  const name = el.cardElternText.value.trim().slice(0, MAX_TEXT_LENGTH);
  const cents = parseAmountToCents(el.cardElternAmount.value);

  if(!name){
    el.cardElternError.textContent = 'Bitte einen Text eingeben.';
    return;
  }
  if(cents === null){
    el.cardElternError.textContent = 'Bitte einen gültigen Betrag eingeben.';
    return;
  }
  const list = getMonthData(currentMonthKey).card.eltern;
  if(list.length >= MAX_ENTRIES_PER_KEY){
    el.cardElternError.textContent = 'Maximale Anzahl Einträge erreicht.';
    return;
  }
  el.cardElternError.textContent = '';

  list.push({ name, cents });
  saveAll(true);
  renderCardElternList();
  refreshTotals();

  el.cardElternText.value = '';
  el.cardElternAmount.value = '';
  el.cardElternText.focus();
}
el.cardElternAddBtn.addEventListener('click', addCardElternEntry);
[el.cardElternText, el.cardElternAmount].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); addCardElternEntry(); }
  });
});

// --- Fixkosten abhaken ---
el.costList.addEventListener('change', (e) => {
  const target = e.target;
  if(!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
  const idx = Number(target.dataset.index);
  if(!Number.isInteger(idx) || idx < 0 || idx >= items.length) return;
  getMonthData(currentMonthKey).checked[idx] = target.checked;
  saveAll();
  refreshTotals();
});

// --- Sonstige Ausgaben hinzufügen ---
function addCatEntry(){
  const name = el.catText.value.trim().slice(0, MAX_TEXT_LENGTH);
  const key = el.catSelect.value;
  const cents = parseAmountToCents(el.catAmount.value);

  if(!name){
    el.catError.textContent = 'Bitte einen Text eingeben.';
    return;
  }
  if(cents === null){
    el.catError.textContent = 'Bitte einen gültigen Betrag eingeben.';
    return;
  }
  // Kategorie gegen die bekannte Liste prüfen, statt dem Feld blind zu trauen.
  if(!categoryDefs.some(d => d.key === key)){
    el.catError.textContent = 'Unbekannte Kategorie.';
    return;
  }
  const list = getMonthData(currentMonthKey).categories[key];
  if(list.length >= MAX_ENTRIES_PER_KEY){
    el.catError.textContent = 'Maximale Anzahl Einträge in dieser Kategorie erreicht.';
    return;
  }
  el.catError.textContent = '';

  // Jeder Eintrag bleibt eine eigene Zeile — kein Zusammenführen gleicher
  // Bezeichnungen mehr, damit die Liste jede einzelne Buchung zeigt.
  list.push({ name, cents });

  saveAll(true);
  renderCatList();
  refreshTotals();

  el.catText.value = '';
  el.catAmount.value = '';
  el.catText.focus();
}

el.catAddBtn.addEventListener('click', addCatEntry);
[el.catText, el.catAmount].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); addCatEntry(); }
  });
});

// --- Sparen hinzufügen (ohne Bezeichnung) ---
function addSavEntry(){
  const key = el.savSelect.value;
  const cents = parseAmountToCents(el.savAmount.value);

  if(cents === null){
    el.savError.textContent = 'Bitte einen gültigen Betrag eingeben.';
    return;
  }
  if(!savingDefs.some(d => d.key === key)){
    el.savError.textContent = 'Unbekannte Unterkategorie.';
    return;
  }
  const list = getMonthData(currentMonthKey).saving[key];
  if(list.length >= MAX_ENTRIES_PER_KEY){
    el.savError.textContent = 'Maximale Anzahl Einträge erreicht.';
    return;
  }
  el.savError.textContent = '';

  list.push({ cents });
  saveAll(true);
  renderSavList();
  refreshTotals();

  el.savAmount.value = '';
  el.savAmount.focus();
}

el.savAddBtn.addEventListener('click', addSavEntry);
el.savAmount.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); addSavEntry(); }
});

// --- Einträge entfernen (ein Listener für beide Listen) ---
function handleRemoveClick(e){
  const btn = e.target.closest('.cat-entry-remove');
  if(!btn) return;
  const scope = btn.dataset.scope;
  const key = btn.dataset.key;
  const idx = Number(btn.dataset.idx);
  if(!Number.isInteger(idx) || idx < 0) return;

  const m = getMonthData(currentMonthKey);
  const list = scope === 'cat' ? m.categories[key]
             : scope === 'sav' ? m.saving[key]
             : scope === 'cardEltern' ? m.card.eltern
             : null;
  if(!list || idx >= list.length) return;

  list.splice(idx, 1);
  saveAll(true);
  if(scope === 'cat') renderCatList();
  else if(scope === 'sav') renderSavList();
  else renderCardElternList();
  refreshTotals();
}
el.catList.addEventListener('click', handleRemoveClick);
el.savList.addEventListener('click', handleRemoveClick);
el.cardElternList.addEventListener('click', handleRemoveClick);

// --- Forecast-Regler --- (Liste enthält jetzt auch 'sonstiges', Schleife
// bleibt unverändert generisch)
fcKeys.forEach(k => {
  // Textfeld statt Regler. Leer/ungültig zählt als 0; zu große Werte werden auf
  // die Obergrenze geklemmt. Die Echo-Anzeige zeigt immer den verwendeten
  // Wert, beim Verlassen des Feldes wird das Feld selbst darauf zurückgesetzt.
  const read = () => clamp(parseEuroInputToCents(fcSliders[k].value) || 0, 0, FC_MAX[k]);
  fcSliders[k].addEventListener('input', () => {
    const cents = read();
    fcVals[k].textContent = formatCents(cents);
    getMonthData(currentMonthKey).forecast[k] = cents;
    saveAll();          // gebündelt, siehe writeStorage
    refreshTotals();
  });
  fcSliders[k].addEventListener('blur', () => {
    const cents = read();
    fcSliders[k].value = cents === 0 ? '' : String(cents / 100).replace('.', ',');
  });
});

// --- Forecast-Notizfeld (freier Text, kein Geldbetrag) ---
el.forecastNote.addEventListener('input', () => {
  getMonthData(currentMonthKey).forecastNote = el.forecastNote.value.slice(0, MAX_NOTE_LENGTH);
  saveAll();
});
