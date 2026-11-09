/* =============================================================================
   CLOUD-BRÜCKE + LOGIN + CLOUD-SYNC
   Ablauf:
   1. Nutzer gibt seine PIN ein (6 bis 12 Ziffern; neue PINs ab v58
      mindestens 8 Ziffern, siehe "PIN ändern").
   2. Login mit der festen Kennung und der PIN als Passwort. Ein neues Konto
      legt die App seit v58 NICHT mehr an — das Konto existiert, und die
      Registrierung ist in der Firebase-Konsole abgeschaltet. Jeder Fehler
      mit falschen Zugangsdaten bedeutet schlicht "Falsche PIN".
   3. Nach erfolgreichem Login: Datenstand aus Firestore laden (oder, falls
      noch keiner existiert, den aktuellen lokalen Stand hochladen) und die
      App sichtbar machen.

   window.__budgetCloud ist eine bewusst schmale Schnittstelle: sie erlaubt,
   den Datenstand nach Laden aus der Cloud zu ersetzen, einen Schnappschuss
   zum Hochladen abzurufen, und den Start der Anzeige auszulösen.
   window.__onLocalSave wird von storage.js bei jeder lokalen Änderung
   aufgerufen (unabhängig vom Internetzugang).
   ============================================================================= */
import { el } from './dom.js?v=58';
import {
  allData, currentMonthKey, writeStorage, fixkostenUebernahmeAbholen,
  replaceAllData as storeReplaceAllData
} from './storage.js?v=58';
import { renderMonth } from './render.js?v=58';
import { renderOverview } from './navigation.js?v=58';

