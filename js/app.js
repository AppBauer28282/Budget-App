/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=44';
import { el } from './dom.js?v=44';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=44';

import './navigation.js?v=44';
import './home.js?v=44';
import './events.js?v=44';
import './receipt.js?v=44';
import './charts.js?v=44';
import './backup.js?v=44';
import './analysis.js?v=44';
import './forecast-edit.js?v=44';
import './fixkosten.js?v=44';
import './salary-calc.js?v=44';
import './konsumtopf.js?v=44';
import './pentracker.js?v=44';
import './auszahlung.js?v=44';
import './vermoegen.js?v=44';
import './cloud-sync.js?v=44';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
