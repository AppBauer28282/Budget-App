/* =============================================================================
   JAHRESZIELE (Unter-App, Kachel ganz unten)
   Kategorien mit Zielen: Start-, Ziel- und aktueller Wert, optionale
   Zwischenziele, Füllgrad und Verlauf.

   Füllgrad eines Ziels:
   - ohne Zwischenziele steigt er gleichmäßig vom Start zum Ziel,
   - mit Zwischenzielen zählt der Anteil der erreichten Stufen
     (Zwischenziele + Endziel),
   - Ziele "nach unten" (z. B. Gewicht) funktionieren genauso.
   Kategorie und Gesamt sind jeweils der Durchschnitt ihrer Ziele.

   Im Quellcode stehen keine Ziele — die App startet leer. Daten liegen im
   Gerätespeicher und (nach dem PIN-Login) in einem eigenen Cloud-Dokument,
   siehe js/cloud-sync.js. Alles, was aus Speicher, Cloud oder einer Datei
   kommt, läuft durch pruefe(). Die Oberfläche entsteht ausschließlich per
   DOM-API und textContent.
   ============================================================================= */
import { openAppScreen, closeAppScreen, openOverlay, closeOverlay } from './overlays.js?v=61';

const $ = (id) => document.getElementById(id);
const jzBtn      = $('jahresziele-btn');
const jzOverlay  = $('jahresziele-overlay');
const jzClose    = $('jahresziele-close');
const jzApp      = $('jz-app');
const jzWarn     = $('jz-warn');
const jzMsg      = $('jz-msg');
const jzFile     = $('jz-file');
const jzWidget   = $('jz-widget');
const dlg        = $('jz-dialog');
const dlgTitel   = $('jz-dialog-title');
const dlgClose   = $('jz-dialog-close');
const dlgBody    = $('jz-dialog-body');
const homeScreenEl = $('home-screen');

const STORE_KEY = 'jahresziele.v1';
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const FARBEN = ['#0A84FF', '#30B158', '#FF9500', '#FF2D55', '#AF52DE', '#30B0C7', '#5E5CE6', '#FF3B30'];
const FARB_NAMEN = ['Blau', 'Grün', 'Orange', 'Pink', 'Lila', 'Türkis', 'Indigo', 'Rot'];
const EINHEITEN = ['Anzahl', 'kg', '€', 'km', '%', 'Stunden', 'Tage'];
const MAX_KATEGORIEN = 30, MAX_ZIELE = 50, MAX_STUFEN = 8, MAX_VERLAUF = 400;
const MAX_ZAHL = 1e9;
const NS = 'http://www.w3.org/2000/svg';

let state = leererStand();
let storageOk = true;
let saveTimer = null;
let msgTimer = null;
let dialogNeu = null;   // zeichnet die gerade offene Dialog-Ansicht neu

function leererStand(){ return { v: 1, year: new Date().getFullYear(), cats: [] }; }

