/* =============================================================================
   BUDGET TÖPFE (Übersicht "Deine Monate", unter "Analyse")
   Je Jahr und Analyse-Kategorie lässt sich ein Jahresbudget eintragen. Daneben
   steht, wie viel davon im Jahr schon verbraucht ist — gezählt genau wie in
   der Analyse (alle Monate des Jahres, Fixkosten nur abgehakt).

   Rücklagen zählen netto (abzüglich "Auflösung Rücklagen"), es gibt keinen
   eigenen Topf für Auflösungen.

   ÜBERNAHME INS NÄCHSTE JAHR: Hat ein Jahr noch keinen eigenen Eintrag,
   gelten automatisch die Budgets des nächstfrüheren Jahres mit Eintrag. Die
   erste Änderung legt für das Jahr einen eigenen Stand an (Kopie der
   übernommenen Budgets); ein bewusst geleertes Jahr bleibt leer.

   Reine Anzeige: Die Budgets stehen in allData.budgetToepfe (läuft über
   Cloud-Abgleich und Sichern/Wiederherstellen), wirken sich aber auf keine
   andere Berechnung der App aus.
   ============================================================================= */
import { formatCents, parseEuroInputToCents } from './utils.js?v=65';
import { allData, saveAll } from './storage.js?v=65';
import { ANALYSIS_CATEGORIES, computeAnalysisData } from './analysis.js?v=65';
import { openOverlay, closeOverlay } from './overlays.js?v=65';

const $ = (id) => document.getElementById(id);
const oeffnenBtn = $('budget-toepfe-btn');
const overlay    = $('budget-overlay');
const schliessen = $('budget-close');
const jahrSel    = $('budget-year');
const liste      = $('budget-liste');
const gesamtEl   = $('budget-gesamt');
const erbtEl     = $('budget-erbt');

