/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=53';
import { el } from './dom.js?v=53';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=53';

import './navigation.js?v=53';
import './home.js?v=53';
import './events.js?v=53';
import './receipt.js?v=53';
import './charts.js?v=53';
import './backup.js?v=53';
import './analysis.js?v=53';
import './budget-toepfe.js?v=53';
import './ruecklagen-topf.js?v=53';
import './forecast-edit.js?v=53';
import './fixkosten.js?v=53';
import './salary-calc.js?v=53';
import './pentracker.js?v=53';
import './auszahlung.js?v=53';
import './vermoegen.js?v=53';
import './cloud-sync.js?v=53';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
