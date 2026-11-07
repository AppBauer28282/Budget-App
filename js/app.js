/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=46';
import { el } from './dom.js?v=46';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=46';

import './navigation.js?v=46';
import './home.js?v=46';
import './events.js?v=46';
import './receipt.js?v=46';
import './charts.js?v=46';
import './backup.js?v=46';
import './analysis.js?v=46';
import './forecast-edit.js?v=46';
import './fixkosten.js?v=46';
import './salary-calc.js?v=46';
import './konsumtopf.js?v=46';
import './pentracker.js?v=46';
import './auszahlung.js?v=46';
import './vermoegen.js?v=46';
import './cloud-sync.js?v=46';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
