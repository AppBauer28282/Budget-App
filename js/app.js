/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=33';
import { el } from './dom.js?v=33';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=33';

import './navigation.js?v=33';
import './home.js?v=33';
import './events.js?v=33';
import './receipt.js?v=33';
import './charts.js?v=33';
import './backup.js?v=33';
import './analysis.js?v=33';
import './salary-calc.js?v=33';
import './konsumtopf.js?v=33';
import './pentracker.js?v=33';
import './auszahlung.js?v=33';
import './vermoegen.js?v=33';
import './cloud-sync.js?v=33';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
