/* =============================================================================
   RÜCKLAGEN TOPF (Übersicht "Deine Monate", unter "Budget Töpfe")
   Oben der Kontostand des Rücklagen-Kontos. Darunter die Aufteilung dieses
   Betrags auf Töpfe (je Kategorie ein Topf, über "+ Topf"); eine kleine Zahl
   zeigt, wie viel noch nicht verteilt ist. Ganz unten EINE Wunschliste
   (v59): alle geplanten Ausgaben untereinander in Eingabe-Reihenfolge. Jeder
   Wunsch gehört zu einem Topf — sichtbar nur an der Farbe (Farbknopf links,
   antippen zum Wechseln). Darunter je Topf: geplant, Topf, Abweichung.

   Reine Planung: gespeichert in allData.ruecklagenTopf (läuft über
   Cloud-Abgleich und Sichern/Wiederherstellen), wirkt sich auf keine andere
   Berechnung aus. Alle Texte per textContent, kein innerHTML.
   ============================================================================= */
import { categoryDefs, MAX_TEXT_LENGTH, AMOUNT_MAX_CENTS, SLICE_COLORS } from './constants.js?v=59';
import { parseEuroInputToCents } from './utils.js?v=59';
import { allData, saveAll, RT_KEYS, sanitizeRuecklagenTopf } from './storage.js?v=59';
import { openOverlay, closeOverlay } from './overlays.js?v=59';

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
const kpisEl     = $('rt-kpis');
const balkenEl   = $('rt-balken');
// Farbe je Topf = Kategoriefarbe aus Diagramm/Analyse (Wiedererkennung).
const farbe = (key) => SLICE_COLORS[key] || '#8e8e93';
function punkt(key){
  const p = document.createElement('span');
  p.className = 'rt-punkt';
  p.style.background = farbe(key);
  return p;
}

const NAME = Object.fromEntries(categoryDefs.map(d => [d.key, d.name]));

function daten(){
  if(!allData.ruecklagenTopf || !Array.isArray(allData.ruecklagenTopf.wuensche)){
    allData.ruecklagenTopf = sanitizeRuecklagenTopf(allData.ruecklagenTopf);
  }
  return allData.ruecklagenTopf;
}
// In diesem Fenster gibt es nur volle Euro (v56): Eingaben werden auf ganze
// Euro gerundet, Anzeigen ohne Nachkommastellen.
const ganz = (c) => Math.round(c / 100) * 100;
function formatCents(c){
  return (c / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + '\u00a0€';
}
function centsZuText(c){
  if(!c) return '';
  return (c / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 });
}
// Ältere Stände mit Cent-Beträgen einmalig auf volle Euro bringen.
function aufGanzeEuro(d){
  let geaendert = false;
  const fix = (o) => { const g = ganz(o.cents); if(g !== o.cents){ o.cents = g; geaendert = true; } };
  if(ganz(d.kontoCents) !== d.kontoCents){ d.kontoCents = ganz(d.kontoCents); geaendert = true; }
  d.toepfe.forEach(fix);
  d.wuensche.forEach(fix);
  return geaendert;
}
// Leer → 0, ungültig → null; sonst auf volle Euro gerundet.
function lies(text){
  const roh = String(text).trim();
  if(roh === '') return 0;
  const c = parseEuroInputToCents(roh);
  return c === null || c < 0 || c > AMOUNT_MAX_CENTS ? null : ganz(c);
}
function speichern(){ saveAll(true); }
const summe = (liste) => liste.reduce((s, x) => s + x.cents, 0);

