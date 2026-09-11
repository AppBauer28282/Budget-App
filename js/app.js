/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=17';
import { el } from './dom.js?v=17';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=17';

import './navigation.js?v=17';
import './events.js?v=17';
import './receipt.js?v=17';
import './charts.js?v=17';
import './backup.js?v=17';
import './analysis.js?v=17';
import './salary-calc.js?v=17';
import './konsumtopf.js?v=17';
import './pentracker.js?v=17';
import './cloud-sync.js?v=17';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
