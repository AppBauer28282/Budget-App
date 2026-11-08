/* =============================================================================
   ANALYSE (monatsübergreifende Auswertung)
   Wertet — anders als Beleg/Diagramm, die immer nur den aktuell geöffneten
   Monat zeigen — ALLE gespeicherten Monate aus (offen und abgeschlossen).
   Nutzer wählt ein Jahr, beliebige Monate dieses Jahres und beliebige
   Kategorien; Ergebnis ist ein Tortendiagramm (Verteilung je Kategorie)
   samt kumulierter Liste, darunter ein grob zusammenfassendes Diagramm mit
   nur drei Segmenten — aktualisiert sich live bei jeder Filteränderung.
   ============================================================================= */
import { categoryDefs, MONTHS, SLICE_COLORS, VERRECHNET_IN, aufloesungLabel } from './constants.js?v=56';
import { el } from './dom.js?v=56';
import { formatCents } from './utils.js?v=56';
import { allData, fixkostenVon } from './storage.js?v=56';
import { buildPieSVG, buildChartLegend } from './charts.js?v=56';
import { openOverlay, closeOverlay } from './overlays.js?v=56';

// Die wählbaren "Kategorien" der Analyse: Fixkosten (Sonderfall, siehe unten),
// die normalen Sonstige-Ausgaben-Kategorien sowie die drei Sparen-Unterarten.
// Sparen steht hier als ganz normale, einzeln abwählbare Position.
// "Auflösung Rücklagen" (v52) ist keine eigene Position: sie läuft als
// Minus-Posten in den Rücklagen (400 € − 300 € = 100 €; mehr aufgelöst als
// zurückgelegt ergibt eine negative Zwischensumme, angezeigt mit "+").
export const ANALYSIS_CATEGORIES = [
  { key: 'fixed', name: 'Fixkosten' },
  ...categoryDefs.filter(d => !VERRECHNET_IN[d.key]).map(d => ({ key: d.key, name: d.name })),
  { key: 'sparen', name: 'Sparen' }
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

// Monats-Checkboxen: nur die Monate des gewählten Jahres, die im
// Haushaltsbuch angelegt sind (v54) — neu aufgebaut beim Öffnen und bei
// jedem Jahreswechsel. Neue Monate sind angehakt; was man im selben Jahr
// abgewählt hat, bleibt beim erneuten Öffnen abgewählt.
// Kategorie-Checkboxen ändern sich nie zur Laufzeit — einmalig beim Laden
// dieses Moduls aufgebaut, alle standardmäßig angehakt.
let monateJahr = null;
let abgewaehlt = new Set();
function buildMonthCheckboxes(year){
  if(year !== monateJahr){ abgewaehlt = new Set(); monateJahr = year; }
  else {
    el.analysisMonths.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if(cb.checked) abgewaehlt.delete(Number(cb.dataset.month)); else abgewaehlt.add(Number(cb.dataset.month));
    });
  }
  const vorhanden = new Set();
  Object.values(allData.monthEntries).forEach(e => { if(e.year === year) vorhanden.add(e.monthIndex); });
  const fragment = document.createDocumentFragment();
  MONTHS.forEach((name, idx) => {
    if(!vorhanden.has(idx)) return;
    const label = document.createElement('label');
    label.className = 'analysis-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.month = String(idx);
    cb.checked = !abgewaehlt.has(idx);
    const span = document.createElement('span');
    span.textContent = name;
    label.append(cb, span);
    fragment.appendChild(label);
  });
  if(!vorhanden.size){
    const p = document.createElement('p');
    p.className = 'analysis-results-empty';
    p.textContent = 'In diesem Jahr sind noch keine Monate angelegt.';
    fragment.appendChild(p);
  }
  el.analysisMonths.replaceChildren(fragment);
  updateToggleAllLabel(el.analysisMonths, el.analysisMonthsToggle);
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
// anderer Stelle der App). Die Sparen-Arten haben keinen eigenen
// Beschreibungstext — dort ist der Kategoriename selbst die "Beschreibung".
export function computeAnalysisData(year, monthSet, categorySet){
  const groups = ANALYSIS_CATEGORIES
    .filter(cat => categorySet.has(cat.key))
    .map(cat => ({ key: cat.key, name: cat.name, color: SLICE_COLORS[cat.key], map: new Map() }));
  const groupByKey = new Map(groups.map(g => [g.key, g]));

  function addToGroup(key, label, cents){
    const g = groupByKey.get(key);
    if(!g || cents === 0) return;
    g.map.set(label, (g.map.get(label) || 0) + cents);
  }

  Object.values(allData.monthEntries).forEach(entry => {
    if(entry.year !== year || !monthSet.has(entry.monthIndex)) return;
    const m = entry.data;

    if(groupByKey.has('fixed')){
      fixkostenVon(m).forEach((item, i) => {
        if(m.checked[i]) addToGroup('fixed', item.name, item.cents);
      });
    }
    categoryDefs.forEach(def => {
      const ziel = VERRECHNET_IN[def.key];
      if(ziel){
        // Auflösung: negativ in der Zielgruppe (Rücklagen).
        if(groupByKey.has(ziel)) m.categories[def.key].forEach(e => addToGroup(ziel, aufloesungLabel(e.name), -e.cents));
        return;
      }
      if(!groupByKey.has(def.key)) return;
      m.categories[def.key].forEach(e => addToGroup(def.key, e.name, e.cents));
    });
    ['sparen'].forEach(key => {
      if(!groupByKey.has(key)) return;
      const sum = m.saving[key].reduce((s, e) => s + e.cents, 0);
      addToGroup(key, groupByKey.get(key).name, sum);
    });
  });

  return groups
    .map(g => {
      const entries = Array.from(g.map.entries())
        .map(([label, cents]) => ({ label, cents }))
        .filter(e => e.cents !== 0)
        .sort((a, b) => b.cents - a.cents); // größte Position zuerst, Minus-Posten zuletzt
      const subtotal = entries.reduce((s, e) => s + e.cents, 0);
      return { key: g.key, name: g.name, color: g.color, entries, subtotal };
    })
    .filter(g => g.entries.length > 0); // Kategorien ohne Einträge im Zeitraum überspringen
}

