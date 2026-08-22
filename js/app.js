/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs, APP_VERSION, APP_VERSION_DATE } from './constants.js?v=13';
import { el } from './dom.js?v=13';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js?v=13';

import './navigation.js?v=13';
import './events.js?v=13';
import './receipt.js?v=13';
import './charts.js?v=13';
import './backup.js?v=13';
import './analysis.js?v=13';
import './salary-calc.js?v=13';
import './cloud-sync.js?v=13';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
el.appVersion.textContent = 'Version ' + APP_VERSION + ' · ' + APP_VERSION_DATE;
