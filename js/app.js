/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=47';
import { el } from './dom.js?v=47';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=47';

import './navigation.js?v=47';
import './home.js?v=47';
import './events.js?v=47';
import './receipt.js?v=47';
import './charts.js?v=47';
import './backup.js?v=47';
import './analysis.js?v=47';
import './forecast-edit.js?v=47';
import './fixkosten.js?v=47';
import './salary-calc.js?v=47';
import './konsumtopf.js?v=47';
import './pentracker.js?v=47';
import './auszahlung.js?v=47';
import './vermoegen.js?v=47';
import './cloud-sync.js?v=47';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