/* ---------- kleine Helfer ---------- */
function el(tag, cls, text){
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text !== undefined && text !== null) n.textContent = text;
  return n;
}
function knopf(cls, text, onClick){
  const b = el('button', cls, text);
  b.type = 'button';
  if(onClick) b.addEventListener('click', onClick);
  return b;
}
function svg(tag, attrs){
  const n = document.createElementNS(NS, tag);
  Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k]));
  return n;
}
function neueId(p){ return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
const r2 = (n) => Math.round(n * 100) / 100;
const istZahl = (n) => typeof n === 'number' && isFinite(n);
function fmt(n){ return istZahl(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '–'; }
function fmtU(n, u){
  if(!u || u === 'Anzahl') return fmt(n);
  return fmt(n) + (u === '%' ? ' %' : ' ' + u);
}
function parseNum(s){
  s = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if(!s) return NaN;
  if(s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if(!/^-?\d*\.?\d+$/.test(s)) return NaN;
  const n = parseFloat(s);
  return Math.abs(n) > MAX_ZAHL ? NaN : n;
}
function inputVal(n){ return istZahl(n) ? String(r2(n)).replace('.', ',') : ''; }
const isInt = (n) => Math.abs(n - Math.round(n)) < 1e-9;
const pct = (f) => Math.round(f * 100) + ' %';

/* ---------- Rechnen (aus der Vorlage übernommen) ---------- */
function stufen(g){
  const dir = g.target >= g.start ? 1 : -1;
  const ms = (g.ms || []).slice().sort((a, b) => dir * (a - b));
  return ms.concat([g.target]);
}
function erreicht(g, v){ return g.target >= g.start ? g.current >= v - 1e-9 : g.current <= v + 1e-9; }
function fuellgrad(g){
  if(g.start === g.target) return erreicht(g, g.target) ? 1 : 0;
  if(!g.ms || !g.ms.length){
    const f = (g.current - g.start) / (g.target - g.start);
    return Math.max(0, Math.min(1, f));
  }
  const st = stufen(g);
  let n = 0;
  for(let i = 0; i < st.length; i++) if(erreicht(g, st[i])) n++;
  return n / st.length;
}
function schnitt(liste){
  if(!liste.length) return 0;
  let s = 0;
  liste.forEach(g => { s += fuellgrad(g); });
  return s / liste.length;
}
function genMs(start, target, n){
  const a = [];
  for(let i = 1; i <= n; i++) a.push(r2(start + (target - start) * i / (n + 1)));
  return a;
}
function defaultMsCount(start, target){
  const d = Math.abs(target - start);
  if(isInt(start) && isInt(target) && d <= 6) return Math.max(0, d - 1);
  return 3;
}
function schrittweite(g){
  const d = Math.abs(g.target - g.start);
  if(d >= 2000) return 100;
  if(d >= 200) return 10;
  if(d >= 20) return 1;
  const ganz = isInt(g.start) && isInt(g.target) && (g.ms || []).every(isInt);
  return ganz ? 1 : 0.1;
}
function alleZiele(){
  const a = [];
  state.cats.forEach(c => c.goals.forEach(g => a.push(g)));
  return a;
}
const tagVon = (t) => new Date(t).toDateString();
function setzeStand(g, v){
  v = Math.max(-MAX_ZAHL, Math.min(MAX_ZAHL, r2(v)));
  g.current = v;
  const jetzt = new Date();
  const letzter = g.log[g.log.length - 1];
  if(letzter && tagVon(letzter.t) === tagVon(jetzt)){
    letzter.v = v;
    letzter.t = jetzt.toISOString();
  } else {
    g.log.push({ t: jetzt.toISOString(), v: v });
  }
  if(g.log.length > MAX_VERLAUF) g.log = g.log.slice(-MAX_VERLAUF);
}
function jahrInfo(jahr){
  const jetzt = new Date();
  const start = new Date(jahr, 0, 1), ende = new Date(jahr + 1, 0, 1);
  const tage = (n) => n + (n === 1 ? ' Tag' : ' Tage');
  if(jetzt < start) return { f: 0, text: 'Startet in ' + tage(Math.ceil((start - jetzt) / 864e5)) };
  if(jetzt >= ende) return { f: 1, text: 'Jahr ist vorbei' };
  const f = (jetzt - start) / (ende - start);
  return { f: f, text: pct(f) + ' des Jahres vorbei, noch ' + tage(Math.ceil((ende - jetzt) / 864e5)) };
}

/* ---------- Prüfrichter für Speicher, Cloud und Datei ---------- */
function text(v, max){
  if(typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}
function zahl(v){
  return (istZahl(v) && Math.abs(v) <= MAX_ZAHL) ? r2(v) : null;
}
function pruefeStufen(roh, start, target){
  if(!Array.isArray(roh)) return [];
  const lo = Math.min(start, target), hi = Math.max(start, target);
  const dir = target >= start ? 1 : -1;
  const gesehen = new Set();
  const a = [];
  roh.forEach(v => {
    const n = zahl(v);
    if(n === null || n <= lo || n >= hi || gesehen.has(n)) return;
    gesehen.add(n);
    a.push(n);
  });
  return a.sort((x, y) => dir * (x - y)).slice(0, MAX_STUFEN);
}
function pruefe(roh){
  if(!roh || typeof roh !== 'object' || Array.isArray(roh) || !Array.isArray(roh.cats)) return null;
  const ids = new Set();
  const id = (v, p) => {
    let s = (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)) ? v : neueId(p);
    while(ids.has(s)) s = neueId(p);
    ids.add(s);
    return s;
  };
  const jahr = Number(roh.year);
  const out = {
    v: 1,
    year: (Number.isInteger(jahr) && jahr >= 2000 && jahr <= 2100) ? jahr : new Date().getFullYear(),
    cats: []
  };
  roh.cats.slice(0, MAX_KATEGORIEN).forEach(c => {
    if(!c || typeof c !== 'object') return;
    const name = text(c.name, 40);
    if(!name) return;
    const kat = {
      id: id(c.id, 'k'),
      name: name,
      color: FARBEN.includes(c.color) ? c.color : FARBEN[0],
      collapsed: c.collapsed === true,
      goals: []
    };
    (Array.isArray(c.goals) ? c.goals : []).slice(0, MAX_ZIELE).forEach(g => {
      if(!g || typeof g !== 'object') return;
      const titel = text(g.title, 80);
      const start = zahl(g.start), target = zahl(g.target);
      if(!titel || start === null || target === null) return;
      const current = zahl(g.current);
      const log = [];
      (Array.isArray(g.log) ? g.log : []).forEach(e => {
        if(!e || typeof e !== 'object') return;
        const v = zahl(e.v);
        const t = typeof e.t === 'string' ? Date.parse(e.t) : NaN;
        if(v === null || !isFinite(t)) return;
        log.push({ t: new Date(t).toISOString(), v: v });
      });
      kat.goals.push({
        id: id(g.id, 'z'),
        title: titel,
        unit: text(g.unit, 12) || 'Anzahl',
        start: start,
        target: target,
        current: current === null ? start : current,
        ms: pruefeStufen(g.ms, start, target),
        log: log.slice(-MAX_VERLAUF)
      });
    });
    out.cats.push(kat);
  });
  return out;
}
function applyData(roh){
  const sauber = pruefe(roh);
  if(!sauber) return false;
  state = sauber;
  return true;
}

/* ---------- Speichern ---------- */
function zeigeWarnung(){
  if(!jzWarn) return;
  jzWarn.replaceChildren();
  jzWarn.hidden = storageOk;
  if(!storageOk){
    jzWarn.appendChild(el('div', 'jz-warn',
      'Der Gerätespeicher ist nicht verfügbar. Änderungen gehen beim Schließen verloren — bitte über „Sichern“ als Datei speichern.'));
  }
}
function writeNow(){
  renderWidget();
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
    storageOk = true;
    zeigeWarnung();
  }catch(e){
    storageOk = false;
    zeigeWarnung();
    return false;
  }
  if(typeof window.__onJahreszieleLocalSave === 'function'){
    try{ window.__onJahreszieleLocalSave(state); }catch(e){ /* nächste Änderung versucht es erneut */ }
  }
  return true;
}
function sichern(){
  renderWidget();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 250);
}
function flush(){
  if(saveTimer !== null){
    clearTimeout(saveTimer);
    saveTimer = null;
    writeNow();
  }
}
function load(){
  let roh = null;
  try{
    roh = localStorage.getItem(STORE_KEY);
  }catch(e){
    storageOk = false;
    return;
  }
  if(!roh) return;
  try{ applyData(JSON.parse(roh)); }catch(e){ /* unlesbar: leer starten */ }
}
function melde(t){
  if(!jzMsg) return;
  jzMsg.textContent = t;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { jzMsg.textContent = ''; }, 4000);
}