function jahre(){
  const set = new Set(Object.values(allData.monthEntries).map(e => e.year));
  Object.keys(allData.budgetToepfe || {}).forEach(j => set.add(Number(j)));
  set.add(new Date().getFullYear());
  set.add(new Date().getFullYear() + 1);   // nächstes Jahr schon planbar
  return Array.from(set).sort((a, b) => a - b);
}
function alleBudgets(){
  if(!allData.budgetToepfe) allData.budgetToepfe = Object.create(null);
  return allData.budgetToepfe;
}
// Jahr, von dem die Budgets übernommen werden — null, wenn das Jahr einen
// eigenen Eintrag hat oder es kein früheres Jahr mit Eintrag gibt.
function geerbtVon(jahr){
  const b = alleBudgets();
  if(b[String(jahr)]) return null;
  const frueher = Object.keys(b).map(Number).filter(j => j < jahr).sort((x, y) => y - x);
  return frueher.length ? frueher[0] : null;
}
function budgetsFuer(jahr){
  const b = alleBudgets();
  if(b[String(jahr)]) return b[String(jahr)];
  const von = geerbtVon(jahr);
  return von === null ? Object.create(null) : b[String(von)];
}
function centsZuText(c){
  return (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Verbraucht je Kategorie im ganzen Jahr (wie die Analyse mit allen Monaten
// und allen Kategorien).
function verbrauchJahr(jahr){
  const alleMonate = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const alleKat = new Set(ANALYSIS_CATEGORIES.map(c => c.key));
  const map = Object.create(null);
  computeAnalysisData(jahr, alleMonate, alleKat).forEach(g => { map[g.key] = g.subtotal; });
  return map;
}

// Netto-Betrag: Rücklagen abzüglich Auflösungen können negativ werden
// (mehr aufgelöst als zurückgelegt) — dann mit "+" wie in der Monatsliste.
function netto(c){ return c < 0 ? '+ ' + formatCents(-c) : formatCents(c); }

// Balken mit feinen Strichen an den Quartalsgrenzen (25 / 50 / 75 % des
// Jahresbudgets) und Q1–Q4 darunter: so lässt sich abschätzen, ob der
// Verbrauch zum Stand des Jahres passt.
function balken(verbraucht, budget){
  const box = document.createElement('div');
  box.className = 'bt-balken';
  const track = document.createElement('div');
  track.className = 'bt-track';
  const fill = document.createElement('div');
  fill.className = 'bt-fill';
  const pct = budget > 0 ? verbraucht / budget * 100 : 0;
  fill.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
  if(pct > 100) fill.classList.add('drueber');
  else if(pct >= 85) fill.classList.add('knapp');
  track.appendChild(fill);
  [25, 50, 75].forEach(p => {
    const strich = document.createElement('span');
    strich.className = 'bt-q-strich';
    strich.style.left = p + '%';
    track.appendChild(strich);
  });
  const skala = document.createElement('div');
  skala.className = 'bt-q-skala';
  skala.setAttribute('aria-hidden', 'true');
  ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => {
    const l = document.createElement('span');
    l.textContent = q;
    skala.appendChild(l);
  });
  box.append(track, skala);
  return box;
}

// Schlüssel des Topfs, dessen Budget gerade bearbeitet wird (höchstens einer).
let offenKey = null;

function speichere(jahr, key, input){
  const roh = input.value.trim();
  const c = roh === '' ? 0 : parseEuroInputToCents(roh);
  if(c === null){ input.classList.add('ungueltig'); return; }
  // Erste Änderung in einem Jahr: übernommene Budgets als eigenen Stand
  // kopieren. Der Eintrag bleibt auch leer bestehen (bewusst kein Budget).
  const b = alleBudgets();
  if(!b[String(jahr)]) b[String(jahr)] = Object.assign(Object.create(null), budgetsFuer(jahr));
  const j = b[String(jahr)];
  if(c > 0) j[key] = c; else delete j[key];
  saveAll(true);
  offenKey = null;
  render();
}

function render(){
  const jahr = Number(jahrSel.value);
  const budgets = budgetsFuer(jahr);
  const verbrauch = verbrauchJahr(jahr);
  const von = geerbtVon(jahr);
  erbtEl.hidden = von === null;
  erbtEl.textContent = von === null ? '' : 'Budgets übernommen aus ' + von + '. Eine Änderung gilt nur für ' + jahr + '.';
  const frag = document.createDocumentFragment();
  let sumBudget = 0, sumVerbrauchMitBudget = 0;
  let fokus = null;

  ANALYSIS_CATEGORIES.forEach(cat => {
    const budget = budgets[cat.key] || 0;
    const verbraucht = verbrauch[cat.key] || 0;
    if(budget){ sumBudget += budget; sumVerbrauchMitBudget += verbraucht; }

    const topf = document.createElement('div');
    topf.className = 'bt-topf' + (budget ? '' : ' ohne');
    topf.dataset.key = cat.key;

    // Die ganze Position ist der Knopf zum Bearbeiten: links das Rechteck
    // (wie im Forecast), rechts Balken und Zahlen.
    const zeile = document.createElement('button');
    zeile.type = 'button';
    zeile.className = 'bt-zeile';
    zeile.setAttribute('aria-expanded', String(offenKey === cat.key));
    zeile.setAttribute('aria-label', cat.name + ': Budget bearbeiten');
    const kachel = document.createElement('span');
    kachel.className = 'bt-kachel';
    const name = document.createElement('span');
    name.className = 'bt-name';
    name.textContent = cat.name;
    const betrag = document.createElement('span');
    betrag.className = 'bt-budget';
    betrag.textContent = budget ? formatCents(budget) : 'kein Budget';
    kachel.append(name, betrag);

    const rechts = document.createElement('span');
    rechts.className = 'bt-rechts';
    const info = document.createElement('span');
    info.className = 'bt-info';
    if(budget){
      rechts.appendChild(balken(verbraucht, budget));
      const rest = budget - verbraucht;
      const l = document.createElement('span');
      l.textContent = netto(verbraucht) + ' · ' + Math.max(0, Math.round(verbraucht / budget * 100)) + ' %';
      const r = document.createElement('span');
      r.className = rest < 0 ? 'bt-rest drueber' : 'bt-rest';
      r.textContent = rest < 0 ? formatCents(-rest) + ' drüber' : 'noch ' + formatCents(rest);
      info.append(l, r);
    } else {
      const l = document.createElement('span');
      l.textContent = 'verbraucht ' + netto(verbraucht);
      info.appendChild(l);
    }
    rechts.appendChild(info);
    zeile.append(kachel, rechts);
    zeile.addEventListener('click', () => {
      offenKey = offenKey === cat.key ? null : cat.key;
      render();
    });
    topf.appendChild(zeile);

    if(offenKey === cat.key){
      const edit = document.createElement('div');
      edit.className = 'bt-edit';
      const label = document.createElement('label');
      label.className = 'visually-hidden';
      label.htmlFor = 'bt-in-' + cat.key;
      label.textContent = 'Jahresbudget ' + cat.name + ' in Euro';
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.enterKeyHint = 'done';
      input.className = 'bt-input';
      input.id = 'bt-in-' + cat.key;
      input.placeholder = 'Jahresbudget €';
      input.value = budget ? centsZuText(budget) : '';
      input.addEventListener('input', () => input.classList.remove('ungueltig'));
      input.addEventListener('keydown', e => {
        if(e.key === 'Enter'){ e.preventDefault(); speichere(jahr, cat.key, input); }
        else if(e.key === 'Escape'){ e.stopPropagation(); offenKey = null; render(); }
      });
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'bt-edit-ok';
      ok.textContent = 'Speichern';
      ok.addEventListener('click', () => speichere(jahr, cat.key, input));
      const ab = document.createElement('button');
      ab.type = 'button';
      ab.className = 'bt-edit-ab';
      ab.textContent = 'Abbrechen';
      ab.addEventListener('click', () => { offenKey = null; render(); });
      edit.append(label, input, ok, ab);
      const tipp = document.createElement('p');
      tipp.className = 'bt-edit-tipp';
      tipp.textContent = 'Leer speichern entfernt das Budget.';
      topf.append(edit, tipp);
      fokus = input;
    }
    frag.appendChild(topf);
  });
  liste.replaceChildren(frag);
  if(fokus){ fokus.focus(); fokus.select(); }

  // Gesamt über alle Töpfe mit Budget.
  const g = document.createDocumentFragment();
  if(sumBudget > 0){
    const box = document.createElement('div');
    box.className = 'bt-gesamt';
    const t = document.createElement('div');
    t.className = 'bt-gesamt-kopf';
    const l = document.createElement('span'); l.textContent = 'Alle Töpfe mit Budget';
    const r = document.createElement('span');
    r.textContent = netto(sumVerbrauchMitBudget) + ' / ' + formatCents(sumBudget);
    t.append(l, r);
    box.append(t, balken(sumVerbrauchMitBudget, sumBudget));
    g.appendChild(box);
  }
  gesamtEl.replaceChildren(g);
}

function oeffnen(){
  const js = jahre();
  const frag = document.createDocumentFragment();
  js.forEach(j => { const o = document.createElement('option'); o.value = String(j); o.textContent = String(j); frag.appendChild(o); });
  jahrSel.replaceChildren(frag);
  const aktuell = new Date().getFullYear();
  jahrSel.value = String(js.includes(aktuell) ? aktuell : js[js.length - 1]);
  offenKey = null;
  render();
  openOverlay(overlay, schliessen);
}
function zu(){ closeOverlay(overlay, oeffnenBtn); }

if([oeffnenBtn, overlay, schliessen, jahrSel, liste, gesamtEl, erbtEl].every(n => n !== null)){
  oeffnenBtn.addEventListener('click', oeffnen);
  schliessen.addEventListener('click', zu);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) zu(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !overlay.hidden) zu(); });
  jahrSel.addEventListener('change', () => { offenKey = null; render(); });
}
