/* =============================================================================
   DIAGRAMMANSICHT
   Zwei Tortendiagramme: "Ist-Ausgaben" (nur echte Buchungen) und
   "Ist + Forecast" (zusätzlich offene Fixkosten + Forecast-Regler).
   Reine SVG-Erzeugung ohne externe Bibliothek — jedes Segment wird als
   <path> per Trigonometrie berechnet. Gleiche Anzeigelogik wie der Beleg
   (Overlay, nur per Button sichtbar).
   ============================================================================= */
import { categoryDefs, FC_DEFS, FC_LABELS, SLICE_COLORS } from './constants.js?v=14';
import { el } from './dom.js?v=14';
import { formatCents } from './utils.js?v=14';
import { computeTotals, sumEntries } from './compute.js?v=14';
import { getMonthData, currentMonthKey, currentMonthLabelText } from './storage.js?v=14';
import { openOverlay, closeOverlay } from './overlays.js?v=14';

const SVG_NS = 'http://www.w3.org/2000/svg';

function polarToCartesian(cx, cy, r, angleDeg){
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Baut den Pfad eines einzelnen Tortenstücks zwischen zwei Winkeln (Grad).
function describeSlicePath(cx, cy, r, startAngle, endAngle){
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = (endAngle - startAngle) <= 180 ? '0' : '1';
  return ['M', cx, cy, 'L', start.x, start.y,
          'A', r, r, 0, largeArcFlag, 0, end.x, end.y, 'Z'].join(' ');
}

// slices: [{ label, cents, color }] — nur Einträge mit cents > 0.
// Exportiert, damit js/analysis.js dieselbe SVG-Erzeugung wiederverwendet.
export function buildPieSVG(slices, size){
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Tortendiagramm der Ausgabenverteilung');

  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  const total = slices.reduce((s, x) => s + x.cents, 0);

  // Ein einzelnes Segment (100%) lässt sich nicht als Bogen zeichnen
  // (Start- und Endpunkt wären identisch) — dafür einfach ein voller Kreis.
  if(slices.length === 1 && total > 0){
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    circle.style.fill = slices[0].color;
    svg.appendChild(circle);
    return svg;
  }

  let angle = 0;
  slices.forEach(slice => {
    const sweep = (slice.cents / total) * 360;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', describeSlicePath(cx, cy, r, angle, angle + sweep));
    path.style.fill = slice.color;
    svg.appendChild(path);
    angle += sweep;
  });
  return svg;
}

// Exportiert, siehe buildPieSVG.
export function buildChartLegend(container, slices, total){
  slices.forEach(slice => {
    const row = document.createElement('div');
    row.className = 'chart-legend-row';

    const swatch = document.createElement('span');
    swatch.className = 'chart-legend-swatch';
    swatch.style.background = slice.color;

    const label = document.createElement('span');
    label.className = 'chart-legend-label';
    label.textContent = slice.label;

    const pct = document.createElement('span');
    pct.className = 'chart-legend-pct';
    const percent = total > 0 ? (slice.cents / total * 100) : 0;
    pct.textContent = percent.toFixed(1).replace('.', ',') + ' %';

    const amount = document.createElement('span');
    amount.className = 'chart-legend-amount';
    amount.textContent = formatCents(slice.cents);

    row.append(swatch, label, pct, amount);
    container.appendChild(row);
  });
}

// Stellt für beide Diagramme die Segmente zusammen. "Ist-Ausgaben" zeigt nur
// echte Buchungen. "Ist + Forecast" fasst abgehakte und offene Fixkosten zu
// einem gemeinsamen Segment zusammen und zeigt zusätzlich alle vier
// Forecast-Regler als eigene "(Forecast)"-Segmente — keiner der neuen
// Kategorienamen entspricht mehr eindeutig einem Regler, daher werden sie
// bewusst nicht mehr in eine Kategorie eingerechnet, sondern konsequent
// separat ausgewiesen. "Auflösung Rücklagen" ist eine Einnahme, keine
// Ausgabe, und taucht daher bewusst in keinem der beiden Diagramme auf.
function computeChartSlices(){
  const m = getMonthData(currentMonthKey);
  const t = computeTotals();

  function push(list, label, cents, color){
    if(cents > 0) list.push({ label, cents, color });
  }

  const real = [];
  push(real, 'Fixkosten (abgehakt)', t.fixedPaid, SLICE_COLORS.fixed);
  categoryDefs.forEach(def => {
    push(real, def.name, sumEntries(m.categories[def.key]), SLICE_COLORS[def.key]);
  });
  push(real, 'Sparen', sumEntries(m.saving.sparen), SLICE_COLORS.sparen);
  push(real, 'Rücklagen', sumEntries(m.saving.ruecklagen), SLICE_COLORS.ruecklagen);

  const withForecast = [];
  push(withForecast, 'Fixkosten', t.fixedPaid + t.fixedRest, SLICE_COLORS.fixed);
  categoryDefs.forEach(def => {
    push(withForecast, def.name, sumEntries(m.categories[def.key]), SLICE_COLORS[def.key]);
  });
  push(withForecast, 'Sparen', sumEntries(m.saving.sparen), SLICE_COLORS.sparen);
  push(withForecast, 'Rücklagen', sumEntries(m.saving.ruecklagen), SLICE_COLORS.ruecklagen);
  FC_DEFS.forEach(def => {
    push(withForecast, FC_LABELS[def.key] + ' (Forecast)', m.forecast[def.key], SLICE_COLORS['fc_' + def.key]);
  });

  return { real, withForecast };
}

function buildChartSection(container, title, slices){
  const heading = document.createElement('p');
  heading.className = 'chart-section-title';
  heading.textContent = title;
  container.appendChild(heading);

  const total = slices.reduce((s, x) => s + x.cents, 0);
  if(slices.length === 0 || total <= 0){
    const note = document.createElement('p');
    note.className = 'chart-empty-note';
    note.textContent = 'Keine Daten für dieses Diagramm.';
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

function buildChartOverview(){
  const { real, withForecast } = computeChartSlices();
  const frag = document.createDocumentFragment();

  const monthLine = document.createElement('p');
  monthLine.className = 'receipt-month'; // gleiche Optik wie im Beleg
  monthLine.textContent = currentMonthLabelText();
  frag.appendChild(monthLine);

  buildChartSection(frag, 'Ist-Ausgaben', real);
  buildChartSection(frag, 'Ist + Forecast', withForecast);

  el.chartBody.replaceChildren(frag);
}

function openChart(){
  buildChartOverview();
  openOverlay(el.chartOverlay, el.chartClose);
}
function closeChart(){
  closeOverlay(el.chartOverlay, el.chartBtn);
}

el.chartBtn.addEventListener('click', openChart);
el.chartClose.addEventListener('click', closeChart);
el.chartOverlay.addEventListener('click', (e) => {
  if(e.target === el.chartOverlay) closeChart();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !el.chartOverlay.hidden) closeChart();
});