/* ---------- Bausteine ---------- */
// Ring aus zwei Kreisen; die Farbe des Fortschritts ist die Kategoriefarbe
// (nur aus der festen Liste), Spur und Text kommen aus styles.css.
function ring(groesse, dicke, f, farbe, innen){
  const r = (groesse - dicke) / 2, m = groesse / 2, u = 2 * Math.PI * r;
  const wrap = el('span', 'jz-ring');
  wrap.style.width = groesse + 'px';
  wrap.style.height = groesse + 'px';
  const s = svg('svg', { viewBox: '0 0 ' + groesse + ' ' + groesse, width: groesse, height: groesse, 'aria-hidden': 'true', focusable: 'false' });
  s.appendChild(svg('circle', { cx: m, cy: m, r: r, fill: 'none', 'stroke-width': dicke, class: 'jz-ring-spur' }));
  if(f > 0){
    const w = svg('circle', { cx: m, cy: m, r: r, fill: 'none', 'stroke-width': dicke, 'stroke-linecap': 'round',
      'stroke-dasharray': (u * Math.min(1, f)).toFixed(2) + ' ' + u.toFixed(2),
      transform: 'rotate(-90 ' + m + ' ' + m + ')', class: 'jz-ring-wert' });
    w.style.stroke = farbe;
    s.appendChild(w);
  }
  wrap.appendChild(s);
  const mitte = el('span', 'jz-ring-mitte');
  (innen || []).forEach(n => mitte.appendChild(n));
  wrap.appendChild(mitte);
  return wrap;
}
function balken(f, farbe, cls){
  const spur = el('span', 'jz-track' + (cls ? ' ' + cls : ''));
  const fuell = el('span', 'jz-fill');
  fuell.style.width = (Math.max(0, Math.min(1, f)) * 100).toFixed(1) + '%';
  if(farbe) fuell.style.backgroundColor = farbe;
  spur.appendChild(fuell);
  return spur;
}
// Ein Segment je Stufe; ohne Zwischenziele ein durchgehender Balken.
function segmente(g, farbe){
  if(!g.ms.length) return balken(fuellgrad(g), farbe, 'duenn');
  const box = el('span', 'jz-segs');
  stufen(g).forEach(v => {
    const s = el('span', 'jz-seg' + (erreicht(g, v) ? ' voll' : ''));
    if(erreicht(g, v)) s.style.backgroundColor = farbe;
    box.appendChild(s);
  });
  return box;
}
function zielErreicht(g){ return erreicht(g, g.target); }

/* ---------- Widget auf der Startseite ---------- */
function renderWidget(){
  if(!jzWidget) return;
  const ziele = alleZiele();
  const frag = document.createDocumentFragment();
  if(!ziele.length){
    frag.appendChild(el('span', 'jzw-leer', 'Noch keine Ziele angelegt.'));
    jzWidget.replaceChildren(frag);
    if(jzBtn) jzBtn.setAttribute('aria-label', 'Jahresziele öffnen');
    return;
  }
  const kreise = el('span', 'jzw-kreise');
  state.cats.forEach(c => {
    const f = schnitt(c.goals);
    const k = el('span', 'jzw-kreis');
    k.dataset.pct = String(Math.round(f * 100));
    k.dataset.farbe = c.color;
    k.append(ring(46, 5, f, c.color, [el('span', 'jzw-pct', String(Math.round(f * 100)))]), el('span', 'jzw-name', c.name));
    kreise.appendChild(k);
  });
  frag.appendChild(kreise);

  const gesamt = schnitt(ziele);
  const fertig = ziele.filter(zielErreicht).length;
  const box = el('span', 'jzw-gesamt');
  const zeile = el('span', 'jzw-zeile');
  zeile.append(el('span', 'jzw-text', fertig + ' von ' + ziele.length + (ziele.length === 1 ? ' Ziel' : ' Zielen') + ' erreicht'),
    el('span', 'jzw-gesamt-pct', pct(gesamt)));
  const spur = balken(gesamt, null, 'jzw-track');
  spur.dataset.pct = String(Math.round(gesamt * 100));
  box.append(zeile, spur);
  frag.appendChild(box);
  jzWidget.replaceChildren(frag);
  if(jzBtn){
    jzBtn.setAttribute('aria-label', 'Jahresziele öffnen. ' + fertig + ' von ' + ziele.length +
      ' Zielen erreicht, Füllgrad ' + pct(gesamt) + '.');
  }
}

