/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=62';
import { el } from './dom.js?v=62';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=62';

import './navigation.js?v=62';
import './home.js?v=62';
import './events.js?v=62';
import './receipt.js?v=62';
import './charts.js?v=62';
import './backup.js?v=62';
import './excel-import.js?v=62';
import './analysis.js?v=62';
import './budget-toepfe.js?v=62';
import './monats-balken.js?v=62';
import './budget-widget.js?v=62';
import './ruecklagen-topf.js?v=62';
import './forecast-edit.js?v=62';
import './fixkosten.js?v=62';
import './salary-calc.js?v=62';
import './pentracker.js?v=62';
import './auszahlung.js?v=62';
import './vermoegen.js?v=62';
import './jahresziele.js?v=62';
import './cloud-sync.js?v=62';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
