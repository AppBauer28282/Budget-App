/* =============================================================================
   STARTBILDSCHIRM (KACHELN)
   Direkt nach der PIN-Eingabe sichtbar. Zeigt alle Anwendungen als Kacheln:
   das Monatsbudget groß oben, die fünf Werkzeuge darunter.

   Bewusst schlank gehalten: Die fünf Werkzeug-Kacheln tragen dieselben IDs,
   die früher die Symbole oben rechts hatten (salary-calc-btn, konsum-btn,
   pentracker-btn, auszahlung-btn, vermoegen-btn). Jedes Werkzeug-Modul holt
   sich seinen Knopf weiterhin selbst über diese ID und hängt seinen eigenen
   Listener an — dieses Modul weiß von den Werkzeugen also gar nichts und
   kümmert sich nur um den Wechsel zwischen Kachelseite und Monatsbudget.

   Die Werkzeuge öffnen sich als eigener Bildschirm anstelle der Kachelseite
   (openAppScreen/closeAppScreen in js/overlays.js) und blenden sie beim
   Schließen selbst wieder ein; dafür ist hier nichts zu tun.
   ============================================================================= */
import { el } from './dom.js?v=33';
import { showOverview } from './navigation.js?v=33';
import { scrollToTop } from './overlays.js?v=33';

const homeScreen   = document.getElementById('home-screen');
const budgetTile   = document.getElementById('budget-tile');
const backToHome   = document.getElementById('back-to-home-btn');

// Zurück zur Kachelseite. Schließt auch eine offene Monats-Detailansicht,
// damit man aus jeder Tiefe des Budgets in einem Schritt herauskommt.
export function showHome(){
  el.sheet.hidden = true;
  el.overviewScreen.hidden = true;
  homeScreen.hidden = false;
  scrollToTop();
}

function openBudget(){
  homeScreen.hidden = true;
  // showOverview() setzt den aktuellen Monat zurück und zeichnet die Listen
  // neu — wichtig, falls zwischenzeitlich ein Cloud-Abgleich gelaufen ist,
  // während die Kachelseite oben lag.
  showOverview();
  scrollToTop();
}

budgetTile.addEventListener('click', openBudget);
backToHome.addEventListener('click', showHome);

/* ---------------------------------------------------------------------------
   DUNKELMODUS-SCHALTER
   Nur per Schalter (folgt bewusst NICHT der iPhone-Einstellung). Die Wahl
   liegt ausschließlich in localStorage dieses Geräts; das Skript im <head>
   von index.html liest sie vor dem ersten Zeichnen.
   --------------------------------------------------------------------------- */
const THEME_KEY = 'kontor.theme';
const themeToggle = document.getElementById('theme-toggle');

function applyTheme(dark){
  const root = document.documentElement;
  if(dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  const setMeta = (name, value) => {
    const m = document.querySelector('meta[name="' + name + '"]');
    if(m) m.content = value;
  };
  setMeta('color-scheme', dark ? 'dark' : 'light');
  setMeta('theme-color', dark ? '#000000' : '#f2f2f7');
  setMeta('apple-mobile-web-app-status-bar-style', dark ? 'black' : 'default');
}

if(themeToggle){
  themeToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
  themeToggle.addEventListener('change', () => {
    const dark = themeToggle.checked;
    applyTheme(dark);
    try{
      if(dark) localStorage.setItem(THEME_KEY, 'dark');
      else localStorage.removeItem(THEME_KEY);
    }catch(e){ /* Speicher nicht verfügbar: gilt dann nur bis zum Neuladen */ }
  });
}