/* ---------- Hauptansicht ---------- */
function render(){
  if(!jzApp) return;
  const frag = document.createDocumentFragment();

  const kopf = el('div', 'jz-kopf');
  const jahrBtn = knopf('jz-btn jz-jahr', state.year + ' ▾', zeigeJahr);
  jahrBtn.id = 'jz-jahr-btn';
  jahrBtn.setAttribute('aria-label', 'Jahr ändern, aktuell ' + state.year);
  const neuKat = knopf('jz-btn primary', '+ Kategorie', () => zeigeKategorie(null));
  neuKat.id = 'jz-kat-neu';
  kopf.append(jahrBtn, neuKat);
  frag.appendChild(kopf);

  // Zusammenfassung
  const ziele = alleZiele();
  const gesamt = schnitt(ziele);
  const fertig = ziele.filter(zielErreicht).length;
  const sum = el('div', 'jz-karte jz-summe');
  sum.id = 'jz-summe';
  sum.dataset.pct = String(Math.round(gesamt * 100));
  const sumText = el('div', 'jz-summe-text');
  sumText.append(
    el('div', 'jz-summe-zahl', fertig + ' von ' + ziele.length + (ziele.length === 1 ? ' Ziel' : ' Zielen') + ' erreicht'),
    el('div', 'jz-klein', 'Füllgrad über alle Ziele'));
  const ji = jahrInfo(state.year);
  const jahrBox = el('div', 'jz-jahrbox');
  jahrBox.append(balken(ji.f, null, 'duenn jahr'), el('div', 'jz-klein', ji.text));
  sumText.appendChild(jahrBox);
  sum.append(ring(92, 9, gesamt, 'var(--brass)', [el('span', 'jz-ring-zahl', pct(gesamt))]), sumText);
  frag.appendChild(sum);

  if(!state.cats.length){
    const leer = el('div', 'jz-karte jz-leer');
    leer.append(el('div', 'jz-leer-titel', 'Noch keine Kategorie'),
      el('div', 'jz-klein', 'Lege zuerst eine Kategorie an, zum Beispiel „Gesundheit“ oder „Finanzen“. Darin sammelst du deine Ziele für das Jahr.'));
    frag.appendChild(leer);
  }

  state.cats.forEach(c => {
    const f = schnitt(c.goals);
    const karte = el('div', 'jz-karte jz-kat');
    karte.dataset.id = c.id;
    karte.dataset.pct = String(Math.round(f * 100));
    const kopfZeile = el('div', 'jz-kat-kopf');
    const auf = knopf('jz-kat-auf', null, () => { c.collapsed = !c.collapsed; sichern(); render(); });
    auf.setAttribute('aria-expanded', String(!c.collapsed));
    const punkt = el('span', 'jz-punkt');
    punkt.style.backgroundColor = c.color;
    auf.append(punkt, el('span', 'jz-kat-name', c.name), el('span', 'jz-kat-pct', pct(f)),
      el('span', 'jz-pfeil' + (c.collapsed ? ' zu' : ''), '›'));
    const mehr = knopf('jz-kat-mehr', '⋯', () => zeigeKategorie(c.id));
    mehr.setAttribute('aria-label', 'Kategorie ' + c.name + ' bearbeiten');
    kopfZeile.append(auf, mehr);
    karte.append(kopfZeile, balken(f, c.color));

    if(!c.collapsed){
      const liste = el('div', 'jz-ziele');
      c.goals.forEach(g => {
        const z = knopf('jz-ziel', null, () => zeigeZiel(c.id, g.id));
        z.dataset.id = g.id;
        z.dataset.pct = String(Math.round(fuellgrad(g) * 100));
        const oben = el('span', 'jz-ziel-oben');
        oben.append(el('span', 'jz-ziel-titel', g.title), el('span', 'jz-ziel-pct', pct(fuellgrad(g))));
        z.append(oben, el('span', 'jz-klein jz-ziel-stand', fmtU(g.current, g.unit) + ' von ' + fmtU(g.target, g.unit)),
          segmente(g, c.color));
        liste.appendChild(z);
      });
      if(!c.goals.length) liste.appendChild(el('div', 'jz-klein jz-ohne', 'Noch kein Ziel in dieser Kategorie.'));
      karte.appendChild(liste);
      if(c.goals.length < MAX_ZIELE){
        karte.appendChild(knopf('jz-ziel-neu', '+ Ziel hinzufügen', () => zeigeZielForm(c.id, null)));
      }
    }
    frag.appendChild(karte);
  });

  const datei = el('div', 'jz-datei');
  const exp = knopf('jz-btn', 'Sichern', exportieren);
  exp.id = 'jz-export';
  const imp = knopf('jz-btn', 'Laden', () => jzFile.click());
  imp.id = 'jz-import';
  datei.append(exp, imp);
  frag.append(datei, el('p', 'jz-klein jz-datei-hinweis', '„Sichern“ speichert alle Ziele als Datei, „Laden“ spielt eine solche Datei wieder ein.'));

  jzApp.replaceChildren(frag);
}
function geaendert(){
  sichern();
  render();
  if(dialogNeu && !dlg.hidden) dialogNeu();
}

