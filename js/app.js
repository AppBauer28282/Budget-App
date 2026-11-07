/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=37';
import { el } from './dom.js?v=37';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=37';

import './navigation.js?v=37';
import './home.js?v=37';
import './events.js?v=37';
import './receipt.js?v=37';
import './charts.js?v=37';
import './backup.js?v=37';
import './analysis.js?v=37';
import './salary-calc.js?v=37';
import './konsumtopf.js?v=37';
import './pentracker.js?v=37';
import './auszahlung.js?v=37';
import './vermoegen.js?v=37';
import './cloud-sync.js?v=37';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
