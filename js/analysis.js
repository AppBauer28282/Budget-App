/* =============================================================================
   ANALYSE (monatsübergreifende Auswertung)
   Wertet — anders als Beleg/Diagramm, die immer nur den aktuell geöffneten
   Monat zeigen — ALLE gespeicherten Monate aus (offen und abgeschlossen).
   Nutzer wählt ein Jahr, beliebige Monate dieses Jahres und beliebige
   Kategorien; Ergebnis ist ein Tortendiagramm (Verteilung je Kategorie) und
   eine kumulierte Liste (Summe je Beschreibungstext, gruppiert nach
   Kategorie mit Zwischensummen) — aktualisiert sich live bei jeder
   Filteränderung.
   ============================================================================= */
import { items, categoryDefs, MONTHS, SLICE_COLORS } from './constants.js';
import { el } from './dom.js';
import { formatCents } from './utils.js';
import { allData } from './storage.js';
import { buildPieSVG, buildChartLegend } from './charts.js';
import { openOverlay, closeOverlay } from './overlays.js';

// Die wählbaren "Kategorien" der Analyse: Fixkosten (Sonderfall, siehe unten),
// die normalen Sonstige-Ausgaben-Kategorien, und Sparen/Rücklagen als zwei
// eigene Positionen (wie in der bestehenden Diagrammansicht). "Auflösung
// Rücklagen" bleibt bewusst außen vor — das ist eine Einnahme, keine Ausgabe,
// genau wie bei der bestehenden Diagrammansicht.
const ANALYSIS_CATEGORIES = [
  { key: 'fixed', name: 'Fixkosten' },
  ...categoryDefs.map(d => ({ key: d.key, name: d.name })),
  { key: 'sparen', name: 'Sparen' },
  { key: 'ruecklagen', name: 'Rücklagen' }
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
// anderer Stelle der App). Sparen/Rücklagen haben keine eigenen
// Beschreibungstexte — dort ist der Kategoriename selbst die "Beschreibung".
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
    ['sparen', 'ruecklagen'].forEach(key => {
      if(!groupByKey.has(key)) return;
      const sum = m.saving[key].reduce((s, e) => s + e.cents, 0);
      addToGroup(key, groupByKey.get(key).name, sum);
    });
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

function renderAnalysisChart(container, groups){
  const total = groups.reduce((s, g) => s + g.subtotal, 0);
  if(groups.length === 0 || total <= 0){
    const note = document.createElement('p');
    note.className = 'chart-empty-note';
    note.textContent = 'Keine Daten für diese Auswahl.';
    container.appendChild(note);
    return;
  }

  const slices = groups.map(g => ({ label: g.name, cents: g.subtotal, color: g.color }));

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

  const fragment = document.createDocumentFragment();
  const chartWrap = document.createElement('div');
  renderAnalysisChart(chartWrap, groups);
  fragment.appendChild(chartWrap);

  const listWrap = document.createElement('div');
  renderAnalysisList(listWrap, groups);
  fragment.appendChild(listWrap);

  el.analysisResults.replaceChildren(fragment);
}

function openAnalysis(){
  populateYearSelect();
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
// jeweiligen Container statt einem Listener pro Checkbox).
el.analysisYear.addEventListener('change', updateAnalysis);
el.analysisMonths.addEventListener('change', updateAnalysis);
el.analysisCategories.addEventListener('change', updateAnalysis);
