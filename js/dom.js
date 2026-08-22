/* =============================================================================
   DOM-REFERENZEN
   Einmal beim Laden dieses Moduls gesammelt statt bei jedem Aufruf neu zu
   suchen — spart wiederholte DOM-Abfragen. Da ES-Module nur einmal
   ausgewertet werden, ist `el` faktisch ein Singleton, das von allen
   anderen Modulen importiert wird.
   ============================================================================= */
import { fcKeys } from './constants.js?v=13';

export const el = {
  overviewScreen:  document.getElementById('overview-screen'),
  sheet:           document.getElementById('sheet'),
  backToOverviewBtn: document.getElementById('back-to-overview-btn'),
  currentMonthLabel: document.getElementById('current-month-label'),
  closeMonthBtn:   document.getElementById('close-month-btn'),
  appVersion:      document.getElementById('app-version'),

  addMonthSelect:  document.getElementById('add-month-select'),
  addYearSelect:   document.getElementById('add-year-select'),
  addMonthBtn:     document.getElementById('add-month-btn'),
  addMonthError:   document.getElementById('add-month-error'),
  openMonthList:   document.getElementById('open-month-list'),
  closedMonthList: document.getElementById('closed-month-list'),

  costList:        document.getElementById('cost-list'),
  balance:         document.getElementById('balance'),
  checkedCount:    document.getElementById('checked-count'),
  spentTotal:      document.getElementById('spent-total'),
  fixkostenSummaryTotal: document.getElementById('fixkosten-summary-total'),

  catList:         document.getElementById('cat-list'),
  catGrandTotal:   document.getElementById('cat-grand-total-amount'),
  catSummaryTotal: document.getElementById('cat-summary-total'),
  catText:         document.getElementById('cat-text'),
  catSelect:       document.getElementById('cat-select'),
  catAmount:       document.getElementById('cat-amount'),
  catAddBtn:       document.getElementById('cat-add-btn'),
  catError:        document.getElementById('cat-error'),

  savList:         document.getElementById('sav-list'),
  savGrandTotal:   document.getElementById('sav-grand-total-amount'),
  savSummaryTotal: document.getElementById('sav-summary-total'),
  savSelect:       document.getElementById('sav-select'),
  savAmount:       document.getElementById('sav-amount'),
  savAddBtn:       document.getElementById('sav-add-btn'),
  savError:        document.getElementById('sav-error'),

  salaryFixed:      document.getElementById('salary-fixed'),
  salaryFixedValue: document.getElementById('salary-fixed-value'),
  salaryDeleteBtn:  document.getElementById('salary-delete-btn'),
  salaryBox:       document.getElementById('salary-box'),
  salarySlider:    document.getElementById('salary-slider'),
  salaryValue:     document.getElementById('salary-value'),
  salarySaveBtn:   document.getElementById('salary-save-btn'),

  forecastSummaryTotal: document.getElementById('forecast-summary-total'),
  forecastBase:    document.getElementById('forecast-base'),
  forecastResult:  document.getElementById('forecast-result'),
  forecastRest:    document.getElementById('forecast-fixed-rest'),
  forecastNote:    document.getElementById('forecast-note'),

  cardSummaryTotal: document.getElementById('card-summary-total'),
  cardTotal:       document.getElementById('card-total'),
  cardRestsaldo:   document.getElementById('card-restsaldo'),
  cardSaveBtn:     document.getElementById('card-save-btn'),
  cardError:       document.getElementById('card-error'),
  cardUsed:        document.getElementById('card-used'),
  cardCatTotal:    document.getElementById('card-cat-total'),
  cardDiff:        document.getElementById('card-diff'),

  exportBtn:       document.getElementById('export-btn'),
  importFile:      document.getElementById('import-file'),
  backupMsg:       document.getElementById('backup-msg'),

  receiptBtn:      document.getElementById('receipt-btn'),
  receiptOverlay:  document.getElementById('receipt-overlay'),
  receiptClose:    document.getElementById('receipt-close'),
  receiptBody:     document.getElementById('receipt-body'),

  chartBtn:        document.getElementById('chart-btn'),
  chartOverlay:    document.getElementById('chart-overlay'),
  chartClose:      document.getElementById('chart-close'),
  chartBody:       document.getElementById('chart-body'),

  analysisBtn:        document.getElementById('analysis-btn'),
  analysisOverlay:    document.getElementById('analysis-overlay'),
  analysisClose:      document.getElementById('analysis-close'),
  analysisYear:       document.getElementById('analysis-year'),
  analysisMonths:     document.getElementById('analysis-months'),
  analysisMonthsToggle:     document.getElementById('analysis-months-toggle'),
  analysisCategories:       document.getElementById('analysis-categories'),
  analysisCategoriesToggle: document.getElementById('analysis-categories-toggle'),
  analysisResults:    document.getElementById('analysis-results')
  // Der Gehaltsrechner taucht hier bewusst nicht auf: js/salary-calc.js holt
  // alle seine Elemente selbst. So kann eine ältere, zwischengespeicherte
  // Fassung dieser Datei den Rechner nicht lahmlegen.
};

export const fcSliders = {};
export const fcVals = {};
fcKeys.forEach(k => {
  fcSliders[k] = document.getElementById('fc-' + k);
  fcVals[k]    = document.getElementById('fc-' + k + '-val');
});
