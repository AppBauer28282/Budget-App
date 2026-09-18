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

   Die Werkzeuge öffnen sich als Overlay ÜBER der Kachelseite. Beim Schließen
   kommt damit von selbst wieder die Kachelseite zum Vorschein; dafür ist hier
   nichts zu tun.
   ============================================================================= */
import { el } from './dom.js?v=26';
import { showOverview } from './navigation.js?v=26';

const homeScreen   = document.getElementById('home-screen');
const budgetTile   = document.getElementById('budget-tile');
const backToHome   = document.getElementById('back-to-home-btn');

// Zurück zur Kachelseite. Schließt auch eine offene Monats-Detailansicht,
// damit man aus jeder Tiefe des Budgets in einem Schritt herauskommt.
export function showHome(){
  el.sheet.hidden = true;
  el.overviewScreen.hidden = true;
  homeScreen.hidden = false;
  window.scrollTo(0, 0);
}

function openBudget(){
  homeScreen.hidden = true;
  // showOverview() setzt den aktuellen Monat zurück und zeichnet die Listen
  // neu — wichtig, falls zwischenzeitlich ein Cloud-Abgleich gelaufen ist,
  // während die Kachelseite oben lag.
  showOverview();
  window.scrollTo(0, 0);
}

budgetTile.addEventListener('click', openBudget);
backToHome.addEventListener('click', showHome);