/* ---------- Dialog-Grundgerüst ---------- */
function dialog(titel, bauen, neuZeichnen){
  dlgTitel.textContent = titel;
  dlgBody.replaceChildren(bauen());
  dialogNeu = neuZeichnen || null;
  if(dlg.hidden) openOverlay(dlg, dlgClose);
}
function dialogZu(){
  dialogNeu = null;
  if(dlg.hidden) return;
  closeOverlay(dlg, null);
  dlgBody.replaceChildren();
}
function feld(labelText, input){
  const l = el('label', 'jz-feld');
  l.append(el('span', 'jz-feld-label', labelText), input);
  return l;
}
function eingabe(id, wert, dezimal){
  const i = document.createElement('input');
  i.type = 'text';
  i.id = id;
  i.value = wert;
  i.autocomplete = 'off';
  if(dezimal) i.inputMode = 'decimal';
  return i;
}
function findeKat(id){ return state.cats.find(c => c.id === id) || null; }
function findeZiel(katId, zielId){
  const c = findeKat(katId);
  const g = c ? c.goals.find(x => x.id === zielId) : null;
  return g ? { c: c, g: g } : null;
}
function frage(titel, satz, jaText, beiJa, zurueck){
  dialog(titel, () => {
    const b = el('div', 'jz-form');
    b.appendChild(el('p', 'jz-frage', satz));
    const z = el('div', 'jz-aktionen');
    const nein = knopf('jz-btn', 'Abbrechen', zurueck || dialogZu);
    const ja = knopf('jz-btn gefahr-voll', jaText, beiJa);
    ja.id = 'jz-ja';
    z.append(nein, ja);
    b.appendChild(z);
    return b;
  });
}

/* ---------- Ziel-Detail ---------- */
function verlaufsLinie(g, farbe){
  const pkt = g.log.slice(-60);
  const W = 300, H = 84, pl = 6, pr = 6, pt = 10, pb = 10;
  const werte = pkt.map(e => e.v).concat([g.target, g.start]);
  let lo = Math.min(...werte), hi = Math.max(...werte);
  if(hi - lo < 1e-9){ hi += 1; lo -= 1; }
  const x = (i) => pl + (pkt.length === 1 ? 0 : i * (W - pl - pr) / (pkt.length - 1));
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'jz-spark', role: 'img' });
  s.appendChild(svg('title')).textContent = 'Verlauf von ' + g.title + ', gestrichelt das Ziel';
  s.appendChild(svg('line', { x1: pl, y1: y(g.target).toFixed(1), x2: W - pr, y2: y(g.target).toFixed(1), class: 'jz-spark-ziel' }));
  const linie = svg('polyline', { points: pkt.map((e, i) => x(i).toFixed(1) + ',' + y(e.v).toFixed(1)).join(' '), fill: 'none', class: 'jz-spark-linie' });
  linie.style.stroke = farbe;
  s.appendChild(linie);
  const letzter = pkt[pkt.length - 1];
  const p = svg('circle', { cx: x(pkt.length - 1).toFixed(1), cy: y(letzter.v).toFixed(1), r: 3.5 });
  p.style.fill = farbe;
  s.appendChild(p);
  return s;
}
function zeigeZiel(katId, zielId){
  const neu = () => {
    if(!findeZiel(katId, zielId)){ dialogZu(); return; }
    zeigeZiel(katId, zielId);
  };
  dialog('Ziel', () => {
    const { c, g } = findeZiel(katId, zielId);
    const f = fuellgrad(g);
    const b = el('div', 'jz-detail');
    b.dataset.pct = String(Math.round(f * 100));

    const kat = el('div', 'jz-detail-kat');
    const punkt = el('span', 'jz-punkt');
    punkt.style.backgroundColor = c.color;
    kat.append(punkt, el('span', null, c.name));
    b.append(kat, el('h3', 'jz-detail-titel', g.title));

    const rz = el('div', 'jz-detail-ring');
    rz.appendChild(ring(132, 12, f, c.color, [el('span', 'jz-ring-zahl gross', pct(f)),
      el('span', 'jz-klein', zielErreicht(g) ? 'erreicht' : 'Füllgrad')]));
    b.appendChild(rz);

    const fakten = el('div', 'jz-fakten');
    [['Start', g.start], ['Aktuell', g.current], ['Ziel', g.target]].forEach((p, i) => {
      const k = el('div', 'jz-fakt' + (i === 1 ? ' aktuell' : ''));
      k.append(el('span', 'jz-klein', p[0]), el('span', 'jz-fakt-wert', fmtU(p[1], g.unit)));
      fakten.appendChild(k);
    });
    b.appendChild(fakten);

    // Stand ändern
    b.appendChild(el('div', 'jz-abschnitt', 'Stand aktualisieren'));
    const zeile = el('div', 'jz-stand');
    const schritt = schrittweite(g);
    const ein = eingabe('jz-stand-input', inputVal(g.current), true);
    ein.setAttribute('aria-label', 'Aktueller Stand');
    const fehler = el('p', 'jz-fehler');
    fehler.setAttribute('role', 'alert');
    const setze = (v) => { setzeStand(g, v); geaendert(); };
    const basis = () => { const n = parseNum(ein.value); return isNaN(n) ? g.current : n; };
    const minus = knopf('jz-rund', '−', () => setze(basis() - schritt));
    minus.id = 'jz-minus';
    minus.setAttribute('aria-label', 'Stand um ' + fmt(schritt) + ' verringern');
    const plus = knopf('jz-rund', '+', () => setze(basis() + schritt));
    plus.id = 'jz-plus';
    plus.setAttribute('aria-label', 'Stand um ' + fmt(schritt) + ' erhöhen');
    const ok = knopf('jz-btn primary', 'Sichern', () => {
      const n = parseNum(ein.value);
      if(isNaN(n)){ fehler.textContent = 'Bitte eine Zahl eingeben.'; return; }
      setze(n);
    });
    ok.id = 'jz-stand-ok';
    ein.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); ok.click(); } });
    zeile.append(minus, ein, plus, ok);
    b.append(zeile, fehler);

    // Stufen
    if(g.ms.length){
      b.appendChild(el('div', 'jz-abschnitt', 'Zwischenziele'));
      const liste = el('div', 'jz-stufen');
      const st = stufen(g);
      st.forEach((v, i) => {
        const da = erreicht(g, v);
        const z = knopf('jz-stufe' + (da ? ' erreicht' : ''), null, da ? null : () => setze(v));
        z.disabled = da;
        z.dataset.wert = String(v);
        const hak = el('span', 'jz-haken', da ? '✓' : '');
        if(da) hak.style.backgroundColor = c.color;
        z.append(hak, el('span', 'jz-stufe-wert', fmtU(v, g.unit) + (i === st.length - 1 ? ' · Endziel' : '')),
          el('span', 'jz-klein', da ? 'erreicht' : 'antippen, wenn erreicht'));
        liste.appendChild(z);
      });
      b.append(liste, el('p', 'jz-klein jz-hinweis', 'Jede erreichte Stufe zählt gleich viel für den Füllgrad.'));
    } else {
      b.appendChild(el('p', 'jz-klein jz-hinweis', 'Ohne Zwischenziele steigt der Füllgrad gleichmäßig vom Start zum Ziel.'));
    }

    // Verlauf
    if(g.log.length){
      b.appendChild(el('div', 'jz-abschnitt', 'Verlauf'));
      if(g.log.length >= 2) b.appendChild(verlaufsLinie(g, c.color));
      const vl = el('div', 'jz-verlauf');
      g.log.slice(-5).reverse().forEach(e => {
        const z = el('div', 'jz-verlauf-zeile');
        z.append(el('span', 'jz-klein', new Date(e.t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })),
          el('span', 'jz-verlauf-wert', fmtU(e.v, g.unit)));
        vl.appendChild(z);
      });
      b.appendChild(vl);
    }

    const akt = el('div', 'jz-aktionen');
    const bearb = knopf('jz-btn', 'Bearbeiten', () => zeigeZielForm(katId, zielId));
    bearb.id = 'jz-ziel-bearbeiten';
    const weg = knopf('jz-btn gefahr', 'Löschen', () => frage('Ziel löschen', '„' + g.title + '“ samt Verlauf löschen?', 'Löschen', () => {
      c.goals = c.goals.filter(x => x.id !== zielId);
      dialogZu();
      geaendert();
      melde('Ziel gelöscht.');
    }, () => zeigeZiel(katId, zielId)));
    weg.id = 'jz-ziel-loeschen';
    akt.append(bearb, weg);
    b.appendChild(akt);
    return b;
  }, neu);
}

