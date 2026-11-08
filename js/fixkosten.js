/* =============================================================================
   FIXKOSTEN EINSTELLEN (Übersicht "Deine Monate")
   Bearbeitet die Fixkosten-Vorlage (allData.fixkostenVorlage). Beim Speichern
   übernehmen alle OFFENEN Monate die neue Liste als eigene Kopie; neue Monate
   bekommen sie beim Anlegen (navigation.js). Abgeschlossene Monate behalten
   ihre damaligen Fixkosten — sonst würden sich alte Monate nachträglich
   verändern.

   Abgehakte Fixkosten bleiben abgehakt, wenn es in der neuen Liste einen
   Posten mit derselben Bezeichnung gibt (z. B. nur der Betrag der Miete
   ändert sich). Neue Posten starten nicht abgehakt.
   ============================================================================= */
import { MAX_TEXT_LENGTH } from './constants.js?v=55';
import { formatCents, parseEuroInputToCents } from './utils.js?v=55';
import { allData, saveAll, fixkostenVon, fixkostenVorlage, MAX_FIXKOSTEN } from './storage.js?v=55';

const $ = (id) => document.getElementById(id);
const bereich  = $('fix-einstellung');
const tabelle  = $('fix-tabelle');
const plusBtn  = $('fix-plus');
const summeEl  = $('fix-summe');
const fehlerEl = $('fix-error');
const saveBtn  = $('fix-save');
const msgEl    = $('fix-msg');

let entwurf = [];

function centsZuText(c){
  return (c / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function lies(t){
  if(String(t).trim() === '') return 0;
  return parseEuroInputToCents(String(t));
}
function aktualisiereSumme(){
  summeEl.textContent = formatCents(entwurf.reduce((s, z) => s + (lies(z.betrag) || 0), 0));
}

function zeichne(fokusIndex){
  const frag = document.createDocumentFragment();
  entwurf.forEach((zeile, i) => {
    const z = document.createElement('div');
    z.className = 'fc-edit-zeile';
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'fc-edit-name';
    name.maxLength = MAX_TEXT_LENGTH;
    name.placeholder = 'Bezeichnung';
    name.autocomplete = 'off';
    name.value = zeile.name;
    name.setAttribute('aria-label', 'Fixkosten ' + (i + 1) + ': Bezeichnung');
    name.addEventListener('input', () => { zeile.name = name.value; msgEl.textContent = ''; });
    const betrag = document.createElement('input');
    betrag.type = 'text';
    betrag.className = 'fc-edit-betrag';
    betrag.inputMode = 'decimal';
    betrag.placeholder = '€';
    betrag.autocomplete = 'off';
    betrag.value = zeile.betrag;
    betrag.setAttribute('aria-label', 'Fixkosten ' + (i + 1) + ': Betrag');
    betrag.addEventListener('input', () => {
      zeile.betrag = betrag.value;
      betrag.classList.toggle('ungueltig', lies(betrag.value) === null);
      msgEl.textContent = '';
      aktualisiereSumme();
    });
    const weg = document.createElement('button');
    weg.type = 'button';
    weg.className = 'fc-edit-weg';
    weg.textContent = '✕';
    weg.setAttribute('aria-label', 'Fixkosten entfernen');
    weg.addEventListener('click', () => { entwurf.splice(i, 1); msgEl.textContent = ''; zeichne(); });
    z.append(name, betrag, weg);
    frag.appendChild(z);
    if(fokusIndex === i) setTimeout(() => name.focus(), 0);
  });
  tabelle.replaceChildren(frag);
  plusBtn.disabled = entwurf.length >= MAX_FIXKOSTEN;
  aktualisiereSumme();
}

function laden(){
  entwurf = fixkostenVorlage().map(f => ({ name: f.name, betrag: centsZuText(f.cents) }));
  fehlerEl.textContent = '';
  msgEl.textContent = '';
  zeichne();
}

function speichern(){
  const liste = [];
  for(const z of entwurf){
    const c = lies(z.betrag);
    const name = z.name.trim().slice(0, MAX_TEXT_LENGTH);
    if(c === null){ fehlerEl.textContent = '"' + z.betrag + '" ist kein gültiger Betrag.'; return; }
    if(c === 0 && !name) continue;                     // leere Zeile
    if(c === 0){ fehlerEl.textContent = 'Bitte einen Betrag für "' + name + '" eintragen.'; return; }
    liste.push({ name: name || 'Ohne Bezeichnung', cents: c });
  }
  if(!liste.length){ fehlerEl.textContent = 'Mindestens einen Fixkosten-Posten eintragen.'; return; }
  fehlerEl.textContent = '';

  allData.fixkostenVorlage = liste.map(f => ({ ...f }));
  let offen = 0;
  Object.keys(allData.monthEntries).forEach(key => {
    const entry = allData.monthEntries[key];
    if(entry.status !== 'open') return;
    offen++;
    const d = entry.data;
    const alt = fixkostenVon(d);
    const vergeben = new Set();
    // Häkchen über die Bezeichnung mitnehmen (je alter Posten höchstens einmal).
    d.checked = liste.map(f => {
      const i = alt.findIndex((a, idx) => !vergeben.has(idx) && a.name === f.name);
      if(i < 0) return false;
      vergeben.add(i);
      return d.checked[i] === true;
    });
    d.fixkosten = liste.map(f => ({ ...f }));
  });
  saveAll(true);
  laden();
  msgEl.textContent = 'Gespeichert – gilt für neue Monate' + (offen ? ' und ' + (offen === 1 ? 'den offenen Monat' : 'die ' + offen + ' offenen Monate') : '') + '.';
}

if([bereich, tabelle, plusBtn, summeEl, fehlerEl, saveBtn, msgEl].every(n => n !== null)){
  // Beim Aufklappen immer den aktuellen Stand laden (z. B. nach Cloud-Abgleich).
  bereich.addEventListener('toggle', () => { if(bereich.open) laden(); });
  plusBtn.addEventListener('click', () => {
    if(entwurf.length >= MAX_FIXKOSTEN) return;
    entwurf.push({ name: '', betrag: '' });
    zeichne(entwurf.length - 1);
  });
  saveBtn.addEventListener('click', speichern);
}
