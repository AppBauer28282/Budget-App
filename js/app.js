/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=45';
import { el } from './dom.js?v=45';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=45';

import './navigation.js?v=45';
import './home.js?v=45';
import './events.js?v=45';
import './receipt.js?v=45';
import './charts.js?v=45';
import './backup.js?v=45';
import './analysis.js?v=45';
import './forecast-edit.js?v=45';
import './fixkosten.js?v=45';
import './salary-calc.js?v=45';
import './konsumtopf.js?v=45';
import './pentracker.js?v=45';
import './auszahlung.js?v=45';
import './vermoegen.js?v=45';
import './cloud-sync.js?v=45';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
