/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=49';
import { el } from './dom.js?v=49';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=49';

import './navigation.js?v=49';
import './home.js?v=49';
import './events.js?v=49';
import './receipt.js?v=49';
import './charts.js?v=49';
import './backup.js?v=49';
import './analysis.js?v=49';
import './forecast-edit.js?v=49';
import './fixkosten.js?v=49';
import './salary-calc.js?v=49';
import './konsumtopf.js?v=49';
import './pentracker.js?v=49';
import './auszahlung.js?v=49';
import './vermoegen.js?v=49';
import './cloud-sync.js?v=49';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
