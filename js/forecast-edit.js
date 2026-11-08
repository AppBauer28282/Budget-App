/* =============================================================================
   FORECAST BEARBEITEN (Tabellenansicht)
   Öffnet sich über "Bearbeiten" im Forecast-Bereich eines Monats. Für jede
   der vier Kategorien (Lebensmittel, Konsum, Sprit, Sonstiges) lassen sich
   einzelne Posten mit Bezeichnung und Betrag eintragen. "Speichern" übernimmt
   je Kategorie die Summe als Forecast-Betrag und merkt sich die Posten
   (data.forecastItems), damit sie beim nächsten Öffnen wieder dastehen.

   Gearbeitet wird auf einer Kopie ("entwurf"): "Abbrechen", ✕, Escape oder ein
   Klick neben das Fenster verwerfen alle Änderungen.

   Hat eine Kategorie noch keine Posten, aber einen Betrag (direkt ins Feld
   getippt), erscheint dieser Betrag als ein Posten "Bisher" — so geht beim
   Speichern nichts verloren.
   ============================================================================= */
import { fcKeys, FC_LABELS, FC_MAX, MAX_TEXT_LENGTH, MAX_ENTRIES_PER_KEY } from './constants.js?v=47';
import { fcSliders, fcVals } from './dom.js?v=47';
import { formatCents, parseEuroInputToCents } from './utils.js?v=47';
import { getMonthData, currentMonthKey, saveAll } from './storage.js?v=47';
import { refreshTotals } from './render.js?v=47';
import { openOverlay, closeOverlay } from './overlays.js?v=47';

const $ = (id) => document.getElementById(id);
const oeffnenBtn = $('fc-edit-btn');
const overlay    = $('fc-edit-overlay');
const schliessen = $('fc-edit-close');
const abbrechen  = $('fc-edit-cancel');
const speichern  = $('fc-edit-save');
const tabelle    = $('fc-edit-tabelle');
const gesamtEl   = $('fc-edit-gesamt');
const fehlerEl   = $('fc-edit-error');

// Entwurf: je Kategorie eine Liste { name, betrag } — betrag als Text, so
// wie getippt, damit halbe Eingaben ("12,") beim Neuzeichnen nicht verloren gehen.
let entwurf = null;

