/* =============================================================================
   JAHRESFIX-TRACKING (Übersicht "Deine Monate")
   Je Jahr eine Liste der geplanten Jahresfix-Ausgaben: Monat, Bezeichnung,
   Betrag und ein Haken für "erledigt". Dargestellt als schlichte Textliste:
   gestrichelte Linie zwischen den Einträgen, Doppelstrich vor der Summe.

   Reine Planung: gespeichert in allData.jahresfixPlan (läuft über
   Cloud-Abgleich und Sichern/Wiederherstellen). Abhaken legt keine Ausgabe
   an und ändert keine andere Zahl der App.
   ============================================================================= */
import { MAX_TEXT_LENGTH } from './constants.js?v=67';
import { formatCents, parseEuroInputToCents } from './utils.js?v=67';
import { allData, saveAll, JFP_MAX } from './storage.js?v=67';
import { openOverlay, closeOverlay } from './overlays.js?v=67';

const $ = (id) => document.getElementById(id);
const oeffnenBtn = $('jfp-btn');
const overlay    = $('jfp-overlay');
const schliessen = $('jfp-close');
const jahrSel    = $('jfp-jahr');
const listeEl    = $('jfp-liste');
const nameIn     = $('jfp-name');
const betragIn   = $('jfp-betrag');
const monatSel   = $('jfp-monat');
const addBtn     = $('jfp-add');
const fehlerEl   = $('jfp-fehler');

const zwei = (n) => (n < 10 ? '0' : '') + n;

function plan(){
  if(!allData.jahresfixPlan || typeof allData.jahresfixPlan !== 'object') allData.jahresfixPlan = Object.create(null);
  return allData.jahresfixPlan;
}
function eintraege(jahr){
  return plan()[String(jahr)] || [];
}
function jahre(){
  const set = new Set(Object.keys(plan()).filter(j => plan()[j].length).map(Number));
  const heute = new Date().getFullYear();
  set.add(heute);
  set.add(heute + 1);   // nächstes Jahr schon planbar
  return Array.from(set).sort((a, b) => a - b);
}
function h(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}
function sichern(){
  saveAll(true);
  render();
}

function render(){
  const jahr = Number(jahrSel.value);
  const roh = eintraege(jahr);
  // Anzeige nach Monat sortiert; bei gleichem Monat in Eingabe-Reihenfolge.
  const sortiert = roh.map((e, idx) => ({ e, idx })).sort((a, b) => a.e.monat - b.e.monat || a.idx - b.idx);
  const frag = document.createDocumentFragment();

  if(!sortiert.length){
    frag.appendChild(h('p', 'jfp-leer', 'Noch nichts geplant für ' + jahr + '.'));
    const vor = eintraege(jahr - 1);
    if(vor.length){
      const b = h('button', 'receipt-btn jfp-uebernehmen', 'Aus ' + (jahr - 1) + ' übernehmen (' + vor.length + ')');
      b.type = 'button';
      b.id = 'jfp-uebernehmen';
      b.addEventListener('click', () => {
        plan()[String(jahr)] = vor.map(e => ({ monat: e.monat, name: e.name, cents: e.cents, erledigt: false }));
        sichern();
      });
      frag.appendChild(b);
    }
    listeEl.replaceChildren(frag);
    return;
  }

  let summe = 0, erledigt = 0;
  sortiert.forEach(({ e, idx }, pos) => {
    summe += e.cents;
    if(e.erledigt) erledigt += e.cents;

    // Die letzte Zeile hat keine gestrichelte Linie: dort folgt der Doppelstrich.
    const zeile = h('div', 'jfp-zeile' + (e.erledigt ? ' erledigt' : '') + (pos === sortiert.length - 1 ? ' letzte' : ''));
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'jfp-haken';
    cb.checked = e.erledigt;
    cb.dataset.idx = String(idx);
    cb.setAttribute('aria-label', e.name + ' erledigt');
    cb.addEventListener('change', () => { roh[idx].erledigt = cb.checked; sichern(); });
    const weg = h('button', 'jfp-weg', '✕');
    weg.type = 'button';
    weg.dataset.idx = String(idx);
    weg.setAttribute('aria-label', e.name + ' entfernen');
    weg.title = 'Entfernen';
    weg.addEventListener('click', () => {
      roh.splice(idx, 1);
      if(!roh.length) delete plan()[String(jahr)];
      sichern();
    });
    zeile.append(cb, h('span', 'jfp-monat', zwei(e.monat)), h('span', 'jfp-name', e.name),
      h('span', 'jfp-betrag', formatCents(e.cents)), weg);
    frag.appendChild(zeile);
  });

  // Doppelstrich (Ergebnisstrich) vor der Summe.
  const fuss = h('div', 'jfp-summe');
  const zeile = (label, wert, cls) => {
    const z = h('div', 'jfp-summe-zeile' + (cls ? ' ' + cls : ''));
    z.append(h('span', '', label), h('span', 'jfp-betrag', wert));
    return z;
  };
  fuss.append(zeile('Summe', formatCents(summe), 'gesamt'),
    zeile('davon erledigt', formatCents(erledigt)),
    zeile('noch offen', formatCents(summe - erledigt)));
  frag.appendChild(fuss);
  listeEl.replaceChildren(frag);
}