// Deine Firebase-Projektdaten (kein Geheimnis — Schutz läuft über die
// Security Rules + PIN-Login, nicht über diesen Config-Block).
const firebaseConfig = {
  apiKey: "AIzaSyCfZNnUjIYE7i2IacGcZB-p-WsE7yj2Q1I",
  authDomain: "budget-app-208fd.firebaseapp.com",
  projectId: "budget-app-208fd",
  storageBucket: "budget-app-208fd.firebasestorage.app",
  messagingSenderId: "1036779344395",
  appId: "1:1036779344395:web:c2717b4b447aff5ef42d0e"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Für dich unsichtbare, feste Kennung: deine PIN wird als "Passwort" dieses
// einen Kontos verwendet — siehe die Erklärung im Chat.
const FIXED_EMAIL = 'nutzer@budget-app-208fd.firebaseapp.com';

window.__budgetCloud = {
  replaceAllData(newData){
    storeReplaceAllData(newData);
    writeStorage();   // sofort lokal spiegeln
    // Nur die aktuell sichtbare Ansicht aktualisieren — während des Logins
    // ist noch nichts sichtbar, dann übernimmt start() gleich danach das
    // erste Rendern.
    if(currentMonthKey && allData.monthEntries[currentMonthKey] && !el.sheet.hidden){
      renderMonth();
    } else if(!el.overviewScreen.hidden){
      renderOverview();
    }
  },
  getSnapshot(){
    return JSON.parse(JSON.stringify(allData));
  },
  start(){
    // Einmalige Fixkosten-Übernahme (siehe storage.js) speichern — lokal und
    // über __onLocalSave auch in die Cloud, damit alle Geräte sie bekommen.
    if(fixkostenUebernahmeAbholen()) writeStorage();
    renderOverview();
  }
};

const sheetEl = el.sheet;
const overviewEl = el.overviewScreen;
const homeEl = document.getElementById('home-screen');
const lockOverlay = document.getElementById('lock-overlay');
const lockPin = document.getElementById('lock-pin');
const lockSubmit = document.getElementById('lock-submit');
const lockError = document.getElementById('lock-error');
const lockStatus = document.getElementById('lock-status');

const budgetDocRef = (uid) => db.collection('budget').doc(uid);

// Zeitstempel des letzten LOKALEN Speicherns — getrennt von localStorage
// für die eigentlichen Budget-Daten, damit wir beim nächsten Öffnen
// vergleichen können: ist der Cloud-Stand wirklich neuer, oder nur älter
// als das, was gerade erst lokal gespeichert wurde (aber der Cloud-Upload
// hat es evtl. nicht mehr rechtzeitig geschafft, bevor die Seite
// geschlossen/in den Hintergrund geschickt wurde)?
const LOCAL_UPDATED_KEY = 'kontor_budget_updated_at';
function getLocalUpdatedAt(){
  const raw = localStorage.getItem(LOCAL_UPDATED_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setLocalUpdatedAt(ts){
  try{ localStorage.setItem(LOCAL_UPDATED_KEY, String(ts)); }catch(e){}
}

// Wird von writeStorage() (in storage.js) bei jeder Änderung aufgerufen —
// pusht den aktuellen Stand samt Zeitstempel in die Cloud. Rein lokales
// Speichern bleibt davon unberührt und läuft immer sofort, unabhängig
// davon, ob der Cloud-Push klappt.
// Während Daten AUS der Cloud geladen werden, soll das dadurch ausgelöste
// lokale Speichern nicht sofort wieder in die Cloud zurückgeschrieben
// werden — sonst überschreibt das Laden den Zeitstempel mit "jetzt" und
// die Vergleichslogik unten wird sinnlos.
let suppressCloudPush = false;

window.__onLocalSave = function(data){
  if(suppressCloudPush) return;
  const ts = Date.now();
  setLocalUpdatedAt(ts);
  if(!auth.currentUser) return;
  budgetDocRef(auth.currentUser.uid).set({ updatedAt: ts, data: data })
    .catch(() => { /* nächste Änderung versucht es erneut zu pushen */ });
};

// ---------- Pen-Tracker-Sync ----------
// Gleicher Mechanismus wie oben, nur für js/pentracker.js und dessen
// eigenes Dokument. Bewusst kein Datum wird hier je vorbelegt — der
// Pen-Tracker startet leer, bis der Nutzer selbst etwas einträgt oder eine
// Sicherungsdatei einliest (siehe Chat: Gesundheitsdaten sollen nicht im
// öffentlichen Quellcode stehen, wohl aber geschützt in Firestore liegen
// dürfen).
const pentrackerDocRef = (uid) => db.collection('pentracker').doc(uid);
const PT_LOCAL_UPDATED_KEY = 'kontor_pentracker_updated_at';
function getPtLocalUpdatedAt(){
  const raw = localStorage.getItem(PT_LOCAL_UPDATED_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setPtLocalUpdatedAt(ts){
  try{ localStorage.setItem(PT_LOCAL_UPDATED_KEY, String(ts)); }catch(e){}
}
let suppressPentrackerPush = false;

window.__onPentrackerLocalSave = function(data){
  if(suppressPentrackerPush) return;
  const ts = Date.now();
  setPtLocalUpdatedAt(ts);
  if(!auth.currentUser) return;
  pentrackerDocRef(auth.currentUser.uid).set({ updatedAt: ts, data: data })
    .catch(() => { /* nächste Änderung versucht es erneut zu pushen */ });
};

// ---------- Auszahlungs-Tracker-Sync ----------
// Gleicher Mechanismus, eigenes Dokument. Auch hier gilt: im Quellcode steht
// nie ein Anfangsbestand — der Tracker startet leer, bis der Nutzer selbst
// etwas einträgt oder eine Sicherungsdatei einliest. Positionsnamen verraten
// Banken und Anlagen und haben in einem öffentlichen Repository nichts zu
// suchen, in Firestore hinter dem PIN-Login dagegen schon.
const auszahlungDocRef = (uid) => db.collection('auszahlungen').doc(uid);
const AZ_LOCAL_UPDATED_KEY = 'kontor_auszahlungen_updated_at';
function getAzLocalUpdatedAt(){
  const raw = localStorage.getItem(AZ_LOCAL_UPDATED_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setAzLocalUpdatedAt(ts){
  try{ localStorage.setItem(AZ_LOCAL_UPDATED_KEY, String(ts)); }catch(e){}
}
let suppressAuszahlungPush = false;

window.__onAuszahlungLocalSave = function(data){
  if(suppressAuszahlungPush) return;
  const ts = Date.now();
  setAzLocalUpdatedAt(ts);
  if(!auth.currentUser) return;
  auszahlungDocRef(auth.currentUser.uid).set({ updatedAt: ts, data: data })
    .catch(() => { /* nächste Änderung versucht es erneut zu pushen */ });
};

// ---------- Vermögens-Tracker-Sync ----------
// Gleicher Mechanismus, eigenes Dokument. Auch hier steht im Quellcode nie ein
// Anfangsbestand — aus Monatsständen ließe sich das gesamte Vermögen ablesen,
// in einem öffentlichen Repository haben sie nichts zu suchen. Hinter dem
// PIN-Login in Firestore dagegen schon.
const vermoegenDocRef = (uid) => db.collection('vermoegen').doc(uid);
const VM_LOCAL_UPDATED_KEY = 'kontor_vermoegen_updated_at';
function getVmLocalUpdatedAt(){
  const raw = localStorage.getItem(VM_LOCAL_UPDATED_KEY);
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setVmLocalUpdatedAt(ts){
  try{ localStorage.setItem(VM_LOCAL_UPDATED_KEY, String(ts)); }catch(e){}
}
let suppressVermoegenPush = false;

window.__onVermoegenLocalSave = function(data){
  if(suppressVermoegenPush) return;
  const ts = Date.now();
  setVmLocalUpdatedAt(ts);
  if(!auth.currentUser) return;
  vermoegenDocRef(auth.currentUser.uid).set({ updatedAt: ts, data: data })
    .catch(() => { /* nächste Änderung versucht es erneut zu pushen */ });
};

// PIN-Längen: Anmelden geht mit 6 bis 12 Ziffern (ältere PINs haben 6),
// eine NEUE PIN muss mindestens 8 Ziffern haben — 100-mal mehr
// Möglichkeiten als 6 Ziffern, damit Durchprobieren aussichtslos wird.
const PIN_LOGIN_RE = /^\d{6,12}$/;
const PIN_NEU_RE = /^\d{8,12}$/;
const PIN_MAX = 12;

async function unlock(){
  const pin = lockPin.value.trim();
  if(!PIN_LOGIN_RE.test(pin)){
    lockError.textContent = 'Bitte deine PIN eingeben (6 bis 12 Ziffern).';
    return;
  }
  lockError.textContent = '';
  lockSubmit.disabled = true;
  lockStatus.textContent = 'Anmelden…';

  try{
    await auth.signInWithEmailAndPassword(FIXED_EMAIL, pin);
    // Erfolgreich — onAuthStateChanged übernimmt den Rest.
  }catch(err){
    lockSubmit.disabled = false;
    lockStatus.textContent = '';
    const code = err && err.code;
    if(['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials',
        'auth/user-not-found', 'auth/invalid-password'].includes(code)){
      lockError.textContent = 'Falsche PIN.';
    } else if(code === 'auth/too-many-requests'){
      lockError.textContent = 'Zu viele Versuche – bitte später erneut versuchen.';
    } else if(code === 'auth/network-request-failed'){
      lockError.textContent = 'Keine Internetverbindung – zum Anmelden nötig.';
    } else {
      lockError.textContent = 'Anmeldung fehlgeschlagen: ' + (code || (err && err.message) || 'unbekannter Fehler');
    }
  }
}

lockSubmit.addEventListener('click', unlock);
lockPin.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); unlock(); }
});
// Nur Ziffern zulassen, Rest stillschweigend verwerfen.
lockPin.addEventListener('input', () => {
  lockPin.value = lockPin.value.replace(/\D/g, '').slice(0, PIN_MAX);
  lockError.textContent = '';   // alte Meldung verschwindet beim Neu-Tippen
});

// Abmelden: sperrt die App wieder, ohne Daten zu löschen (bleiben in der
// Cloud und lokal erhalten — nur die Sitzung wird beendet).
const signoutBtn = document.getElementById('signout-btn');
if(signoutBtn){
  signoutBtn.addEventListener('click', () => { auth.signOut(); });
}

// --- PIN ändern ---
const changePinBtn = document.getElementById('change-pin-btn');
const pinOverlay = document.getElementById('pin-overlay');
const pinClose = document.getElementById('pin-close');
const pinCurrent = document.getElementById('pin-current');
const pinNew = document.getElementById('pin-new');
const pinNewRepeat = document.getElementById('pin-new-repeat');
const pinChangeBtn = document.getElementById('pin-change-btn');
const pinChangeError = document.getElementById('pin-change-error');
const pinChangeStatus = document.getElementById('pin-change-status');

function openPinChange(){
  pinCurrent.value = '';
  pinNew.value = '';
  pinNewRepeat.value = '';
  pinChangeError.textContent = '';
  pinChangeStatus.textContent = '';
  pinOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  pinCurrent.focus();
}
function closePinChange(){
  pinOverlay.hidden = true;
  document.body.style.overflow = '';
  changePinBtn.focus();
}

changePinBtn.addEventListener('click', openPinChange);
pinClose.addEventListener('click', closePinChange);
pinOverlay.addEventListener('click', (e) => {
  if(e.target === pinOverlay) closePinChange();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && !pinOverlay.hidden) closePinChange();
});

// Nur Ziffern in den drei PIN-Feldern zulassen.
[pinCurrent, pinNew, pinNewRepeat].forEach(input => {
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, PIN_MAX);
    pinChangeError.textContent = '';
  });
});

