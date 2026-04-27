// Main application bootstrap.
// - Owns the settings state (load, update, persist, notify subscribers).
// - Wires tab switching.
// - Keeps all inputs that reflect the same settings field in two-way sync.
// - Initialises each feature (calculators, history, invoice).

import { STORAGE_KEYS, loadJSON, loadSettings, saveJSON, saveSettings } from './storage.js';
import { todayISO } from './utils.js';
import {
  initCombinedCalculator,
  initCostCalculator,
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
    selectors: ['hoursPerDay', 'costHoursPerDay', 'settingsHoursPerDay'],
    parse: asNumber,
    format: asString,
    isValid: positiveNumber
  });

  bindSharedField({
    field: 'hoursPerWeek',
    selectors: ['workingHoursPerWeek', 'settingsHoursPerWeek'],
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
  bindTextField({ field: 'invoiceDescription', selectors: ['settingsInvoiceDescription'] });
}

// ============================================================
// Multiplier sliders (Settings panel)
// ============================================================
function initMultiplierSliders() {
  const configs = [
    { field: 'overtimeMultiplier', sliderId: 'settingsOvertimeMultiplier', valueId: 'settingsOvertimeMultiplierValue' },
    { field: 'belowTimeMultiplier', sliderId: 'settingsBelowTimeMultiplier', valueId: 'settingsBelowTimeMultiplierValue' }
  ];
  configs.forEach(({ field, sliderId, valueId }) => {
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    if (!slider || !valueEl) return;

    function render(v) {
      const num = Number(v);
      slider.value = num;
      valueEl.textContent = `${num.toFixed(2)}x`;
      const min = Number(slider.min) || 0;
      const max = Number(slider.max) || 3;
      const pct = ((num - min) / (max - min)) * 100;
      slider.style.setProperty('--fill', `${pct}%`);
    }

    render(settings[field]);
    slider.addEventListener('input', () => updateSettings({ [field]: Number(slider.value) }));
    onSettingsChange((next, prev) => {
      if (next[field] !== prev[field]) render(next[field]);
    });
  });
}

// ============================================================
// Share links — encode current inputs of a calculator into the URL
// hash, copy to clipboard. Loading a URL with #share=<type>:<b64>
// switches to the right tab, prefills inputs, and runs the calc.
// ============================================================
function encodeShare(payload) {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}

function decodeShare(b64) {
  try { return JSON.parse(decodeURIComponent(escape(atob(b64)))); }
  catch { return null; }
}

function showToast(text) {
  let toast = document.getElementById('shareToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'shareToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise(resolve => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignore */ }
    document.body.removeChild(ta);
    resolve();
  });
}

function historyItemToPayload(type, item) {
  if (!item) return null;
  if (type === 'calc') {
    const payload = {
      startDate: item.startDate,
      endDate: item.endDate,
      hoursPerDay: item.hoursPerDay,
      weekendDays: Array.isArray(item.weekendDays) ? [...item.weekendDays] : undefined
    };
    if (item.payslip) {
      payload.salary = item.payslip.salary;
      payload.currency = item.payslip.currency;
      payload.recordedHours = item.payslip.recordedRaw ?? String(item.payslip.recordedHours ?? '');
      payload.overtimeMultiplier = item.payslip.overtimeMultiplier;
      payload.belowTimeMultiplier = item.payslip.belowTimeMultiplier;
    }
    return payload;
  }
  if (type === 'cost') {
    return {
      salary: item.salary,
      currency: item.currency,
      hoursPerDay: item.hoursPerDay,
      hoursPerWeek: item.hoursPerWeek
    };
  }
  return null;
}

function shareHistoryItem(type, item) {
  const payload = historyItemToPayload(type, item);
  if (!payload) return;
  const encoded = encodeShare(payload);
  const url = `${location.origin}${location.pathname}#share=${type}:${encoded}`;
  copyToClipboard(url).then(() => showToast('Share link copied to clipboard'));
}

function applyShare(type, data) {
  if (!data) return;
  function activateTab(tab) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  }
  if (type === 'calc') {
    activateTab('hours');
    if (data.startDate) document.getElementById('startDate').value = data.startDate;
    if (data.endDate) document.getElementById('endDate').value = data.endDate;
    const patch = {};
    if (data.hoursPerDay) patch.hoursPerDay = data.hoursPerDay;
    if (Array.isArray(data.weekendDays)) patch.weekendDays = data.weekendDays;
    if (data.salary) patch.monthlySalary = data.salary;
    if (data.currency) patch.currency = data.currency;
    if (typeof data.overtimeMultiplier === 'number') patch.overtimeMultiplier = data.overtimeMultiplier;
    if (typeof data.belowTimeMultiplier === 'number') patch.belowTimeMultiplier = data.belowTimeMultiplier;
    if (Object.keys(patch).length) updateSettings(patch);
    if (data.salary) document.getElementById('payslipSalary').value = data.salary;
    if (data.currency) document.getElementById('payslipCurrency').value = data.currency;
    if (data.recordedHours != null) document.getElementById('payslipRecordedHours').value = data.recordedHours;
    document.getElementById('calcCombinedBtn').click();
  } else if (type === 'cost') {
    activateTab('cost');
    const patch = {};
    if (data.salary) patch.monthlySalary = data.salary;
    if (data.currency) patch.currency = data.currency;
    if (data.hoursPerDay) patch.hoursPerDay = data.hoursPerDay;
    if (data.hoursPerWeek) patch.hoursPerWeek = data.hoursPerWeek;
    if (Object.keys(patch).length) updateSettings(patch);
    document.getElementById('calcCostBtn').click();
  }
}

function consumeShareHash() {
  const hash = location.hash;
  const m = hash.match(/^#share=([^:]+):(.+)$/);
  if (!m) return;
  const [, type, b64] = m;
  const data = decodeShare(b64);
  if (!data) return;
  // Clear the hash so reloads don't re-apply it.
  history.replaceState(null, '', location.pathname + location.search);
  // Defer until features are initialized.
  queueMicrotask(() => applyShare(type, data));
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
initMultiplierSliders();
initDefaultDates();

const ctx = { getSettings, updateSettings, onSettingsChange };

function persistLastInputs(inputs) {
  saveJSON(STORAGE_KEYS.LAST_INPUTS, inputs);
}

const calcFeature = initCombinedCalculator({ ...ctx, persistLastInputs });
const costFeature = initCostCalculator(ctx);

calcFeature.applyLastInputs(loadJSON(STORAGE_KEYS.LAST_INPUTS, null));

initHistoryDelegation({
  calc: calcFeature,
  cost: costFeature,
  onShare: shareHistoryItem
});

initInvoice({
  ...ctx,
  computePayslip: calcFeature.computeFromInputs
});

consumeShareHash();

// Tap-to-toggle for info tooltips (hover already works via CSS).
document.addEventListener('click', e => {
  const tip = e.target.closest('.info-tip');
  document.querySelectorAll('.info-tip.open').forEach(el => {
    if (el !== tip) el.classList.remove('open');
  });
  if (tip) {
    e.preventDefault();
    tip.classList.toggle('open');
  }
});
