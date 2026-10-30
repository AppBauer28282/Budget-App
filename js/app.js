/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=31';
import { el } from './dom.js?v=31';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=31';

import './navigation.js?v=31';
import './home.js?v=31';
import './events.js?v=31';
import './receipt.js?v=31';
import './charts.js?v=31';
import './backup.js?v=31';
import './analysis.js?v=31';
import './salary-calc.js?v=31';
import './konsumtopf.js?v=31';
import './pentracker.js?v=31';
import './auszahlung.js?v=31';
import './vermoegen.js?v=31';
import './cloud-sync.js?v=31';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
