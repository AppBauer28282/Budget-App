/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=50';
import { el } from './dom.js?v=50';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=50';

import './navigation.js?v=50';
import './home.js?v=50';
import './events.js?v=50';
import './receipt.js?v=50';
import './charts.js?v=50';
import './backup.js?v=50';
import './analysis.js?v=50';
import './budget-toepfe.js?v=50';
import './forecast-edit.js?v=50';
import './fixkosten.js?v=50';
import './salary-calc.js?v=50';
import './konsumtopf.js?v=50';
import './pentracker.js?v=50';
import './auszahlung.js?v=50';
import './vermoegen.js?v=50';
import './cloud-sync.js?v=50';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
