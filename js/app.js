/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=56';
import { el } from './dom.js?v=56';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=56';

import './navigation.js?v=56';
import './home.js?v=56';
import './events.js?v=56';
import './receipt.js?v=56';
import './charts.js?v=56';
import './backup.js?v=56';
import './analysis.js?v=56';
import './budget-toepfe.js?v=56';
import './ruecklagen-topf.js?v=56';
import './forecast-edit.js?v=56';
import './fixkosten.js?v=56';
import './salary-calc.js?v=56';
import './pentracker.js?v=56';
import './auszahlung.js?v=56';
import './vermoegen.js?v=56';
import './cloud-sync.js?v=56';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
