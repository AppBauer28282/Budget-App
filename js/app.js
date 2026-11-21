/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=67';
import { el } from './dom.js?v=67';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=67';

import './navigation.js?v=67';
import './home.js?v=67';
import './events.js?v=67';
import './receipt.js?v=67';
import './charts.js?v=67';
import './backup.js?v=67';
import './excel-import.js?v=67';
import './analysis.js?v=67';
import './budget-toepfe.js?v=67';
import './monats-balken.js?v=67';
import './budget-widget.js?v=67';
import './ruecklagen-topf.js?v=67';
import './jahresfix-plan.js?v=67';
import './forecast-edit.js?v=67';
import './fixkosten.js?v=67';
import './salary-calc.js?v=67';
import './gehalt-tracker.js?v=67';
import './pentracker.js?v=67';
import './auszahlung.js?v=67';
import './vermoegen.js?v=67';
import './jahresziele.js?v=67';
import './cloud-sync.js?v=67';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
