/* =============================================================================
   SICHERN / WIEDERHERSTELLEN
   ============================================================================= */
import { MAX_IMPORT_BYTES } from './constants.js?v=11';
import { el } from './dom.js?v=11';
// Zirkulärer Import: storage.js importiert umgekehrt showBackupMsg aus
// diesem Modul (für den Fehlerfall beim Schreiben in localStorage). Sicher,
// weil storage.js diese Funktion nur im catch-Block von writeStorage()
// aufruft — nie beim Modul-Start selbst.
import { allData, saveAll, sanitizeAll, setAllData } from './storage.js?v=11';
import { showOverview } from './navigation.js?v=11';

export function showBackupMsg(text, isError){
  el.backupMsg.textContent = text;
  el.backupMsg.className = isError ? 'backup-msg error' : 'backup-msg';
}

el.exportBtn.addEventListener('click', () => {
  try{
    const payload = { version: 3, exportedAt: new Date().toISOString(), data: allData };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'budget-sicherung.json'; // gleicher Name → iOS bietet "Ersetzen" an
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Object-URL erst nach dem Klick freigeben, damit der Download startet.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showBackupMsg('Datei erzeugt. Über "In Dateien sichern" im gewünschten Ordner ablegen (bei Nachfrage "Ersetzen" wählen).', false);
  }catch(err){
    showBackupMsg('Sicherung konnte nicht erstellt werden.', true);
  }
});

el.importFile.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if(!file){ return; }

  // Größenbegrenzung: verhindert, dass eine riesige Datei den Browser blockiert.
  if(file.size > MAX_IMPORT_BYTES){
    showBackupMsg('Datei ist zu groß (max. 2 MB).', true);
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => {
    showBackupMsg('Datei konnte nicht gelesen werden.', true);
    e.target.value = '';
  };
  reader.onload = () => {
    try{
      const parsed = JSON.parse(String(reader.result));
      const rawData = (parsed && typeof parsed === 'object' && parsed.data) ? parsed.data : parsed;
      const clean = sanitizeAll(rawData);   // fremde Daten werden hier gefiltert
      if(Object.keys(clean.monthEntries).length === 0) throw new Error('keine gültigen Monatsdaten');

      setAllData(clean);
      saveAll(true);
      showOverview();
      showBackupMsg('Sicherung wurde eingelesen.', false);
    }catch(err){
      showBackupMsg('Diese Datei enthält keine gültige Sicherung.', true);
    }
    e.target.value = '';   // erlaubt erneutes Auswählen derselben Datei
  };
  reader.readAsText(file);
});
