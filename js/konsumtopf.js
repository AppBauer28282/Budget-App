/* =============================================================================
   KONSUMTOPF
   Eigenständiges Planungswerkzeug hinter dem Geldsack-Symbol rechts oben.
   Plant über zwölf Monate hinweg Rücklagen und geplante Konsum-Posten; der
   Rest eines Monats wandert als Übertrag in den Folgemonat. Dazu eine
   Bucket-List (geplant vs. tatsächlich) und ein Notizfeld.

   Bewusst getrennt vom Budget: eigener Speicherschlüssel, keine Berührung
   mit allData. Wie beim Gehaltsrechner holt sich das Modul alle Elemente
   selbst (statt über dom.js) und startet nur, wenn wirklich alle da sind —
   so kann eine ältere, zwischengespeicherte Datei die App nicht lahmlegen.

   Alle IDs sind mit "kt-" vorangestellt, damit sie nicht mit der Budget-
   Oberfläche kollidieren. Aufbau der Listen über die DOM-API statt über
   innerHTML, wie überall sonst in dieser App.
   ============================================================================= */
import { openOverlay, closeOverlay } from './overlays.js?v=14';

const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const MONTHS_FULL  = ['Januar','Februar','März','April','Mai','Juni','Juli',
                      'August','September','Oktober','November','Dezember'];
const MAX_CENTS_VIEW = 2500;          // Fassungsvermögen des Topfes in Euro
const STORE_KEY = 'konsumtopf.v2';
const MAX_TEXT = 80;
const MAX_NOTE = 2000;

// Erstbelegung: die bisherige Jahresplanung. Wird nur geschrieben, wenn noch
// gar nichts gespeichert ist — vorhandene Daten bleiben unangetastet.
const SEED = [
  { r: 300, items: [['Silvester', 60]] },
  { r: 300, items: [['Apple Watch + Armband', 395]] },
  { r: 300, items: [['TV Vater, Hygrometer+, Baterien, MX Master', 255]] },
  { r: 300, items: [['Oberteil, Hose, Auto-Teile', 315]] },
  { r: 300, items: [['CarVetical, Rucksack, iPad Cover, Schrank eltern', 120]] },
  { r: 350, items: [['Zava, Milchschaum, Shirt', 460]] },
  { r: 350, items: [['Basis', 100]] },
  { r: 300, items: [['Walking Pad, Zava', 750]] },
  { r: 300, items: [['Zava', 500]] },
  { r: 300, items: [['Sonstiges', 400]] },
  { r: 600, items: [['Basis', 100]] },
  { r: 300, items: [['Basis', 100]] }
];
const SEED_NOTES =
  'Etwa 10% für Konsum. In 15 € Schritten. 3000 = 300 und 3150 = 315\n\n' +
  '100 € ist immer die Basis; irgendwas gibt man eh aus';

/* ---------- Elemente ---------- */
const $ = (id) => document.getElementById(id);

const ktBtn        = $('konsum-btn');
const ktOverlay    = $('konsum-overlay');
const ktClose      = $('konsum-close');
const ktTabs       = $('kt-tabs');
const ktPlanTitle  = $('kt-plan-title');
const ktCarryIn    = $('kt-carry-in');
const ktRueck      = $('kt-rueck');
const ktItems      = $('kt-items');
const ktNewName    = $('kt-new-name');
const ktNewAmount  = $('kt-new-amount');
const ktAddItem    = $('kt-add-item');
const ktCalc       = $('kt-calc');
const ktChart      = $('kt-chart');
const ktRows       = $('kt-rows');
const ktTfoot      = $('kt-tfoot');
const ktSackLabel  = $('kt-sack-label');
const ktSackValue  = $('kt-sack-value');
const ktSackStatus = $('kt-sack-status');
const ktFill       = $('kt-fill');
const ktFillEdge   = $('kt-fill-edge');
const ktBlMonth    = $('kt-bl-month');
const ktBlTopic    = $('kt-bl-topic');
const ktBlSum      = $('kt-bl-sum');
const ktBlAdd      = $('kt-bl-add');
const ktBlList     = $('kt-bl-list');
const ktBlFoot     = $('kt-bl-foot');
const ktNotes      = $('kt-notes');
const ktStart      = $('kt-start');
const ktSaved      = $('kt-saved');

