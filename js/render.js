/* =============================================================================
   RENDERING
   Benutzertexte werden ausschließlich über textContent gesetzt, nie über
   innerHTML. Sonst könnte ein Text wie <img onerror=...> als HTML ausgeführt
   werden (Cross-Site-Scripting) — besonders relevant, weil Daten auch aus
   importierten Dateien stammen können.
   ============================================================================= */
import { items, categoryDefs, savingDefs, MONTHS, fcKeys, SALARY_MIN_CENTS, CARD_TOTAL_CENTS, FC_LABELS, vorzeichen, VERRECHNET_IN, aufloesungLabel } from './constants.js?v=61';
import { fixkostenVon } from './storage.js?v=61';
import { el, fcListe } from './dom.js?v=61';
import { formatCents } from './utils.js?v=61';
import { computeTotals, sumEntries } from './compute.js?v=61';
import { getMonthData, currentMonthKey, currentMonthLabelText } from './storage.js?v=61';

// Baut eine Eintragszeile per DOM-API auf.
// isIncome=true kennzeichnet Beträge, die gegen ihre Gruppe laufen (Auflösung
// Rücklagen innerhalb der Rücklagen) — mit "−" und grüner Farbe sichtbar gemacht.
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
  amount.textContent = (isIncome ? '− ' : '') + formatCents(entry.cents);
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
    // Minus-Kategorien (Auflösung Rücklagen) stehen nicht als eigene Gruppe,
    // sondern innerhalb der Gruppe, gegen die sie verrechnet werden.
    if(VERRECHNET_IN[def.key]) return;
    const zeilen = dataObj[def.key].map((entry, idx) => ({ key: def.key, idx, entry, minus: false }));
    Object.keys(VERRECHNET_IN).forEach(mk => {
      if(VERRECHNET_IN[mk] === def.key && dataObj[mk]){
        dataObj[mk].forEach((entry, idx) => zeilen.push({ key: mk, idx, entry, minus: true }));
      }
    });
    const subtotal = zeilen.reduce((s, z) => s + vorzeichen(z.key) * z.entry.cents, 0);
    grandTotal += subtotal;
    if(zeilen.length === 0) return;  // leere Gruppen ausblenden
    hasEntries = true;

    const group = document.createElement('div');
    group.className = 'cat-group';

    const heading = document.createElement('p');
    heading.className = 'cat-group-name';
    heading.textContent = def.name;
    group.appendChild(heading);

    zeilen.forEach(z => {
      const entry = z.minus && withName ? { ...z.entry, name: aufloesungLabel(z.entry.name) } : z.entry;
      group.appendChild(buildEntryLine(scope, z.key, z.idx, entry, withName, z.minus));
    });

    const subtotalRow = document.createElement('div');
    subtotalRow.className = 'cat-subtotal';
    const subLabel = document.createElement('span');
    subLabel.textContent = 'Zwischensumme ' + def.name;
    const subValue = document.createElement('span');
    // Mehr aufgelöst als zurückgelegt: Überschuss mit "+" kennzeichnen.
    subValue.textContent = subtotal < 0 ? '+ ' + formatCents(-subtotal) : formatCents(subtotal);
    if(subtotal < 0) subValue.className = 'income';
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
  const gesamtText = grandTotal < 0 ? '+ ' + formatCents(-grandTotal) : formatCents(grandTotal);
  totalEl.textContent = gesamtText;
  if(summaryTotalEl) summaryTotalEl.textContent = gesamtText;
}

export function renderCatList(){
  const m = getMonthData(currentMonthKey);
  renderGroupedList(categoryDefs, m.categories, el.catList, el.catGrandTotal, true, 'cat', el.catSummaryTotal);
  // Datum des zuletzt angelegten Eintrags direkt unter der Gesamtsumme.
  if(el.catLastEntry){
    if(m.lastEntryAt){
      const d = new Date(m.lastEntryAt);
      el.catLastEntry.textContent = 'Zuletzt erfasst: ' + String(d.getDate()).padStart(2, '0') + '.' +
        String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    } else {
      el.catLastEntry.textContent = '';
    }
  }
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

  el.checkedCount.textContent = t.checkedCount + ' von ' + fixkostenVon(getMonthData(currentMonthKey)).length + ' angehakt';
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

  el.cardElternRow.textContent = formatCents(t.cardElternTotal);
  el.cardRausRow.textContent = (t.cardRausTotal ? '+ ' : '') + formatCents(t.cardRausTotal);

  if(m.card.restsaldoCents === null){
    el.cardUsed.textContent = '–';
    el.cardDiff.textContent = '–';
    el.cardDiff.classList.remove('negative');
    el.cardSummaryTotal.textContent = '–';
    el.cardSummaryTotal.classList.remove('negative');
  } else {
    const used = CARD_TOTAL_CENTS - m.card.restsaldoCents;
    // Ausgaben für die Eltern liefen zwar über die Karte (stecken also in
    // "used"), zählen aber nicht als eigene Ausgabe — deshalb werden sie
    // hier wieder herausgerechnet, sonst würde die Differenz fälschlich
    // eine Lücke zeigen, obwohl das Geld zurückerstattet wird.
    // "Rausrechnen" dagegen sind Sonstige Ausgaben, die NICHT über die Karte
    // liefen (bar, anderes Konto): sie werden aus den Ausgaben herausgerechnet
    // und verkleinern damit die Lücke zwischen Karte und Ausgaben (v54).
    const diff = used - t.categoryTotal - t.cardElternTotal + t.cardRausTotal;
    el.cardUsed.textContent = formatCents(used);
    el.cardDiff.textContent = formatCents(diff);
    el.cardDiff.classList.toggle('negative', diff < 0);
    // Die Differenz ist die eigentliche Kennzahl dieses Bereichs — deshalb
    // steht sie auch klein in der Überschrift, solange er zugeklappt ist.
    el.cardSummaryTotal.textContent = formatCents(diff);
    el.cardSummaryTotal.classList.toggle('negative', diff < 0);
  }
}

