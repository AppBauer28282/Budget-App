/* =============================================================================
   OVERLAY-HILFSFUNKTIONEN
   Gemeinsame Öffnen/Schließen-Logik für alle Overlays (Beleg, Diagramm,
   PIN-Ändern). Ersetzt die zuvor dreifach fast identisch kopierten
   Funktionspaare — ein neues Overlay braucht künftig nur noch diese beiden
   Aufrufe statt eines eigenen Copy-Paste-Paares.
   ============================================================================= */

export function openOverlay(overlayEl, focusEl){
  overlayEl.hidden = false;
  document.body.style.overflow = 'hidden'; // verhindert Hintergrund-Scrollen
  if(focusEl) focusEl.focus();
}

// onAfterClose (optional) läuft statt des Standard-Fokus-Zurücksetzens —
// z. B. wenn das Schließen stattdessen zu einem anderen Bildschirm navigiert.
export function closeOverlay(overlayEl, focusBackEl, onAfterClose){
  overlayEl.hidden = true;
  document.body.style.overflow = '';
  if(onAfterClose){
    onAfterClose();
  } else if(focusBackEl){
    focusBackEl.focus();
  }
}

/* ---------------------------------------------------------------------------
   WERKZEUG-BILDSCHIRME (Gehaltsrechner, Konsumtopf, Pen-Tracker,
   Auszahlungs- und Vermögens-Tracker)
   Anders als die kleinen Dialoge oben öffnen sich diese fünf Werkzeuge als
   VOLLSTÄNDIGER Bildschirmwechsel — genau wie das Monatsbudget selbst
   (js/home.js, js/navigation.js): die Kachelseite wird verborgen, das
   Werkzeug nimmt ihren Platz ein. Kein abgedunkelter Hintergrund, keine
   Scroll-Sperre — es ist kein schwebender Dialog mehr, sondern eine normale
   Seite im Wechsel mit den anderen [hidden]-gesteuerten Bildschirmen.
   "homeEl" ist die Kachelseite (#home-screen), die dabei ausgeblendet bzw.
   wieder gezeigt wird. ============================================================================= */
// Die Seite scrollt über <body> (html/body haben height:100% und
// overflow-x:hidden), nicht über das Fenster — window.scrollTo allein setzt
// die Position deshalb nicht zurück.
export function scrollToTop(){
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
}

export function openAppScreen(screenEl, homeEl, focusEl){
  homeEl.hidden = true;
  screenEl.hidden = false;
  scrollToTop();
  if(focusEl) focusEl.focus();
}

export function closeAppScreen(screenEl, homeEl, focusEl){
  screenEl.hidden = true;
  homeEl.hidden = false;
  scrollToTop();
  if(focusEl) focusEl.focus();
}