function hinzufuegen(){
  const jahr = Number(jahrSel.value);
  const name = nameIn.value.trim().slice(0, MAX_TEXT_LENGTH);
  const cents = parseEuroInputToCents(betragIn.value);
  const monat = Number(monatSel.value);
  if(!name){ fehlerEl.textContent = 'Bitte eine Bezeichnung eingeben.'; nameIn.focus(); return; }
  if(cents === null || cents <= 0){ fehlerEl.textContent = 'Bitte einen gültigen Betrag eingeben.'; betragIn.focus(); return; }
  if(!Number.isInteger(monat) || monat < 1 || monat > 12){ fehlerEl.textContent = 'Bitte einen Monat wählen.'; return; }
  const p = plan();
  if(!p[String(jahr)]) p[String(jahr)] = [];
  if(p[String(jahr)].length >= JFP_MAX){ fehlerEl.textContent = 'Höchstens ' + JFP_MAX + ' Einträge je Jahr.'; return; }
  fehlerEl.textContent = '';
  p[String(jahr)].push({ monat, name, cents, erledigt: false });
  nameIn.value = '';
  betragIn.value = '';
  sichern();
  nameIn.focus();
}

function oeffnen(){
  const js = jahre();
  const frag = document.createDocumentFragment();
  js.forEach(j => { const o = document.createElement('option'); o.value = String(j); o.textContent = String(j); frag.appendChild(o); });
  jahrSel.replaceChildren(frag);
  jahrSel.value = String(new Date().getFullYear());
  monatSel.value = String(new Date().getMonth() + 1);
  fehlerEl.textContent = '';
  render();
  openOverlay(overlay, schliessen);
}
function zu(){ closeOverlay(overlay, oeffnenBtn); }

if([oeffnenBtn, overlay, schliessen, jahrSel, listeEl, nameIn, betragIn, monatSel, addBtn, fehlerEl].every(n => n !== null)){
  for(let m = 1; m <= 12; m++){
    const o = document.createElement('option');
    o.value = String(m);
    o.textContent = zwei(m);
    monatSel.appendChild(o);
  }
  oeffnenBtn.addEventListener('click', oeffnen);
  schliessen.addEventListener('click', zu);
  overlay.addEventListener('click', (e) => { if(e.target === overlay) zu(); });
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape' && !overlay.hidden) zu(); });
  jahrSel.addEventListener('change', () => { fehlerEl.textContent = ''; render(); });
  addBtn.addEventListener('click', hinzufuegen);
  [nameIn, betragIn].forEach(i => i.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); hinzufuegen(); }
  }));
}
