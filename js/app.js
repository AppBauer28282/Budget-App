/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=55';
import { el } from './dom.js?v=55';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=55';

import './navigation.js?v=55';
import './home.js?v=55';
import './events.js?v=55';
import './receipt.js?v=55';
import './charts.js?v=55';
import './backup.js?v=55';
import './analysis.js?v=55';
import './budget-toepfe.js?v=55';
import './ruecklagen-topf.js?v=55';
import './forecast-edit.js?v=55';
import './fixkosten.js?v=55';
import './salary-calc.js?v=55';
import './pentracker.js?v=55';
import './auszahlung.js?v=55';
import './vermoegen.js?v=55';
import './cloud-sync.js?v=55';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
