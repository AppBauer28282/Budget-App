/* =============================================================================
   STAMMDATEN (Konstanten)
   Diese Listen definieren, was die App kennt. Sie sind die einzige Quelle
   der Wahrheit — Speicher-Daten werden beim Laden gegen sie geprüft.
   ============================================================================= */

// Versionsanzeige (Einstellungen-Bereich): bei jeder inhaltlichen Änderung
// von Hand hochzählen und das Datum aktualisieren. Dient nur zur Kontrolle,
// ob im Browser wirklich die neueste Version geladen ist (z. B. nach einem
// Deployment, falls der Browser eine alte Version zwischenspeichert).
//
// WICHTIG beim Hochzählen: Dieselbe Zahl steht auch in den "?v="-Angaben
// hinter JEDER Verknüpfung in js/*.js und hinter js/app.js in index.html.
// Sie sorgt dafür, dass der Browser nach einem Update alle Dateien frisch
// holt und keine alte mit einer neuen mischen kann (genau daran ist v8
// gescheitert: neue salary-calc.js traf auf alte dom.js).
// Alle Stellen mitziehen, z. B.:
//   sed -i "s|\.js?v=9'|.js?v=10'|g" js/*.js
//   sed -i 's|js/app\.js?v=9|js/app.js?v=10|' index.html
// Sie müssen ALLE dieselbe Zahl tragen — sonst würde ein Modul zweimal
// geladen und der gemeinsame Datenstand liefe auseinander.
export const APP_VERSION = 'v9';
export const APP_VERSION_DATE = '2026-08-17';

// Fixkosten. Beträge in Cent, um Rundungsfehler mit Kommazahlen zu vermeiden
// (0.1 + 0.2 !== 0.3 in JavaScript). Gerechnet wird durchgängig in Cent.
export const items = [
  { name: 'Miete',     cents: 78500 },
  { name: 'Strom',     cents: 7000 },
  { name: 'Congstar',  cents: 2000 },
  { name: 'Outfit',    cents: 3000 },
  { name: 'Internet',  cents: 3500 },
  { name: 'BU',        cents: 8500 }
];

// 'konsum_cat' statt 'konsum', damit der Key sich vom gleichnamigen
// Forecast-Regler unterscheidet — beides heißt in der Anzeige "Konsum",
// ist aber Unterschiedliches: echte Buchung vs. Prognose.
export const categoryDefs = [
  { key: 'einkauf',      name: 'Einkauf' },
  { key: 'benzin',       name: 'Benzin' },
  { key: 'gesundheit',   name: 'Gesundheit' },
  { key: 'eltern',       name: 'Eltern' },
  { key: 'konsum_cat',   name: 'Konsum' },
  { key: 'freizeit',     name: 'Freizeit' },
  { key: 'urlaub',       name: 'Urlaub' },
  { key: 'jahresfix',    name: 'Jahresfix' },
  { key: 'kfz_sonstige', name: 'sonstige KFZ-Ausgaben' }
];

export const savingDefs = [
  { key: 'sparen',     name: 'Sparen' },
  { key: 'ruecklagen', name: 'Rücklagen' },
  { key: 'aufloesung', name: 'Auflösung Rücklagen' }
];

// Echte Kalenderreihenfolge (kein fiktives Geschäftsjahr mehr), da Monat
// und Jahr beim Anlegen eines Monats jetzt getrennt gewählt werden.
export const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli',
                'August','September','Oktober','November','Dezember'];

export const STORAGE_KEY = 'kontor_budget_v2';

// Grenzwerte. Werden beim Import erzwungen, damit manipulierte oder kaputte
// Dateien keine unsinnigen Werte in die App bringen.
export const SALARY_MIN_CENTS = 200000;   // 2.000 €
export const SALARY_MAX_CENTS = 800000;   // 8.000 €
export const AMOUNT_MAX_CENTS = 100000000; // 1.000.000 € pro Einzeleintrag
export const MAX_ENTRIES_PER_KEY = 500;   // begrenzt Speicher- und Renderaufwand
export const MAX_TEXT_LENGTH = 80;
export const MAX_NOTE_LENGTH = 2000;      // Forecast-Notizfeld
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_MONTH_ENTRIES = 500;     // Sicherheitsobergrenze für Anzahl Monate
export const MAX_OPEN_MONTHS = 3;         // gleichzeitig bearbeitbare Monate

// Fester Gesamtsaldo der Kreditkarte — bewusst keine Nutzereinstellung,
// sondern eine Konstante, wie vorgegeben.
export const CARD_TOTAL_CENTS = 200000; // 2.000 €

// Obergrenzen der Forecast-Regler, passend zu den max-Attributen im HTML.
export const FC_DEFS = [
  { key: 'lebensmittel', maxCents: 80000 },
  { key: 'konsum',       maxCents: 200000 },
  { key: 'sprit',        maxCents: 30000 },
  { key: 'sonstiges',    maxCents: 100000 }
];
export const fcKeys = FC_DEFS.map(d => d.key);
// Direktes Nachschlagen der Obergrenze, damit beim Ziehen eines Reglers nicht
// bei jedem einzelnen Ereignis die Liste durchsucht werden muss.
export const FC_MAX = {};
FC_DEFS.forEach(d => { FC_MAX[d.key] = d.maxCents; });

export const FC_LABELS = { lebensmittel: 'Lebensmittel', konsum: 'Konsum', sprit: 'Sprit', sonstiges: 'Sonstiges' };

// Eine Farbe je Kategorie — bewusst gedeckte, zum Rest der Seite passende
// Töne. 'fc_*' sind die Farben der Forecast-Regler-Segmente in "Ist +
// Forecast" — eigene Palette, damit sie sich von den echten Kategorien
// unterscheiden lassen.
export const SLICE_COLORS = {
  fixed:          '#14202b', // ink — abgehakte + offene Fixkosten zusammen
  einkauf:        '#5b7a5e',
  benzin:         '#b5543a',
  gesundheit:     '#3f7f93',
  eltern:         '#7d6a9c',
  konsum_cat:     '#a3455c',
  freizeit:       '#3f5f8a',
  urlaub:         '#7a8a4a',
  jahresfix:      '#c2a23a',
  kfz_sonstige:   '#8a7355',
  sparen:         '#3c6e4f',
  ruecklagen:     '#6f5b3e',
  aufloesung:     '#b06b8f',
  fc_lebensmittel:'#8fae7a',
  fc_konsum:      '#d98b7c',
  fc_sprit:       '#e0a458',
  fc_sonstiges:   '#9fa8c4',
  overview_income:  '#c9a227',
  overview_expense: '#8f3f3f'
};

// Eine Farbe je Monat — für das Einnahmen-Diagramm in der Analyse, das
// (anders als das Ausgaben-Diagramm) nach Monat statt nach Kategorie
// aufschlüsselt, da es nur eine Einnahmequelle (Gehalt) gibt. Reihenfolge
// entspricht MONTHS (Index 0 = Januar).
export const MONTH_COLORS = [
  '#4a5a7a', '#6b8fa3', '#7a9e6e', '#a3a34a',
  '#c2914a', '#c2703a', '#a8453f', '#9c3b5c',
  '#7d4a9c', '#5c4a9c', '#4a5a8a', '#3c4a6e'
];
