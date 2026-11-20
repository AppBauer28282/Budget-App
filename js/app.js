/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=65';
import { el } from './dom.js?v=65';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=65';

import './navigation.js?v=65';
import './home.js?v=65';
import './events.js?v=65';
import './receipt.js?v=65';
import './charts.js?v=65';
import './backup.js?v=65';
import './excel-import.js?v=65';
import './analysis.js?v=65';
import './budget-toepfe.js?v=65';
import './monats-balken.js?v=65';
import './budget-widget.js?v=65';
import './ruecklagen-topf.js?v=65';
import './jahresfix-plan.js?v=65';
import './forecast-edit.js?v=65';
import './fixkosten.js?v=65';
import './salary-calc.js?v=65';
import './pentracker.js?v=65';
import './auszahlung.js?v=65';
import './vermoegen.js?v=65';
import './jahresziele.js?v=65';
import './cloud-sync.js?v=65';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