// Betrags-Eingabe: übernimmt beim Verlassen des Feldes (change).
function betragFeld(cents, label, beiAenderung){
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
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
    const name = document.createElement('div');
    name.className = 'rt-topf-name';
    const titel = document.createElement('span');
    titel.className = 'bt-name';
    titel.textContent = NAME[t.key];
    const anteil = document.createElement('span');
    anteil.className = 'rt-anteil';
    const text = document.createElement('div');
    text.className = 'rt-topf-text';
    text.append(titel, anteil);
    name.append(punkt(t.key), text);
    aktualisierer.push(() => {
      anteil.textContent = d.kontoCents > 0 && t.cents > 0 ? Math.round(t.cents / d.kontoCents * 100) + ' %' : '';
    });
    z.append(name,
      betragFeld(t.cents, 'Topf ' + NAME[t.key], c => { t.cents = c; }),
      // Wünsche des Topfs bleiben in der Liste, nur ohne Topf (grau).
      wegKnopf('Topf ' + NAME[t.key] + ' entfernen', () => {
        d.toepfe.splice(idx, 1);
        d.wuensche.forEach(w => { if(w.key === t.key) w.key = ''; });
      }));
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

  // Aufteilungsbalken: je Topf ein farbiges Stück, Rest grau.
  aktualisierer.push(() => {
    const verteilt = summe(d.toepfe);
    const basis = Math.max(d.kontoCents, verteilt);
    const stuecke = document.createDocumentFragment();
    if(basis > 0){
      d.toepfe.forEach(t => {
        if(t.cents <= 0) return;
        const st = document.createElement('span');
        st.className = 'rt-stueck';
        st.style.width = (t.cents / basis * 100).toFixed(2) + '%';
        st.style.background = farbe(t.key);
        stuecke.appendChild(st);
      });
    }
    balkenEl.replaceChildren(stuecke);
    balkenEl.classList.toggle('drueber', verteilt > d.kontoCents);
    balkenEl.setAttribute('aria-label', 'Verteilt ' + formatCents(verteilt) + ' von ' + formatCents(d.kontoCents));
    balkenEl.hidden = d.toepfe.length === 0;
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
      d.toepfe.push({ key: sel.value, cents: 0 });
      speichern();
      render();
      const inputs = toepfeEl.querySelectorAll('.bt-input');
      if(inputs.length) inputs[inputs.length - 1].focus();
    });
    pf.append(sel, plus);
  }
  plusZeile.replaceChildren(pf);
}

const OHNE_FARBE = '#8e8e93';
const geplantFuer = (d, key) => d.wuensche.reduce((x, w) => x + (w.key === key ? w.cents : 0), 0);

function renderWuensche(d){
  const frag = document.createDocumentFragment();
  const liste = document.createElement('div');
  liste.className = 'rt-wunsch-liste';

  d.wuensche.forEach((w, i) => {
    const z = document.createElement('div');
    z.className = 'rt-wunsch';
    z.dataset.key = w.key;

    // Farbknopf = Topf-Auswahl. Sichtbar ist nur die Farbe des Topfs.
    const wahl = document.createElement('select');
    wahl.className = 'rt-farbwahl';
    wahl.setAttribute('aria-label', 'Topf für Wunsch ' + (i + 1));
    const optionen = d.toepfe.map(t => [t.key, NAME[t.key]]);
    if(w.key === '' || !d.toepfe.length) optionen.unshift(['', 'Ohne Topf']);
    optionen.forEach(([wert, text]) => {
      const o = document.createElement('option');
      o.value = wert; o.textContent = text;
      wahl.appendChild(o);
    });
    wahl.value = w.key;
    const faerbe = () => {
      const f = w.key ? farbe(w.key) : OHNE_FARBE;
      wahl.style.background = f;
      z.style.setProperty('--rt-farbe', f);
      wahl.title = w.key ? NAME[w.key] : 'Ohne Topf';
    };
    faerbe();
    wahl.addEventListener('change', () => {
      w.key = wahl.value;
      z.dataset.key = w.key;
      faerbe();
      speichern();
      zahlen();
    });

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'fc-edit-name';
    name.maxLength = MAX_TEXT_LENGTH;
    name.placeholder = 'Wunsch';
    name.autocomplete = 'off';
    name.value = w.name;
    name.setAttribute('aria-label', 'Wunsch ' + (i + 1));
    name.addEventListener('change', () => { w.name = name.value.trim().slice(0, MAX_TEXT_LENGTH); speichern(); });
    const betrag = betragFeld(w.cents, 'Betrag Wunsch ' + (i + 1), c => { w.cents = c; });
    betrag.className = 'fc-edit-betrag';
    z.append(wahl, name, betrag, wegKnopf('Wunsch entfernen', () => { d.wuensche.splice(i, 1); }));
    liste.appendChild(z);
    if(fokusWunsch === i) setTimeout(() => name.focus(), 0);
  });
  if(d.wuensche.length) frag.appendChild(liste);

  // Ein "+ Wunsch" für die ganze Liste; der neue Wunsch übernimmt den Topf
  // des letzten Eintrags (sonst den ersten Topf).
  if(d.toepfe.length){
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.id = 'rt-wunsch-plus';
    plus.className = 'fc-edit-plus';
    plus.textContent = '+ Wunsch';
    plus.addEventListener('click', () => {
      if(d.wuensche.length >= 300) return;
      const letzter = d.wuensche[d.wuensche.length - 1];
      const key = letzter && letzter.key ? letzter.key : d.toepfe[0].key;
      d.wuensche.push({ key, name: '', cents: 0 });
      fokusWunsch = d.wuensche.length - 1;
      speichern();
      render();
      fokusWunsch = null;
    });
    frag.appendChild(plus);
  } else {
    const p = document.createElement('p');
    p.className = 'rt-leer';
    p.textContent = 'Erscheint, sobald oben ein Topf angelegt ist.';
    frag.appendChild(p);
  }

  // Je Topf eine schlanke Zeile: geplant · Topf · Abweichung.
  if(d.toepfe.length){
    const je = document.createElement('div');
    je.className = 'rt-je-topf';
    d.toepfe.forEach(t => {
      const z = document.createElement('div');
      z.className = 'rt-gruppe';
      z.dataset.key = t.key;
      const n = document.createElement('span');
      n.className = 'rt-gruppe-name';
      n.append(punkt(t.key), document.createTextNode(NAME[t.key]));
      const s = document.createElement('span');
      s.className = 'rt-gruppe-summe';
      const info = document.createElement('span');
      info.className = 'rt-gruppe-info';
      const topf = document.createElement('span');
      const abw = document.createElement('span');
      info.append(topf, abw);
      z.append(n, s, info);
      aktualisierer.push(() => {
        const geplant = geplantFuer(d, t.key);
        s.textContent = formatCents(geplant);
        topf.textContent = 'Topf ' + formatCents(t.cents) + ' · ';
        abweichung(abw, t.cents - geplant);
      });
      je.appendChild(z);
    });
    frag.appendChild(je);
  }
  wuenscheEl.replaceChildren(frag);

  // Gesamt: alle Wünsche gegen das Rücklagen-Konto.
  wunschGes.replaceChildren();
  if(d.toepfe.length){
    const a = document.createElement('span');
    const b = document.createElement('span');
    wunschGes.append(a, b);
    aktualisierer.push(() => {
      const gesamt = summe(d.wuensche);
      a.textContent = formatCents(gesamt) + ' · ';
      abweichung(b, d.kontoCents - gesamt);
    });
  }
}

