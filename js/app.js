/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=64';
import { el } from './dom.js?v=64';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=64';

import './navigation.js?v=64';
import './home.js?v=64';
import './events.js?v=64';
import './receipt.js?v=64';
import './charts.js?v=64';
import './backup.js?v=64';
import './excel-import.js?v=64';
import './analysis.js?v=64';
import './budget-toepfe.js?v=64';
import './monats-balken.js?v=64';
import './budget-widget.js?v=64';
import './ruecklagen-topf.js?v=64';
import './jahresfix-plan.js?v=64';
import './forecast-edit.js?v=64';
import './fixkosten.js?v=64';
import './salary-calc.js?v=64';
import './pentracker.js?v=64';
import './auszahlung.js?v=64';
import './vermoegen.js?v=64';
import './jahresziele.js?v=64';
import './cloud-sync.js?v=64';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
