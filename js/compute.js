/* =============================================================================
   BERECHNUNGEN
   Alle Summen werden einmal pro Aktualisierung in einem Durchlauf berechnet
   und weitergereicht, statt dieselben Werte mehrfach zu ermitteln.
   ============================================================================= */
import { items, categoryDefs, savingDefs, fcKeys } from './constants.js?v=13';
import { getMonthData, currentMonthKey } from './storage.js?v=13';

export function sumEntries(list){
  let total = 0;
  for(let i = 0; i < list.length; i++) total += list[i].cents;
  return total;
}

export function computeTotals(){
  const m = getMonthData(currentMonthKey);

  let fixedPaid = 0;    // abgehakte Fixkosten
  let fixedRest = 0;    // noch offene Fixkosten
  let checkedCount = 0;
  for(let i = 0; i < items.length; i++){
    if(m.checked[i]){ fixedPaid += items[i].cents; checkedCount++; }
    else { fixedRest += items[i].cents; }
  }

  let categoryTotal = 0;
  for(const def of categoryDefs) categoryTotal += sumEntries(m.categories[def.key]);

  // Sparen/Rücklagen mindern das Verbleibend, "Auflösung Rücklagen" erhöht es
  // wieder — das ist Geld, das aus den Rücklagen zurück ins Budget fließt.
  let savingOut = 0;
  let savingIn = 0;
  for(const def of savingDefs){
    const sum = sumEntries(m.saving[def.key]);
    if(def.key === 'aufloesung') savingIn += sum;
    else savingOut += sum;
  }

  let forecastSliders = 0;
  for(const k of fcKeys) forecastSliders += m.forecast[k];

  const spent = fixedPaid + categoryTotal + savingOut;
  // Verbleibend ist null, solange kein Gehalt gespeichert wurde.
  const remaining = m.salary === null ? null : m.salary - spent + savingIn;

  return {
    checkedCount, fixedPaid, fixedRest,
    categoryTotal, savingOut, savingIn, spent, remaining,
    forecastSliders,
    // Forecast: vom echten Rest gehen die sicher kommenden Fixkosten und
    // die simulierten Reglerbeträge ab.
    forecast: remaining === null ? null : remaining - fixedRest - forecastSliders
  };
}
