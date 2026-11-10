/* =============================================================================
   MONATSVERGLEICH (Balkendiagramm pro Monat)
   Übersicht "Deine Monate", Knopf unter "Analyse". Je ABGESCHLOSSENEM Monat
   (seit v59; offene Monate sind noch unvollständig) des gewählten Jahres ein
   gestapelter Balken: wie viel in welcher Kategorie
   ausgegeben wurde. Kategorien lassen sich an- und abwählen.

   Ganz links steht als Vergleich "Ø <Vorjahr>": der Durchschnitt der
   ABGESCHLOSSENEN Monate des Vorjahres (erscheint, sobald dort mindestens
   ein Monat abgeschlossen ist).

   Jahresfix geht verteilt ein (Jahressumme ÷ 12, siehe js/auswertung.js),
   damit der Buchungsmonat nicht herausragt. Reine SVG-Erzeugung per DOM-API;
   Farben von Text und Linien kommen aus styles.css (hell/dunkel).
   ============================================================================= */
import { categoryDefs, SLICE_COLORS, VERRECHNET_IN } from './constants.js?v=59';
import { alleEintraege, monatsWerte, schnitt, AUSWERTUNG_KEYS } from './auswertung.js?v=59';
import { openOverlay, closeOverlay } from './overlays.js?v=59';

const $ = (id) => document.getElementById(id);
const oeffnenBtn = $('mb-btn');
const overlay    = $('mb-overlay');
const schliessen = $('mb-close');
const jahrSel    = $('mb-year');
const katBox     = $('mb-kategorien');
const katToggle  = $('mb-kat-toggle');
const chartBox   = $('mb-chart');
const legendeBox = $('mb-legende');

const NS = 'http://www.w3.org/2000/svg';
const MON_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const NAMEN = Object.assign(Object.create(null), { fixed: 'Fixkosten', sparen: 'Sparen' });
categoryDefs.forEach(d => { if(!VERRECHNET_IN[d.key]) NAMEN[d.key] = d.name; });

const euro = (cents) => Math.round(cents / 100).toLocaleString('de-DE') + ' €';
function svg(tag, attrs){
  const n = document.createElementNS(NS, tag);
  Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k]));
  return n;
}
function html(tag, cls, text){
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text !== undefined) n.textContent = text;
  return n;
}

function gewaehlt(){
  return Array.from(katBox.querySelectorAll('input:checked')).map(cb => cb.dataset.key);
}
function alleAn(){
  const b = Array.from(katBox.querySelectorAll('input'));
  return b.length > 0 && b.every(cb => cb.checked);
}
function toggleText(){ katToggle.textContent = alleAn() ? 'Alle abwählen' : 'Alle auswählen'; }

function baueKategorien(){
  const frag = document.createDocumentFragment();
  AUSWERTUNG_KEYS.forEach(key => {
    const label = html('label', 'analysis-check');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.key = key;
    cb.checked = true;
    label.append(cb, html('span', null, NAMEN[key]));
    frag.appendChild(label);
  });
  katBox.replaceChildren(frag);
}

// Schöne Obergrenze der Achse (1/2/2,5/5 × Zehnerpotenz) für vier Schritte.
function achsenMax(maxCents){
  const euroMax = Math.max(1, maxCents / 100);
  const roh = euroMax / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(roh)));
  const schritt = [1, 2, 2.5, 5, 10].map(f => f * pot).find(s => s >= roh);
  return schritt * 4 * 100;
}

