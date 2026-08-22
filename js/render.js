/* =============================================================================
   RENDERING
   Benutzertexte werden ausschließlich über textContent gesetzt, nie über
   innerHTML. Sonst könnte ein Text wie <img onerror=...> als HTML ausgeführt
   werden (Cross-Site-Scripting) — besonders relevant, weil Daten auch aus
   importierten Dateien stammen können.
   ============================================================================= */
import { items, categoryDefs, savingDefs, MONTHS, fcKeys, SALARY_MIN_CENTS, CARD_TOTAL_CENTS } from './constants.js?v=12';
import { el, fcSliders, fcVals } from './dom.js?v=12';
import { formatCents } from './utils.js?v=12';
import { computeTotals, sumEntries } from './compute.js?v=12';
import { getMonthData, currentMonthKey, currentMonthLabelText } from './storage.js?v=12';

// Baut eine Eintragszeile per DOM-API auf.
// isIncome=true kennzeichnet Beträge, die das Budget erhöhen (z. B. Auflösung
// Rücklagen), statt es zu verringern — mit "+" und grüner Farbe sichtbar gemacht.
function buildEntryLine(scope, key, idx, entry, withName, isIncome){
  const line = document.createElement('div');
  line.className = 'cat-entry-line';

  if(withName){
    const text = document.createElement('span');
    text.className = 'cat-entry-text';
    text.textContent = entry.name;
    line.appendChild(text);
  }

  const amount = document.createElement('span');
  amount.className = 'cat-entry-amount' + (isIncome ? ' income' : '');
  amount.textContent = (isIncome ? '+ ' : '') + formatCents(entry.cents);
  line.appendChild(amount);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'cat-entry-remove';
  btn.dataset.scope = scope;   // 'cat' oder 'sav'
  btn.dataset.key = key;
  btn.dataset.idx = String(idx);
  btn.setAttribute('aria-label', 'Eintrag entfernen');
  btn.title = 'Entfernen';
  btn.textContent = '✕';
  line.appendChild(btn);

  return line;
}

// Gemeinsame Renderfunktion für "Sonstige Ausgaben" und "Sparen".
// Aufbau erfolgt in einem DocumentFragment: der Baum wird komplett im
// Speicher zusammengesetzt und nur einmal eingehängt, statt bei jedem
// Element ein Neuzeichnen auszulösen. summaryTotalEl (optional) zeigt
// dieselbe Summe klein neben dem Abschnittstitel, wenn er eingeklappt ist.
function renderGroupedList(defs, dataObj, listEl, totalEl, withName, scope, summaryTotalEl){
  const fragment = document.createDocumentFragment();
  let grandTotal = 0;
  let hasEntries = false;

  defs.forEach(def => {
    const entries = dataObj[def.key];
    const subtotal = sumEntries(entries);
    grandTotal += subtotal;
    if(entries.length === 0) return;  // leere Gruppen ausblenden
    hasEntries = true;

    const group = document.createElement('div');
    group.className = 'cat-group';

    const heading = document.createElement('p');
    heading.className = 'cat-group-name';
    heading.textContent = def.name;
    group.appendChild(heading);

    entries.forEach((entry, idx) => {
      group.appendChild(buildEntryLine(scope, def.key, idx, entry, withName, def.key === 'aufloesung'));
    });

    const subtotalRow = document.createElement('div');
    subtotalRow.className = 'cat-subtotal';
    const subLabel = document.createElement('span');
    subLabel.textContent = 'Zwischensumme ' + def.name;
    const subValue = document.createElement('span');
    subValue.textContent = formatCents(subtotal);
    subtotalRow.append(subLabel, subValue);
    group.appendChild(subtotalRow);

    fragment.appendChild(group);
  });

  if(!hasEntries){
    const empty = document.createElement('p');
    empty.className = 'cat-empty';
    empty.textContent = 'Noch keine Einträge diesen Monat.';
    fragment.appendChild(empty);
  }

  listEl.replaceChildren(fragment);
  totalEl.textContent = formatCents(grandTotal);
  if(summaryTotalEl) summaryTotalEl.textContent = formatCents(grandTotal);
}

