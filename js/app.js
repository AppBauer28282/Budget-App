/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=21';
import { el } from './dom.js?v=21';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=21';

import './navigation.js?v=21';
import './events.js?v=21';
import './receipt.js?v=21';
import './charts.js?v=21';
import './backup.js?v=21';
import './analysis.js?v=21';
import './salary-calc.js?v=21';
import './konsumtopf.js?v=21';
import './pentracker.js?v=21';
import './cloud-sync.js?v=21';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
