/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=48';
import { el } from './dom.js?v=48';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=48';

import './navigation.js?v=48';
import './home.js?v=48';
import './events.js?v=48';
import './receipt.js?v=48';
import './charts.js?v=48';
import './backup.js?v=48';
import './analysis.js?v=48';
import './forecast-edit.js?v=48';
import './fixkosten.js?v=48';
import './salary-calc.js?v=48';
import './konsumtopf.js?v=48';
import './pentracker.js?v=48';
import './auszahlung.js?v=48';
import './vermoegen.js?v=48';
import './cloud-sync.js?v=48';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