export function renderCatList(){
  const m = getMonthData(currentMonthKey);
  renderGroupedList(categoryDefs, m.categories, el.catList, el.catGrandTotal, true, 'cat', el.catSummaryTotal);
}
export function renderSavList(){
  const m = getMonthData(currentMonthKey);
  renderGroupedList(savingDefs, m.saving, el.savList, el.savGrandTotal, false, 'sav', el.savSummaryTotal);
}

// Aktualisiert alle abgeleiteten Anzeigen (Kopfzahl, Zusammenfassung, Forecast).
export function refreshTotals(){
  const t = computeTotals();

  if(t.remaining === null){
    el.balance.textContent = '–';
    el.balance.classList.remove('negative');
  } else {
    el.balance.textContent = formatCents(t.remaining);
    el.balance.classList.toggle('negative', t.remaining < 0);
  }

  el.checkedCount.textContent = t.checkedCount + ' von ' + items.length + ' angehakt';
  // Nur die abgehakten Fixkosten — nicht t.spent (das würde zusätzlich
  // Sonstige Ausgaben und Sparen mit reinrechnen, was hier falsch wäre).
  el.spentTotal.textContent = formatCents(t.fixedPaid) + ' ausgegeben';
  el.fixkostenSummaryTotal.textContent = formatCents(t.fixedPaid);

  el.forecastBase.textContent = t.remaining === null ? '–' : formatCents(t.remaining);
  el.forecastBase.classList.toggle('negative', t.remaining !== null && t.remaining < 0);
  el.forecastRest.textContent = formatCents(t.fixedRest);

  if(t.forecast === null){
    el.forecastResult.textContent = '–';
    el.forecastResult.classList.remove('negative');
    el.forecastSummaryTotal.textContent = '–';
    el.forecastSummaryTotal.classList.remove('negative');
  } else {
    el.forecastResult.textContent = formatCents(t.forecast);
    el.forecastResult.classList.toggle('negative', t.forecast < 0);
    // Gleicher Wert klein neben der Überschrift, solange der Bereich zu ist.
    el.forecastSummaryTotal.textContent = formatCents(t.forecast);
    el.forecastSummaryTotal.classList.toggle('negative', t.forecast < 0);
  }

  // --- Kreditkarte: Verbraucht (fester Gesamtsaldo − Restsaldo) gegen die
  // tatsächlich erfassten "Sonstigen Ausgaben" abgleichen. ---
  const m = getMonthData(currentMonthKey);
  el.cardTotal.textContent = formatCents(CARD_TOTAL_CENTS);
  el.cardCatTotal.textContent = formatCents(t.categoryTotal);

  if(m.card.restsaldoCents === null){
    el.cardUsed.textContent = '–';
    el.cardDiff.textContent = '–';
    el.cardDiff.classList.remove('negative');
    el.cardSummaryTotal.textContent = '–';
    el.cardSummaryTotal.classList.remove('negative');
  } else {
    const used = CARD_TOTAL_CENTS - m.card.restsaldoCents;
    const diff = used - t.categoryTotal;
    el.cardUsed.textContent = formatCents(used);
    el.cardDiff.textContent = formatCents(diff);
    el.cardDiff.classList.toggle('negative', diff < 0);
    // Die Differenz ist die eigentliche Kennzahl dieses Bereichs — deshalb
    // steht sie auch klein in der Überschrift, solange er zugeklappt ist.
    el.cardSummaryTotal.textContent = formatCents(diff);
    el.cardSummaryTotal.classList.toggle('negative', diff < 0);
  }
}

/* ---------------------------------------------------------------------------
   AUFBAU DER STATISCHEN OBERFLÄCHE (einmalig beim Start, von app.js gerufen)
   --------------------------------------------------------------------------- */

