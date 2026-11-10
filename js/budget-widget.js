/* =============================================================================
   MONATSBUDGET-WIDGET (große Kachel oben auf der Startseite)
   Von oben nach unten:
   1. Drei Boxen für den aktuellen Monat: Einnahmen · Ausgaben · Verbleibend
      (volle Euro, echte Monatswerte — passen zu "Verbleibend" im Monat).
   2. Querbalken des aktuellen Monats: Fix / Variabel / Sparen als Anteile,
      100 % = Summe der drei, Marker bei 1/3 und 2/3.
   3. Derselbe Querbalken als Durchschnitt aller abgeschlossenen Monate.
   Beide Balken rechnen mit verteiltem Jahresfix (js/auswertung.js), damit
   sie vergleichbar sind.

   "Aktueller Monat" = neuester offener Monat; ohne offenen der zuletzt
   abgeschlossene. Reine Anzeige; alle Texte per textContent.
   ============================================================================= */
import { alleEintraege, monatsWerte, schnitt, dreiteilung } from './auswertung.js?v=58';

const box = document.getElementById('budget-widget');
const kachel = document.getElementById('budget-tile');

function el(tag, cls, text){
  const n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text !== undefined && text !== null) n.textContent = text;
  return n;
}
const euro = (cents) => Math.round(cents / 100).toLocaleString('de-DE') + ' €';

const TEILE = [
  { key: 'fix',      name: 'Fix' },
  { key: 'variabel', name: 'Variabel' },
  { key: 'sparen',   name: 'Sparen' }
];

function kennzahl(label, text, cls){
  const k = el('span', 'bw-box' + (cls ? ' ' + cls : ''));
  k.append(el('span', 'bw-box-label', label), el('span', 'bw-box-wert', text));
  return k;
}

// Ein Querbalken: Titel + Summe, darunter die drei Segmente mit Markern bei
// 1/3 und 2/3, darunter die Anteile in Prozent.
function balken(titel, t, cls){
  const zeile = el('span', 'bw-zeile' + (cls ? ' ' + cls : ''));
  const gesamt = t.fix + t.variabel + t.sparen;
  const kopf = el('span', 'bw-titel');
  kopf.append(el('span', null, titel), el('span', 'bw-summe', gesamt > 0 ? euro(gesamt) : ''));
  zeile.appendChild(kopf);

  // "spur" trägt die gerundeten Segmente; die Marker liegen darüber und
  // ragen oben und unten leicht hinaus, damit man sie auf jeder Farbe sieht.
  const b = el('span', 'bw-balken');
  const spur = el('span', 'bw-spur');
  b.appendChild(spur);
  const leg = el('span', 'bw-legende');
  if(gesamt > 0){
    TEILE.forEach(teil => {
      const pct = t[teil.key] / gesamt * 100;
      if(pct > 0){
        const seg = el('span', 'bw-seg ' + teil.key);
        seg.style.width = pct.toFixed(2) + '%';
        seg.dataset.pct = pct.toFixed(1);
        spur.appendChild(seg);
      }
      const l = el('span', 'bw-leg ' + teil.key + (pct > 100 / 3 ? ' ueber' : ''));
      l.append(el('span', 'bw-punkt'), el('span', null, teil.name + ' ' + Math.round(pct) + ' %'));
      leg.appendChild(l);
    });
  } else {
    leg.appendChild(el('span', 'bw-leer', 'Noch keine Ausgaben.'));
  }
  // Marker bei einem und zwei Dritteln.
  [100 / 3, 200 / 3].forEach(p => {
    const m = el('span', 'bw-marke');
    m.style.left = p.toFixed(3) + '%';
    b.appendChild(m);
  });
  zeile.append(b, leg);
  return zeile;
}

export function renderBudgetWidget(){
  if(!box) return;
  const alle = alleEintraege();
  const offen = alle.filter(e => e.status === 'open');
  const zu = alle.filter(e => e.status === 'closed');
  const aktuell = offen.length ? offen[offen.length - 1] : (zu.length ? zu[zu.length - 1] : null);

  const frag = document.createDocumentFragment();
  if(!aktuell){
    frag.appendChild(el('span', 'bw-leer', 'Noch kein Monat angelegt.'));
    box.replaceChildren(frag);
    return;
  }

  // 1. Boxen mit den echten Monatswerten.
  const echt = monatsWerte(aktuell, false);
  let ausgaben = 0;
  Object.keys(echt).forEach(k => { ausgaben += echt[k]; });
  const gehalt = aktuell.data.salary;
  const rest = gehalt === null ? null : gehalt - ausgaben;
  const boxen = el('span', 'bw-boxen');
  boxen.append(
    kennzahl('Einnahmen', gehalt === null ? '–' : euro(gehalt)),
    kennzahl('Ausgaben', euro(ausgaben)),
    kennzahl('Verbleibend', rest === null ? '–' : euro(rest), rest !== null && rest < 0 ? 'minus' : 'plus'));
  frag.appendChild(boxen);

  // 2. Balken des aktuellen Monats, 3. Durchschnitt der abgeschlossenen.
  const name = aktuell.monthName + ' ' + aktuell.year;
  frag.appendChild(balken(name, dreiteilung(monatsWerte(aktuell, true)), 'monat'));
  if(zu.length){
    frag.appendChild(balken('Ø abgeschlossene Monate (' + zu.length + ')', dreiteilung(schnitt(zu, true)), 'schnitt'));
  }
  box.replaceChildren(frag);

  if(kachel){
    kachel.setAttribute('aria-label', 'Monatsbudget öffnen. ' + name + ': Einnahmen ' +
      (gehalt === null ? 'nicht eingetragen' : euro(gehalt)) + ', Ausgaben ' + euro(ausgaben) +
      (rest === null ? '' : ', verbleibend ' + euro(rest)) + '.');
  }
}

if(box){
  renderBudgetWidget();
  // storage.js meldet jede Änderung am Budget (auch nach Cloud-Abgleich
  // oder Wiederherstellen) über dieses Ereignis.
  let geplant = false;
  document.addEventListener('kontor:budget', () => {
    if(geplant) return;
    geplant = true;
    setTimeout(() => { geplant = false; renderBudgetWidget(); }, 0);
  });
}