/* ---------- Hilfsfunktionen ---------- */
// Nimmt deutsche Eingaben entgegen: Punkt als Tausender-, Komma als
// Dezimaltrennzeichen. Ungültiges wird zu 0, damit nie NaN weitergereicht wird.
function num(v){
  if(typeof v === 'number') return isFinite(v) ? v : 0;
  if(v === null || v === undefined) return 0;
  const s = String(v).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
function eur(v){
  let n = Math.round(v * 100) / 100;
  if(n === 0) n = 0;               // verhindert die Anzeige von "-0 €"
  return nf.format(n) + ' €';
}
// Farbklasse nach Füllstand: negativ, am Maximum, sonst normal.
function cls(v){
  if(v < 0) return 'kt-bad';
  if(v >= MAX_CENTS_VIEW) return 'kt-full';
  return 'kt-good';
}
function signed(v){
  if(v > 0) return '+' + eur(v);
  if(v < 0) return '−' + eur(Math.abs(v));
  return '±0 €';
}
// Beim Soll/Ist-Vergleich ist teurer als geplant das schlechtere Ergebnis.
function diffCls(v){
  if(v > 0) return 'kt-bad';
  if(v < 0) return 'kt-good';
  return '';
}
function newId(){
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---------- Zustand ---------- */
function blankState(){
  const months = [];
  for(let i = 0; i < 12; i++) months.push({ ruecklage: 300, items: [] });
  return { year: new Date().getFullYear(), start: 0, months, notes: '', bucket: [] };
}
function seededState(){
  const s = blankState();
  for(let i = 0; i < 12; i++){
    s.months[i].ruecklage = SEED[i].r;
    s.months[i].items = SEED[i].items.map(p => ({ name: p[0], amount: p[1] }));
  }
  s.notes = SEED_NOTES;
  return s;
}
function hasSaved(){
  try{ return !!localStorage.getItem(STORE_KEY); }catch(e){ return false; }
}

let state = hasSaved() ? blankState() : seededState();
let sel = 0;
let nowMonth = 0;
let blPending = null;   // Eintrag, dessen Ist-Betrag gerade abgefragt wird

// Alles aus dem Speicher wird geprüft und begrenzt — beschädigte oder
// manipulierte Daten dürfen die Oberfläche nicht durcheinanderbringen.
function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return;
    const d = JSON.parse(raw);
    if(!d || !Array.isArray(d.months)) return;

    state.year  = Number.isInteger(d.year) ? d.year : new Date().getFullYear();
    state.start = num(d.start);
    state.notes = typeof d.notes === 'string' ? d.notes.slice(0, MAX_NOTE) : '';

    for(let i = 0; i < 12; i++){
      const s = d.months[i] || {};
      state.months[i] = {
        ruecklage: num(s.ruecklage),
        items: Array.isArray(s.items)
          ? s.items.slice(0, 200).map(it => ({
              name: String((it && it.name) || '').slice(0, MAX_TEXT),
              amount: num(it && it.amount)
            }))
          : []
      };
    }

    state.bucket = Array.isArray(d.bucket)
      ? d.bucket.slice(0, 200).map(b => {
          b = b || {};
          const m = parseInt(b.month, 10);
          return {
            id: String(b.id || newId()),
            month: (isFinite(m) && m >= 0 && m <= 11) ? m : 0,
            topic: String(b.topic || '').slice(0, MAX_TEXT),
            planned: num(b.planned),
            done: !!b.done,
            actual: (b.actual === null || b.actual === undefined) ? null : num(b.actual)
          };
        })
      : [];
  }catch(e){ /* beschädigte Daten ignorieren, leeres Jahr behalten */ }
}

