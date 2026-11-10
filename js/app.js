/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=59';
import { el } from './dom.js?v=59';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=59';

import './navigation.js?v=59';
import './home.js?v=59';
import './events.js?v=59';
import './receipt.js?v=59';
import './charts.js?v=59';
import './backup.js?v=59';
import './analysis.js?v=59';
import './budget-toepfe.js?v=59';
import './monats-balken.js?v=59';
import './budget-widget.js?v=59';
import './ruecklagen-topf.js?v=59';
import './forecast-edit.js?v=59';
import './fixkosten.js?v=59';
import './salary-calc.js?v=59';
import './pentracker.js?v=59';
import './auszahlung.js?v=59';
import './vermoegen.js?v=59';
import './cloud-sync.js?v=59';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
