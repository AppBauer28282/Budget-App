/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=43';
import { el } from './dom.js?v=43';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=43';

import './navigation.js?v=43';
import './home.js?v=43';
import './events.js?v=43';
import './receipt.js?v=43';
import './charts.js?v=43';
import './backup.js?v=43';
import './analysis.js?v=43';
import './forecast-edit.js?v=43';
import './fixkosten.js?v=43';
import './salary-calc.js?v=43';
import './konsumtopf.js?v=43';
import './pentracker.js?v=43';
import './auszahlung.js?v=43';
import './vermoegen.js?v=43';
import './cloud-sync.js?v=43';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