/* ---------- Speichern ---------- */
// Gebündelt wie im Budget: beim Tippen feuert 'input' dutzendfach, ohne
// Bündelung würde jedes Mal der ganze Zustand serialisiert.
let saveTimer = null;

function writeNow(){
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    return true;
  }catch(e){ return false; }
}
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const ok = writeNow();
    ktSaved.textContent = ok ? 'gespeichert' : 'nicht gespeichert!';
    ktSaved.style.color = ok ? '' : 'var(--error)';
    ktSaved.classList.add('on');
    if(ok) setTimeout(() => ktSaved.classList.remove('on'), 900);
  }, 250);
}
// Sicherheitsnetz beim Verlassen/Ausblenden der Seite.
function flush(){
  if(saveTimer !== null){
    clearTimeout(saveTimer);
    saveTimer = null;
    writeNow();
  }
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') flush();
});

/* ---------- Berechnung ---------- */
// Der Rest eines Monats ist der Übertrag des nächsten — deshalb läuft die
// Kette einmal von Januar bis Dezember durch.
function compute(){
  const rows = [];
  let carry = num(state.start);
  for(let i = 0; i < 12; i++){
    const m = state.months[i];
    const r = num(m.ruecklage);
    let k = 0;
    m.items.forEach(it => { k += num(it.amount); });
    const rest = carry + r - k;
    rows.push({ carryIn: carry, r, k, rest });
    carry = rest;
  }
  return rows;
}

/* ---------- Kleine DOM-Bausteine ---------- */
function span(text, className){
  const s = document.createElement('span');
  if(className) s.className = className;
  s.textContent = text;
  return s;
}
function cell(text, className){
  const d = document.createElement('div');
  if(className) d.className = className;
  d.textContent = text;
  return d;
}

/* ---------- Anzeige ---------- */
function renderTabs(){
  const frag = document.createDocumentFragment();
  MONTHS_SHORT.forEach((name, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kt-tab' + (i === sel ? ' active' : '') + (i === nowMonth ? ' now' : '');
    b.textContent = name;
    b.dataset.i = String(i);
    b.setAttribute('aria-pressed', i === sel ? 'true' : 'false');
    frag.appendChild(b);
  });
  ktTabs.replaceChildren(frag);
}

function renderItems(){
  const items = state.months[sel].items;
  if(items.length === 0){
    const p = document.createElement('p');
    p.className = 'kt-empty';
    p.textContent = 'Noch keine Posten geplant.';
    ktItems.replaceChildren(p);
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'kt-item';
    row.append(
      span(it.name.trim() || 'Ohne Bezeichnung', 'kt-item-name'),
      span(eur(num(it.amount)), 'kt-item-amount')
    );
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'kt-del';
    del.textContent = '✕';
    del.title = 'Posten löschen';
    del.setAttribute('aria-label', 'Posten löschen');
    del.dataset.idx = String(idx);
    row.appendChild(del);
    frag.appendChild(row);
  });
  ktItems.replaceChildren(frag);
}

function renderPlanFields(){
  ktPlanTitle.textContent = MONTHS_FULL[sel];
  const r = state.months[sel].ruecklage;
  ktRueck.value = r ? nf.format(r) : '0';
}

function renderSack(v){
  const pct = Math.max(0, Math.min(1, v / MAX_CENTS_VIEW));
  const top = 72, bottom = 226;
  const h = (bottom - top) * pct;
  const y = bottom - h;
  const color = v < 0 ? 'var(--error)' : (v >= MAX_CENTS_VIEW ? 'var(--brass)' : 'var(--ok)');

  ktFill.setAttribute('y', y);
  ktFill.setAttribute('height', h);
  ktFill.setAttribute('fill', color);
  ktFillEdge.setAttribute('y', h > 0 ? y : bottom);
  ktFillEdge.setAttribute('height', h > 0 ? 2 : 0);

  ktSackLabel.textContent = 'Ende ' + MONTHS_FULL[sel];
  ktSackValue.textContent = eur(v);
  ktSackValue.className = 'kt-sack-value ' + cls(v);

  let txt;
  if(v < 0)                       txt = 'Topf überzogen: ' + eur(Math.abs(v)) + ' fehlen';
  else if(v >= MAX_CENTS_VIEW)    txt = 'Maximum erreicht';
  else                            txt = eur(MAX_CENTS_VIEW - v) + ' bis zum Maximum';
  ktSackStatus.textContent = txt;
  ktSackStatus.className = 'kt-sack-status ' + cls(v);
}

