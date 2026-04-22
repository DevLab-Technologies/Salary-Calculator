// Main application bootstrap.
// - Owns the settings state (load, update, persist, notify subscribers).
// - Wires tab switching.
// - Keeps all inputs that reflect the same settings field in two-way sync.
// - Initialises each feature (calculators, history, invoice).

import { loadSettings, saveSettings } from './storage.js';
import { todayISO } from './utils.js';
import {
  initHoursCalculator,
  initCostCalculator,
  initPayslipCalculator,
  initHistoryDelegation
} from './calculators.js';
import { initInvoice } from './invoice.js';

// ============================================================
// Settings state (observable)
// ============================================================
let settings = loadSettings();
const settingsListeners = new Set();

function getSettings() {
  return settings;
}

function updateSettings(patch) {
  const prev = settings;
  settings = { ...settings, ...patch };
  saveSettings(settings);
  for (const fn of settingsListeners) fn(settings, prev);
}

function onSettingsChange(fn) {
  settingsListeners.add(fn);
  return () => settingsListeners.delete(fn);
}

// ============================================================
// Tabs
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });
}

// ============================================================
// Weekend pickers (hours panel + settings panel stay in sync)
// ============================================================
function initWeekendPickers() {
  const pickers = [
    document.getElementById('weekendPicker'),
    document.getElementById('settingsWeekendPicker')
  ].filter(Boolean);

  function render() {
    pickers.forEach(picker => {
      picker.querySelectorAll('.day').forEach(el => {
        const d = Number(el.dataset.day);
        el.classList.toggle('active', settings.weekendDays.includes(d));
      });
    });
  }

  pickers.forEach(picker => {
    picker.querySelectorAll('.day').forEach(el => {
      el.addEventListener('click', () => {
        const d = Number(el.dataset.day);
        const next = settings.weekendDays.includes(d)
          ? settings.weekendDays.filter(x => x !== d)
          : [...settings.weekendDays, d].sort();
        updateSettings({ weekendDays: next });
      });
    });
  });

  render();
  onSettingsChange((next, prev) => {
    if (next.weekendDays !== prev.weekendDays) render();
  });
}

// ============================================================
// Shared-field input sync
// Multiple inputs across panels reflect the same settings field.
// Changing any one updates settings + other inputs (unless the user
// is actively typing in one).
// ============================================================
function bindSharedField({ field, selectors, parse, format, isValid }) {
  const elements = selectors.map(s => document.getElementById(s)).filter(Boolean);
  if (elements.length === 0) return;

  // Initialize
  elements.forEach(el => { el.value = format(settings[field]); });

  // Wire input events
  elements.forEach(el => {
    const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(eventName, e => {
      const parsed = parse(e.target.value);
      if (!isValid(parsed)) return;
      updateSettings({ [field]: parsed });
    });
  });

  // Update other inputs on external settings changes (avoid disturbing the active one)
  onSettingsChange((next, prev) => {
    if (next[field] === prev[field]) return;
    elements.forEach(el => {
      if (el === document.activeElement) return;
      el.value = format(next[field]);
    });
  });
}

function bindTextField({ field, selectors }) {
  const elements = selectors.map(s => document.getElementById(s)).filter(Boolean);
  if (elements.length === 0) return;

  elements.forEach(el => { el.value = settings[field] || ''; });
  elements.forEach(el => {
    el.addEventListener('input', e => updateSettings({ [field]: e.target.value }));
  });
  onSettingsChange((next, prev) => {
    if (next[field] === prev[field]) return;
    elements.forEach(el => {
      if (el === document.activeElement) return;
      el.value = next[field] || '';
    });
  });
}

function initSharedFields() {
  const positiveNumber = n => Number.isFinite(n) && n > 0;
  const asNumber = v => Number(v);
  const asString = v => String(v);

  bindSharedField({
    field: 'hoursPerDay',
    selectors: ['hoursPerDay', 'costHoursPerDay', 'payslipHoursPerDay', 'settingsHoursPerDay'],
    parse: asNumber,
    format: asString,
    isValid: positiveNumber
  });

  bindSharedField({
    field: 'hoursPerWeek',
    selectors: ['workingHoursPerWeek', 'payslipHoursPerWeek', 'settingsHoursPerWeek'],
    parse: asNumber,
    format: asString,
    isValid: positiveNumber
  });

  bindSharedField({
    field: 'currency',
    selectors: ['currency', 'payslipCurrency', 'settingsCurrency'],
    parse: v => v,
    format: v => v,
    isValid: v => !!v
  });

  // Monthly salary: empty input == 0 ("not set"). Inputs show empty for 0.
  bindSharedField({
    field: 'monthlySalary',
    selectors: ['monthlySalary', 'payslipSalary', 'settingsMonthlySalary'],
    parse: v => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    format: v => (v > 0 ? String(v) : ''),
    isValid: () => true
  });

  bindTextField({ field: 'employeeName', selectors: ['settingsEmployeeName'] });
  bindTextField({ field: 'employeeAddress', selectors: ['settingsEmployeeAddress'] });
  bindTextField({ field: 'bankDetails', selectors: ['settingsBankDetails'] });
}

// ============================================================
// Defaults
// ============================================================
function initDefaultDates() {
  const today = todayISO();
  const startEl = document.getElementById('startDate');
  const endEl = document.getElementById('endDate');
  if (startEl && !startEl.value) startEl.value = today;
  if (endEl && !endEl.value) endEl.value = today;
}

// ============================================================
// Bootstrap
// ============================================================
initTabs();
initWeekendPickers();
initSharedFields();
initDefaultDates();

const ctx = { getSettings, updateSettings, onSettingsChange };

const hoursFeature = initHoursCalculator(ctx);
const costFeature = initCostCalculator(ctx);
const payslipFeature = initPayslipCalculator(ctx);

initHistoryDelegation({
  hours: hoursFeature,
  cost: costFeature,
  payslip: payslipFeature
});

initInvoice({
  ...ctx,
  computePayslip: payslipFeature.computeFromInputs
});
