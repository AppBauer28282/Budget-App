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
