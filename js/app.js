/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=52';
import { el } from './dom.js?v=52';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=52';

import './navigation.js?v=52';
import './home.js?v=52';
import './events.js?v=52';
import './receipt.js?v=52';
import './charts.js?v=52';
import './backup.js?v=52';
import './analysis.js?v=52';
import './budget-toepfe.js?v=52';
import './forecast-edit.js?v=52';
import './fixkosten.js?v=52';
import './salary-calc.js?v=52';
import './pentracker.js?v=52';
import './auszahlung.js?v=52';
import './vermoegen.js?v=52';
import './cloud-sync.js?v=52';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
