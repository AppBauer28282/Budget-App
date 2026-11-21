/* =============================================================================
   GEHALTSTRACKER (Reiter „Tracker“ im Gehaltsrechner-Fenster)
   Jahresbrutto je Jahr (Ist) und bis zu fünf Prognosejahre: Kennzahlen,
   Balkendiagramm mit zwei Trendlinien, Tabelle, Eintragen/Bearbeiten/Löschen
   sowie Export und Import als JSON.

   Daten liegen in allData.gehaltTracker = { ist:[{jahr, cents}], prognose:[…] }
   und laufen damit über Cloud-Abgleich und Sichern/Wiederherstellen mit.
   Echte Werte stehen nie im Code — sie kommen per Import oder Eingabe.
   Aufbau nur per DOM-API (textContent, createElementNS), kein innerHTML.
   ============================================================================= */
import { MAX_IMPORT_BYTES } from './constants.js?v=66';
import { parseEuroInputToCents } from './utils.js?v=66';
import { allData, saveAll, sanitizeGehaltTracker, GT_MAX_PROGNOSE } from './storage.js?v=66';

const $ = (id) => document.getElementById(id);
const tabTracker = $('gt-tab-tracker');
const tabRechner = $('gt-tab-rechner');
const panelTracker = $('gt-tracker');
const panelRechner = $('sc-rechner');
const kpisEl   = $('gt-kpis');
const chartEl  = $('gt-chart');
const legendeEl = $('gt-legende');
const tblEl    = $('gt-tbl');
const formIst  = $('gt-form-ist');
const formProg = $('gt-form-prog');
const fehlerIst  = $('gt-fehler-ist');
const fehlerProg = $('gt-fehler-prog');
const exportBtn = $('gt-export');
const importIn  = $('gt-import');
const meldungEl = $('gt-meldung');
const openBtn   = $('salary-calc-btn');
const SVGNS = 'http://www.w3.org/2000/svg';

/* ---------- Format ---------- */
const nf = (v, d) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = (e) => nf(Math.round(e), 0) + ' €';
const sgnEur = (e) => (Math.round(e) > 0 ? '+' : Math.round(e) < 0 ? '−' : '') + eur(Math.abs(e));
const pct = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), 1) + ' %';

function h(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined && text !== null) e.textContent = text;
  return e;
}
function s(tag, attrs, text){
  const e = document.createElementNS(SVGNS, tag);
  for(const k in attrs) e.setAttribute(k, String(attrs[k]));
  if(text !== undefined) e.textContent = text;
  return e;
}

/* ---------- Daten ---------- */
function daten(){
  if(!allData.gehaltTracker || !Array.isArray(allData.gehaltTracker.ist)) allData.gehaltTracker = sanitizeGehaltTracker(null);
  return allData.gehaltTracker;
}
function speichern(){
  allData.gehaltTracker = sanitizeGehaltTracker(daten());
  saveAll(true);
  render();
}

/* ---------- Berechnung (wie im ursprünglichen Gehaltstracker) ---------- */
function zeilen(){
  const d = daten();
  const alle = [
    ...d.ist.map(e => ({ jahr: e.jahr, gehalt: e.cents / 100, typ: 'ist' })),
    ...d.prognose.map(e => ({ jahr: e.jahr, gehalt: e.cents / 100, typ: 'prog' }))
  ].sort((a, b) => a.jahr - b.jahr || (a.typ === 'ist' ? -1 : 1));
  alle.forEach((r, i) => {
    const vor = alle[i - 1];
    r.deltaAbs = vor ? r.gehalt - vor.gehalt : null;
    r.delta = vor ? (r.gehalt / vor.gehalt - 1) * 100 : null;
  });
  return alle;
}
const cagr = (start, ende, jahre) => jahre > 0 && start > 0 ? (Math.pow(ende / start, 1 / jahre) - 1) * 100 : null;

