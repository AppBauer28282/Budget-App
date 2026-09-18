/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=26';
import { el } from './dom.js?v=26';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=26';

import './navigation.js?v=26';
import './home.js?v=26';
import './events.js?v=26';
import './receipt.js?v=26';
import './charts.js?v=26';
import './backup.js?v=26';
import './analysis.js?v=26';
import './salary-calc.js?v=26';
import './konsumtopf.js?v=26';
import './pentracker.js?v=26';
import './auszahlung.js?v=26';
import './vermoegen.js?v=26';
import './cloud-sync.js?v=26';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