// Balkendiagramm als Inline-SVG, ohne Bibliothek — wie die übrigen
// Diagramme der App.
function renderChart(rows){
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const W = 480, top = 8, bottom = 100, H = bottom - top;
  const vals = rows.map(r => r.rest);
  const lo = Math.min(0, ...vals);
  let hi = Math.max(MAX_CENTS_VIEW, ...vals);
  if(hi === lo) hi = lo + 1;
  const yOf = (v) => top + (hi - v) / (hi - lo) * H;

  const slot = (W - 16) / 12;
  const bw = Math.min(26, slot - 8);
  const frag = document.createDocumentFragment();

  const zero = document.createElementNS(SVG_NS, 'line');
  zero.setAttribute('x1', 8);
  zero.setAttribute('y1', yOf(0).toFixed(1));
  zero.setAttribute('x2', W - 8);
  zero.setAttribute('y2', yOf(0).toFixed(1));
  zero.setAttribute('stroke', 'rgba(20,32,43,0.16)');
  zero.setAttribute('stroke-width', '1');
  frag.appendChild(zero);

  vals.forEach((v, i) => {
    const x = 8 + slot * i + (slot - bw) / 2;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', 'kt-bar');
    rect.dataset.i = String(i);
    rect.setAttribute('x', x.toFixed(1));
    rect.setAttribute('y', yOf(Math.max(v, 0)).toFixed(1));
    rect.setAttribute('width', bw.toFixed(1));
    rect.setAttribute('height', Math.max(Math.abs(yOf(v) - yOf(0)), 1.5).toFixed(1));
    rect.setAttribute('fill', v < 0 ? '#9c3b2e' : (v >= MAX_CENTS_VIEW ? '#a8783f' : '#3c6e4f'));
    rect.setAttribute('opacity', i === sel ? '1' : '0.42');
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = MONTHS_FULL[i] + ': ' + eur(v);
    rect.appendChild(title);
    frag.appendChild(rect);

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('x', (x + bw / 2).toFixed(1));
    label.setAttribute('y', '119');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-family', "'IBM Plex Mono', monospace");
    label.setAttribute('font-size', '9');
    label.setAttribute('fill', i === sel ? '#14202b' : '#3c4a56');
    label.textContent = MONTHS_SHORT[i];
    frag.appendChild(label);
  });

  ktChart.replaceChildren(frag);
}

function renderTable(rows){
  const frag = document.createDocumentFragment();
  let sumR = 0, sumK = 0;

  rows.forEach((r, i) => {
    sumR += r.r;
    sumK += r.k;

    const row = document.createElement('div');
    row.className = 'kt-trow' + (i === sel ? ' active' : '') + (i === nowMonth ? ' now' : '');
    row.dataset.i = String(i);
    row.tabIndex = 0;

    const names = state.months[i].items
      .map(it => it.name.trim())
      .filter(Boolean)
      .join(', ');

    const posten = cell(names || '—', 'kt-posten');
    if(names) posten.title = names;

    row.append(
      cell(MONTHS_SHORT[i], 'kt-mo'),
      cell(eur(r.carryIn), 'kt-carry kt-dim'),
      cell(eur(r.r)),
      cell(r.k ? '−' + eur(r.k) : eur(0), r.k ? '' : 'kt-dim'),
      cell(eur(r.rest), cls(r.rest)),
      posten
    );
    frag.appendChild(row);
  });
  ktRows.replaceChildren(frag);

  const end = rows[11].rest;
  const foot = document.createDocumentFragment();
  foot.append(
    cell('Jahr', 'kt-mo'),
    cell(eur(num(state.start)), 'kt-carry kt-dim'),
    cell(eur(sumR)),
    cell('−' + eur(sumK)),
    cell(eur(end), cls(end)),
    cell('', 'kt-posten')
  );
  ktTfoot.replaceChildren(foot);
}