// Lineare Regression (kleinste Quadrate) über die Punkte.
function trend(pts){
  if(pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((a, r) => a + r.jahr, 0) / n;
  const my = pts.reduce((a, r) => a + r.gehalt, 0) / n;
  let sxy = 0, sxx = 0;
  pts.forEach(r => { sxy += (r.jahr - mx) * (r.gehalt - my); sxx += (r.jahr - mx) ** 2; });
  if(!sxx) return null;
  const slope = sxy / sxx;
  return { slope, von: pts[0].jahr, bis: pts[n - 1].jahr, at: (j) => my + slope * (j - mx) };
}

/* ---------- Darstellung ---------- */
function render(){
  if(panelTracker.hidden) return;
  const alle = zeilen();
  const ist = alle.filter(r => r.typ === 'ist');
  const prog = alle.filter(r => r.typ === 'prog');
  const tIst = trend(ist);
  const letzterIst = ist[ist.length - 1];
  const tProg = letzterIst && prog.length ? trend([letzterIst, ...prog.filter(p => p.jahr > letzterIst.jahr)]) : null;
  renderKpis(ist, prog);
  renderTabelle(alle);
  renderChart(alle, [{ t: tIst, cls: 'ist' }, { t: tProg, cls: 'prog' }]);
  renderLegende(tIst, tProg);
  vorbelegen();
}

function kachel(label, wert, sub, cls){
  const k = h('div', 'gt-kpi');
  k.append(h('div', 'gt-kpi-l', label), h('div', 'gt-kpi-v' + (cls ? ' ' + cls : ''), wert), h('div', 'gt-kpi-s', sub));
  return k;
}
function renderKpis(ist, prog){
  if(!ist.length){ kpisEl.replaceChildren(); kpisEl.hidden = true; return; }
  kpisEl.hidden = false;
  const erst = ist[0], letzt = ist[ist.length - 1];
  const g = cagr(erst.gehalt, letzt.gehalt, letzt.jahr - erst.jahr);
  const lp = prog[prog.length - 1];
  const gp = lp ? cagr(letzt.gehalt, lp.gehalt, lp.jahr - letzt.jahr) : null;
  kpisEl.replaceChildren(
    kachel('Gehalt ' + letzt.jahr, eur(letzt.gehalt), 'Jahresbrutto'),
    kachel('Δ zum Vorjahr', letzt.delta === null ? '–' : pct(letzt.delta), letzt.deltaAbs === null ? '' : sgnEur(letzt.deltaAbs),
      letzt.delta === null ? '' : (letzt.delta >= 0 ? 'pos' : 'neg')),
    kachel('Ø Wachstum p. a.', g === null ? '–' : pct(g), g === null ? 'mind. 2 Jahre nötig' : erst.jahr + '–' + letzt.jahr),
    kachel('Prognose' + (lp ? ' ' + lp.jahr : ''), lp ? eur(lp.gehalt) : '–', gp === null ? 'keine Prognose' : 'Ø ' + pct(gp) + ' p. a. ab ' + letzt.jahr)
  );
}

function renderLegende(tIst, tProg){
  const eintrag = (cls, text) => { const sp = h('span'); sp.append(h('i', cls), document.createTextNode(text)); return sp; };
  legendeEl.replaceChildren(
    eintrag('gt-lg-ist', 'Ist'),
    eintrag('gt-lg-prog', 'Prognose'),
    eintrag('gt-lg-ln', tIst ? 'Trend Ist ' + tIst.von + '–' + tIst.bis + ': ' + sgnEur(tIst.slope) + ' p. a.' : 'Trend Ist (ab 2 Jahren)'),
    eintrag('gt-lg-ln prog', tProg ? 'Trend Prognose ' + tProg.von + '–' + tProg.bis + ': ' + sgnEur(tProg.slope) + ' p. a.' : 'Trend Prognose (keine Daten)')
  );
}

// Balkendiagramm in echter Pixelbreite des Containers, damit die Schrift auf
// dem Handy lesbar bleibt (keine Verkleinerung per viewBox).
function renderChart(alle, trends){
  if(!alle.length){ chartEl.replaceChildren(h('p', 'gt-leer', 'Noch keine Daten. Gehalt eintragen oder eine Datei importieren.')); return; }
  const W = Math.max(200, Math.round(chartEl.clientWidth || 340));
  const H = W < 420 ? 210 : 250;
  const P = { l: 42, r: 6, t: 18, b: 22 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const aktiv = trends.filter(tr => tr.t);
  const tw = aktiv.flatMap(({ t }) => [t.at(t.von), t.at(t.bis)]);
  const max = Math.max(...alle.map(r => r.gehalt), ...tw) * 1.12 || 1;
  const y = (v) => P.t + ih - v / max * ih;
  const band = iw / alle.length;
  const x = (i) => P.l + band * i + band / 2;
  const bw = Math.min(40, band * 0.62);
  const kompakt = band < 46;
  const k = (v) => nf(Math.round(v / 1000), 0) + 'k';
  const svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Gehaltsentwicklung' });
  for(let i = 0; i <= 4; i++){
    const v = max * i / 4, yy = y(v);
    svg.appendChild(s('line', { x1: P.l, x2: W - P.r, y1: yy, y2: yy, class: 'gt-gitter' }));
    svg.appendChild(s('text', { x: P.l - 5, y: yy + 4, 'text-anchor': 'end', class: 'gt-achse' }, i === 0 ? '0' : k(v) + ' €'));
  }
  // Bei sehr schmalen Balken nur ausgewählte Werte beschriften (erstes Jahr,
  // letztes Ist-Jahr, letzte Prognose), sonst überlappen die Zahlen.
  const letzterIstIdx = alle.map(r => r.typ).lastIndexOf('ist');
  const wichtig = new Set([0, letzterIstIdx, alle.length - 1]);
  const jahrJedes = band < 16 ? 2 : 1;
  alle.forEach((r, i) => {
    const yy = y(r.gehalt), prog = r.typ === 'prog';
    const rect = s('rect', { x: x(i) - bw / 2, y: yy, width: bw, height: Math.max(0, P.t + ih - yy), rx: Math.min(4, bw / 3), class: 'gt-balken' + (prog ? ' prog' : '') });
    rect.appendChild(s('title', {}, r.jahr + (prog ? ' (Prognose)' : '') + ': ' + eur(r.gehalt)));
    svg.appendChild(rect);
    if(band >= 24 || wichtig.has(i)){
      svg.appendChild(s('text', { x: x(i), y: yy - 5, 'text-anchor': 'middle', class: 'gt-wert' }, kompakt ? k(r.gehalt) : eur(r.gehalt)));
    }
    if(i % jahrJedes === 0 || i === alle.length - 1){
      svg.appendChild(s('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'gt-achse' },
        (kompakt ? "'" + String(r.jahr).slice(2) : String(r.jahr)) + (prog ? '*' : '')));
    }
  });
  const xJahr = (jahr) => x(alle.findIndex(r => r.jahr === jahr));
  aktiv.forEach(({ t, cls }) => {
    svg.appendChild(s('line', { x1: xJahr(t.von), y1: y(Math.max(0, t.at(t.von))), x2: xJahr(t.bis), y2: y(Math.max(0, t.at(t.bis))), class: 'gt-trend ' + cls }));
  });
  chartEl.replaceChildren(svg);
}

let scharf = null, scharfTimer = null;
function entschaerfen(){
  if(scharf){ scharf.classList.remove('scharf'); scharf.textContent = '✕'; }
  scharf = null; clearTimeout(scharfTimer);
}
function renderTabelle(alle){
  entschaerfen();
  if(!alle.length){
    const tr = h('tr'); const td = h('td', 'gt-leer', 'Noch keine Einträge.'); tr.appendChild(td);
    tblEl.replaceChildren(tr); return;
  }
  const kopf = h('tr');
  ['Jahr', 'Brutto', 'Δ €', 'Δ %', ''].forEach(t => kopf.appendChild(h('th', '', t)));
  const frag = document.createDocumentFragment();
  frag.appendChild(kopf);
  alle.slice().reverse().forEach(r => {
    const tr = h('tr', r.typ === 'prog' ? 'prog' : 'ist');
    const jahr = h('td', '', String(r.jahr));
    if(r.typ === 'prog') jahr.appendChild(h('span', 'gt-tag', 'Prognose'));
    const cls = (v) => v >= 0 ? 'pos' : 'neg';
    const d1 = h('td'), d2 = h('td');
    if(r.deltaAbs === null){ d1.textContent = '–'; d2.textContent = '–'; }
    else { d1.appendChild(h('span', cls(r.deltaAbs), sgnEur(r.deltaAbs).replace(' €', ''))); d2.appendChild(h('span', cls(r.delta), pct(r.delta))); }
    const akt = h('td', 'gt-akt');
    const ed = h('button', 'gt-icon', '✎'); ed.type = 'button'; ed.dataset.edit = r.typ + ':' + r.jahr;
    ed.setAttribute('aria-label', r.jahr + ' bearbeiten'); ed.title = 'Bearbeiten';
    const del = h('button', 'gt-icon', '✕'); del.type = 'button'; del.dataset.del = r.typ + ':' + r.jahr;
    del.setAttribute('aria-label', r.jahr + (r.typ === 'prog' ? ' (Prognose)' : '') + ' löschen'); del.title = 'Löschen';
    akt.append(ed, del);
    tr.append(jahr, h('td', '', eur(r.gehalt)), d1, d2, akt);
    frag.appendChild(tr);
  });
  tblEl.replaceChildren(frag);
}

/* ---------- Formulare ---------- */
function vorbelegen(){
  const d = daten();
  const letzterIst = Math.max(new Date().getFullYear() - 1, ...d.ist.map(e => e.jahr));
  if(!formIst.jahr.value) formIst.jahr.value = String(letzterIst + 1);
  if(!formProg.jahr.value) formProg.jahr.value = String(Math.max(letzterIst, ...d.prognose.map(p => p.jahr)) + 1);
}

function eintragen(form, key, fehlerEl){
  const jahrTxt = form.jahr.value.trim();
  const jahr = /^\d{4}$/.test(jahrTxt) ? Number(jahrTxt) : NaN;
  const cents = parseEuroInputToCents(form.gehalt.value);
  if(!(jahr >= 1970 && jahr <= 2100)){ fehlerEl.textContent = 'Bitte ein Jahr zwischen 1970 und 2100 eingeben.'; form.jahr.focus(); return; }
  if(cents === null || cents <= 0){ fehlerEl.textContent = 'Bitte einen gültigen Bruttobetrag eingeben.'; form.gehalt.focus(); return; }
  const d = daten();
  const rest = d[key].filter(e => e.jahr !== jahr);
  if(key === 'prognose' && rest.length >= GT_MAX_PROGNOSE){
    fehlerEl.textContent = 'Höchstens ' + GT_MAX_PROGNOSE + ' Prognosejahre. Bitte zuerst eines löschen.'; return;
  }
  fehlerEl.textContent = '';
  d[key] = rest.concat({ jahr, cents });
  form.gehalt.value = ''; form.jahr.value = '';
  speichern();
}

/* ---------- Export / Import ---------- */
// Format wie im ursprünglichen Gehaltstracker: Beträge in Euro.
function exportieren(){
  const d = daten();
  const aus = (l) => l.map(e => ({ jahr: e.jahr, gehalt: e.cents / 100 }));
  const blob = new Blob([JSON.stringify({ ist: aus(d.ist), prognose: aus(d.prognose) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gehaltstracker-' + new Date().toISOString().slice(0, 10) + '.json';
  a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  meldung('Export erstellt.', false);
}

// Euro-Wert aus der Datei → Cent. Zahl oder Text („71.500“, „71500,50“).
function zuCents(v){
  if(typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
  if(typeof v === 'string') return parseEuroInputToCents(v);
  return null;
}
function liste(arr){
  return arr.filter(e => e && typeof e === 'object').map(e => ({ jahr: typeof e.jahr === 'string' && /^\d{4}$/.test(e.jahr.trim()) ? Number(e.jahr) : e.jahr, cents: zuCents(e.gehalt) }));
}
async function importieren(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  try{
    if(file.size > Math.min(MAX_IMPORT_BYTES, 1024 * 1024)) throw new Error('Datei ist zu groß.');
    let roh;
    try{ roh = JSON.parse(await file.text()); }catch(err){ throw new Error('Keine gültige JSON-Datei.'); }
    if(!roh || !Array.isArray(roh.ist) || !Array.isArray(roh.prognose)) throw new Error('Ungültiges Format (erwartet „ist“ und „prognose“).');
    const sauber = sanitizeGehaltTracker({ ist: liste(roh.ist), prognose: liste(roh.prognose) });
    const verworfen = roh.ist.length + roh.prognose.length - sauber.ist.length - sauber.prognose.length;
    if(!sauber.ist.length && !sauber.prognose.length) throw new Error('Keine gültigen Einträge gefunden.');
    allData.gehaltTracker = sauber;
    saveAll(true);
    formIst.jahr.value = ''; formProg.jahr.value = '';
    render();
    meldung(sauber.ist.length + ' Ist-Jahre und ' + sauber.prognose.length + ' Prognosen übernommen' +
      (verworfen > 0 ? ' (' + verworfen + ' ungültige Zeilen verworfen).' : '.'), false);
  }catch(err){
    meldung('Import fehlgeschlagen: ' + err.message, true);
  }
}
function meldung(text, fehler){
  meldungEl.textContent = text;
  meldungEl.classList.toggle('fehler', !!fehler);
}

/* ---------- Reiter ---------- */
function zeige(tracker){
  tabTracker.setAttribute('aria-selected', String(tracker));
  tabRechner.setAttribute('aria-selected', String(!tracker));
  tabTracker.tabIndex = tracker ? 0 : -1;
  tabRechner.tabIndex = tracker ? -1 : 0;
  panelTracker.hidden = !tracker;
  panelRechner.hidden = tracker;
  if(tracker) render();
}

const alleDa = [tabTracker, tabRechner, panelTracker, panelRechner, kpisEl, chartEl, legendeEl, tblEl, formIst, formProg,
  fehlerIst, fehlerProg, exportBtn, importIn, meldungEl].every(n => n !== null);

if(alleDa){
  tabTracker.addEventListener('click', () => zeige(true));
  tabRechner.addEventListener('click', () => zeige(false));
  [tabTracker, tabRechner].forEach(t => t.addEventListener('keydown', (e) => {
    if(e.key === 'ArrowLeft' || e.key === 'ArrowRight'){
      e.preventDefault();
      const nach = t === tabTracker ? tabRechner : tabTracker;
      zeige(nach === tabTracker); nach.focus();
    }
  }));
  // Beim Öffnen des Gehaltsrechners ist immer der Tracker aktiv.
  if(openBtn) openBtn.addEventListener('click', () => { meldung('', false); fehlerIst.textContent = ''; fehlerProg.textContent = ''; zeige(true); });
  formIst.addEventListener('submit', (e) => { e.preventDefault(); eintragen(formIst, 'ist', fehlerIst); });
  formProg.addEventListener('submit', (e) => { e.preventDefault(); eintragen(formProg, 'prognose', fehlerProg); });
  tblEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if(!btn) return;
    const ref = btn.dataset.del || btn.dataset.edit;
    if(!ref) return;
    const [typ, jahrTxt] = ref.split(':');
    const jahr = Number(jahrTxt);
    const key = typ === 'prog' ? 'prognose' : 'ist';
    const d = daten();
    if(btn.dataset.del){
      // Zweimal tippen: erst „Löschen?“, dann löschen (kein confirm()).
      if(scharf !== btn){
        entschaerfen();
        scharf = btn; btn.classList.add('scharf'); btn.textContent = 'Löschen?';
        scharfTimer = setTimeout(entschaerfen, 4000);
        return;
      }
      entschaerfen();
      d[key] = d[key].filter(x => x.jahr !== jahr);
      speichern();
    } else {
      const f = typ === 'prog' ? formProg : formIst;
      const r = d[key].find(x => x.jahr === jahr);
      if(!r) return;
      f.jahr.value = String(r.jahr);
      f.gehalt.value = nf(r.cents / 100, r.cents % 100 ? 2 : 0);
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      f.gehalt.focus({ preventScroll: true });
    }
  });
  exportBtn.addEventListener('click', exportieren);
  importIn.addEventListener('change', importieren);
  // Cloud-Abgleich/Wiederherstellen: offenen Tracker neu zeichnen.
  document.addEventListener('kontor:budget', () => { if(!panelTracker.hidden && panelTracker.offsetParent) render(); });
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if(panelTracker.offsetParent) render(); }, 150); });
  zeige(true);
}
