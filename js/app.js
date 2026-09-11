/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=18';
import { el } from './dom.js?v=18';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=18';

import './navigation.js?v=18';
import './events.js?v=18';
import './receipt.js?v=18';
import './charts.js?v=18';
import './backup.js?v=18';
import './analysis.js?v=18';
import './salary-calc.js?v=18';
import './konsumtopf.js?v=18';
import './pentracker.js?v=18';
import './cloud-sync.js?v=18';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
