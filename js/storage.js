// localStorage abstraction, storage keys, default settings, and history helpers.

export const STORAGE_KEYS = Object.freeze({
  SETTINGS: 'workCalc.settings',
  HOURS_HISTORY: 'workCalc.hoursHistory',
  COST_HISTORY: 'workCalc.costHistory',
  PAYSLIP_HISTORY: 'workCalc.payslipHistory',
  CALC_HISTORY: 'workCalc.calcHistory',
  LAST_INPUTS: 'workCalc.lastInputs',
  CUSTOMERS: 'workCalc.customers',
  LAST_CUSTOMER_ID: 'workCalc.lastCustomerId',
  LEGACY_INVOICE_CUSTOMER: 'workCalc.invoiceCustomer'
});

export const DEFAULT_INVOICE_DESCRIPTION = 'Professional Services Rendered';

export const DEFAULT_SETTINGS = Object.freeze({
  weekendDays: [5, 6],
  hoursPerDay: 8,
  hoursPerWeek: 40,
  monthlySalary: 0,
  currency: 'USD',
  overtimeMultiplier: 1,
  belowTimeMultiplier: 1,
  employeeName: '',
  employeeAddress: '',
  bankDetails: '',
  invoiceDescription: DEFAULT_INVOICE_DESCRIPTION
});

export const HISTORY_LIMIT = 50;

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or disabled storage — silently ignore
  }
}

export function readString(key) {
  try { return localStorage.getItem(key) || ''; }
  catch { return ''; }
}

export function writeString(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* ignore */ }
}

export function removeKey(key) {
  try { localStorage.removeItem(key); }
  catch { /* ignore */ }
}

// Loads settings applying any needed migrations from previous schema versions.
export function loadSettings() {
  const stored = loadJSON(STORAGE_KEYS.SETTINGS, {});

  // Legacy: workingDaysPerWeek -> hoursPerWeek
  if (!('hoursPerWeek' in stored) && 'workingDaysPerWeek' in stored) {
    const hpd = Number(stored.hoursPerDay) || DEFAULT_SETTINGS.hoursPerDay;
    const dpw = Number(stored.workingDaysPerWeek);
    if (dpw > 0) stored.hoursPerWeek = dpw * hpd;
  }
  delete stored.workingDaysPerWeek;

  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings) {
  saveJSON(STORAGE_KEYS.SETTINGS, settings);
}

// Prepends an entry to a capped history list.
export function pushHistory(key, entry) {
  const history = loadJSON(key, []);
  history.unshift(entry);
  saveJSON(key, history.slice(0, HISTORY_LIMIT));
}

export function deleteHistoryEntry(key, id) {
  const history = loadJSON(key, []).filter(h => h.id !== id);
  saveJSON(key, history);
}

export function clearHistoryFor(key) {
  saveJSON(key, []);
}
