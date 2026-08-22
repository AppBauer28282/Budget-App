/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=14';
import { el } from './dom.js?v=14';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=14';

import './navigation.js?v=14';
import './events.js?v=14';
import './receipt.js?v=14';
import './charts.js?v=14';
import './backup.js?v=14';
import './analysis.js?v=14';
import './salary-calc.js?v=14';
import './konsumtopf.js?v=14';
import './cloud-sync.js?v=14';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