export function renderCardRausList(){
  const m = getMonthData(currentMonthKey);
  const entries = m.card.raus;
  const frag = document.createDocumentFragment();
  if(entries.length === 0){
    const empty = document.createElement('p');
    empty.className = 'cat-empty';
    empty.textContent = 'Noch keine Einträge diesen Monat.';
    frag.appendChild(empty);
  } else {
    entries.forEach((entry, idx) => {
      frag.appendChild(buildEntryLine('cardRaus', 'raus', idx, entry, true, false));
    });
  }
  el.cardRausList.replaceChildren(frag);
  el.cardRausSubtotal.textContent = formatCents(sumEntries(entries));
}

export function renderCardElternList(){
  const m = getMonthData(currentMonthKey);
  const entries = m.card.eltern;
  const total = sumEntries(entries);
  const frag = document.createDocumentFragment();

  if(entries.length === 0){
    const empty = document.createElement('p');
    empty.className = 'cat-empty';
    empty.textContent = 'Noch keine Einträge diesen Monat.';
    frag.appendChild(empty);
  } else {
    entries.forEach((entry, idx) => {
      frag.appendChild(buildEntryLine('cardEltern', 'eltern', idx, entry, true, false));
    });
  }

  el.cardElternList.replaceChildren(frag);
  el.cardElternSubtotal.textContent = formatCents(total);
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
// Wird je Monat neu aufgebaut, weil jeder Monat seine eigene Fixkosten-Liste
// haben kann (siehe fixkostenVon in storage.js).
export function buildCostList(liste){
  const fragment = document.createDocumentFragment();
  (liste || items).forEach((item, i) => {
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
  el.costList.replaceChildren(fragment);
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

  // Fixkosten dieses Monats aufbauen und Checkboxen auf den gespeicherten
  // Stand setzen.
  buildCostList(fixkostenVon(m));
  const boxes = el.costList.querySelectorAll('input[type="checkbox"]');
  for(let i = 0; i < boxes.length; i++) boxes[i].checked = m.checked[i] === true;

  renderCatList();
  renderSavList();

  // Gehalt: je nach Monat entweder fixierte Zeile (gespeichert) oder
  // Eingabefeld (noch nicht gespeichert) anzeigen.
  el.salaryError.textContent = '';
  if(m.salary === null){
    el.salarySlider.value = '';
    el.salaryValue.textContent = 'noch nicht gespeichert';
    showSalarySlider();
  } else {
    el.salarySlider.value = String(m.salary / 100).replace('.', ',');
    el.salaryValue.textContent = formatCents(m.salary);
    showSalaryFixed(m.salary);
  }

  // Forecast-Posten als Textliste.
  renderForecastListe();

  // Notizfeld auf gespeicherten Text.
  el.forecastNote.value = m.forecastNote || '';

  // Kreditkarten-Restsaldo auf gespeicherten Wert (oder leer, wenn noch
  // nichts erfasst wurde).
  el.cardRestsaldo.value = m.card.restsaldoCents === null
    ? '' : String(m.card.restsaldoCents / 100);
  el.cardError.textContent = '';
  el.cardElternError.textContent = '';
  el.cardRausError.textContent = '';
  renderCardElternList();
  renderCardRausList();

  refreshTotals();
}

// Forecast eines Monats als schlichte Textliste: je Kategorie eine
// Überschrift mit Summe, darunter die Posten (Bezeichnung · Betrag). Ändern
// nur über "Bearbeiten" (js/forecast-edit.js). Ein früher direkt getippter
// Betrag ohne Posten erscheint als Zeile "Bisher" — wie im Bearbeiten-Fenster.
export function renderForecastListe(){
  if(!fcListe) return;
  const m = getMonthData(currentMonthKey);
  const frag = document.createDocumentFragment();
  fcKeys.forEach(k => {
    const gruppe = document.createElement('div');
    gruppe.className = 'fc-liste-gruppe';
    gruppe.dataset.key = k;

    // Links ein Rechteck mit Kategorie und Summe, rechts daneben die Posten.
    const kopf = document.createElement('div');
    kopf.className = 'fc-liste-kopf';
    const titel = document.createElement('span');
    titel.className = 'fc-liste-titel';
    titel.textContent = FC_LABELS[k];
    const summe = document.createElement('span');
    summe.className = 'fc-liste-summe';
    summe.textContent = formatCents(m.forecast[k]);
    kopf.append(titel, summe);
    gruppe.appendChild(kopf);
    const posten_ = document.createElement('div');
    posten_.className = 'fc-liste-posten';
    gruppe.appendChild(posten_);

    const posten = (m.forecastItems && m.forecastItems[k] && m.forecastItems[k].length)
      ? m.forecastItems[k]
      : (m.forecast[k] > 0 ? [{ name: 'Bisher', cents: m.forecast[k] }] : []);
    if(!posten.length){
      const leer = document.createElement('p');
      leer.className = 'fc-liste-leer';
      leer.textContent = 'Nichts geplant';
      posten_.appendChild(leer);
    }
    posten.forEach(p => {
      const z = document.createElement('div');
      z.className = 'fc-liste-zeile';
      const n = document.createElement('span');
      n.className = 'fc-liste-name';
      n.textContent = p.name;
      const b = document.createElement('span');
      b.className = 'fc-liste-betrag';
      b.textContent = formatCents(p.cents);
      z.append(n, b);
      posten_.appendChild(z);
    });
    frag.appendChild(gruppe);
  });
  fcListe.replaceChildren(frag);
}
