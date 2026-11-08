/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=54';
import { el } from './dom.js?v=54';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=54';

import './navigation.js?v=54';
import './home.js?v=54';
import './events.js?v=54';
import './receipt.js?v=54';
import './charts.js?v=54';
import './backup.js?v=54';
import './analysis.js?v=54';
import './budget-toepfe.js?v=54';
import './ruecklagen-topf.js?v=54';
import './forecast-edit.js?v=54';
import './fixkosten.js?v=54';
import './salary-calc.js?v=54';
import './pentracker.js?v=54';
import './auszahlung.js?v=54';
import './vermoegen.js?v=54';
import './cloud-sync.js?v=54';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
