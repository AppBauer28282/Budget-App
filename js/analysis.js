/* =============================================================================
   ANALYSE (monatsübergreifende Auswertung)
   Wertet — anders als Beleg/Diagramm, die immer nur den aktuell geöffneten
   Monat zeigen — ALLE gespeicherten Monate aus (offen und abgeschlossen).
   Nutzer wählt ein Jahr, beliebige Monate dieses Jahres und beliebige
   Kategorien; Ergebnis sind zwei Tortendiagramme — Ausgaben (Verteilung je
   Kategorie, mit kumulierter Liste) und Einnahmen (Übersicht: Einnahmen vs.
   Ausgaben ohne Sparen vs. Sparen) — aktualisiert sich live bei jeder
   Filteränderung.
   ============================================================================= */
import { items, categoryDefs, MONTHS, SLICE_COLORS } from './constants.js?v=9';
import { el } from './dom.js?v=9';
import { formatCents } from './utils.js?v=9';
import { allData } from './storage.js?v=9';
import { buildPieSVG, buildChartLegend } from './charts.js?v=9';
import { openOverlay, closeOverlay } from './overlays.js?v=9';

// Die wählbaren "Kategorien" der Analyse: Fixkosten (Sonderfall, siehe unten),
// die normalen Sonstige-Ausgaben-Kategorien, und "Auflösung Rücklagen". Diese
// ist eigentlich eine Einnahme, wird auf Nutzerwunsch aber wie eine normale
// Ausgaben-Kategorie geführt. "Sparen"/"Rücklagen" sind dagegen keine echten
// Ausgaben (das Geld ist nicht weg, nur zurückgelegt) und tauchen deshalb
// nicht hier auf, sondern nur gesammelt im Einnahmen/Ausgaben/Sparen-
// Übersichtsdiagramm ganz unten (computeOverviewData/renderIncomeChart),
// unabhängig vom Kategorien-Filter.
const ANALYSIS_CATEGORIES = [
  { key: 'fixed', name: 'Fixkosten' },
  ...categoryDefs.map(d => ({ key: d.key, name: d.name })),
  { key: 'aufloesung', name: 'Auflösung Rücklagen' }
];

function getAvailableYears(){
  const years = new Set();
  Object.values(allData.monthEntries).forEach(entry => years.add(entry.year));
  if(years.size === 0) years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => a - b);
}

// Wird bei jedem Öffnen neu aufgebaut, da inzwischen neue Monate/Jahre
// angelegt worden sein können.
function populateYearSelect(){
  const years = getAvailableYears();
  const fragment = document.createDocumentFragment();
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    fragment.appendChild(opt);
  });
  el.analysisYear.replaceChildren(fragment);
  el.analysisYear.value = String(years[years.length - 1]); // neuestes Jahr zuerst
}

// Monats- und Kategorie-Checkboxen ändern sich nie zur Laufzeit — einmalig
// beim Laden dieses Moduls aufgebaut, alle standardmäßig angehakt (sofortiger
// Gesamtüberblick beim ersten Öffnen).
function buildMonthCheckboxes(){
  const fragment = document.createDocumentFragment();
  MONTHS.forEach((name, idx) => {
    const label = document.createElement('label');
    label.className = 'analysis-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.month = String(idx);
    cb.checked = true;
    const span = document.createElement('span');
    span.textContent = name;
    label.append(cb, span);
    fragment.appendChild(label);
  });
  el.analysisMonths.replaceChildren(fragment);
}

function buildCategoryCheckboxes(){
  const fragment = document.createDocumentFragment();
  ANALYSIS_CATEGORIES.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'analysis-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.key = cat.key;
    cb.checked = true;
    const span = document.createElement('span');
    span.textContent = cat.name;
    label.append(cb, span);
    fragment.appendChild(label);
  });
  el.analysisCategories.replaceChildren(fragment);
}
buildMonthCheckboxes();
buildCategoryCheckboxes();

// "Alle auswählen/abwählen"-Umschaltknopf: Beschriftung zeigt immer die
// nächste Aktion an (steht aktuell alles an, bietet er "Alle abwählen" an).
function allChecked(container){
  const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
  return boxes.length > 0 && boxes.every(cb => cb.checked);
}
function setAllChecked(container, checked){
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
}
function updateToggleAllLabel(container, btn){
  btn.textContent = allChecked(container) ? 'Alle abwählen' : 'Alle auswählen';
}
function wireToggleAllButton(btn, container){
  updateToggleAllLabel(container, btn);
  btn.addEventListener('click', () => {
    setAllChecked(container, !allChecked(container));
    updateToggleAllLabel(container, btn);
    updateAnalysis();
  });
}

function getSelectedMonthIndexes(){
  return Array.from(el.analysisMonths.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => Number(cb.dataset.month));
}
function getSelectedCategoryKeys(){
  return Array.from(el.analysisCategories.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.key);
}

