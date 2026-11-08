/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=51';
import { el } from './dom.js?v=51';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=51';

import './navigation.js?v=51';
import './home.js?v=51';
import './events.js?v=51';
import './receipt.js?v=51';
import './charts.js?v=51';
import './backup.js?v=51';
import './analysis.js?v=51';
import './budget-toepfe.js?v=51';
import './forecast-edit.js?v=51';
import './fixkosten.js?v=51';
import './salary-calc.js?v=51';
import './pentracker.js?v=51';
import './auszahlung.js?v=51';
import './vermoegen.js?v=51';
import './cloud-sync.js?v=51';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
