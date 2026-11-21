/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=66';
import { el } from './dom.js?v=66';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=66';

import './navigation.js?v=66';
import './home.js?v=66';
import './events.js?v=66';
import './receipt.js?v=66';
import './charts.js?v=66';
import './backup.js?v=66';
import './excel-import.js?v=66';
import './analysis.js?v=66';
import './budget-toepfe.js?v=66';
import './monats-balken.js?v=66';
import './budget-widget.js?v=66';
import './ruecklagen-topf.js?v=66';
import './jahresfix-plan.js?v=66';
import './forecast-edit.js?v=66';
import './fixkosten.js?v=66';
import './salary-calc.js?v=66';
import './gehalt-tracker.js?v=66';
import './pentracker.js?v=66';
import './auszahlung.js?v=66';
import './vermoegen.js?v=66';
import './jahresziele.js?v=66';
import './cloud-sync.js?v=66';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
