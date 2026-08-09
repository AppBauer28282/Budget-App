/* =============================================================================
   BOOTSTRAP
   Baut die statische Oberfläche einmalig auf und lädt danach alle Module,
   die sich selbst um ihre Event-Listener kümmern (Navigation, Ereignisse,
   Beleg-/Diagrammansicht, Sichern/Wiederherstellen, Cloud-Sync/Login).
   ============================================================================= */
import { categoryDefs, savingDefs } from './constants.js';
import { el } from './dom.js';
import { buildAddMonthSelects, buildCostList, fillSelect } from './render.js';

import './navigation.js';
import './events.js';
import './receipt.js';
import './charts.js';
import './backup.js';
import './cloud-sync.js';

buildAddMonthSelects();
fillSelect(el.catSelect, categoryDefs);
fillSelect(el.savSelect, savingDefs);
buildCostList();
