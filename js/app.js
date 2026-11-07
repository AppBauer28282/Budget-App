/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=39';
import { el } from './dom.js?v=39';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=39';

import './navigation.js?v=39';
import './home.js?v=39';
import './events.js?v=39';
import './receipt.js?v=39';
import './charts.js?v=39';
import './backup.js?v=39';
import './analysis.js?v=39';
import './salary-calc.js?v=39';
import './konsumtopf.js?v=39';
import './pentracker.js?v=39';
import './auszahlung.js?v=39';
import './vermoegen.js?v=39';
import './cloud-sync.js?v=39';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
