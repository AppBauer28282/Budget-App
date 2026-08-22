/* =============================================================================
   CLOUD-BRÜCKE + LOGIN + CLOUD-SYNC
   Ablauf:
   1. Nutzer gibt 6-stellige PIN ein.
   2. Zuerst wird ein Login versucht (Rückkehrer). Schlägt das fehl, wird
      versucht, das Konto neu anzulegen (allererstes Mal). Schlägt AUCH das
      fehl (Konto existiert schon), war die PIN schlicht falsch.
   3. Nach erfolgreichem Login: Datenstand aus Firestore laden (oder, falls
      noch keiner existiert, den aktuellen lokalen Stand hochladen) und die
      App sichtbar machen.

   window.__budgetCloud ist eine bewusst schmale Schnittstelle: sie erlaubt,
   den Datenstand nach Laden aus der Cloud zu ersetzen, einen Schnappschuss
   zum Hochladen abzurufen, und den Start der Anzeige auszulösen.
   window.__onLocalSave wird von storage.js bei jeder lokalen Änderung
   aufgerufen (unabhängig vom Internetzugang).
   ============================================================================= */
import { el } from './dom.js?v=13';
import {
  allData, currentMonthKey, writeStorage,
  replaceAllData as storeReplaceAllData
} from './storage.js?v=13';
import { renderMonth } from './render.js?v=13';
import { renderOverview } from './navigation.js?v=13';

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
    renderOverview();
  }
};

const sheetEl = el.sheet;
const overviewEl = el.overviewScreen;
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

async function unlock(){
  const pin = lockPin.value.trim();
  if(!/^\d{6}$/.test(pin)){
    lockError.textContent = 'Bitte eine 6-stellige PIN eingeben.';
    return;
  }
  lockError.textContent = '';
  lockSubmit.disabled = true;
  lockStatus.textContent = 'Anmelden…';

  // Nur bei diesen Fehlercodes ist "kein Konto / falsches Passwort" die
  // plausible Ursache — dann lohnt sich der Versuch, ein neues Konto
  // anzulegen. Bei jedem anderen Fehler (z. B. zu viele Versuche, Netzwerk)
  // zeigen wir den echten Grund, statt pauschal "Falsche PIN" zu behaupten.
  const credentialErrorCodes = [
    'auth/user-not-found', 'auth/wrong-password',
    'auth/invalid-credential', 'auth/invalid-login-credentials'
  ];

  try{
    // Fall A: Konto existiert schon (Rückkehrer) — normaler Login.
    await auth.signInWithEmailAndPassword(FIXED_EMAIL, pin);
  }catch(signInErr){
    if(!credentialErrorCodes.includes(signInErr.code)){
      // Kein Anmeldedaten-Problem, sondern etwas anderes — echten Grund zeigen.
      lockSubmit.disabled = false;
      lockStatus.textContent = '';
      lockError.textContent = 'Anmeldung fehlgeschlagen: ' +
        (signInErr.code || signInErr.message || 'unbekannter Fehler');
      return;
    }
    try{
      // Fall B: allererstes Mal — Konto mit dieser PIN als Passwort anlegen.
      await auth.createUserWithEmailAndPassword(FIXED_EMAIL, pin);
    }catch(createErr){
      lockSubmit.disabled = false;
      lockStatus.textContent = '';
      if(createErr.code === 'auth/email-already-in-use'){
        // Konto existiert, Login schlug aber fehl → PIN passt nicht.
        // Der technische Code des ursprünglichen Login-Fehlers wird
        // mitangezeigt, damit man z. B. eine Sperre nach zu vielen
        // Versuchen von einer wirklich falschen PIN unterscheiden kann.
        lockError.textContent = 'Falsche PIN. (' + (signInErr.code || 'kein Code') + ')';
      } else if(createErr.code === 'auth/weak-password'){
        lockError.textContent = 'PIN muss mindestens 6 Ziffern haben.';
      } else if(createErr.code === 'auth/network-request-failed'){
        lockError.textContent = 'Keine Internetverbindung — beim allerersten Mal zwingend nötig.';
      } else {
        lockError.textContent = 'Anmeldung fehlgeschlagen: ' + (createErr.code || 'unbekannt');
      }
      return;
    }
  }
  // Erfolgreicher Login (Fall A oder B) — onAuthStateChanged übernimmt den Rest.
}

lockSubmit.addEventListener('click', unlock);
lockPin.addEventListener('keydown', (e) => {
  if(e.key === 'Enter'){ e.preventDefault(); unlock(); }
});
// Nur Ziffern zulassen, Rest stillschweigend verwerfen.
lockPin.addEventListener('input', () => {
  lockPin.value = lockPin.value.replace(/\D/g, '').slice(0, 6);
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
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  });
});

async function changePin(){
  const cur = pinCurrent.value.trim();
  const next = pinNew.value.trim();
  const repeat = pinNewRepeat.value.trim();

  if(!/^\d{6}$/.test(cur) || !/^\d{6}$/.test(next)){
    pinChangeError.textContent = 'Bitte alle Felder mit 6 Ziffern ausfüllen.';
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
    if(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'){
      pinChangeError.textContent = 'Aktuelle PIN ist falsch.';
    } else if(err.code === 'auth/weak-password'){
      pinChangeError.textContent = 'Neue PIN muss mindestens 6 Ziffern haben.';
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
    lockPin.value = '';
    lockStatus.textContent = '';
    lockSubmit.disabled = false;
    lockOverlay.hidden = true;
    overviewEl.hidden = false;
    window.__budgetCloud.start();
  } else {
    // Abgemeldet: alle offenen Fenster schließen und die Scroll-Sperre
    // aufheben, damit der Sperrbildschirm nicht blockiert dargestellt wird.
    document.body.style.overflow = '';
    ['receipt-overlay','chart-overlay','pin-overlay','analysis-overlay','salary-calc-overlay'].forEach(id => {
      const ov = document.getElementById(id);
      if(ov) ov.hidden = true;
    });
    sheetEl.hidden = true;
    overviewEl.hidden = true;
    lockOverlay.hidden = false;
    lockSubmit.disabled = false;
    lockStatus.textContent = '';
    lockPin.value = '';
    lockPin.focus();
  }
});
