/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=41';
import { el } from './dom.js?v=41';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=41';

import './navigation.js?v=41';
import './home.js?v=41';
import './events.js?v=41';
import './receipt.js?v=41';
import './charts.js?v=41';
import './backup.js?v=41';
import './analysis.js?v=41';
import './salary-calc.js?v=41';
import './konsumtopf.js?v=41';
import './pentracker.js?v=41';
import './auszahlung.js?v=41';
import './vermoegen.js?v=41';
import './cloud-sync.js?v=41';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
