/* =============================================================================
   RÜCKLAGEN TOPF (Übersicht "Deine Monate", unter "Budget Töpfe")
   Oben der Kontostand des Rücklagen-Kontos. Darunter die Aufteilung dieses
   Betrags auf Töpfe (je Kategorie ein Topf, über "+ Topf"); eine kleine Zahl
   zeigt, wie viel noch nicht verteilt ist. Ganz unten je Topf eine
   Wunschliste mit geplanten Ausgaben, deren Summe und die Abweichung zum Topf.

   Reine Planung: gespeichert in allData.ruecklagenTopf (läuft über
   Cloud-Abgleich und Sichern/Wiederherstellen), wirkt sich auf keine andere
   Berechnung aus. Alle Texte per textContent, kein innerHTML.
   ============================================================================= */
import { categoryDefs, MAX_TEXT_LENGTH, AMOUNT_MAX_CENTS } from './constants.js?v=54';
import { formatCents, parseEuroInputToCents } from './utils.js?v=54';
import { allData, saveAll, RT_KEYS, sanitizeRuecklagenTopf } from './storage.js?v=54';
import { openOverlay, closeOverlay } from './overlays.js?v=54';

const $ = (id) => document.getElementById(id);
const oeffnenBtn = $('rt-btn');
const overlay    = $('rt-overlay');
const schliessen = $('rt-close');
const kontoIn    = $('rt-konto-input');
const diffEl     = $('rt-diff');
const toepfeEl   = $('rt-toepfe');
const plusZeile  = $('rt-plus-zeile');
const wunschGes  = $('rt-wunsch-gesamt');
const wuenscheEl = $('rt-wuensche');

const NAME = Object.fromEntries(categoryDefs.map(d => [d.key, d.name]));

function daten(){
  if(!allData.ruecklagenTopf) allData.ruecklagenTopf = sanitizeRuecklagenTopf(null);
  return allData.ruecklagenTopf;
}
function centsZuText(c){
  if(!c) return '';
  const nk = c % 100 ? 2 : 0;   // 1.500,50 statt 1.500,5 — ganze Euro ohne Komma
  return (c / 100).toLocaleString('de-DE', { minimumFractionDigits: nk, maximumFractionDigits: nk });
}
// Leer → 0, ungültig → null.
function lies(text){
  const roh = String(text).trim();
  if(roh === '') return 0;
  const c = parseEuroInputToCents(roh);
  return c === null || c < 0 || c > AMOUNT_MAX_CENTS ? null : c;
}
function speichern(){ saveAll(true); }
const summe = (liste) => liste.reduce((s, x) => s + x.cents, 0);

// Betrags-Eingabe: übernimmt beim Verlassen des Feldes (change).
function betragFeld(cents, label, beiAenderung){
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.className = 'bt-input';
  input.placeholder = '€';
  input.value = centsZuText(cents);
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => {
    const c = lies(input.value);
    if(c === null){ input.classList.add('ungueltig'); return; }
    input.classList.remove('ungueltig');
    beiAenderung(c);
    input.value = centsZuText(c);
    speichern();
    zahlen();   // nur Summen/Abweichungen neu, Felder bleiben (Fokus springt nicht)
  });
  return input;
}
function wegKnopf(label, beiKlick){
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'fc-edit-weg';
  b.textContent = '✕';
  b.setAttribute('aria-label', label);
  b.addEventListener('click', () => { beiKlick(); speichern(); render(); });
  return b;
}
// Abweichung "Topf − geplant": positiv = Luft, negativ = drüber.
function abweichung(span, rest){
  span.className = 'rt-abw' + (rest < 0 ? ' drueber' : '');
  span.textContent = rest < 0 ? formatCents(-rest) + ' drüber' : 'noch ' + formatCents(rest);
}

let fokusWunsch = null;
// Beim Zeichnen gesammelte Funktionen, die nur die Zahlen neu setzen.
let aktualisierer = [];
function zahlen(){ aktualisierer.forEach(f => f()); }   // { key, i } — nach "+ Wunsch" das neue Feld fokussieren

function renderToepfe(d){
  const frag = document.createDocumentFragment();
  d.toepfe.forEach((t, idx) => {
    const z = document.createElement('div');
    z.className = 'rt-topf-zeile';
    const name = document.createElement('span');
    name.className = 'bt-name';
    name.textContent = NAME[t.key];
    z.append(name,
      betragFeld(t.cents, 'Topf ' + NAME[t.key], c => { t.cents = c; }),
      wegKnopf('Topf ' + NAME[t.key] + ' entfernen', () => { d.toepfe.splice(idx, 1); }));
    frag.appendChild(z);
  });
  if(!d.toepfe.length){
    const p = document.createElement('p');
    p.className = 'rt-leer';
    p.textContent = 'Noch keine Töpfe. Über „+ Topf“ eine Kategorie hinzufügen.';
    frag.appendChild(p);
  }
  toepfeEl.replaceChildren(frag);

  // Rest = Konto − verteilt (die kleine Zahl oben rechts).
  aktualisierer.push(() => {
    const rest = d.kontoCents - summe(d.toepfe);
    diffEl.className = 'rt-diff' + (rest < 0 ? ' drueber' : rest === 0 ? ' null' : '');
    diffEl.textContent = rest < 0 ? formatCents(-rest) + ' zu viel verteilt'
                       : rest === 0 ? 'alles verteilt'
                       : 'nicht verteilt: ' + formatCents(rest);
  });

  // "+ Topf": Auswahl der noch freien Kategorien.
  const frei = RT_KEYS.filter(k => !d.toepfe.some(t => t.key === k));
  const pf = document.createDocumentFragment();
  if(frei.length){
    const sel = document.createElement('select');
    sel.id = 'rt-neu-select';
    sel.className = 'rt-neu-select';
    sel.setAttribute('aria-label', 'Kategorie für neuen Topf');
    frei.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = NAME[k]; sel.appendChild(o); });
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.id = 'rt-plus';
    plus.className = 'fc-edit-plus';
    plus.textContent = '+ Topf';
    plus.addEventListener('click', () => {
      d.toepfe.push({ key: sel.value, cents: 0, wuensche: [] });
      speichern();
      render();
      const inputs = toepfeEl.querySelectorAll('.bt-input');
      if(inputs.length) inputs[inputs.length - 1].focus();
    });
    pf.append(sel, plus);
  }
  plusZeile.replaceChildren(pf);
}