async function changePin(){
  const cur = pinCurrent.value.trim();
  const next = pinNew.value.trim();
  const repeat = pinNewRepeat.value.trim();

  if(!PIN_LOGIN_RE.test(cur)){
    pinChangeError.textContent = 'Bitte die aktuelle PIN eingeben.';
    return;
  }
  if(!PIN_NEU_RE.test(next)){
    pinChangeError.textContent = 'Die neue PIN muss 8 bis 12 Ziffern haben.';
    return;
  }
  if(next !== repeat){
    pinChangeError.textContent = 'Neue PIN stimmt in beiden Feldern nicht überein.';
    return;
  }
  if(next === cur){
    pinChangeError.textContent = 'Neue PIN muss sich von der aktuellen unterscheiden.';
    return;
  }
  if(!auth.currentUser){
    pinChangeError.textContent = 'Nicht angemeldet.';
    return;
  }

  pinChangeError.textContent = '';
  pinChangeBtn.disabled = true;
  pinChangeStatus.textContent = 'Wird geändert…';

  try{
    // Firebase verlangt für sicherheitsrelevante Änderungen wie ein neues
    // Passwort eine frische Anmeldung — deshalb hier erst mit der
    // aktuellen PIN erneut bestätigen, bevor die neue gesetzt wird.
    const credential = firebase.auth.EmailAuthProvider.credential(FIXED_EMAIL, cur);
    await auth.currentUser.reauthenticateWithCredential(credential);
    await auth.currentUser.updatePassword(next);

    pinChangeStatus.textContent = '';
    pinChangeBtn.disabled = false;
    pinChangeError.textContent = '';
    pinCurrent.value = '';
    pinNew.value = '';
    pinNewRepeat.value = '';
    pinChangeStatus.textContent = 'PIN erfolgreich geändert ✓';
    setTimeout(closePinChange, 1200);
  }catch(err){
    pinChangeBtn.disabled = false;
    pinChangeStatus.textContent = '';
    if(['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(err.code)){
      pinChangeError.textContent = 'Aktuelle PIN ist falsch.';
    } else if(err.code === 'auth/weak-password'){
      pinChangeError.textContent = 'Die neue PIN muss 8 bis 12 Ziffern haben.';
    } else if(err.code === 'auth/too-many-requests'){
      pinChangeError.textContent = 'Zu viele Versuche — bitte kurz warten.';
    } else {
      pinChangeError.textContent = 'Fehlgeschlagen: ' + (err.code || err.message || 'unbekannt');
    }
  }
}

pinChangeBtn.addEventListener('click', changePin);
[pinCurrent, pinNew, pinNewRepeat].forEach(input => {
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); changePin(); }
  });
});

