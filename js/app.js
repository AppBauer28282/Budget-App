/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=61';
import { el } from './dom.js?v=61';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=61';

import './navigation.js?v=61';
import './home.js?v=61';
import './events.js?v=61';
import './receipt.js?v=61';
import './charts.js?v=61';
import './backup.js?v=61';
import './analysis.js?v=61';
import './budget-toepfe.js?v=61';
import './monats-balken.js?v=61';
import './budget-widget.js?v=61';
import './ruecklagen-topf.js?v=61';
import './forecast-edit.js?v=61';
import './fixkosten.js?v=61';
import './salary-calc.js?v=61';
import './pentracker.js?v=61';
import './auszahlung.js?v=61';
import './vermoegen.js?v=61';
import './jahresziele.js?v=61';
import './cloud-sync.js?v=61';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