function renderWuensche(d){
  const frag = document.createDocumentFragment();
  d.toepfe.forEach(t => {
    const g = document.createElement('section');
    g.className = 'rt-gruppe';
    g.dataset.key = t.key;

    const kopf = document.createElement('div');
    kopf.className = 'rt-gruppe-kopf';
    const n = document.createElement('span');
    n.className = 'rt-gruppe-name';
    n.textContent = NAME[t.key];
    const s = document.createElement('span');
    s.className = 'rt-gruppe-summe';
    kopf.append(n, s);
    g.appendChild(kopf);

    t.wuensche.forEach((w, i) => {
      const z = document.createElement('div');
      z.className = 'fc-edit-zeile';
      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'fc-edit-name';
      name.maxLength = MAX_TEXT_LENGTH;
      name.placeholder = 'Wunsch';
      name.autocomplete = 'off';
      name.value = w.name;
      name.setAttribute('aria-label', NAME[t.key] + ': Wunsch ' + (i + 1));
      name.addEventListener('change', () => { w.name = name.value.trim().slice(0, MAX_TEXT_LENGTH); speichern(); });
      const betrag = betragFeld(w.cents, NAME[t.key] + ': Betrag ' + (i + 1), c => { w.cents = c; });
      betrag.className = 'fc-edit-betrag';
      z.append(name, betrag, wegKnopf('Wunsch entfernen', () => { t.wuensche.splice(i, 1); }));
      g.appendChild(z);
      if(fokusWunsch && fokusWunsch.key === t.key && fokusWunsch.i === i) setTimeout(() => name.focus(), 0);
    });

    const fuss = document.createElement('div');
    fuss.className = 'rt-gruppe-fuss';
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'fc-edit-plus';
    plus.textContent = '+ Wunsch';
    plus.addEventListener('click', () => {
      if(t.wuensche.length >= 100) return;
      t.wuensche.push({ name: '', cents: 0 });
      fokusWunsch = { key: t.key, i: t.wuensche.length - 1 };
      speichern();
      render();
      fokusWunsch = null;
    });
    const info = document.createElement('span');
    info.className = 'rt-gruppe-info';
    const topf = document.createElement('span');
    const abw = document.createElement('span');
    info.append(topf, abw);
    aktualisierer.push(() => {
      const geplant = summe(t.wuensche);
      s.textContent = formatCents(geplant);
      topf.textContent = 'Topf ' + formatCents(t.cents) + ' · ';
      abweichung(abw, t.cents - geplant);
    });
    fuss.append(plus, info);
    g.appendChild(fuss);
    frag.appendChild(g);
  });
  if(!d.toepfe.length){
    const p = document.createElement('p');
    p.className = 'rt-leer';
    p.textContent = 'Erscheint, sobald oben ein Topf angelegt ist.';
    frag.appendChild(p);
  }
  wuenscheEl.replaceChildren(frag);

  // Gesamt: alle Wünsche gegen das Rücklagen-Konto.
  wunschGes.replaceChildren();
  if(d.toepfe.length){
    const a = document.createElement('span');
    const b = document.createElement('span');
    wunschGes.append(a, b);
    aktualisierer.push(() => {
      const gesamt = d.toepfe.reduce((x, t) => x + summe(t.wuensche), 0);
      a.textContent = formatCents(gesamt) + ' · ';
      abweichung(b, d.kontoCents - gesamt);
    });
  }
}

function render(){
  const d = daten();
  if(document.activeElement !== kontoIn) kontoIn.value = centsZuText(d.kontoCents);
  aktualisierer = [];
  renderToepfe(d);
  renderWuensche(d);
  zahlen();
}

function oeffnen(){
  kontoIn.classList.remove('ungueltig');
  kontoIn.value = centsZuText(daten().kontoCents);
  render();
  openOverlay(overlay, schliessen);
}
function zu(){ closeOverlay(overlay, oeffnenBtn); }

if([oeffnenBtn, overlay, schliessen, kontoIn, diffEl, toepfeEl, plusZeile, wunschGes, wuenscheEl].every(n => n !== null)){
  oeffnenBtn.addEventListener('click', oeffnen);
  schliessen.addEventListener('click', zu);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) zu(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !overlay.hidden) zu(); });
  kontoIn.addEventListener('change', () => {
    const c = lies(kontoIn.value);
    if(c === null){ kontoIn.classList.add('ungueltig'); return; }
    kontoIn.classList.remove('ungueltig');
    daten().kontoCents = c;
    kontoIn.value = centsZuText(c);
    speichern();
    zahlen();
  });
}
