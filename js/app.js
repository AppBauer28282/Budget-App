/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=63';
import { el } from './dom.js?v=63';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=63';

import './navigation.js?v=63';
import './home.js?v=63';
import './events.js?v=63';
import './receipt.js?v=63';
import './charts.js?v=63';
import './backup.js?v=63';
import './excel-import.js?v=63';
import './analysis.js?v=63';
import './budget-toepfe.js?v=63';
import './monats-balken.js?v=63';
import './budget-widget.js?v=63';
import './ruecklagen-topf.js?v=63';
import './forecast-edit.js?v=63';
import './fixkosten.js?v=63';
import './salary-calc.js?v=63';
import './pentracker.js?v=63';
import './auszahlung.js?v=63';
import './vermoegen.js?v=63';
import './jahresziele.js?v=63';
import './cloud-sync.js?v=63';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
