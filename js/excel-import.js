/* =============================================================================
   MONATSBUDGET AUS EXCEL EINLESEN
   Liest eine Tabelle (.xlsx oder .csv) mit einer Zeile je Posten:
     Jahr | Monat | Bereich | Kategorie | Bezeichnung | Betrag
   Die Datei wird ausschließlich hier im Browser gelesen. Vor dem Übernehmen
   zeigt ein Fenster, was gefunden wurde; erst "Übernehmen" ändert Daten.
   Jeder Monat läuft danach durch denselben Prüfrichter wie eine eingelesene
   Sicherung (sanitizeMonthEntry in storage.js).

   .xlsx ist ein ZIP-Archiv mit XML-Dateien. Es wird ohne Fremdbibliothek
   gelesen: Verzeichnis des Archivs auswerten, die nötigen Dateien mit dem
   im Browser eingebauten DecompressionStream entpacken, XML mit DOMParser.
   ============================================================================= */
import {
  categoryDefs, savingDefs, MONTHS, MAX_IMPORT_BYTES, AMOUNT_MAX_CENTS,
  SALARY_MIN_CENTS, SALARY_MAX_CENTS, MAX_ENTRIES_PER_KEY, MAX_TEXT_LENGTH,
  MAX_MONTH_ENTRIES
} from './constants.js?v=62';
import {
  allData, saveAll, setAllData, sanitizeMonthEntry, fixkostenVorlage, MAX_FIXKOSTEN
} from './storage.js?v=62';
import { showOverview } from './navigation.js?v=62';
import { openOverlay, closeOverlay } from './overlays.js?v=62';
import { formatCents, monthKey } from './utils.js?v=62';

const MAX_ZEILEN = 5000;
const MAX_ENTPACKT = 20 * 1024 * 1024;   // Schutz vor ZIP-Bomben
const SPALTEN = ['jahr', 'monat', 'bereich', 'kategorie', 'bezeichnung', 'betrag'];

const $ = id => document.getElementById(id);
const fileEl = $('xls-file');
const msgEl = $('xls-msg');
const overlay = $('xls-overlay');
const bodyEl = $('xls-body');
const closeBtn = $('xls-close');

function melde(text, fehler){
  msgEl.textContent = text;
  msgEl.className = fehler ? 'backup-msg error' : 'backup-msg';
}
function h(tag, cls, text){
  const e = document.createElement(tag);
  if(cls) e.className = cls;
  if(text !== undefined) e.textContent = text;
  return e;
}

/* ---------------------------------------------------------------------------
   .xlsx lesen
   --------------------------------------------------------------------------- */