// Drei Kennzahlen unter dem Kontostand: verteilt, frei, in Wünschen geplant.
function renderKpis(d){
  const werte = [['Verteilt', 'verteilt'], ['Frei', 'frei'], ['Geplant', 'geplant']].map(([label, k]) => {
    const kachel = document.createElement('div');
    kachel.className = 'rt-kpi';
    kachel.dataset.kpi = k;
    const l = document.createElement('span');
    l.className = 'rt-kpi-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'rt-kpi-wert';
    kachel.append(l, v);
    return [kachel, v, k];
  });
  kpisEl.replaceChildren(...werte.map(w => w[0]));
  aktualisierer.push(() => {
    const verteilt = summe(d.toepfe);
    const geplant = summe(d.wuensche);
    const r = (c) => Math.round(c / 100);
    const euro = { verteilt: r(verteilt), frei: r(d.kontoCents - verteilt), geplant: r(geplant) };
    werte.forEach(([kachel, v, k]) => {
      v.textContent = euro[k].toLocaleString('de-DE') + ' €';
      kachel.classList.toggle('drueber', euro[k] < 0 || (k === 'frei' && d.kontoCents - verteilt < 0));
    });
  });
}

function render(){
  const d = daten();
  if(document.activeElement !== kontoIn) kontoIn.value = centsZuText(d.kontoCents);
  aktualisierer = [];
  renderKpis(d);
  renderToepfe(d);
  renderWuensche(d);
  zahlen();
}

function oeffnen(){
  kontoIn.classList.remove('ungueltig');
  if(aufGanzeEuro(daten())) speichern();
  kontoIn.value = centsZuText(daten().kontoCents);
  render();
  openOverlay(overlay, schliessen);
}
function zu(){ closeOverlay(overlay, oeffnenBtn); }

if([oeffnenBtn, overlay, schliessen, kontoIn, diffEl, toepfeEl, plusZeile, wunschGes, wuenscheEl, kpisEl, balkenEl].every(n => n !== null)){
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
