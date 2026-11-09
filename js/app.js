/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=57';
import { el } from './dom.js?v=57';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=57';

import './navigation.js?v=57';
import './home.js?v=57';
import './events.js?v=57';
import './receipt.js?v=57';
import './charts.js?v=57';
import './backup.js?v=57';
import './analysis.js?v=57';
import './budget-toepfe.js?v=57';
import './ruecklagen-topf.js?v=57';
import './forecast-edit.js?v=57';
import './fixkosten.js?v=57';
import './salary-calc.js?v=57';
import './pentracker.js?v=57';
import './auszahlung.js?v=57';
import './vermoegen.js?v=57';
import './cloud-sync.js?v=57';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