function renderCalc(r){
  ktCarryIn.textContent = eur(r.carryIn);

  const frag = document.createDocumentFragment();
  const line = (label, value, extraClass) => {
    const d = document.createElement('div');
    d.className = 'kt-calc-row' + (extraClass ? ' ' + extraClass : '');
    d.append(span(label), span(value));
    return d;
  };
  frag.appendChild(line('Übertrag', eur(r.carryIn)));
  frag.appendChild(line('+ Rücklage', eur(r.r)));
  frag.appendChild(line('− Konsum', eur(r.k)));

  const res = line('Rest / Übertrag in den Folgemonat', eur(r.rest), 'kt-res');
  res.lastChild.classList.add(cls(r.rest));
  frag.appendChild(res);

  ktCalc.replaceChildren(frag);
}

/* ---------- Bucket-List ---------- */
function bucketSorted(){
  return state.bucket.slice().sort((a, b) => a.month - b.month);
}

function renderBucket(){
  const list = bucketSorted();
  const frag = document.createDocumentFragment();
  let focusEl = null;

  if(list.length === 0){
    const p = document.createElement('p');
    p.className = 'kt-empty';
    p.textContent = 'Noch keine Einträge.';
    frag.appendChild(p);
  }

  list.forEach(e => {
    const row = document.createElement('div');
    row.className = 'kt-bl-row' + (e.done ? ' done' : '');

    const chk = document.createElement('button');
    chk.type = 'button';
    chk.className = 'kt-bl-check' + (e.done ? ' on' : '');
    chk.textContent = '✓';
    chk.title = e.done ? 'Wieder als offen markieren' : 'Als bezahlt abhaken';
    chk.setAttribute('aria-pressed', e.done ? 'true' : 'false');
    chk.addEventListener('click', () => toggleBucket(e));

    row.append(chk, cell(MONTHS_SHORT[e.month], 'kt-bl-mo'));

    const topic = cell(e.topic || 'Ohne Thema', 'kt-bl-topic');
    if(e.topic) topic.title = e.topic;
    row.appendChild(topic);

    if(e.id === blPending){
      // Ist-Betrag direkt in der Zeile abfragen — kein prompt(), das wird
      // in manchen Umgebungen blockiert.
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'kt-bl-edit kt-num';
      inp.inputMode = 'decimal';
      inp.value = e.planned ? nf.format(e.planned) : '';
      inp.placeholder = '0';
      inp.setAttribute('aria-label', 'Tatsächlicher Betrag');

      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'kt-bl-ok';
      ok.textContent = '✓';
      ok.title = 'Übernehmen';
      ok.addEventListener('click', () => confirmBucket(e, inp.value));

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'kt-bl-cancel';
      cancel.textContent = '✕';
      cancel.title = 'Abbrechen';
      cancel.addEventListener('click', () => { blPending = null; renderBucket(); });

      inp.addEventListener('keydown', (ev) => {
        if(ev.key === 'Enter'){ ev.preventDefault(); confirmBucket(e, inp.value); }
        if(ev.key === 'Escape'){ ev.stopPropagation(); blPending = null; renderBucket(); }
      });

      row.append(span('Wirklich gekostet?', 'kt-bl-hint'), inp, ok, cancel);
      frag.appendChild(row);
      focusEl = inp;
      return;
    }

    if(e.done){
      const d = num(e.actual) - num(e.planned);
      row.appendChild(cell(eur(num(e.actual)), 'kt-bl-amt'));
      const dif = cell(d === 0 ? '' : signed(d), 'kt-bl-diff ' + diffCls(d));
      dif.title = 'geplant: ' + eur(num(e.planned));
      row.appendChild(dif);
    } else {
      row.appendChild(cell(eur(num(e.planned)), 'kt-bl-amt plan'));
      row.appendChild(cell('', 'kt-bl-diff'));
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'kt-del';
    del.textContent = '✕';
    del.title = 'Eintrag löschen';
    del.setAttribute('aria-label', 'Eintrag löschen');
    del.addEventListener('click', () => {
      const i = state.bucket.findIndex(x => x.id === e.id);
      if(i >= 0) state.bucket.splice(i, 1);
      save();
      renderBucket();
    });
    row.appendChild(del);

    frag.appendChild(row);
  });

  ktBlList.replaceChildren(frag);

  // Summe: offene Einträge mit Plan-, abgehakte mit Ist-Betrag.
  // Die Differenz zählt nur abgehakte Einträge.
  let total = 0, diff = 0;
  state.bucket.forEach(e => {
    if(e.done){
      total += num(e.actual);
      diff  += num(e.actual) - num(e.planned);
    } else {
      total += num(e.planned);
    }
  });

  if(state.bucket.length === 0){
    ktBlFoot.replaceChildren();
    ktBlFoot.hidden = true;
  } else {
    ktBlFoot.hidden = false;
    const foot = document.createDocumentFragment();
    foot.append(
      span('Summe'),
      cell('', 'kt-bl-topic'),
      cell(eur(total), 'kt-bl-amt'),
      cell(signed(diff), 'kt-bl-diff ' + diffCls(diff))
    );
    ktBlFoot.replaceChildren(foot);
  }

  if(focusEl){ focusEl.focus(); focusEl.select(); }
}

function toggleBucket(entry){
  if(entry.done){
    entry.done = false;
    entry.actual = null;
    blPending = null;
    save();
  } else {
    blPending = (blPending === entry.id) ? null : entry.id;
  }
  renderBucket();
}
function confirmBucket(entry, raw){
  entry.actual = num(raw);
  entry.done = true;
  blPending = null;
  save();
  renderBucket();
}

function addBucket(){
  const topic = ktBlTopic.value.trim().slice(0, MAX_TEXT);
  const planned = num(ktBlSum.value);
  if(!topic && !planned){ ktBlTopic.focus(); return; }
  const m = parseInt(ktBlMonth.value, 10);
  state.bucket.push({
    id: newId(),
    month: (isFinite(m) && m >= 0 && m <= 11) ? m : 0,
    topic,
    planned,
    done: false,
    actual: null
  });
  save();
  renderBucket();
  ktBlTopic.value = '';
  ktBlSum.value = '';
  ktBlTopic.focus();
}

/* ---------- Zusammenspiel ---------- */
// Nur das Abgeleitete neu zeichnen — Eingabefelder bleiben unangetastet,
// damit der Fokus beim Tippen nicht verloren geht.
function renderDerived(){
  const rows = compute();
  renderCalc(rows[sel]);
  renderSack(rows[sel].rest);
  renderTable(rows);
  renderChart(rows);
}
function renderAll(){
  renderTabs();
  renderPlanFields();
  renderItems();
  renderDerived();
  renderBucket();
}
function selectMonth(i){
  if(!Number.isInteger(i) || i < 0 || i > 11 || i === sel) return;
  sel = i;
  // Halb getippten Posten nicht in den neuen Monat mitnehmen.
  ktNewName.value = '';
  ktNewAmount.value = '';
  renderTabs();
  renderPlanFields();
  renderItems();
  renderDerived();
}

function addItemFromEntry(){
  const name = ktNewName.value.trim().slice(0, MAX_TEXT);
  const amount = num(ktNewAmount.value);
  if(!name && !amount){ ktNewName.focus(); return; }
  state.months[sel].items.push({ name, amount });
  save();
  renderItems();
  renderDerived();
  ktNewName.value = '';
  ktNewAmount.value = '';
  ktNewName.focus();
}

/* ---------- Fenster ---------- */
function openKonsum(){
  openOverlay(ktOverlay, ktClose);
}
function closeKonsum(){
  blPending = null;
  closeOverlay(ktOverlay, ktBtn);
}

/* ---------- Start ---------- */
function init(){
  load();
  nowMonth = new Date().getMonth();
  sel = nowMonth;

  // Erstbelegung festschreiben, damit sie beim nächsten Start nicht erneut
  // greift und eigene Änderungen überschreibt.
  if(!hasSaved()) writeNow();

  ktStart.value = state.start ? nf.format(state.start) : '0';
  ktNotes.value = state.notes;

  const frag = document.createDocumentFragment();
  MONTHS_SHORT.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = name;
    frag.appendChild(opt);
  });
  ktBlMonth.replaceChildren(frag);
  ktBlMonth.value = String(nowMonth);

  // --- Eingaben ---
  ktStart.addEventListener('input', () => {
    state.start = num(ktStart.value);
    save();
    renderDerived();
  });
  ktStart.addEventListener('blur', () => {
    ktStart.value = state.start ? nf.format(state.start) : '0';
  });

  ktRueck.addEventListener('input', () => {
    state.months[sel].ruecklage = num(ktRueck.value);
    save();
    renderDerived();
  });
  ktRueck.addEventListener('blur', () => {
    const r = state.months[sel].ruecklage;
    ktRueck.value = r ? nf.format(r) : '0';
  });

  ktAddItem.addEventListener('click', addItemFromEntry);
  [ktNewName, ktNewAmount].forEach(node => {
    node.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); addItemFromEntry(); }
    });
  });

  // Posten löschen (Ereignis-Delegation, da die Liste ständig neu entsteht).
  ktItems.addEventListener('click', (e) => {
    const btn = e.target.closest('.kt-del');
    if(!btn) return;
    const idx = Number(btn.dataset.idx);
    if(!Number.isInteger(idx)) return;
    state.months[sel].items.splice(idx, 1);
    save();
    renderItems();
    renderDerived();
  });

  ktTabs.addEventListener('click', (e) => {
    const b = e.target.closest('.kt-tab');
    if(b) selectMonth(Number(b.dataset.i));
  });
  ktRows.addEventListener('click', (e) => {
    const r = e.target.closest('.kt-trow');
    if(r) selectMonth(Number(r.dataset.i));
  });
  ktRows.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('.kt-trow');
    if(r){ e.preventDefault(); selectMonth(Number(r.dataset.i)); }
  });
  ktChart.addEventListener('click', (e) => {
    const b = e.target.closest('.kt-bar');
    if(b) selectMonth(Number(b.dataset.i));
  });

  ktBlAdd.addEventListener('click', addBucket);
  [ktBlTopic, ktBlSum].forEach(node => {
    node.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); addBucket(); }
    });
  });

  ktNotes.addEventListener('input', () => {
    state.notes = ktNotes.value.slice(0, MAX_NOTE);
    save();
  });

  // --- Fenster ---
  ktBtn.addEventListener('click', openKonsum);
  ktClose.addEventListener('click', closeKonsum);
  ktOverlay.addEventListener('click', (e) => {
    if(e.target === ktOverlay) closeKonsum();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !ktOverlay.hidden) closeKonsum();
  });

  renderAll();
}

// Der Konsumtopf ist ein Zusatzwerkzeug — er darf den Start der App unter
// keinen Umständen verhindern. Fehlt eines seiner Elemente (etwa weil der
// Browser noch eine ältere index.html aus dem Zwischenspeicher anzeigt),
// wird er still übersprungen und das Budget läuft normal weiter.
const alleElementeDa = [
  ktBtn, ktOverlay, ktClose, ktTabs, ktPlanTitle, ktCarryIn, ktRueck, ktItems,
  ktNewName, ktNewAmount, ktAddItem, ktCalc, ktChart, ktRows, ktTfoot,
  ktSackLabel, ktSackValue, ktSackStatus, ktFill, ktFillEdge,
  ktBlMonth, ktBlTopic, ktBlSum, ktBlAdd, ktBlList, ktBlFoot, ktNotes,
  ktStart, ktSaved
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
