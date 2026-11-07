/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=32';
import { el } from './dom.js?v=32';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=32';

import './navigation.js?v=32';
import './home.js?v=32';
import './events.js?v=32';
import './receipt.js?v=32';
import './charts.js?v=32';
import './backup.js?v=32';
import './analysis.js?v=32';
import './salary-calc.js?v=32';
import './konsumtopf.js?v=32';
import './pentracker.js?v=32';
import './auszahlung.js?v=32';
import './vermoegen.js?v=32';
import './cloud-sync.js?v=32';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
