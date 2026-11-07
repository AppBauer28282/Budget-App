/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=35';
import { el } from './dom.js?v=35';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=35';

import './navigation.js?v=35';
import './home.js?v=35';
import './events.js?v=35';
import './receipt.js?v=35';
import './charts.js?v=35';
import './backup.js?v=35';
import './analysis.js?v=35';
import './salary-calc.js?v=35';
import './konsumtopf.js?v=35';
import './pentracker.js?v=35';
import './auszahlung.js?v=35';
import './vermoegen.js?v=35';
import './cloud-sync.js?v=35';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