// Hinzufügen-Zeile der Übersicht: Monat (Kalenderreihenfolge) + Jahr,
// vorbelegt mit dem heutigen Monat/Jahr.
export function buildAddMonthSelects(){
  const today = new Date();
  const monthFragment = document.createDocumentFragment();
  MONTHS.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = name;
    monthFragment.appendChild(opt);
  });
  el.addMonthSelect.appendChild(monthFragment);
  el.addMonthSelect.value = String(today.getMonth());

  const yearFragment = document.createDocumentFragment();
  const currentYear = today.getFullYear();
  for(let y = currentYear - 1; y <= currentYear + 3; y++){
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearFragment.appendChild(opt);
  }
  el.addYearSelect.appendChild(yearFragment);
  el.addYearSelect.value = String(currentYear);
}

// Kategorie-Dropdowns
export function fillSelect(selectEl, defs){
  const fragment = document.createDocumentFragment();
  defs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.key;
    opt.textContent = d.name;
    fragment.appendChild(opt);
  });
  selectEl.appendChild(fragment);
}

// Fixkosten-Liste
export function buildCostList(){
  const fragment = document.createDocumentFragment();
  items.forEach((item, i) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'cost-row';
    label.htmlFor = 'cost-' + i;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = 'cost-' + i;
    cb.dataset.index = String(i);

    const name = document.createElement('span');
    name.className = 'cost-name';
    name.textContent = item.name;

    const amount = document.createElement('span');
    amount.className = 'cost-amount';
    amount.textContent = formatCents(item.cents);

    label.append(cb, name, amount);
    li.appendChild(label);
    fragment.appendChild(li);
  });
  el.costList.appendChild(fragment);
}

// Blendet zwischen Schieberegler (Bearbeiten) und fixierter Zeile (gespeichert) um.
export function showSalaryFixed(cents){
  el.salaryFixedValue.textContent = formatCents(cents);
  el.salaryFixed.hidden = false;
  el.salaryBox.hidden = true;
}
export function showSalarySlider(){
  el.salaryFixed.hidden = true;
  el.salaryBox.hidden = false;
}

/* ---------------------------------------------------------------------------
   MONAT ANZEIGEN
   Wird beim Öffnen eines offenen Monats aus der Übersicht aufgerufen.
   --------------------------------------------------------------------------- */
export function renderMonth(){
  const m = getMonthData(currentMonthKey);

  el.currentMonthLabel.textContent = currentMonthLabelText();

  // Checkboxen auf den gespeicherten Stand setzen.
  const boxes = el.costList.querySelectorAll('input[type="checkbox"]');
  for(let i = 0; i < boxes.length; i++) boxes[i].checked = m.checked[i] === true;

  renderCatList();
  renderSavList();

  // Gehalt: je nach Monat entweder fixierte Zeile (gespeichert) oder
  // Regler (noch nicht gespeichert) anzeigen.
  if(m.salary === null){
    el.salarySlider.value = String(SALARY_MIN_CENTS / 100 + 1250); // 3.250 € Startwert
    el.salaryValue.textContent = 'noch nicht gespeichert';
    showSalarySlider();
  } else {
    el.salarySlider.value = String(m.salary / 100);
    el.salaryValue.textContent = formatCents(m.salary);
    showSalaryFixed(m.salary);
  }

  // Forecast-Regler auf gespeicherte Werte.
  fcKeys.forEach(k => {
    fcSliders[k].value = String(m.forecast[k] / 100);
    fcVals[k].textContent = formatCents(m.forecast[k]);
  });

  // Notizfeld auf gespeicherten Text.
  el.forecastNote.value = m.forecastNote || '';

  // Kreditkarten-Restsaldo auf gespeicherten Wert (oder leer, wenn noch
  // nichts erfasst wurde).
  el.cardRestsaldo.value = m.card.restsaldoCents === null
    ? '' : String(m.card.restsaldoCents / 100);
  el.cardError.textContent = '';

  refreshTotals();
}