/* ---------- Ziel anlegen / bearbeiten ---------- */
function zeigeZielForm(katId, zielId){
  const c = findeKat(katId);
  if(!c) return;
  const alt = zielId ? c.goals.find(x => x.id === zielId) : null;
  dialog(alt ? 'Ziel bearbeiten' : 'Neues Ziel', () => {
    const b = el('div', 'jz-form');
    const titel = eingabe('jz-f-titel', alt ? alt.title : '');
    titel.maxLength = 80;
    titel.placeholder = 'z. B. Bücher lesen';
    const einheit = eingabe('jz-f-einheit', alt ? alt.unit : 'Anzahl');
    einheit.maxLength = 12;
    const chips = el('div', 'jz-chips');
    const markiere = () => chips.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.textContent === einheit.value.trim())));
    EINHEITEN.forEach(u => chips.appendChild(knopf('jz-chip', u, () => { einheit.value = u; markiere(); })));
    einheit.addEventListener('input', markiere);
    markiere();
    const start = eingabe('jz-f-start', alt ? inputVal(alt.start) : '', true);
    const ziel = eingabe('jz-f-ziel', alt ? inputVal(alt.target) : '', true);
    const paar = el('div', 'jz-paar');
    paar.append(feld('Startwert', start), feld('Zielwert', ziel));

    // Zwischenziele: Anzahl per Stepper, Werte als Vorschlag (änderbar).
    let anzahl = alt ? alt.ms.length : 0;
    let anzahlGewaehlt = !!alt;
    let werteGeaendert = !!alt && alt.ms.length > 0;
    const msBox = el('div', 'jz-ms-liste');
    const zahlAnz = el('span', 'jz-ms-anzahl');
    const baueMs = (werte) => {
      zahlAnz.textContent = String(anzahl);
      msBox.replaceChildren();
      for(let i = 0; i < anzahl; i++){
        const inp = eingabe('jz-f-ms-' + i, werte && istZahl(werte[i]) ? inputVal(werte[i]) : '', true);
        inp.className = 'jz-f-ms';
        inp.setAttribute('aria-label', 'Zwischenziel ' + (i + 1));
        inp.addEventListener('input', () => { werteGeaendert = true; });
        msBox.appendChild(inp);
      }
    };
    const vorschlag = () => {
      const s = parseNum(start.value), t = parseNum(ziel.value);
      if(isNaN(s) || isNaN(t) || s === t){ baueMs(null); return; }
      if(!anzahlGewaehlt) anzahl = Math.min(MAX_STUFEN, defaultMsCount(s, t));
      baueMs(genMs(s, t, anzahl));
    };
    const beiWertwechsel = () => { if(!werteGeaendert) vorschlag(); };
    start.addEventListener('change', beiWertwechsel);
    ziel.addEventListener('change', beiWertwechsel);
    const stepper = el('div', 'jz-stepper');
    const wen = knopf('jz-rund', '−', () => { if(anzahl > 0){ anzahl--; anzahlGewaehlt = true; werteGeaendert = false; vorschlag(); } });
    wen.id = 'jz-ms-minus';
    wen.setAttribute('aria-label', 'Ein Zwischenziel weniger');
    const meh = knopf('jz-rund', '+', () => { if(anzahl < MAX_STUFEN){ anzahl++; anzahlGewaehlt = true; werteGeaendert = false; vorschlag(); } });
    meh.id = 'jz-ms-plus';
    meh.setAttribute('aria-label', 'Ein Zwischenziel mehr');
    stepper.append(wen, zahlAnz, meh);
    const msKopf = el('div', 'jz-ms-kopf');
    msKopf.append(el('span', 'jz-feld-label', 'Zwischenziele'), stepper);
    baueMs(alt ? alt.ms : null);

    const fehler = el('p', 'jz-fehler');
    fehler.setAttribute('role', 'alert');
    const speichern = knopf('jz-btn primary breit', alt ? 'Speichern' : 'Ziel anlegen', () => {
      const t = text(titel.value, 80);
      const s = parseNum(start.value), z = parseNum(ziel.value);
      if(!t){ fehler.textContent = 'Bitte einen Titel eingeben.'; return; }
      if(isNaN(s) || isNaN(z)){ fehler.textContent = 'Start- und Zielwert müssen Zahlen sein.'; return; }
      if(r2(s) === r2(z)){ fehler.textContent = 'Start- und Zielwert dürfen nicht gleich sein.'; return; }
      const roh = Array.from(msBox.querySelectorAll('input')).map(i => parseNum(i.value)).filter(n => !isNaN(n));
      const ms = pruefeStufen(roh, r2(s), r2(z));
      const einh = text(einheit.value, 12) || 'Anzahl';
      if(alt){
        alt.title = t; alt.unit = einh; alt.start = r2(s); alt.target = r2(z); alt.ms = ms;
        geaendert();
        zeigeZiel(katId, alt.id);
      } else {
        c.goals.push({ id: neueId('z'), title: t, unit: einh, start: r2(s), target: r2(z), current: r2(s), ms: ms,
          log: [{ t: new Date().toISOString(), v: r2(s) }] });
        c.collapsed = false;
        dialogZu();
        geaendert();
        melde('Ziel angelegt.');
      }
    });
    speichern.id = 'jz-f-speichern';
    b.append(feld('Titel', titel), feld('Einheit', einheit), chips, paar, msKopf, msBox,
      el('p', 'jz-klein jz-hinweis', 'Die Werte sind ein Vorschlag und lassen sich ändern. Ohne Zwischenziele steigt der Füllgrad gleichmäßig.'),
      fehler, speichern);
    return b;
  });
  const t = $('jz-f-titel');
  if(t && !alt) t.focus();
}

