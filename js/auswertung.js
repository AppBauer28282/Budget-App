/* =============================================================================
   AUSWERTUNG (gemeinsame Rechenbasis)
   Reine Funktionen ohne Oberfläche — genutzt vom Monatsbudget-Widget auf der
   Startseite (js/budget-widget.js), vom Monatsvergleich (js/monats-balken.js)
   und vom Ø-Modus der Analyse (js/analysis.js).

   Gezählt wird wie überall in der App: Fixkosten nur abgehakt, Rücklagen
   netto (abzüglich "Auflösung Rücklagen").

   JAHRESFIX VERTEILT: Jahresfix-Buchungen (z. B. Versicherung im März)
   verzerren den Buchungsmonat. Für Durchschnitte und Monatsvergleiche wird
   deshalb die Jahresfix-Summe eines Kalenderjahres gleichmäßig auf seine
   12 Monate verteilt (÷ 12) — jeder Monat des Jahres trägt denselben Anteil.
   ============================================================================= */
import { categoryDefs, istMinus, zielVon, minusPosten } from './constants.js?v=66';
import { allData, fixkostenVon } from './storage.js?v=66';

// Schlüssel wie in der Analyse: Fixkosten, alle Ausgaben-Kategorien (ohne
// die verrechnete "Auflösung"), Sparen.
export const AUSWERTUNG_KEYS = ['fixed',
  ...categoryDefs.filter(d => !istMinus(d.key)).map(d => d.key), 'sparen'];

const summe = (liste) => liste.reduce((s, e) => s + e.cents, 0);

export function alleEintraege(){
  return Object.values(allData.monthEntries)
    .sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
}

// Summe aller Jahresfix-Buchungen eines Kalenderjahres (alle Monate, offen
// wie abgeschlossen).
export function jahresfixSumme(jahr){
  let s = 0;
  Object.values(allData.monthEntries).forEach(e => {
    if(e.year === jahr) s += summe(e.data.categories.jahresfix)
      - minusPosten(e.data.categories, 'jahresfix').reduce((x, p) => x + p.entry.cents, 0);
  });
  return s;
}
export function jahresfixProMonat(jahr){
  return Math.round(jahresfixSumme(jahr) / 12);
}

// Beträge eines Monats je Schlüssel (Cent). verteilt=true ersetzt den echten
// Jahresfix-Betrag des Monats durch den 1/12-Anteil seines Jahres.
export function monatsWerte(entry, verteilt){
  const m = entry.data;
  const w = Object.create(null);
  AUSWERTUNG_KEYS.forEach(k => { w[k] = 0; });
  fixkostenVon(m).forEach((item, i) => { if(m.checked[i]) w.fixed += item.cents; });
  categoryDefs.forEach(def => {
    if(istMinus(def.key)){
      m.categories[def.key].forEach(e => { const ziel = zielVon(def.key, e); if(ziel in w) w[ziel] -= e.cents; });
    } else w[def.key] += summe(m.categories[def.key]);
  });
  w.sparen = summe(m.saving.sparen);
  if(verteilt) w.jahresfix = jahresfixProMonat(entry.year);
  return w;
}

// Mittelwert je Schlüssel über mehrere Monate (leere Liste → lauter Nullen).
export function schnitt(entries, verteilt){
  const w = Object.create(null);
  AUSWERTUNG_KEYS.forEach(k => { w[k] = 0; });
  if(!entries.length) return w;
  entries.forEach(e => {
    const mw = monatsWerte(e, verteilt);
    AUSWERTUNG_KEYS.forEach(k => { w[k] += mw[k]; });
  });
  AUSWERTUNG_KEYS.forEach(k => { w[k] = Math.round(w[k] / entries.length); });
  return w;
}

// Grobe Dreiteilung: Fix = Fixkosten + Jahresfix, Sparen = Sparen,
// Variabel = alles andere (nie unter 0, falls mehr aufgelöst als ausgegeben).
export function dreiteilung(w){
  let variabel = 0;
  AUSWERTUNG_KEYS.forEach(k => { if(k !== 'fixed' && k !== 'jahresfix' && k !== 'sparen') variabel += w[k]; });
  return { fix: w.fixed + w.jahresfix, variabel: Math.max(0, variabel), sparen: w.sparen };
}
