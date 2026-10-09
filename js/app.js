/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=28';
import { el } from './dom.js?v=28';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=28';

import './navigation.js?v=28';
import './home.js?v=28';
import './events.js?v=28';
import './receipt.js?v=28';
import './charts.js?v=28';
import './backup.js?v=28';
import './analysis.js?v=28';
import './salary-calc.js?v=28';
import './konsumtopf.js?v=28';
import './pentracker.js?v=28';
import './auszahlung.js?v=28';
import './vermoegen.js?v=28';
import './cloud-sync.js?v=28';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