// Grobe Dreiteilung für das Übersichtsdiagramm ganz unten. Bewusst feste
// Töpfe statt der 13 Einzelkategorien — es geht nur um das Verhältnis von
// Fixem, laufenden Ausgaben und Zurückgelegtem:
//   Fix      = abgehakte Fixkosten + Jahresfix
//   Ausgaben = alle übrigen Sonstige-Ausgaben-Kategorien (inkl. Rücklagen)
//              − Auflösung Rücklagen
//   Sparen   = Sparen
// Jahresfix zählt ausschließlich zu "Fix" und ist deshalb aus "Ausgaben"
// herausgenommen, sonst stünde derselbe Betrag doppelt im Diagramm.
// Hängt nur an Jahr und Monatsauswahl, nicht am Kategorien-Filter — die
// drei Töpfe sind fest und lassen sich nicht sinnvoll einzeln abwählen.
const SUMMARY_FIX_CATEGORIES = ['jahresfix'];

function computeSummaryData(year, monthSet){
  let fixCents = 0, ausgabenCents = 0, sparenCents = 0;

  Object.values(allData.monthEntries).forEach(entry => {
    if(entry.year !== year || !monthSet.has(entry.monthIndex)) return;
    const m = entry.data;

    fixkostenVon(m).forEach((item, i) => {
      if(m.checked[i]) fixCents += item.cents;
    });

    categoryDefs.forEach(def => {
      const sum = (VERRECHNET_IN[def.key] ? -1 : 1) * m.categories[def.key].reduce((s, e) => s + e.cents, 0);
      if(SUMMARY_FIX_CATEGORIES.includes(def.key)) fixCents += sum;
      else ausgabenCents += sum;
    });

    sparenCents   += m.saving.sparen.reduce((s, e) => s + e.cents, 0);
  });

  return [
    { label: 'Fix',      cents: fixCents,      color: SLICE_COLORS.fixed },
    { label: 'Ausgaben', cents: ausgabenCents, color: SLICE_COLORS.summary_ausgaben },
    { label: 'Sparen',   cents: sparenCents,   color: SLICE_COLORS.sparen }
  ].filter(slice => slice.cents > 0);
}

// Titel + Tortendiagramm + Legende + Gesamt-Zeile, oder ein
// Leerzustand-Hinweis.
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

function renderAnalysisChart(container, groups){
  const slices = groups.filter(g => g.subtotal > 0).map(g => ({ label: g.name, cents: g.subtotal, color: g.color }));
  renderChartSection(container, durchschnitt ? 'Ausgaben (Ø pro Monat)' : 'Ausgaben', slices, 'Keine Daten für diese Auswahl.');
}

