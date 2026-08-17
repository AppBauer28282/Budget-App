/* =============================================================================
   GEHALTSRECHNER
   Eigenständiges Werkzeug hinter dem Geldsack-Symbol rechts oben in der
   Übersicht. Rechnet aus der Entgelttabelle (KT1–KT5) das Bruttogehalt hoch
   und daraus nach Rechtsstand 2026 das Netto.

   Bewusst vollständig getrennt vom Budget: liest keine Monatsdaten, schreibt
   nichts in den Speicher. Die Steuer- und Sozialabgabenlogik ist unverändert
   aus dem eigenständigen Rechner übernommen — an den Zahlen und Formeln darf
   nichts "aufgeräumt" werden, sie bilden den Rechtsstand ab.

   Die Eingabefelder werden hier direkt geholt (statt über dom.js), da sie
   ausschließlich in diesem Modul gebraucht werden. Alle IDs sind mit "sc-"
   vorangestellt, damit sie nicht mit den gleichnamigen Feldern der Budget-
   Oberfläche kollidieren (z. B. gibt es dort bereits ein #salary-slider).
   ============================================================================= */
import { openOverlay, closeOverlay } from './overlays.js?v=9';

/* ---------- Entgelttabelle & Konstanten ---------- */
const TABELLE = {
  '-3': { KT1: 2495, KT2: 2495 },
  '+3': { KT1: 2495, KT2: 2539, KT3: 3032, KT4: 3387 },
  '+5': { KT1: 2686, KT2: 2843, KT3: 3326, KT4: 3873 },
  '+7': { KT2: 3175, KT3: 3506, KT4: 4137, KT5: 5028 },
  '+9': { KT3: 3731, KT4: 4559, KT5: 5215 }
};

const BASIS_STD = 37.5;
const GEHAELTER = 13;
const ZUSCHLAG  = 1080;
const VL_AG = 26.59;   // Arbeitgeberanteil, brutto
const VL_AN = 40;      // Arbeitnehmeranteil, netto

const BBG_RV_ALV = 101400;
const BBG_KV_PV  = 69750;
const SATZ_RV       = 0.093;
const SATZ_ALV      = 0.013;
const SATZ_KV_GRUND = 0.073;
const SATZ_PV       = 0.024;
const ZTABFB        = 1266;
const SOLI_FREIGRENZE = 20350;
const VSP_HOECHSTBETRAG = 1900;

/* ---------- Eigene Felder ---------- */
const $ = (id) => document.getElementById(id);

const scStufe      = $('sc-stufe');
const scGruppe     = $('sc-gruppe');
const scStunden    = $('sc-stunden');
const scStundenVal = $('sc-stunden-val');
const scProzent    = $('sc-prozent');
const scProzentVal = $('sc-prozent-val');
const scMonatOut   = $('sc-monat-out');
const scDevMonat   = $('sc-dev-monat');
const scJahrOut    = $('sc-jahr-out');
const scDevJahr    = $('sc-dev-jahr');
const scGrowth     = $('sc-growth');
const scKvz        = $('sc-kvz');
const scBtnMonat   = $('sc-btn-monat');
const scBtnJahr    = $('sc-btn-jahr');
const scRows       = $('sc-rows');
const scNettoCap   = $('sc-netto-cap');
const scNettoOut   = $('sc-netto-out');
const scDevNetto   = $('sc-dev-netto');

// Auch Schaltfläche und Fensterrahmen werden hier selbst geholt statt über
// dom.js. Grund: Browser können nach einem Deployment einzelne Dateien noch
// aus dem Zwischenspeicher laden. Träfe eine neue salary-calc.js auf eine
// alte dom.js, wäre der Verweis undefiniert — mit eigener Abfrage kann das
// nicht passieren.
const scOpenBtn    = $('salary-calc-btn');
const scOverlay    = $('salary-calc-overlay');
const scCloseBtn   = $('salary-calc-close');

let jahrModus = false;

