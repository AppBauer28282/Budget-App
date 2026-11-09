/* =============================================================================
   BUDGET TÖPFE (Übersicht "Deine Monate", unter "Analyse")
   Je Jahr und Analyse-Kategorie lässt sich ein Jahresbudget eintragen. Daneben
   steht, wie viel davon im Jahr schon verbraucht ist — gezählt genau wie in
   der Analyse (alle Monate des Jahres, Fixkosten nur abgehakt).

   Rücklagen zählen netto (abzüglich "Auflösung Rücklagen"), es gibt keinen
   eigenen Topf für Auflösungen.

   Reine Anzeige: Die Budgets stehen in allData.budgetToepfe (läuft über
   Cloud-Abgleich und Sichern/Wiederherstellen), wirken sich aber auf keine
   andere Berechnung der App aus.
   ============================================================================= */
import { formatCents, parseEuroInputToCents } from './utils.js?v=58';
import { allData, saveAll } from './storage.js?v=58';
import { ANALYSIS_CATEGORIES, computeAnalysisData } from './analysis.js?v=58';
import { openOverlay, closeOverlay } from './overlays.js?v=58';

const $ = (id) => document.getElementById(id);
const oeffnenBtn = $('budget-toepfe-btn');
const overlay    = $('budget-overlay');
const schliessen = $('budget-close');
const jahrSel    = $('budget-year');
const liste      = $('budget-liste');
const gesamtEl   = $('budget-gesamt');

function jahre(){
  const set = new Set(Object.values(allData.monthEntries).map(e => e.year));
  Object.keys(allData.budgetToepfe || {}).forEach(j => set.add(Number(j)));
  set.add(new Date().getFullYear());
  return Array.from(set).sort((a, b) => a - b);
}
function budgetsFuer(jahr){
  if(!allData.budgetToepfe) allData.budgetToepfe = Object.create(null);
  return allData.budgetToepfe[String(jahr)] || Object.create(null);
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

function balken(verbraucht, budget){
  const track = document.createElement('div');
  track.className = 'bt-track';
  const fill = document.createElement('div');
  fill.className = 'bt-fill';
  const pct = budget > 0 ? verbraucht / budget * 100 : 0;
  fill.style.width = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
  if(pct > 100) fill.classList.add('drueber');
  else if(pct >= 85) fill.classList.add('knapp');
  track.appendChild(fill);
  return track;
}

function render(){
  const jahr = Number(jahrSel.value);
  const budgets = budgetsFuer(jahr);
  const verbrauch = verbrauchJahr(jahr);
  const frag = document.createDocumentFragment();
  let sumBudget = 0, sumVerbrauchMitBudget = 0;

  ANALYSIS_CATEGORIES.forEach(cat => {
    const budget = budgets[cat.key] || 0;
    const verbraucht = verbrauch[cat.key] || 0;
    if(budget){ sumBudget += budget; sumVerbrauchMitBudget += verbraucht; }

    const topf = document.createElement('div');
    topf.className = 'bt-topf' + (budget ? '' : ' ohne');

    const kopf = document.createElement('div');
    kopf.className = 'bt-kopf';
    const name = document.createElement('label');
    name.className = 'bt-name';
    name.htmlFor = 'bt-in-' + cat.key;
    name.textContent = cat.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.autocomplete = 'off';
    input.className = 'bt-input';
    input.id = 'bt-in-' + cat.key;
    input.placeholder = 'Budget €';
    input.value = budget ? centsZuText(budget) : '';
    input.addEventListener('change', () => {
      const roh = input.value.trim();
      const c = roh === '' ? 0 : parseEuroInputToCents(roh);
      if(c === null){ input.classList.add('ungueltig'); return; }
      input.classList.remove('ungueltig');
      if(!allData.budgetToepfe) allData.budgetToepfe = Object.create(null);
      const j = allData.budgetToepfe[String(jahr)] || (allData.budgetToepfe[String(jahr)] = Object.create(null));
      if(c > 0) j[cat.key] = c; else delete j[cat.key];
      if(!Object.keys(j).length) delete allData.budgetToepfe[String(jahr)];
      saveAll(true);
      render();
    });
    kopf.append(name, input);
    topf.appendChild(kopf);

    const info = document.createElement('div');
    info.className = 'bt-info';
    if(budget){
      topf.appendChild(balken(verbraucht, budget));
      const rest = budget - verbraucht;
      const links = document.createElement('span');
      links.textContent = netto(verbraucht) + ' von ' + formatCents(budget) + ' · ' + Math.max(0, Math.round(verbraucht / budget * 100)) + ' %';
      const rechts = document.createElement('span');
      rechts.className = rest < 0 ? 'bt-rest drueber' : 'bt-rest';
      rechts.textContent = rest < 0 ? formatCents(-rest) + ' drüber' : 'noch ' + formatCents(rest);
      info.append(links, rechts);
    } else {
      const links = document.createElement('span');
      links.textContent = 'verbraucht ' + netto(verbraucht) + ' · kein Budget';
      info.appendChild(links);
    }
    topf.appendChild(info);
    frag.appendChild(topf);
  });
  liste.replaceChildren(frag);

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
  render();
  openOverlay(overlay, schliessen);
}
function zu(){ closeOverlay(overlay, oeffnenBtn); }

if([oeffnenBtn, overlay, schliessen, jahrSel, liste, gesamtEl].every(n => n !== null)){
  oeffnenBtn.addEventListener('click', oeffnen);
  schliessen.addEventListener('click', zu);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) zu(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !overlay.hidden) zu(); });
  jahrSel.addEventListener('change', render);
}