/* ---------- Kategorie anlegen / bearbeiten ---------- */
function zeigeKategorie(katId){
  const alt = katId ? findeKat(katId) : null;
  if(!alt && state.cats.length >= MAX_KATEGORIEN){ melde('Mehr als ' + MAX_KATEGORIEN + ' Kategorien sind nicht möglich.'); return; }
  let farbe = alt ? alt.color : FARBEN[state.cats.length % FARBEN.length];
  dialog(alt ? 'Kategorie bearbeiten' : 'Neue Kategorie', () => {
    const b = el('div', 'jz-form');
    const name = eingabe('jz-k-name', alt ? alt.name : '');
    name.maxLength = 40;
    name.placeholder = 'z. B. Gesundheit';
    const farben = el('div', 'jz-farben');
    farben.setAttribute('role', 'group');
    farben.setAttribute('aria-label', 'Farbe');
    FARBEN.forEach((f, i) => {
      const k = knopf('jz-farbe', null, () => {
        farbe = f;
        farben.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.farbe === f)));
      });
      k.dataset.farbe = f;
      k.style.backgroundColor = f;
      k.setAttribute('aria-label', FARB_NAMEN[i]);
      k.setAttribute('aria-pressed', String(f === farbe));
      farben.appendChild(k);
    });
    const fehler = el('p', 'jz-fehler');
    fehler.setAttribute('role', 'alert');
    const speichern = knopf('jz-btn primary breit', alt ? 'Speichern' : 'Kategorie anlegen', () => {
      const n = text(name.value, 40);
      if(!n){ fehler.textContent = 'Bitte einen Namen eingeben.'; return; }
      if(alt){ alt.name = n; alt.color = farbe; }
      else state.cats.push({ id: neueId('k'), name: n, color: farbe, collapsed: false, goals: [] });
      dialogZu();
      geaendert();
    });
    speichern.id = 'jz-k-speichern';
    name.addEventListener('keydown', (e) => { if(e.key === 'Enter'){ e.preventDefault(); speichern.click(); } });
    const farbFeld = el('div', 'jz-feld');
    farbFeld.append(el('span', 'jz-feld-label', 'Farbe'), farben);
    b.append(feld('Name', name), farbFeld, fehler, speichern);
    if(alt){
      const weg = knopf('jz-btn gefahr breit', 'Kategorie löschen', () => {
        const n = alt.goals.length;
        frage('Kategorie löschen', '„' + alt.name + '“' + (n ? ' mit ' + n + (n === 1 ? ' Ziel' : ' Zielen') : '') + ' löschen?', 'Löschen', () => {
          state.cats = state.cats.filter(x => x.id !== alt.id);
          dialogZu();
          geaendert();
          melde('Kategorie gelöscht.');
        }, () => zeigeKategorie(katId));
      });
      weg.id = 'jz-k-loeschen';
      b.appendChild(weg);
    }
    return b;
  });
  const n = $('jz-k-name');
  if(n && !alt) n.focus();
}

