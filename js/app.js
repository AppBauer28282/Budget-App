/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=30';
import { el } from './dom.js?v=30';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=30';

import './navigation.js?v=30';
import './home.js?v=30';
import './events.js?v=30';
import './receipt.js?v=30';
import './charts.js?v=30';
import './backup.js?v=30';
import './analysis.js?v=30';
import './salary-calc.js?v=30';
import './konsumtopf.js?v=30';
import './pentracker.js?v=30';
import './auszahlung.js?v=30';
import './vermoegen.js?v=30';
import './cloud-sync.js?v=30';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