/* ---------- Formatierung ---------- */
function nf(n, d){
  return n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function eur(n, d){
  return nf(n, d === undefined ? 2 : d) + ' €';
}
function parseKomma(s){
  const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return isFinite(v) ? v : 0;
}

/* ---------- Steuer-/SV-Logik ---------- */
function kvSatzVorsorgepauschale(kvzGesamt){
  return kvzGesamt / 200 + 0.07;            // ermäßigter Satz 7,0 % + halber Zusatzbeitrag
}

function vorsorgepauschale(bruttoJahr, kvzGesamt){
  const vspr    = Math.min(bruttoJahr, BBG_RV_ALV) * SATZ_RV;
  const vspkvpv = Math.min(bruttoJahr, BBG_KV_PV) * (kvSatzVorsorgepauschale(kvzGesamt) + SATZ_PV);
  const vspalv  = Math.min(bruttoJahr, BBG_RV_ALV) * SATZ_ALV;
  const vsphb   = Math.min(vspalv + vspkvpv, VSP_HOECHSTBETRAG);
  return Math.max(vspr + vspkvpv, vspr + vsphb);
}

function berechneEinkommensteuer(zvE){
  const x = Math.floor(zvE);
  if(x < 12349) return 0;
  if(x <= 17799){ const y = (x - 12348) / 10000; return Math.floor((914.51 * y + 1400) * y); }
  if(x <= 69878){ const z = (x - 17799) / 10000; return Math.floor((173.10 * z + 2397) * z + 1034.87); }
  if(x <= 277825) return Math.floor(0.42 * x - 11135.63);
  return Math.floor(0.45 * x - 19470.38);
}

function berechneSoli(estJahr){
  if(estJahr <= SOLI_FREIGRENZE) return 0;
  return Math.min(0.055 * estJahr, 0.119 * (estJahr - SOLI_FREIGRENZE));
}

// bruttoGesamt = Brutto inkl. VL-Arbeitgeberanteil, im gewählten Zeitraum
function nettoRechnung(bruttoGesamt, jahr, kvz){
  const capRVALV = jahr ? BBG_RV_ALV : BBG_RV_ALV / 12;
  const capKVPV  = jahr ? BBG_KV_PV  : BBG_KV_PV  / 12;
  const bemRVALV = Math.min(bruttoGesamt, capRVALV);
  const bemKVPV  = Math.min(bruttoGesamt, capKVPV);

  const rv       = bemRVALV * SATZ_RV;
  const alv      = bemRVALV * SATZ_ALV;
  const kvGrund  = bemKVPV  * SATZ_KV_GRUND;
  const kvZusatz = bemKVPV  * (kvz / 100) / 2;
  const pv       = bemKVPV  * SATZ_PV;
  const sv       = rv + alv + kvGrund + kvZusatz + pv;

  const bruttoJahr = jahr ? bruttoGesamt : bruttoGesamt * 12;
  const zvE      = Math.max(0, bruttoJahr - ZTABFB - vorsorgepauschale(bruttoJahr, kvz));
  const estJahr  = berechneEinkommensteuer(zvE);
  const soliJahr = berechneSoli(estJahr);

  const lohnsteuer = jahr ? estJahr  : estJahr  / 12;
  const soli       = jahr ? soliJahr : soliJahr / 12;
  const vlAN       = jahr ? VL_AN * 12 : VL_AN;

  const netto = bruttoGesamt - sv - lohnsteuer - soli - vlAN;
  return { rv, alv, kvGrund, kvZusatz, pv, sv, lohnsteuer, soli, vlAN, netto };
}

/* ---------- Oberfläche ---------- */
// Gruppen hängen von der gewählten Stufe ab. Die bisherige Auswahl bleibt
// erhalten, sofern es sie in der neuen Stufe überhaupt gibt.
function fuelleGruppen(){
  const stufe = scStufe.value;
  const vorher = scGruppe.value;
  const gruppen = Object.keys(TABELLE[stufe]);
  const fragment = document.createDocumentFragment();
  gruppen.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = g;
    fragment.appendChild(opt);
  });
  scGruppe.replaceChildren(fragment);
  scGruppe.value = gruppen.indexOf(vorher) >= 0 ? vorher : gruppen[0];
}

function abweichung(diff){
  const v = Math.round(diff);
  if(v === 0) return '';
  return (v > 0 ? '+' : '−') + nf(Math.abs(v), 0) + ' € ggü. KT5/+7';
}

// Wie überall in der App: Zeilen über die DOM-API bauen, nie über innerHTML.
function addRow(container, label, wert, klasse){
  const row = document.createElement('div');
  row.className = 'sc-row' + (klasse ? ' ' + klasse : '');
  const l = document.createElement('span');
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'sc-num';
  v.textContent = wert;
  row.append(l, v);
  container.appendChild(row);
}