function renderSummaryChart(container, slices){
  renderChartSection(container, 'Übersicht', slices, 'Keine Daten in diesem Zeitraum.');
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
      amount.className = 'cat-entry-amount' + (entry.cents < 0 ? ' income' : '');
      amount.textContent = entry.cents < 0 ? '− ' + formatCents(-entry.cents) : formatCents(entry.cents);
      line.append(text, amount);
      group.appendChild(line);
    });

    const subtotalRow = document.createElement('div');
    subtotalRow.className = 'cat-subtotal';
    const subLabel = document.createElement('span');
    subLabel.textContent = 'Zwischensumme ' + g.name;
    const subValue = document.createElement('span');
    subValue.textContent = g.subtotal < 0 ? '+ ' + formatCents(-g.subtotal) : formatCents(g.subtotal);
    if(g.subtotal < 0) subValue.className = 'income';
    subtotalRow.append(subLabel, subValue);
    group.appendChild(subtotalRow);

    container.appendChild(group);
  });

  const grand = document.createElement('div');
  grand.className = 'cat-grand-total';
  const gl = document.createElement('span');
  gl.textContent = durchschnitt ? 'Gesamt (Ø pro Monat)' : 'Gesamtsumme';
  const ga = document.createElement('span');
  ga.className = 'cat-grand-total-amount';
  ga.textContent = formatCents(grandTotal);
  grand.append(gl, ga);
  container.appendChild(grand);
}

/* ---------- Summe / Durchschnitt ----------
   Schalter neben dem Jahr: Σ zeigt die Summe der ausgewählten Monate, Ø den
   Durchschnitt je Monat. Geteilt wird durch die ausgewählten Monate, die im
   Haushaltsbuch auch angelegt sind (ein nie angelegter Monat zählt nicht). */
const avgBtn = document.getElementById('analysis-avg-toggle');
let durchschnitt = false;
function setzeModus(avg){
  durchschnitt = avg;
  if(avgBtn){
    avgBtn.setAttribute('aria-checked', String(avg));
    avgBtn.classList.toggle('avg', avg);
  }
}
function anzahlMonateMitDaten(year, monthSet){
  const set = new Set();
  Object.values(allData.monthEntries).forEach(e => {
    if(e.year === year && monthSet.has(e.monthIndex)) set.add(e.monthIndex);
  });
  return set.size;
}
function teile(cents, n){ return Math.round(cents / n); }

function updateAnalysis(){
  const year = Number(el.analysisYear.value);
  if(!Number.isInteger(year)) return;
  const monthSet = new Set(getSelectedMonthIndexes());
  const categorySet = new Set(getSelectedCategoryKeys());

  let groups = computeAnalysisData(year, monthSet, categorySet);
  let summary = computeSummaryData(year, monthSet);
  const n = anzahlMonateMitDaten(year, monthSet);
  if(durchschnitt && n > 0){
    groups = groups.map(g => ({ ...g, subtotal: teile(g.subtotal, n),
      entries: g.entries.map(e => ({ ...e, cents: teile(e.cents, n) })) }));
    summary = summary.map(x => ({ ...x, cents: teile(x.cents, n) }));
  }

  const fragment = document.createDocumentFragment();

  const chartWrap = document.createElement('div');
  renderAnalysisChart(chartWrap, groups);
  fragment.appendChild(chartWrap);

  const listWrap = document.createElement('div');
  renderAnalysisList(listWrap, groups);
  fragment.appendChild(listWrap);

  // Grobe Dreiteilung ganz unten.
  const summaryWrap = document.createElement('div');
  renderSummaryChart(summaryWrap, summary);
  fragment.appendChild(summaryWrap);

  // Hinweis, worauf sich der Durchschnitt bezieht.
  if(durchschnitt){
    const hint = document.createElement('p');
    hint.className = 'analysis-avg-hint';
    hint.textContent = n > 0
      ? 'Durchschnitt pro Monat über ' + n + (n === 1 ? ' angelegten Monat.' : ' angelegte Monate.')
      : 'Keine angelegten Monate in dieser Auswahl.';
    fragment.insertBefore(hint, fragment.firstChild);
  }

  el.analysisResults.replaceChildren(fragment);
}

function openAnalysis(){
  populateYearSelect();
  buildMonthCheckboxes(Number(el.analysisYear.value));
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
el.analysisYear.addEventListener('change', () => {
  buildMonthCheckboxes(Number(el.analysisYear.value));
  updateAnalysis();
});
el.analysisMonths.addEventListener('change', () => {
  updateToggleAllLabel(el.analysisMonths, el.analysisMonthsToggle);
  updateAnalysis();
});
el.analysisCategories.addEventListener('change', () => {
  updateToggleAllLabel(el.analysisCategories, el.analysisCategoriesToggle);
  updateAnalysis();
});

if(avgBtn){
  setzeModus(false);
  avgBtn.addEventListener('click', () => { setzeModus(!durchschnitt); updateAnalysis(); });
}
wireToggleAllButton(el.analysisMonthsToggle, el.analysisMonths);
wireToggleAllButton(el.analysisCategoriesToggle, el.analysisCategories);