auth.onAuthStateChanged(async (user) => {
  if(user){
    lockStatus.textContent = 'Daten werden geladen…';
    try{
      const snap = await budgetDocRef(user.uid).get();
      if(snap.exists){
        const raw = snap.data() || {};
        // Zwei Formate möglich: neu = { updatedAt, data }, alt = Daten
        // liegen direkt oben (aus einer früheren Version ohne Zeitstempel).
        const isNewFormat = raw.data && typeof raw.data === 'object';
        const cloudPayload = isNewFormat ? raw.data : raw;
        const cloudUpdatedAt = Number(raw.updatedAt) || 0;
        const localUpdatedAt = getLocalUpdatedAt();

        // WICHTIG: Hat dieses Gerät noch nie selbst gespeichert
        // (localUpdatedAt === 0), gewinnt IMMER die Cloud. Sonst würde ein
        // frisch hinzugefügtes Gerät mit leerem lokalen Stand die echten
        // Daten in der Cloud überschreiben — genau das ließ Häkchen und
        // Werte scheinbar "zurückspringen".
        const cloudWins = localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt;

        if(cloudWins){
          suppressCloudPush = true;
          window.__budgetCloud.replaceAllData(cloudPayload);
          suppressCloudPush = false;
          setLocalUpdatedAt(cloudUpdatedAt || Date.now());
        } else {
          // Lokal ist nachweislich neuer — Cloud damit nachziehen, statt
          // frische Änderungen zu verlieren.
          const ts = localUpdatedAt;
          await budgetDocRef(user.uid).set({ updatedAt: ts, data: window.__budgetCloud.getSnapshot() });
        }
      } else {
        // Allererster Login: aktuellen lokalen Stand als Startpunkt hochladen.
        const ts = Date.now();
        setLocalUpdatedAt(ts);
        await budgetDocRef(user.uid).set({ updatedAt: ts, data: window.__budgetCloud.getSnapshot() });
      }
    }catch(err){
      lockError.textContent = 'Cloud gerade nicht erreichbar — arbeite lokal weiter.';
    }

    // Jeder weitere Bereich wird als eigener Versuch abgeglichen: ein
    // Fehlschlag (Netzwerk, Modul nicht geladen) darf den Budget-Login nie
    // blockieren — deshalb jeweils eigenes try/catch ohne Fehlermeldung.
    // Gleicher Abgleich für den Pen-Tracker, ebenfalls als eigener Versuch.
    if(window.__pentrackerCloud){
      try{
        const ptSnap = await pentrackerDocRef(user.uid).get();
        if(ptSnap.exists){
          const raw = ptSnap.data() || {};
          const isNewFormat = raw.data && typeof raw.data === 'object';
          const cloudPayload = isNewFormat ? raw.data : raw;
          const cloudUpdatedAt = Number(raw.updatedAt) || 0;
          const localUpdatedAt = getPtLocalUpdatedAt();
          const cloudWins = localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt;

          if(cloudWins){
            suppressPentrackerPush = true;
            window.__pentrackerCloud.replaceAllData(cloudPayload);
            suppressPentrackerPush = false;
            setPtLocalUpdatedAt(cloudUpdatedAt || Date.now());
          } else {
            const ts = localUpdatedAt;
            await pentrackerDocRef(user.uid).set({ updatedAt: ts, data: window.__pentrackerCloud.getSnapshot() });
          }
        } else {
          // Allererster Login: aktuellen lokalen Stand hochladen (meist
          // leer, außer es wurde vorher schon lokal etwas eingetragen).
          const ts = Date.now();
          setPtLocalUpdatedAt(ts);
          await pentrackerDocRef(user.uid).set({ updatedAt: ts, data: window.__pentrackerCloud.getSnapshot() });
        }
      }catch(err){ /* Pen-Tracker bleibt lokal nutzbar, auch ohne Cloud */ }
    }

    // Gleicher Abgleich für den Auszahlungs-Tracker, ebenfalls als eigener
    // Versuch — ein Fehler hier darf den Budget-Login nicht aufhalten.
    if(window.__auszahlungCloud){
      try{
        const azSnap = await auszahlungDocRef(user.uid).get();
        if(azSnap.exists){
          const raw = azSnap.data() || {};
          const isNewFormat = raw.data && typeof raw.data === 'object';
          const cloudPayload = isNewFormat ? raw.data : raw;
          const cloudUpdatedAt = Number(raw.updatedAt) || 0;
          const localUpdatedAt = getAzLocalUpdatedAt();
          const cloudWins = localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt;

          if(cloudWins){
            suppressAuszahlungPush = true;
            window.__auszahlungCloud.replaceAllData(cloudPayload);
            suppressAuszahlungPush = false;
            setAzLocalUpdatedAt(cloudUpdatedAt || Date.now());
          } else {
            const ts = localUpdatedAt;
            await auszahlungDocRef(user.uid).set({ updatedAt: ts, data: window.__auszahlungCloud.getSnapshot() });
          }
        } else {
          // Allererster Login: aktuellen lokalen Stand hochladen (meist leer,
          // außer es wurde vorher schon lokal etwas eingetragen).
          const ts = Date.now();
          setAzLocalUpdatedAt(ts);
          await auszahlungDocRef(user.uid).set({ updatedAt: ts, data: window.__auszahlungCloud.getSnapshot() });
        }
      }catch(err){ /* Tracker bleibt lokal nutzbar, auch ohne Cloud */ }
    }

    // Gleicher Abgleich für den Vermögens-Tracker, ebenfalls als eigener
    // Versuch — ein Fehler hier darf den Budget-Login nicht aufhalten.
    if(window.__vermoegenCloud){
      try{
        const vmSnap = await vermoegenDocRef(user.uid).get();
        if(vmSnap.exists){
          const raw = vmSnap.data() || {};
          const isNewFormat = raw.data && typeof raw.data === 'object';
          const cloudPayload = isNewFormat ? raw.data : raw;
          const cloudUpdatedAt = Number(raw.updatedAt) || 0;
          const localUpdatedAt = getVmLocalUpdatedAt();
          const cloudWins = localUpdatedAt === 0 || cloudUpdatedAt > localUpdatedAt;

          if(cloudWins){
            suppressVermoegenPush = true;
            window.__vermoegenCloud.replaceAllData(cloudPayload);
            suppressVermoegenPush = false;
            setVmLocalUpdatedAt(cloudUpdatedAt || Date.now());
          } else {
            const ts = localUpdatedAt;
            await vermoegenDocRef(user.uid).set({ updatedAt: ts, data: window.__vermoegenCloud.getSnapshot() });
          }
        } else {
          const ts = Date.now();
          setVmLocalUpdatedAt(ts);
          await vermoegenDocRef(user.uid).set({ updatedAt: ts, data: window.__vermoegenCloud.getSnapshot() });
        }
      }catch(err){ /* Tracker bleibt lokal nutzbar, auch ohne Cloud */ }
    }

    lockPin.value = '';
    lockStatus.textContent = '';
    lockSubmit.disabled = false;
    lockOverlay.hidden = true;
    // Nach dem Entsperren kommt die Kachelseite, nicht mehr direkt das
    // Budget. start() zeichnet die Monatslisten trotzdem schon jetzt, damit
    // die Übersicht beim Antippen der Kachel sofort steht.
    homeEl.hidden = false;
    window.__budgetCloud.start();
  } else {
    // Abgemeldet: alle offenen Fenster schließen und die Scroll-Sperre
    // aufheben, damit der Sperrbildschirm nicht blockiert dargestellt wird.
    document.body.style.overflow = '';
    ['receipt-overlay','chart-overlay','pin-overlay','analysis-overlay','fc-edit-overlay','budget-overlay','rt-overlay',
     'salary-calc-overlay','pentracker-overlay',
     'auszahlung-overlay','vermoegen-overlay'].forEach(id => {
      const ov = document.getElementById(id);
      if(ov) ov.hidden = true;
    });
    // Die kleinen Dialoge des Pen-Trackers liegen außerhalb seines Fensters
    // und müssen deshalb einzeln geschlossen werden.
    document.querySelectorAll('.pt-dialog').forEach(dlg => { dlg.hidden = true; });
    // Ebenso die Unterfenster des Auszahlungs-Trackers.
    document.querySelectorAll('.az-dialog').forEach(dlg => { dlg.hidden = true; });
    // Die Dialoge des Vermögens-Trackers werden dynamisch erzeugt und deshalb
    // entfernt statt versteckt.
    document.querySelectorAll('.vt-modal-overlay, .vt-toast').forEach(n => n.remove());
    sheetEl.hidden = true;
    overviewEl.hidden = true;
    homeEl.hidden = true;
    lockOverlay.hidden = false;
    lockSubmit.disabled = false;
    lockStatus.textContent = '';
    lockPin.value = '';
    lockPin.focus();
  }
});