function update(){
  const stufe  = scStufe.value;
  const gruppe = scGruppe.value;
  const std    = parseFloat(scStunden.value);
  const proz   = parseFloat(scProzent.value);
  const kvz    = parseKomma(scKvz.value);
  const tabelle = TABELLE[stufe][gruppe];

  scStundenVal.textContent = nf(std, 1) + ' Std./Woche';
  scProzentVal.textContent = nf(proz, 2) + ' %';

  /* Bereich 1 */
  const monatBasis = Math.round(tabelle * (std / BASIS_STD));
  const monat      = Math.round(monatBasis * (1 + proz / 100));
  const jahr       = monat * GEHAELTER + ZUSCHLAG;

  scMonatOut.textContent = eur(monat, 0);
  scJahrOut.textContent  = eur(jahr, 0);

  /* Referenz KT5 / +7, immer mit 0 % */
  const basisMonatRef = Math.round(TABELLE['+7'].KT5 * (std / BASIS_STD));
  const basisJahrRef  = basisMonatRef * GEHAELTER + ZUSCHLAG;

  scDevMonat.textContent = abweichung(monat - basisMonatRef);
  scDevJahr.textContent  = abweichung(jahr - basisJahrRef);

  /* Wachstum durch Prozent-Regler */
  const diffMonat = monat - monatBasis;
  const diffJahr  = jahr - (monatBasis * GEHAELTER + ZUSCHLAG);
  if(diffMonat !== 0 || diffJahr !== 0){
    scGrowth.textContent = (diffMonat > 0 ? '+' : '−') + nf(Math.abs(diffMonat), 0) + ' €/Monat · ' +
                           (diffJahr  > 0 ? '+' : '−') + nf(Math.abs(diffJahr), 0)  + ' €/Jahr ggü. 0 %';
  } else {
    scGrowth.textContent = '';
  }

  /* Bereich 2 */
  const bruttoBasis = jahrModus ? jahr : monat;
  const vlAG        = jahrModus ? VL_AG * 12 : VL_AG;
  const bruttoGes   = bruttoBasis + vlAG;
  const r = nettoRechnung(bruttoGes, jahrModus, kvz);

  const refBasis = jahrModus ? basisJahrRef : basisMonatRef;
  const refNetto = nettoRechnung(refBasis + vlAG, jahrModus, kvz).netto;

  const rowsFrag = document.createDocumentFragment();
  addRow(rowsFrag, 'Bruttogehalt', eur(bruttoBasis, 2));
  addRow(rowsFrag, '+ VL-Arbeitgeberanteil', eur(vlAG, 2));
  addRow(rowsFrag, '= Brutto gesamt', eur(bruttoGes, 2), 'sum');
  addRow(rowsFrag, '− Rentenversicherung', eur(r.rv), 'neg');
  addRow(rowsFrag, '− Arbeitslosenversicherung', eur(r.alv), 'neg');
  addRow(rowsFrag, '− Krankenversicherung (Grund)', eur(r.kvGrund), 'neg');
  addRow(rowsFrag, '− Krankenversicherung (Zusatz)', eur(r.kvZusatz), 'neg');
  addRow(rowsFrag, '− Pflegeversicherung', eur(r.pv), 'neg');
  addRow(rowsFrag, '− Lohnsteuer', eur(r.lohnsteuer), 'neg');
  addRow(rowsFrag, '− Solidaritätszuschlag', eur(r.soli), 'neg');
  addRow(rowsFrag, '− VL-Arbeitnehmeranteil', eur(r.vlAN), 'neg');
  addRow(rowsFrag, '= Netto', eur(r.netto, 2), 'total');
  scRows.replaceChildren(rowsFrag);

  scNettoCap.textContent = jahrModus ? 'Netto pro Jahr' : 'Netto pro Monat';
  scNettoOut.textContent = eur(r.netto, 2);
  scDevNetto.textContent = abweichung(r.netto - refNetto);
}

function setModus(jahr){
  jahrModus = jahr;
  scBtnMonat.setAttribute('aria-pressed', String(!jahr));
  scBtnJahr.setAttribute('aria-pressed', String(jahr));
  update();
}

/* ---------- Fenster öffnen/schließen ---------- */
function openSalaryCalc(){
  openOverlay(scOverlay, scCloseBtn);
}
function closeSalaryCalc(){
  closeOverlay(scOverlay, scOpenBtn);
}

/* ---------- Ereignisse & Start ---------- */
function init(){
  scOpenBtn.addEventListener('click', openSalaryCalc);
  scCloseBtn.addEventListener('click', closeSalaryCalc);
  scOverlay.addEventListener('click', (e) => {
    if(e.target === scOverlay) closeSalaryCalc();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && !scOverlay.hidden) closeSalaryCalc();
  });

  scStufe.addEventListener('change', () => { fuelleGruppen(); update(); });
  [scGruppe, scStunden, scProzent, scKvz].forEach(node => {
    node.addEventListener('input', update);
    node.addEventListener('change', update);
  });
  scBtnMonat.addEventListener('click', () => setModus(false));
  scBtnJahr.addEventListener('click', () => setModus(true));

  scStufe.value = '+7';
  fuelleGruppen();
  scGruppe.value = 'KT5';
  update();
}

// Der Rechner ist ein Zusatzwerkzeug — er darf den Start der App unter
// keinen Umständen verhindern. Fehlt auch nur eines seiner Elemente (etwa
// weil der Browser noch eine ältere index.html aus dem Zwischenspeicher
// anzeigt, die das Symbol noch nicht enthält), wird er still übersprungen
// und Anmeldung sowie Budget funktionieren ganz normal weiter.
const alleElementeDa = [
  scStufe, scGruppe, scStunden, scStundenVal, scProzent, scProzentVal,
  scMonatOut, scDevMonat, scJahrOut, scDevJahr, scGrowth, scKvz,
  scBtnMonat, scBtnJahr, scRows, scNettoCap, scNettoOut, scDevNetto,
  scOpenBtn, scOverlay, scCloseBtn
].every(node => node !== null && node !== undefined);

if(alleElementeDa) init();
