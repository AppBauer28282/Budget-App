/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=12';
import { el } from './dom.js?v=12';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=12';

import './navigation.js?v=12';
import './events.js?v=12';
import './receipt.js?v=12';
import './charts.js?v=12';
import './backup.js?v=12';
import './analysis.js?v=12';
import './salary-calc.js?v=12';
import './cloud-sync.js?v=12';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
