/* =============================================================================
   HILFSFUNKTIONEN
   ============================================================================= */
import { AMOUNT_MAX_CENTS } from './constants.js?v=12';

// Formatiert Cent-Beträge als deutsche Euro-Angabe.
// Intl.NumberFormat wird einmal erzeugt statt bei jedem Aufruf neu (deutlich
// schneller, da die Erzeugung teuer ist und hunderte Male pro Render liefe).
const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR',
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
export function formatCents(cents){
  return eurFormatter.format(cents / 100);
}

// Wandelt Benutzereingaben in Cent um. Akzeptiert Komma und Punkt.
// Gibt null zurück, wenn die Eingabe ungültig ist.
export function parseAmountToCents(raw){
  if(typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if(normalized === '') return null;
  const value = Number(normalized);
  if(!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if(cents <= 0 || cents > AMOUNT_MAX_CENTS) return null;
  return cents;
}

// Wie parseAmountToCents, aber 0 ist erlaubt (z. B. Kreditkarten-Restsaldo:
// "0 €" bedeutet gültig "Karte komplett ausgeschöpft", nicht "keine Eingabe").
export function parseNonNegativeAmountToCents(raw){
  if(typeof raw !== 'string') return null;
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if(normalized === '') return null;
  const value = Number(normalized);
  if(!Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  if(cents < 0 || cents > AMOUNT_MAX_CENTS) return null;
  return cents;
}

export function clamp(value, min, max){
  return Math.min(Math.max(value, min), max);
}

// Eindeutiger Schlüssel eines Monats-Eintrags, z. B. "2026-08".
export function monthKey(year, monthIndex){
  const mm = monthIndex + 1;
  return year + '-' + (mm < 10 ? '0' + mm : String(mm));
}
