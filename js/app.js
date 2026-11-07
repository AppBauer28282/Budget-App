/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=36';
import { el } from './dom.js?v=36';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=36';

import './navigation.js?v=36';
import './home.js?v=36';
import './events.js?v=36';
import './receipt.js?v=36';
import './charts.js?v=36';
import './backup.js?v=36';
import './analysis.js?v=36';
import './salary-calc.js?v=36';
import './konsumtopf.js?v=36';
import './pentracker.js?v=36';
import './auszahlung.js?v=36';
import './vermoegen.js?v=36';
import './cloud-sync.js?v=36';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