/* ---------- Jahr ---------- */
function zeigeJahr(){
  dialog('Jahr', () => {
    const b = el('div', 'jz-form');
    const stepper = el('div', 'jz-stepper gross');
    const wert = el('span', 'jz-jahr-wert', String(state.year));
    wert.id = 'jz-jahr-wert';
    const info = el('p', 'jz-klein jz-hinweis', jahrInfo(state.year).text);
    const setze = (d) => {
      const j = state.year + d;
      if(j < 2000 || j > 2100) return;
      state.year = j;
      wert.textContent = String(j);
      info.textContent = jahrInfo(j).text;
      sichern();
      render();
    };
    const zur = knopf('jz-rund', '−', () => setze(-1));
    zur.id = 'jz-jahr-minus';
    zur.setAttribute('aria-label', 'Ein Jahr zurück');
    const vor = knopf('jz-rund', '+', () => setze(1));
    vor.id = 'jz-jahr-plus';
    vor.setAttribute('aria-label', 'Ein Jahr weiter');
    stepper.append(zur, wert, vor);
    const fertig = knopf('jz-btn primary breit', 'Fertig', dialogZu);
    fertig.id = 'jz-jahr-fertig';
    b.append(stepper, info, el('p', 'jz-klein jz-hinweis', 'Das Jahr bestimmt nur den Jahresfortschritt. Deine Ziele bleiben erhalten.'), fertig);
    return b;
  });
}

/* ---------- Sichern / Laden als Datei ---------- */
function exportieren(){
  flush();
  try{
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jahresziele-' + state.year + '.json';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    melde('Datei gesichert.');
  }catch(e){
    melde('Sicherung konnte nicht erstellt werden.');
  }
}
function importieren(datei){
  if(!datei) return;
  if(datei.size > MAX_IMPORT_BYTES){ melde('Datei ist zu groß (höchstens 2 MB).'); return; }
  const reader = new FileReader();
  reader.onerror = () => melde('Datei konnte nicht gelesen werden.');
  reader.onload = () => {
    try{
      const geparst = JSON.parse(String(reader.result));
      // Blanker Stand oder Umschlag mit "data".
      const roh = (geparst && typeof geparst === 'object' && geparst.data && !geparst.cats) ? geparst.data : geparst;
      if(applyData(roh)){
        dialogZu();
        writeNow();
        render();
        melde('Daten geladen.');
      } else {
        melde('Die Datei passt nicht zu diesem Werkzeug.');
      }
    }catch(e){
      melde('Die Datei passt nicht zu diesem Werkzeug.');
    }
  };
  reader.readAsText(datei);
}

/* ---------- Start ---------- */
function oeffnen(){
  render();
  openAppScreen(jzOverlay, homeScreenEl, jzClose);
}
function schliessen(){
  flush();
  dialogZu();
  closeAppScreen(jzOverlay, homeScreenEl, jzBtn);
}

if([jzBtn, jzOverlay, jzClose, jzApp, jzWarn, jzMsg, jzFile, jzWidget, dlg, dlgTitel, dlgClose, dlgBody, homeScreenEl].every(n => n !== null)){
  load();
  zeigeWarnung();
  renderWidget();

  // Schnittstelle für den Cloud-Abgleich (siehe js/cloud-sync.js).
  window.__jahreszieleCloud = {
    replaceAllData(newData){
      // Passt die Form nicht, bleibt der bisherige Stand stehen und wird beim
      // nächsten Speichern hochgeladen.
      applyData(newData);
      dialogZu();
      writeNow();
      render();
    },
    getSnapshot(){
      return JSON.parse(JSON.stringify(state));
    }
  };

  jzBtn.addEventListener('click', oeffnen);
  jzClose.addEventListener('click', schliessen);
  dlgClose.addEventListener('click', dialogZu);
  dlg.addEventListener('click', (e) => { if(e.target === dlg) dialogZu(); });
  document.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape') return;
    if(!dlg.hidden) dialogZu();
    else if(!jzOverlay.hidden) schliessen();
  });
  jzFile.addEventListener('change', (e) => {
    importieren(e.target.files && e.target.files[0]);
    e.target.value = '';
  });
  window.addEventListener('pagehide', flush);
}