function zeichne(){
  const jahr = Number(jahrSel.value);
  const keys = gewaehlt();
  const alle = alleEintraege();
  const monate = alle.filter(e => e.year === jahr && e.status === 'closed');
  const vorjahrZu = alle.filter(e => e.year === jahr - 1 && e.status === 'closed');

  // Spalten: optional "Ø Vorjahr", dann jeder angelegte Monat des Jahres.
  const spalten = [];
  if(vorjahrZu.length){
    spalten.push({ label: 'Ø ' + (jahr - 1), werte: schnitt(vorjahrZu, true), art: 'schnitt',
      titel: 'Durchschnitt der ' + vorjahrZu.length + ' abgeschlossenen Monate ' + (jahr - 1) });
  }
  monate.forEach(e => spalten.push({ label: MON_KURZ[e.monthIndex], werte: monatsWerte(e, true),
    art: 'zu', titel: e.monthName + ' ' + e.year }));

  chartBox.replaceChildren();
  legendeBox.replaceChildren();
  if(!monate.length){
    chartBox.appendChild(html('p', 'analysis-results-empty', 'In diesem Jahr ist noch kein Monat abgeschlossen.'));
    return;
  }
  if(!keys.length){
    chartBox.appendChild(html('p', 'analysis-results-empty', 'Bitte mindestens eine Kategorie auswählen.'));
    return;
  }

  spalten.forEach(s => {
    s.teile = keys.map(k => ({ key: k, cents: Math.max(0, s.werte[k]) })).filter(t => t.cents > 0);
    s.summe = s.teile.reduce((a, t) => a + t.cents, 0);
  });
  const maxSumme = Math.max(...spalten.map(s => s.summe), 0);
  const top = achsenMax(maxSumme);

  // Breite: füllt das Fenster; bei vielen Monaten wird das Diagramm breiter
  // als das Fenster und lässt sich seitlich schieben (mind. 40 px je Balken).
  const padL = 44, padR = 8, padT = 22, padB = 30, plotH = 190;
  const platz = Math.max(260, chartBox.clientWidth || 330);
  const slot = Math.min(64, Math.max(40, (platz - padL - padR) / spalten.length));
  const W = Math.round(padL + spalten.length * slot + padR), H = padT + plotH + padB;
  const y = (cents) => padT + plotH - (cents / top) * plotH;

  const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'mb-svg' });
  s.style.width = W + 'px';
  s.appendChild(svg('title')).textContent = 'Ausgaben je Monat ' + jahr + ', gestapelt nach Kategorie';

  // Gitterlinien + Achsenbeschriftung (volle Euro).
  for(let i = 0; i <= 4; i++){
    const wert = top / 4 * i;
    const yy = y(wert).toFixed(1);
    s.appendChild(svg('line', { x1: padL, y1: yy, x2: W - padR, y2: yy, class: i === 0 ? 'mb-grund' : 'mb-gitter' }));
    const t = svg('text', { x: padL - 6, y: (Number(yy) + 3.5).toFixed(1), 'text-anchor': 'end', class: 'mb-achse' });
    t.textContent = Math.round(wert / 100).toLocaleString('de-DE');
    s.appendChild(t);
  }

  spalten.forEach((sp, i) => {
    const x0 = padL + i * slot, bw = Math.min(30, slot * 0.62), bx = x0 + (slot - bw) / 2;
    const g = svg('g', { class: 'mb-spalte ' + sp.art });
    g.dataset.summe = String(sp.summe);
    g.appendChild(svg('title')).textContent = sp.titel + ': ' + euro(sp.summe);
    let unten = 0;
    sp.teile.forEach(t => {
      const h = (t.cents / top) * plotH;
      const r = svg('rect', { x: bx.toFixed(1), y: (y(unten + t.cents)).toFixed(1), width: bw.toFixed(1), height: Math.max(0.5, h).toFixed(1), class: 'mb-teil' });
      r.style.fill = SLICE_COLORS[t.key];
      r.dataset.key = t.key;
      r.dataset.cents = String(t.cents);
      g.appendChild(r);
      unten += t.cents;
    });
    const wert = svg('text', { x: (x0 + slot / 2).toFixed(1), y: (y(sp.summe) - 5).toFixed(1), 'text-anchor': 'middle', class: 'mb-wert' });
    wert.textContent = Math.round(sp.summe / 100).toLocaleString('de-DE');
    g.appendChild(wert);
    const lab = svg('text', { x: (x0 + slot / 2).toFixed(1), y: (padT + plotH + 16).toFixed(1), 'text-anchor': 'middle', class: 'mb-monat' });
    lab.textContent = sp.label;
    g.appendChild(lab);
    s.appendChild(g);
    // Trennlinie rechts neben dem Vorjahres-Durchschnitt.
    if(sp.art === 'schnitt'){
      s.appendChild(svg('line', { x1: x0 + slot, y1: padT - 8, x2: x0 + slot, y2: padT + plotH + 22, class: 'mb-trenner' }));
    }
  });
  chartBox.appendChild(s);

  // Legende: Ø pro Monat des gewählten Jahres je Kategorie.
  const mittel = schnitt(monate, true);
  let gesamt = 0;
  keys.forEach(k => {
    const c = Math.max(0, mittel[k]);
    if(c <= 0) return;
    gesamt += c;
    const z = html('div', 'mb-leg-zeile');
    const p = html('span', 'mb-leg-punkt');
    p.style.background = SLICE_COLORS[k];
    z.append(p, html('span', 'mb-leg-name', NAMEN[k]), html('span', 'mb-leg-wert', euro(c)));
    legendeBox.appendChild(z);
  });
  const kopf = html('div', 'mb-leg-zeile mb-leg-kopf');
  kopf.append(html('span', 'mb-leg-name', 'Ø pro Monat ' + jahr + ' (' + monate.length + (monate.length === 1 ? ' Monat' : ' Monate') + ')'),
    html('span', 'mb-leg-wert', euro(gesamt)));
  legendeBox.prepend(kopf);
  const hinweis = [];
  hinweis.push('Gezeigt werden nur abgeschlossene Monate.');
  if(keys.includes('jahresfix')) hinweis.push('Jahresfix ist gleichmäßig verteilt (Jahressumme ÷ 12).');
  if(hinweis.length) legendeBox.appendChild(html('p', 'categories-hint mb-hinweis', hinweis.join(' ')));
}

function oeffnen(){
  const jahre = Array.from(new Set(alleEintraege().filter(e => e.status === 'closed').map(e => e.year)));
  if(!jahre.length) jahre.push(new Date().getFullYear());
  const frag = document.createDocumentFragment();
  jahre.forEach(j => { const o = document.createElement('option'); o.value = String(j); o.textContent = String(j); frag.appendChild(o); });
  const vorher = jahrSel.value;
  jahrSel.replaceChildren(frag);
  jahrSel.value = jahre.map(String).includes(vorher) ? vorher : String(jahre[jahre.length - 1]);
  toggleText();
  openOverlay(overlay, schliessen);   // zuerst öffnen: zeichne() misst die Breite
  zeichne();
}
function zu(){ closeOverlay(overlay, oeffnenBtn); }

if([oeffnenBtn, overlay, schliessen, jahrSel, katBox, katToggle, chartBox, legendeBox].every(n => n !== null)){
  baueKategorien();
  oeffnenBtn.addEventListener('click', oeffnen);
  schliessen.addEventListener('click', zu);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) zu(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !overlay.hidden) zu(); });
  jahrSel.addEventListener('change', zeichne);
  katBox.addEventListener('change', () => { toggleText(); zeichne(); });
  katToggle.addEventListener('click', () => {
    const an = !alleAn();
    katBox.querySelectorAll('input').forEach(cb => { cb.checked = an; });
    toggleText();
    zeichne();
  });
}