// Sammelt für jede ausgewählte Kategorie die Summe je Beschreibungstext über
// alle Monats-Einträge des gewählten Jahres/der gewählten Monate hinweg
// (Status offen/abgeschlossen spielt keine Rolle). Fixkosten zählen nur,
// wenn im jeweiligen Monat abgehakt (konsistent mit "Ist-Ausgaben" an
// anderer Stelle der App). "Auflösung Rücklagen" hat keinen eigenen
// Beschreibungstext — dort ist der Kategoriename selbst die "Beschreibung".
function computeAnalysisData(year, monthSet, categorySet){
  const groups = ANALYSIS_CATEGORIES
    .filter(cat => categorySet.has(cat.key))
    .map(cat => ({ key: cat.key, name: cat.name, color: SLICE_COLORS[cat.key], map: new Map() }));
  const groupByKey = new Map(groups.map(g => [g.key, g]));

  function addToGroup(key, label, cents){
    const g = groupByKey.get(key);
    if(!g || cents <= 0) return;
    g.map.set(label, (g.map.get(label) || 0) + cents);
  }

  Object.values(allData.monthEntries).forEach(entry => {
    if(entry.year !== year || !monthSet.has(entry.monthIndex)) return;
    const m = entry.data;

    if(groupByKey.has('fixed')){
      items.forEach((item, i) => {
        if(m.checked[i]) addToGroup('fixed', item.name, item.cents);
      });
    }
    categoryDefs.forEach(def => {
      if(!groupByKey.has(def.key)) return;
      m.categories[def.key].forEach(e => addToGroup(def.key, e.name, e.cents));
    });
    if(groupByKey.has('aufloesung')){
      const sum = m.saving.aufloesung.reduce((s, e) => s + e.cents, 0);
      addToGroup('aufloesung', groupByKey.get('aufloesung').name, sum);
    }
  });

  return groups
    .map(g => {
      const entries = Array.from(g.map.entries())
        .map(([label, cents]) => ({ label, cents }))
        .sort((a, b) => b.cents - a.cents); // größte Position zuerst
      const subtotal = entries.reduce((s, e) => s + e.cents, 0);
      return { key: g.key, name: g.name, color: g.color, entries, subtotal };
    })
    .filter(g => g.subtotal > 0); // Kategorien ohne Einträge im Zeitraum überspringen
}

// Übersichts-Diagramm ganz unten: drei Gesamtsummen über die gewählten
// Monate hinweg — Einnahmen (Gehalt), Ausgaben ohne Sparen (identisch zur
// "Gesamt"-Zeile des Ausgaben-Diagramms, daher werden die dort schon
// berechneten `groups` übergeben statt doppelt zu rechnen) und Sparen
// (Sparen + Rücklagen zusammengefasst, da beides keine echten Ausgaben
// sind). Unabhängig vom Kategorien-Filter — der betrifft nur die Ausgaben-
// Aufschlüsselung selbst, nicht diese Gesamtsumme.
function computeOverviewData(year, monthSet, groups){
  let incomeCents = 0, savingsCents = 0;
  Object.values(allData.monthEntries).forEach(entry => {
    if(entry.year !== year || !monthSet.has(entry.monthIndex)) return;
    const m = entry.data;
    if(m.salary !== null) incomeCents += m.salary;
    savingsCents += m.saving.sparen.reduce((s, e) => s + e.cents, 0);
    savingsCents += m.saving.ruecklagen.reduce((s, e) => s + e.cents, 0);
  });
  const expenseCents = groups.reduce((s, g) => s + g.subtotal, 0);

  return [
    { label: 'Einnahmen', cents: incomeCents, color: SLICE_COLORS.overview_income },
    { label: 'Ausgaben ohne Sparen', cents: expenseCents, color: SLICE_COLORS.overview_expense },
    { label: 'Sparen', cents: savingsCents, color: SLICE_COLORS.sparen }
  ].filter(s => s.cents > 0);
}

