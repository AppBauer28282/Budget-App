/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=60';
import { el } from './dom.js?v=60';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=60';

import './navigation.js?v=60';
import './home.js?v=60';
import './events.js?v=60';
import './receipt.js?v=60';
import './charts.js?v=60';
import './backup.js?v=60';
import './analysis.js?v=60';
import './budget-toepfe.js?v=60';
import './monats-balken.js?v=60';
import './budget-widget.js?v=60';
import './ruecklagen-topf.js?v=60';
import './forecast-edit.js?v=60';
import './fixkosten.js?v=60';
import './salary-calc.js?v=60';
import './pentracker.js?v=60';
import './auszahlung.js?v=60';
import './vermoegen.js?v=60';
import './cloud-sync.js?v=60';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