function zipVerzeichnis(buf){
  const dv = new DataView(buf);
  const n = buf.byteLength;
  let eocd = -1;
  for(let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--){
    if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error('kein-zip');
  const anzahl = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const dateien = new Map();
  for(let i = 0; i < anzahl && i < 2000; i++){
    if(p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw new Error('kein-zip');
    const methode = dv.getUint16(p + 10, true);
    const gepackt = dv.getUint32(p + 20, true);
    const entpackt = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const kommLen = dv.getUint16(p + 32, true);
    const lokal = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    dateien.set(name, { methode, gepackt, entpackt, lokal });
    p += 46 + nameLen + extraLen + kommLen;
  }
  return dateien;
}

async function zipDatei(buf, eintrag){
  const dv = new DataView(buf);
  const p = eintrag.lokal;
  if(p + 30 > buf.byteLength || dv.getUint32(p, true) !== 0x04034b50) throw new Error('kein-zip');
  const start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  if(start + eintrag.gepackt > buf.byteLength) throw new Error('kein-zip');
  if(eintrag.entpackt > MAX_ENTPACKT) throw new Error('zu-gross');
  const roh = new Uint8Array(buf, start, eintrag.gepackt);
  if(eintrag.methode === 0) return new TextDecoder().decode(roh);
  if(eintrag.methode !== 8) throw new Error('kein-zip');
  if(typeof DecompressionStream !== 'function') throw new Error('kein-entpacker');
  const strom = new Blob([roh]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const leser = strom.getReader();
  const teile = [];
  let summe = 0;
  for(;;){
    const { done, value } = await leser.read();
    if(done) break;
    summe += value.byteLength;
    if(summe > MAX_ENTPACKT){ try{ leser.cancel(); }catch(e){} throw new Error('zu-gross'); }
    teile.push(value);
  }
  const alles = new Uint8Array(summe);
  let o = 0;
  teile.forEach(t => { alles.set(t, o); o += t.byteLength; });
  return new TextDecoder().decode(alles);
}

function xml(text){
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('kein-xlsx');
  return doc;
}
const tags = (knoten, name) => Array.from(knoten.getElementsByTagNameNS('*', name));

// "B7" → 1 (Spalte B, nullbasiert).
function spalteAus(ref){
  let s = 0, i = 0;
  for(; i < ref.length; i++){
    const c = ref.charCodeAt(i);
    if(c < 65 || c > 90) break;
    s = s * 26 + (c - 64);
  }
  return i ? s - 1 : -1;
}

async function leseXlsx(buf){
  const dateien = zipVerzeichnis(buf);
  const hole = async name => dateien.has(name) ? zipDatei(buf, dateien.get(name)) : null;

  // Erstes Tabellenblatt laut Arbeitsmappe; sonst das übliche sheet1.xml.
  let blattPfad = 'xl/worksheets/sheet1.xml';
  const wb = await hole('xl/workbook.xml');
  const rels = await hole('xl/_rels/workbook.xml.rels');
  if(wb && rels){
    const erstes = tags(xml(wb), 'sheet')[0];
    const rid = erstes && (erstes.getAttribute('r:id') ||
      erstes.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    const rel = rid && tags(xml(rels), 'Relationship').find(r => r.getAttribute('Id') === rid);
    if(rel){
      const ziel = rel.getAttribute('Target') || '';
      blattPfad = ziel.charAt(0) === '/' ? ziel.slice(1) : 'xl/' + ziel;
    }
  }
  const blatt = await hole(blattPfad);
  if(!blatt) throw new Error('kein-xlsx');

  const texte = [];
  const ss = await hole('xl/sharedStrings.xml');
  if(ss){
    tags(xml(ss), 'si').forEach(si => {
      // Lautschrift-Zusätze (rPh) gehören nicht zum Zelltext.
      texte.push(tags(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
    });
  }

  const zeilen = [];
  const rows = tags(xml(blatt), 'row');
  for(let r = 0; r < rows.length; r++){
    if(zeilen.length > MAX_ZEILEN) break;
    const nr = parseInt(rows[r].getAttribute('r'), 10);
    const zellen = [];
    let lauf = 0;
    tags(rows[r], 'c').forEach(c => {
      const sp = spalteAus(c.getAttribute('r') || '');
      const idx = sp >= 0 ? sp : lauf;
      lauf = idx + 1;
      if(idx > 50) return;
      const typ = c.getAttribute('t');
      const v = tags(c, 'v')[0];
      let wert = '';
      if(typ === 'inlineStr') wert = tags(c, 't').map(t => t.textContent).join('');
      else if(!v) wert = '';
      else if(typ === 's') wert = texte[parseInt(v.textContent, 10)] || '';
      else if(typ === 'str' || typ === 'b' || typ === 'e') wert = v.textContent;
      else { const zahl = Number(v.textContent); wert = Number.isFinite(zahl) ? zahl : v.textContent; }
      zellen[idx] = wert;
    });
    zeilen.push({ nr: Number.isInteger(nr) ? nr : r + 1, zellen });
  }
  return zeilen;
}

/* ---------------------------------------------------------------------------
   .csv lesen
   --------------------------------------------------------------------------- */
function leseCsv(buf){
  let text = new TextDecoder('utf-8').decode(buf);
  // Ältere Excel-Versionen speichern CSV in der Windows-Kodierung.
  if(text.indexOf('�') > -1){
    try{ text = new TextDecoder('windows-1252').decode(buf); }catch(e){}
  }
  if(text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const kopf = text.split(/\r?\n/, 1)[0] || '';
  const zaehle = z => kopf.split(z).length - 1;
  const trenner = zaehle(';') >= zaehle(',') && zaehle(';') >= zaehle('\t') ? ';'
    : (zaehle('\t') > zaehle(',') ? '\t' : ',');

  const zeilen = [];
  let zellen = [], feld = '', inQuote = false, nr = 1;
  const fertigFeld = () => { zellen.push(feld); feld = ''; };
  const fertigZeile = () => { fertigFeld(); zeilen.push({ nr, zellen }); zellen = []; nr++; };
  for(let i = 0; i < text.length; i++){
    const c = text[i];
    if(inQuote){
      if(c === '"'){
        if(text[i + 1] === '"'){ feld += '"'; i++; }
        else inQuote = false;
      } else feld += c;
    } else if(c === '"' && feld === '') inQuote = true;
    else if(c === trenner) fertigFeld();
    else if(c === '\n'){ fertigZeile(); if(zeilen.length > MAX_ZEILEN) break; }
    else if(c !== '\r') feld += c;
  }
  if(feld !== '' || zellen.length) fertigZeile();
  return zeilen;
}

/* ---------------------------------------------------------------------------
   Zeilen deuten
   --------------------------------------------------------------------------- */
// Kleinschreibung, Umlaute und Leerzeichen vereinheitlicht — so passt
// "März", "maerz" und " MÄRZ " gleichermaßen.
function norm(v){
  return String(v === undefined || v === null ? '' : v).trim().toLowerCase()
    .replace(/ /g, ' ').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[\s\-_.]+/g, ' ').trim();
}

const KATEGORIEN = new Map();
categoryDefs.forEach(d => { KATEGORIEN.set(norm(d.name), d.key); KATEGORIEN.set(norm(d.key), d.key); });
[['konsum', 'konsum_cat'], ['kfz', 'kfz_sonstige'], ['sonstige kfz', 'kfz_sonstige'],
 ['kfz ausgaben', 'kfz_sonstige'], ['auto', 'kfz_sonstige'], ['aufloesung', 'aufloesung'],
 ['ruecklage', 'ruecklagen'], ['tanken', 'benzin'], ['sprit', 'benzin'],
 ['lebensmittel', 'einkauf'], ['einkaeufe', 'einkauf']
].forEach(([n, k]) => { if(!KATEGORIEN.has(n)) KATEGORIEN.set(n, k); });
const KAT_NAME = {};
categoryDefs.forEach(d => { KAT_NAME[d.key] = d.name; });

const BEREICHE = new Map([
  ['gehalt', 'gehalt'], ['einkommen', 'gehalt'], ['lohn', 'gehalt'],
  ['fixkosten', 'fix'], ['fix', 'fix'], ['fixkost', 'fix'],
  ['ausgabe', 'ausgabe'], ['ausgaben', 'ausgabe'], ['sonstige ausgaben', 'ausgabe'], ['sonstige ausgabe', 'ausgabe'],
  ['sparen', 'sparen'], ['sparrate', 'sparen']
]);

const MONATE = MONTHS.map(norm);
function monatAus(v){
  if(typeof v === 'number') return Number.isInteger(v) && v >= 1 && v <= 12 ? v - 1 : null;
  const t = norm(v);
  if(t === '') return null;
  if(/^\d+( 0+)?$/.test(t)){
    const z = parseInt(t, 10);
    return z >= 1 && z <= 12 ? z - 1 : null;
  }
  if(t.length < 3) return null;
  let i = MONATE.indexOf(t);
  if(i < 0) i = MONATE.findIndex(m => m.indexOf(t) === 0);        // "jan", "sept"
  if(i < 0 && t === 'mrz') i = 2;
  return i < 0 ? null : i;
}
function jahrAus(v){
  const z = typeof v === 'number' ? v : (/^\d{4}([.,]0+)?$/.test(String(v).trim()) ? parseInt(v, 10) : NaN);
  return Number.isInteger(z) && z >= 2000 && z <= 2100 ? z : null;
}
// Liefert Cent, 'leer', 'minus' oder null (nicht lesbar).
function betragAus(v){
  let euro;
  if(typeof v === 'number') euro = v;
  else {
    let t = String(v === undefined || v === null ? '' : v).replace(/[\s €]/g, '').replace(/EUR$/i, '');
    if(t === '') return 'leer';
    const minus = /^-|-$|^\(.*\)$/.test(t);
    t = t.replace(/[-()+]/g, '');
    if(t.indexOf(',') > -1 && t.indexOf('.') > -1){
      // Das letzte der beiden Zeichen ist das Dezimalzeichen.
      t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    } else if(t.indexOf(',') > -1){
      t = t.replace(',', '.');
    } else if(/^\d{1,3}(\.\d{3})+$/.test(t)){
      t = t.replace(/\./g, '');
    }
    if(!/^\d+(\.\d+)?$/.test(t)) return null;
    euro = Number(t) * (minus ? -1 : 1);
  }
  if(!Number.isFinite(euro)) return null;
  if(euro < 0) return 'minus';
  return Math.round(euro * 100);
}

function deute(zeilen){
  const fehler = [];
  // Kopfzeile: die erste Zeile, in der "Jahr" und "Monat" stehen.
  let kopfIdx = -1, sp = null;
  for(let i = 0; i < Math.min(zeilen.length, 15); i++){
    const z = zeilen[i].zellen.map(norm);
    if(z.indexOf('jahr') > -1 && z.indexOf('monat') > -1){
      kopfIdx = i;
      sp = {};
      SPALTEN.forEach(s => { sp[s] = z.indexOf(s); });
      if(sp.betrag < 0) sp.betrag = z.findIndex(x => /^betrag/.test(x));
      if(sp.bezeichnung < 0) sp.bezeichnung = z.findIndex(x => x === 'name' || x === 'beschreibung' || x === 'text');
      break;
    }
  }
  if(!sp) return { fehlerText: 'Die Überschriften fehlen. Erwartet werden: Jahr, Monat, Bereich, Kategorie, Bezeichnung, Betrag.' };
  if(sp.betrag < 0) return { fehlerText: 'Die Spalte „Betrag“ fehlt.' };
  if(sp.bereich < 0 && sp.kategorie < 0) return { fehlerText: 'Die Spalte „Bereich“ fehlt.' };

  const monate = new Map();
  const zelle = (z, s) => sp[s] >= 0 ? z.zellen[sp[s]] : '';
  let gelesen = 0;

  for(let i = kopfIdx + 1; i < zeilen.length; i++){
    const z = zeilen[i];
    if(!z.zellen.some(c => c !== undefined && String(c).trim() !== '')) continue;   // Leerzeile
    if(gelesen >= MAX_ZEILEN){ fehler.push({ nr: z.nr, grund: 'mehr als ' + MAX_ZEILEN + ' Zeilen — Rest nicht gelesen' }); break; }
    gelesen++;
    const mist = grund => fehler.push({ nr: z.nr, grund });

    const jahr = jahrAus(zelle(z, 'jahr'));
    if(jahr === null){ mist('Jahr fehlt oder ungültig (2000–2100)'); continue; }
    const mi = monatAus(zelle(z, 'monat'));
    if(mi === null){ mist('Monat fehlt oder ungültig (1–12 oder Name)'); continue; }

    const bRoh = norm(zelle(z, 'bereich'));
    const kRoh = norm(zelle(z, 'kategorie'));
    let bereich = BEREICHE.get(bRoh) || null;
    let kat = KATEGORIEN.get(kRoh) || null;
    // Nachsichtig: Kategorie in der Spalte "Bereich" oder Bereich leer.
    if(!bereich && KATEGORIEN.has(bRoh)){ bereich = 'ausgabe'; kat = kat || KATEGORIEN.get(bRoh); }
    if(!bereich && bRoh === '' && kat) bereich = 'ausgabe';
    if(!bereich){ mist(bRoh === '' ? 'Bereich fehlt' : 'Bereich unbekannt („' + String(zelle(z, 'bereich')).trim().slice(0, 30) + '“)'); continue; }
    if(bereich === 'ausgabe' && !kat){
      mist(kRoh === '' ? 'Kategorie fehlt' : 'Kategorie unbekannt („' + String(zelle(z, 'kategorie')).trim().slice(0, 30) + '“)');
      continue;
    }

    const cents = betragAus(zelle(z, 'betrag'));
    if(cents === 'leer'){ mist('Betrag fehlt'); continue; }
    if(cents === 'minus' || cents === 0){ mist('Betrag muss größer als 0 sein'); continue; }
    if(cents === null){ mist('Betrag nicht lesbar'); continue; }
    if(cents > AMOUNT_MAX_CENTS){ mist('Betrag zu groß'); continue; }

    const key = monthKey(jahr, mi);
    if(!monate.has(key)){
      const categories = {};
      categoryDefs.forEach(d => { categories[d.key] = []; });
      monate.set(key, { key, year: jahr, monthIndex: mi, salary: null, fixkosten: [], categories, sparen: [], zuViel: 0 });
    }
    const m = monate.get(key);
    const name = String(zelle(z, 'bezeichnung') === undefined ? '' : zelle(z, 'bezeichnung')).trim().slice(0, MAX_TEXT_LENGTH);

    if(bereich === 'gehalt') m.salary = (m.salary || 0) + cents;
    else if(bereich === 'fix'){
      if(m.fixkosten.length >= MAX_FIXKOSTEN) m.zuViel++;
      else m.fixkosten.push({ name: name || 'Ohne Bezeichnung', cents });
    }
    else if(bereich === 'sparen'){
      if(m.sparen.length >= MAX_ENTRIES_PER_KEY) m.zuViel++;
      else m.sparen.push({ cents });
    }
    else {
      if(m.categories[kat].length >= MAX_ENTRIES_PER_KEY) m.zuViel++;
      else m.categories[kat].push({ name: name || KAT_NAME[kat], cents });
    }
  }
  const liste = Array.from(monate.values()).sort((a, b) => a.key < b.key ? -1 : 1);
  return { monate: liste, fehler };
}

/* ---------------------------------------------------------------------------
   Monat für die App aufbauen (immer durch den Prüfrichter)
   --------------------------------------------------------------------------- */
function baue(m){
  const alt = allData.monthEntries[m.key] || null;
  const fix = m.fixkosten.length ? m.fixkosten
    : fixkostenVorlage().map(f => ({ name: f.name, cents: f.cents }));
  const saving = {};
  savingDefs.forEach(d => { saving[d.key] = []; });
  saving.sparen = m.sparen;
  const data = {
    salary: m.salary,
    fixkosten: fix,
    checked: fix.map(() => true),
    categories: m.categories,
    saving
  };
  if(alt){
    // Forecast, Notiz und Kreditkarte des vorhandenen Monats bleiben.
    ['forecast', 'forecastNote', 'forecastItems', 'card', 'lastEntryAt'].forEach(k => { data[k] = alt.data[k]; });
  }
  const jetzt = Date.now();
  return sanitizeMonthEntry(alt
    ? { year: m.year, monthIndex: m.monthIndex, status: alt.status, createdAt: alt.createdAt,
        closedAt: alt.closedAt, warAbgeschlossen: alt.warAbgeschlossen, data }
    : { year: m.year, monthIndex: m.monthIndex, status: 'closed', createdAt: jetzt, closedAt: jetzt, data });
}

const summe = liste => liste.reduce((s, e) => s + e.cents, 0);

/* ---------------------------------------------------------------------------
   Vorschau
   --------------------------------------------------------------------------- */
let offen = null;   // { monate, fehler, ersetzen }

function schliesse(){
  offen = null;
  closeOverlay(overlay, document.querySelector('label[for="xls-file"]'));
}

function zeigeVorschau(){
  const { monate, fehler } = offen;
  bodyEl.textContent = '';
  const vorhanden = monate.filter(m => allData.monthEntries[m.key]);
  const neu = monate.length - vorhanden.length;

  bodyEl.appendChild(h('p', 'xls-kopf',
    monate.length + (monate.length === 1 ? ' Monat' : ' Monate') + ' gefunden' +
    (vorhanden.length ? ' · ' + neu + ' neu, ' + vorhanden.length + ' schon vorhanden' : '')));

  const liste = h('div', 'xls-liste');
  monate.forEach(m => {
    const gibtEs = !!allData.monthEntries[m.key];
    const box = h('div', 'xls-monat');
    const kopf = h('div', 'xls-monat-kopf');
    kopf.appendChild(h('span', 'xls-monat-name', MONTHS[m.monthIndex] + ' ' + m.year));
    kopf.appendChild(h('span', 'xls-marke' + (gibtEs ? ' da' : ''), gibtEs ? 'vorhanden' : 'neu'));
    box.appendChild(kopf);
    const zeile = (label, wert) => {
      const l = h('div', 'xls-zeile');
      l.appendChild(h('span', '', label));
      l.appendChild(h('span', 'xls-wert', wert));
      box.appendChild(l);
    };
    let ausgaben = 0, posten = m.fixkosten.length + m.sparen.length;
    categoryDefs.forEach(d => {
      ausgaben += (d.key === 'aufloesung' ? -1 : 1) * summe(m.categories[d.key]);
      posten += m.categories[d.key].length;
    });
    zeile('Gehalt', m.salary === null ? '–' : formatCents(m.salary));
    zeile('Fixkosten', m.fixkosten.length ? formatCents(summe(m.fixkosten)) : 'aus deiner Vorlage');
    zeile('Ausgaben', formatCents(ausgaben));
    zeile('Sparen', formatCents(summe(m.sparen)));
    zeile('Posten', String(posten));
    if(m.salary !== null && (m.salary < SALARY_MIN_CENTS || m.salary > SALARY_MAX_CENTS)){
      box.appendChild(h('p', 'xls-hinweis', 'Gehalt wird auf den erlaubten Bereich ' +
        formatCents(SALARY_MIN_CENTS) + ' bis ' + formatCents(SALARY_MAX_CENTS) + ' gesetzt.'));
    }
    if(m.zuViel){
      box.appendChild(h('p', 'xls-hinweis', m.zuViel + ' Posten über der Höchstzahl werden nicht übernommen.'));
    }
    liste.appendChild(box);
  });
  bodyEl.appendChild(liste);

  if(fehler.length){
    const det = h('details', 'xls-fehler');
    det.appendChild(h('summary', '', fehler.length + (fehler.length === 1 ? ' Zeile wird' : ' Zeilen werden') + ' nicht übernommen'));
    fehler.slice(0, 40).forEach(f => det.appendChild(h('p', 'xls-fehler-zeile', 'Zeile ' + f.nr + ': ' + f.grund)));
    if(fehler.length > 40) det.appendChild(h('p', 'xls-fehler-zeile', '… und ' + (fehler.length - 40) + ' weitere'));
    det.open = fehler.length <= 8;
    bodyEl.appendChild(det);
  }

  if(vorhanden.length){
    bodyEl.appendChild(h('p', 'xls-frage', 'Schon vorhandene Monate:'));
    const wahl = h('div', 'xls-wahl');
    [['skip', 'Überspringen'], ['replace', 'Ersetzen']].forEach(([wert, text]) => {
      const b = h('button', 'xls-wahl-btn', text);
      b.type = 'button';
      b.dataset.wahl = wert;
      b.setAttribute('aria-pressed', String((wert === 'replace') === offen.ersetzen));
      b.addEventListener('click', () => { offen.ersetzen = wert === 'replace'; zeigeVorschau(); });
      wahl.appendChild(b);
    });
    bodyEl.appendChild(wahl);
    if(offen.ersetzen){
      bodyEl.appendChild(h('p', 'xls-hinweis', 'Die bisherigen Posten dieser Monate werden durch die Datei ersetzt. Forecast und Kreditkarte bleiben.'));
    }
  }

  const anzahl = offen.ersetzen ? monate.length : neu;
  const knoepfe = h('div', 'xls-knoepfe');
  const ab = h('button', 'xls-btn', 'Abbrechen');
  ab.type = 'button';
  ab.id = 'xls-abbrechen';
  ab.addEventListener('click', schliesse);
  const ok = h('button', 'xls-btn primary', anzahl ? anzahl + (anzahl === 1 ? ' Monat' : ' Monate') + ' übernehmen' : 'Nichts zu übernehmen');
  ok.type = 'button';
  ok.id = 'xls-ok';
  ok.disabled = anzahl === 0;
  ok.addEventListener('click', uebernehme);
  knoepfe.appendChild(ab);
  knoepfe.appendChild(ok);
  bodyEl.appendChild(knoepfe);
}

function uebernehme(){
  if(!offen) return;
  const { monate, ersetzen } = offen;
  let dazu = 0, ersetzt = 0, belassen = 0;
  const neueZahl = monate.filter(m => !allData.monthEntries[m.key]).length;
  if(Object.keys(allData.monthEntries).length + neueZahl > MAX_MONTH_ENTRIES){
    schliesse();
    melde('Zu viele Monate (höchstens ' + MAX_MONTH_ENTRIES + ').', true);
    return;
  }
  monate.forEach(m => {
    const gibtEs = !!allData.monthEntries[m.key];
    if(gibtEs && !ersetzen){ belassen++; return; }
    const eintrag = baue(m);
    if(!eintrag) return;
    allData.monthEntries[m.key] = eintrag;
    if(gibtEs) ersetzt++; else dazu++;
  });
  setAllData(allData);
  saveAll(true);
  schliesse();
  showOverview();
  const teile = [];
  if(dazu) teile.push(dazu + (dazu === 1 ? ' Monat' : ' Monate') + ' neu angelegt');
  if(ersetzt) teile.push(ersetzt + ' ersetzt');
  if(belassen) teile.push(belassen + ' übersprungen');
  melde(teile.join(', ') + '.', false);
}

/* ---------------------------------------------------------------------------
   Dateiwahl
   --------------------------------------------------------------------------- */
const FEHLERTEXT = {
  'kein-zip': 'Diese Datei ist keine gültige Excel-Datei (.xlsx).',
  'kein-xlsx': 'Diese Datei ist keine gültige Excel-Datei (.xlsx).',
  'zu-gross': 'Die Datei ist zu groß.',
  'kein-entpacker': 'Dieser Browser kann .xlsx nicht lesen. Bitte in Excel als „CSV UTF-8“ speichern und diese Datei einlesen.'
};

fileEl.addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';   // erlaubt erneutes Auswählen derselben Datei
  if(!file) return;
  melde('', false);
  if(file.size > MAX_IMPORT_BYTES){ melde('Datei ist zu groß (max. 2 MB).', true); return; }
  try{
    const buf = await file.arrayBuffer();
    const kopf = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    const istZip = kopf[0] === 0x50 && kopf[1] === 0x4b;
    if(!istZip && /\.xls$/i.test(file.name)){
      melde('Das alte Format .xls wird nicht gelesen. Bitte als .xlsx oder „CSV UTF-8“ speichern.', true);
      return;
    }
    const zeilen = istZip ? await leseXlsx(buf) : leseCsv(buf);
    const erg = deute(zeilen);
    if(erg.fehlerText){ melde(erg.fehlerText, true); return; }
    if(!erg.monate.length){
      melde(erg.fehler.length
        ? 'Keine gültige Zeile gefunden. Erste Meldung: Zeile ' + erg.fehler[0].nr + ': ' + erg.fehler[0].grund + '.'
        : 'Die Datei enthält keine Posten.', true);
      return;
    }
    offen = { monate: erg.monate, fehler: erg.fehler, ersetzen: false };
    zeigeVorschau();
    openOverlay(overlay, closeBtn);
  }catch(err){
    melde(FEHLERTEXT[err && err.message] || 'Die Datei konnte nicht gelesen werden.', true);
  }
});

closeBtn.addEventListener('click', schliesse);
overlay.addEventListener('click', e => { if(e.target === overlay) schliesse(); });
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && !overlay.hidden) schliesse();
});