// Gemeinsamer Baustein für beide Diagramme: Titel + Tortendiagramm +
// Legende + Gesamt-Zeile, oder ein Leerzustand-Hinweis.
function renderChartSection(container, title, slices, emptyText){
  const heading = document.createElement('p');
  heading.className = 'chart-section-title';
  heading.textContent = title;
  container.appendChild(heading);

  const total = slices.reduce((s, x) => s + x.cents, 0);
  if(slices.length === 0 || total <= 0){
    const note = document.createElement('p');
    note.className = 'chart-empty-note';
    note.textContent = emptyText;
    container.appendChild(note);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  wrap.appendChild(buildPieSVG(slices, 160));
  container.appendChild(wrap);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  buildChartLegend(legend, slices, total);
  container.appendChild(legend);

  const totalRow = document.createElement('div');
  totalRow.className = 'chart-total-row';
  const l = document.createElement('span');
  l.textContent = 'Gesamt';
  const a = document.createElement('span');
  a.textContent = formatCents(total);
  totalRow.append(l, a);
  container.appendChild(totalRow);
}

function renderIncomeChart(container, overviewSlices){
  renderChartSection(container, 'Einnahmen', overviewSlices, 'Keine Daten in diesem Zeitraum.');
}

function renderAnalysisChart(container, groups){
  const slices = groups.map(g => ({ label: g.name, cents: g.subtotal, color: g.color }));
  renderChartSection(container, 'Ausgaben', slices, 'Keine Daten für diese Auswahl.');
}

// Nutzt dieselben CSS-Klassen wie die bestehende Sonstige-Ausgaben/Sparen-
// Liste (cat-group, cat-entry-line, cat-subtotal, cat-grand-total) — optisch
// identisch, kein Lösch-Button, da hier nur ausgewertet, nicht bearbeitet wird.
function renderAnalysisList(container, groups){
  if(groups.length === 0){
    const p = document.createElement('p');
    p.className = 'analysis-results-empty';
    p.textContent = 'Keine Ausgaben in diesem Zeitraum und dieser Auswahl.';
    container.appendChild(p);
    return;
  }

  let grandTotal = 0;
  groups.forEach(g => {
    grandTotal += g.subtotal;

    const group = document.createElement('div');
    group.className = 'cat-group';

    const heading = document.createElement('p');
    heading.className = 'cat-group-name';
    heading.textContent = g.name;
    group.appendChild(heading);

    g.entries.forEach(entry => {
      const line = document.createElement('div');
      line.className = 'cat-entry-line';
      const text = document.createElement('span');
      text.className = 'cat-entry-text';
      text.textContent = entry.label;
      const amount = document.createElement('span');
      amount.className = 'cat-entry-amount';
      amount.textContent = formatCents(entry.cents);
      line.append(text, amount);
      group.appendChild(line);
    });

    const subtotalRow = document.createElement('div');
    subtotalRow.className = 'cat-subtotal';
    const subLabel = document.createElement('span');
    subLabel.textContent = 'Zwischensumme ' + g.name;
    const subValue = document.createElement('span');
    subValue.textContent = formatCents(g.subtotal);
    subtotalRow.append(subLabel, subValue);
    group.appendChild(subtotalRow);

    container.appendChild(group);
  });

  const grand = document.createElement('div');
  grand.className = 'cat-grand-total';
  const gl = document.createElement('span');
  gl.textContent = 'Gesamtsumme';
  const ga = document.createElement('span');
  ga.className = 'cat-grand-total-amount';
  ga.textContent = formatCents(grandTotal);
  grand.append(gl, ga);
  container.appendChild(grand);
}

function updateAnalysis(){
  const year = Number(el.analysisYear.value);
  if(!Number.isInteger(year)) return;
  const monthSet = new Set(getSelectedMonthIndexes());
  const categorySet = new Set(getSelectedCategoryKeys());

  const groups = computeAnalysisData(year, monthSet, categorySet);
  const overviewSlices = computeOverviewData(year, monthSet, groups);

  const fragment = document.createDocumentFragment();

  // Ausgaben-Diagramm und -Liste zuerst, Einnahmen-Übersicht ganz unten.
  const chartWrap = document.createElement('div');
  renderAnalysisChart(chartWrap, groups);
  fragment.appendChild(chartWrap);

  const listWrap = document.createElement('div');
  renderAnalysisList(listWrap, groups);
  fragment.appendChild(listWrap);

  const overviewWrap = document.createElement('div');
  renderIncomeChart(overviewWrap, overviewSlices);
  fragment.appendChild(overviewWrap);

  el.analysisResults.replaceChildren(fragment);
}

function openAnalysis(){
  populateYearSelect();
  updateToggleAllLabel(el.analysisMonths, el.analysisMonthsToggle);
  updateToggleAllLabel(el.analysisCategories, el.analysisCategoriesToggle);
  updateAnalysis();
  openOverlay(el.analysisOverlay, el.analysisClose);
}
function closeAnalysis(){
  closeOverlay(el.analysisOverlay, el.analysisBtn);
}

el.analysisBtn.addEventListener('click', openAnalysis);
el.analysisClose.addEventListener('click', closeAnalysis);
el.analysisOverlay.addEventListener('click', (e) => {
  if(e.target === el.analysisOverlay) closeAnalysis();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !el.analysisOverlay.hidden) closeAnalysis();
});

// Live-Aktualisierung bei jeder Filteränderung (Event-Delegation auf den
// jeweiligen Container statt einem Listener pro Checkbox). Die Umschalt-
// Beschriftung ("Alle auswählen"/"Alle abwählen") muss bei jeder manuellen
// Einzelauswahl mit aktualisiert werden.
el.analysisYear.addEventListener('change', updateAnalysis);
el.analysisMonths.addEventListener('change', () => {
  updateToggleAllLabel(el.analysisMonths, el.analysisMonthsToggle);
  updateAnalysis();
});
el.analysisCategories.addEventListener('change', () => {
  updateToggleAllLabel(el.analysisCategories, el.analysisCategoriesToggle);
  updateAnalysis();
});

wireToggleAllButton(el.analysisMonthsToggle, el.analysisMonths);
wireToggleAllButton(el.analysisCategoriesToggle, el.analysisCategories);