function centsZuText(c){
  return (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
// Gültiger Betrag in Cent, 0 für leer, null für ungültig.
function lies(betrag){
  if(String(betrag).trim() === '') return 0;
  return parseEuroInputToCents(String(betrag));
}
function summe(k){
  return entwurf[k].reduce((s, z) => { const c = lies(z.betrag); return s + (c || 0); }, 0);
}

function aktualisiereSummen(){
  let gesamt = 0;
  fcKeys.forEach(k => {
    const s = summe(k);
    gesamt += s;
    const el = tabelle.querySelector('[data-summe="' + k + '"]');
    if(el) el.textContent = formatCents(s);
  });
  gesamtEl.textContent = formatCents(gesamt);
}

function zeichne(fokus){
  const frag = document.createDocumentFragment();
  fcKeys.forEach(k => {
    const gruppe = document.createElement('section');
    gruppe.className = 'fc-edit-gruppe';

    const kopf = document.createElement('div');
    kopf.className = 'fc-edit-kopf';
    const titel = document.createElement('span');
    titel.textContent = FC_LABELS[k];
    const s = document.createElement('span');
    s.className = 'fc-edit-summe';
    s.dataset.summe = k;
    kopf.append(titel, s);
    gruppe.appendChild(kopf);

    entwurf[k].forEach((zeile, i) => {
      const z = document.createElement('div');
      z.className = 'fc-edit-zeile';
      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'fc-edit-name';
      name.maxLength = MAX_TEXT_LENGTH;
      name.placeholder = 'Bezeichnung';
      name.autocomplete = 'off';
      name.value = zeile.name;
      name.setAttribute('aria-label', FC_LABELS[k] + ': Bezeichnung ' + (i + 1));
      name.addEventListener('input', () => { zeile.name = name.value; });
      const betrag = document.createElement('input');
      betrag.type = 'text';
      betrag.className = 'fc-edit-betrag';
      betrag.inputMode = 'decimal';
      betrag.placeholder = '€';
      betrag.autocomplete = 'off';
      betrag.value = zeile.betrag;
      betrag.setAttribute('aria-label', FC_LABELS[k] + ': Betrag ' + (i + 1));
      betrag.addEventListener('input', () => {
        zeile.betrag = betrag.value;
        betrag.classList.toggle('ungueltig', lies(betrag.value) === null);
        aktualisiereSummen();
      });
      const weg = document.createElement('button');
      weg.type = 'button';
      weg.className = 'fc-edit-weg';
      weg.textContent = '✕';
      weg.setAttribute('aria-label', 'Posten entfernen');
      weg.addEventListener('click', () => { entwurf[k].splice(i, 1); zeichne(); });
      z.append(name, betrag, weg);
      gruppe.appendChild(z);
      if(fokus && fokus.k === k && fokus.i === i) setTimeout(() => name.focus(), 0);
    });

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'fc-edit-plus';
    plus.textContent = '+ Posten';
    plus.addEventListener('click', () => {
      if(entwurf[k].length >= MAX_ENTRIES_PER_KEY) return;
      entwurf[k].push({ name: '', betrag: '' });
      zeichne({ k, i: entwurf[k].length - 1 });
    });
    gruppe.appendChild(plus);
    frag.appendChild(gruppe);
  });
  tabelle.replaceChildren(frag);
  aktualisiereSummen();
}

function oeffnen(){
  const m = getMonthData(currentMonthKey);
  entwurf = {};
  fcKeys.forEach(k => {
    const posten = (m.forecastItems && m.forecastItems[k]) || [];
    if(posten.length){
      entwurf[k] = posten.map(p => ({ name: p.name, betrag: centsZuText(p.cents) }));
    } else if(m.forecast[k] > 0){
      entwurf[k] = [{ name: 'Bisher', betrag: centsZuText(m.forecast[k]) }];
    } else {
      entwurf[k] = [];
    }
  });
  fehlerEl.textContent = '';
  zeichne();
  openOverlay(overlay, schliessen);
}

function zu(){
  entwurf = null;
  closeOverlay(overlay, oeffnenBtn);
}

function uebernehmen(){
  const neu = {};
  for(const k of fcKeys){
    const posten = [];
    for(const z of entwurf[k]){
      const name = z.name.trim().slice(0, MAX_TEXT_LENGTH);
      const c = lies(z.betrag);
      if(c === null){
        fehlerEl.textContent = FC_LABELS[k] + ': "' + z.betrag + '" ist kein gültiger Betrag.';
        return;
      }
      if(c === 0) continue;               // leere Zeilen fallen weg
      posten.push({ name: name || 'Ohne Bezeichnung', cents: c });
    }
    const s = posten.reduce((a, p) => a + p.cents, 0);
    if(s > FC_MAX[k]){
      fehlerEl.textContent = FC_LABELS[k] + ': Summe zu groß (max. ' + formatCents(FC_MAX[k]) + ').';
      return;
    }
    neu[k] = { posten, s };
  }
  const m = getMonthData(currentMonthKey);
  if(!m.forecastItems) m.forecastItems = {};
  fcKeys.forEach(k => {
    m.forecastItems[k] = neu[k].posten;
    m.forecast[k] = neu[k].s;
    fcSliders[k].value = neu[k].s === 0 ? '' : String(neu[k].s / 100).replace('.', ',');
    fcVals[k].textContent = formatCents(neu[k].s);
  });
  saveAll(true);
  refreshTotals();
  zu();
}

const alleDa = [oeffnenBtn, overlay, schliessen, abbrechen, speichern, tabelle, gesamtEl, fehlerEl]
  .every(n => n !== null);
if(alleDa){
  oeffnenBtn.addEventListener('click', oeffnen);
  schliessen.addEventListener('click', zu);
  abbrechen.addEventListener('click', zu);
  speichern.addEventListener('click', uebernehmen);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) zu(); });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !overlay.hidden) zu();
  });
}
