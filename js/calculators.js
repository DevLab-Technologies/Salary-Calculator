// Working Hours, Hourly/Daily Cost, and Payslip calculators with their history lists.
// Each calculator is self-contained: it wires up its form, renders its history, and
// exposes a `restore` handler consumed by the shared history event delegation.

import {
  FREELANCER_MULTIPLIERS,
  WEEKS_PER_MONTH,
  countDaysInRange,
  formatDate,
  formatHoursAsHM,
  formatMoney,
  parseRecordedHours
} from './utils.js';

import {
  STORAGE_KEYS,
  clearHistoryFor,
  deleteHistoryEntry,
  loadJSON,
  pushHistory
} from './storage.js';

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>';

// Derive hours-per-week from a history entry, accommodating legacy schema
// entries that stored workingDaysPerWeek instead of hoursPerWeek.
function historyHoursPerWeek(item) {
  if (item.hoursPerWeek != null) return item.hoursPerWeek;
  if (item.daysPerWeek != null && item.hoursPerDay != null) {
    return item.daysPerWeek * item.hoursPerDay;
  }
  return null;
}

// ============================================================
// Combined Hours + Payslip Calculator
// One date-range-driven flow: always computes hours; if salary
// and recorded hours are provided, also computes a payslip using
// the period's actual working hours (no monthly-average fudge).
// ============================================================
export function initCombinedCalculator({ getSettings, updateSettings, persistLastInputs }) {
  const el = {
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    hoursPerDay: document.getElementById('hoursPerDay'),
    salary: document.getElementById('payslipSalary'),
    currency: document.getElementById('payslipCurrency'),
    recordedHours: document.getElementById('payslipRecordedHours'),
    button: document.getElementById('calcCombinedBtn'),
    result: document.getElementById('combinedResult'),
    totalDays: document.getElementById('totalDays'),
    weekendDaysOut: document.getElementById('weekendDays'),
    workingDays: document.getElementById('workingDays'),
    totalHours: document.getElementById('totalHours'),
    payslipBlock: document.getElementById('payslipBlock'),
    hourlyRate: document.getElementById('payslipHourlyRate'),
    hoursDecimal: document.getElementById('payslipHoursDecimal'),
    expectedHours: document.getElementById('payslipExpectedHours'),
    totalPay: document.getElementById('payslipTotalPay'),
    historyList: document.getElementById('calcHistory'),
    clearBtn: document.getElementById('clearCalcHistory')
  };

  function computeFromInputs() {
    const startStr = el.startDate.value;
    const endStr = el.endDate.value;
    const hoursPerDay = Number(el.hoursPerDay.value);
    const { weekendDays, overtimeMultiplier, belowTimeMultiplier } = getSettings();

    if (!startStr || !endStr) return { error: 'Please select both start and end dates.' };
    if (!hoursPerDay || hoursPerDay <= 0) return { error: 'Please enter a valid number of hours per day.' };

    const counts = countDaysInRange(startStr, endStr, weekendDays);
    if (!counts) return { error: 'End date must be on or after the start date.' };

    const expectedHours = counts.workingDays * hoursPerDay;

    // Optional payslip part — only when salary AND recorded hours are present.
    const salaryRaw = el.salary.value;
    const recordedRaw = el.recordedHours.value;
    const salary = Number(salaryRaw);
    const hasSalary = salaryRaw !== '' && Number.isFinite(salary) && salary > 0;
    const hasRecorded = recordedRaw !== '';

    let payslip = null;
    if (hasSalary && hasRecorded) {
      const recordedHours = parseRecordedHours(recordedRaw);
      if (!Number.isFinite(recordedHours)) {
        return { error: 'Recorded hours must be hh:mm (e.g. 42:30) or decimal (e.g. 42.5).' };
      }
      const currency = el.currency.value;
      const otMult = Number.isFinite(overtimeMultiplier) ? overtimeMultiplier : 1;
      const btMult = Number.isFinite(belowTimeMultiplier) ? belowTimeMultiplier : 1;
      const hourlyRate = salary / expectedHours;

      let totalPay;
      if (recordedHours >= expectedHours) {
        const overtime = recordedHours - expectedHours;
        totalPay = hourlyRate * expectedHours + hourlyRate * overtime * otMult;
      } else {
        totalPay = hourlyRate * recordedHours * btMult;
      }

      payslip = {
        salary, currency, recordedRaw, recordedHours,
        hourlyRate, expectedHours, totalPay,
        overtimeMultiplier: otMult, belowTimeMultiplier: btMult
      };
    }

    return {
      startStr, endStr, hoursPerDay, weekendDays: [...weekendDays],
      totalDays: counts.totalDays,
      workingDays: counts.workingDays,
      weekendCount: counts.weekendCount,
      totalHours: expectedHours,
      payslip
    };
  }

  el.button.addEventListener('click', () => {
    const r = computeFromInputs();
    if (r.error) return alert(r.error);

    displayResult(r);

    pushHistory(STORAGE_KEYS.CALC_HISTORY, {
      id: Date.now(),
      startDate: r.startStr,
      endDate: r.endStr,
      hoursPerDay: r.hoursPerDay,
      weekendDays: r.weekendDays,
      totalDays: r.totalDays,
      workingDays: r.workingDays,
      weekendCount: r.weekendCount,
      totalHours: r.totalHours,
      payslip: r.payslip,
      timestamp: new Date().toISOString()
    });
    renderHistory();
  });

  el.clearBtn.addEventListener('click', () => {
    if (confirm('Clear all calculation history?')) {
      clearHistoryFor(STORAGE_KEYS.CALC_HISTORY);
      renderHistory();
    }
  });

  // Persist last inputs on every change so reopening the page restores them.
  ['startDate', 'endDate', 'salary', 'currency', 'recordedHours'].forEach(k => {
    const evt = el[k].tagName === 'SELECT' ? 'change' : 'input';
    el[k].addEventListener(evt, () => persistLastInputs?.({
      startDate: el.startDate.value,
      endDate: el.endDate.value,
      salary: el.salary.value,
      currency: el.currency.value,
      recordedHours: el.recordedHours.value
    }));
  });

  function displayResult(r) {
    el.totalDays.textContent = r.totalDays;
    el.weekendDaysOut.textContent = r.weekendCount;
    el.workingDays.textContent = r.workingDays;
    el.totalHours.textContent = r.totalHours.toLocaleString() + ' h';

    if (r.payslip) {
      el.hourlyRate.textContent = formatMoney(r.payslip.hourlyRate, r.payslip.currency);
      el.hoursDecimal.textContent = `${r.payslip.recordedHours.toFixed(2)} h (${formatHoursAsHM(r.payslip.recordedHours)})`;
      el.expectedHours.textContent = r.payslip.expectedHours.toFixed(2) + ' h';
      el.totalPay.textContent = formatMoney(r.payslip.totalPay, r.payslip.currency);
      el.payslipBlock.style.display = 'block';
    } else {
      el.payslipBlock.style.display = 'none';
    }
    el.result.style.display = 'block';
  }

  function renderHistory() {
    const history = loadJSON(STORAGE_KEYS.CALC_HISTORY, []);
    if (history.length === 0) {
      el.historyList.innerHTML = '<div class="empty">No calculations yet. Your history will appear here.</div>';
      return;
    }
    el.historyList.innerHTML = history.map(item => {
      const main = item.payslip
        ? `${formatMoney(item.payslip.totalPay, item.payslip.currency)} · ${formatHoursAsHM(item.payslip.recordedHours)}`
        : `${item.totalHours.toLocaleString()} hours · ${item.workingDays} days`;
      const sub = item.payslip
        ? `${formatDate(item.startDate)} → ${formatDate(item.endDate)} · ${formatMoney(item.payslip.hourlyRate, item.payslip.currency)}/h`
        : `${formatDate(item.startDate)} → ${formatDate(item.endDate)} · ${item.hoursPerDay}h/day`;
      return `
      <div class="history-item clickable" data-id="${item.id}" data-type="calc">
        <div class="details">
          <div class="main">${main}</div>
          <div class="sub">${sub}</div>
        </div>
        <div class="history-actions">
          <button class="icon-btn share" data-id="${item.id}" data-type="calc" title="Copy share link" aria-label="Copy share link">${SHARE_ICON}</button>
          <button class="icon-btn delete" data-id="${item.id}" data-type="calc" title="Delete" aria-label="Delete">×</button>
        </div>
      </div>`;
    }).join('');
  }

  function restore(item) {
    el.startDate.value = item.startDate;
    el.endDate.value = item.endDate;
    const patch = { hoursPerDay: item.hoursPerDay };
    if (Array.isArray(item.weekendDays)) patch.weekendDays = [...item.weekendDays];
    if (item.payslip) {
      patch.monthlySalary = item.payslip.salary;
      patch.currency = item.payslip.currency;
      if (typeof item.payslip.overtimeMultiplier === 'number') patch.overtimeMultiplier = item.payslip.overtimeMultiplier;
      if (typeof item.payslip.belowTimeMultiplier === 'number') patch.belowTimeMultiplier = item.payslip.belowTimeMultiplier;
      el.recordedHours.value = item.payslip.recordedRaw ?? String(item.payslip.recordedHours ?? '');
    } else {
      el.recordedHours.value = '';
    }
    updateSettings(patch);

    displayResult({
      totalDays: item.totalDays,
      workingDays: item.workingDays,
      weekendCount: item.weekendCount,
      totalHours: item.totalHours,
      payslip: item.payslip || null
    });
    el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function applyLastInputs(last) {
    if (!last) return;
    if (last.startDate) el.startDate.value = last.startDate;
    if (last.endDate) el.endDate.value = last.endDate;
    if (last.salary) el.salary.value = last.salary;
    if (last.currency) el.currency.value = last.currency;
    if (last.recordedHours != null) el.recordedHours.value = last.recordedHours;
  }

  // Build a payslip-shaped object for the invoice feature (compat with old API).
  function computePayslipForInvoice() {
    const r = computeFromInputs();
    if (r.error) return { error: r.error };
    if (!r.payslip) return { error: 'Please enter monthly salary and recorded hours to generate an invoice.' };
    return {
      ...r.payslip,
      hoursPerDay: r.hoursPerDay,
      hoursPerWeek: getSettings().hoursPerWeek
    };
  }

  renderHistory();
  return { restore, renderHistory, computeFromInputs: computePayslipForInvoice, applyLastInputs };
}

// ============================================================
// Cost Calculator (with freelancer multipliers)
// ============================================================
export function initCostCalculator({ getSettings, updateSettings }) {
  const el = {
    button: document.getElementById('calcCostBtn'),
    salary: document.getElementById('monthlySalary'),
    hoursPerDay: document.getElementById('costHoursPerDay'),
    hoursPerWeek: document.getElementById('workingHoursPerWeek'),
    currency: document.getElementById('currency'),
    result: document.getElementById('costResult'),
    daysPerMonth: document.getElementById('daysPerMonth'),
    hoursPerMonth: document.getElementById('hoursPerMonth'),
    dailyCost: document.getElementById('dailyCost'),
    hourlyCost: document.getElementById('hourlyCost'),
    multipliersBody: document.getElementById('multipliersBody'),
    historyList: document.getElementById('costHistory'),
    clearBtn: document.getElementById('clearCostHistory')
  };

  el.button.addEventListener('click', () => {
    const salary = Number(el.salary.value);
    const hoursPerDay = Number(el.hoursPerDay.value);
    const hoursPerWeek = Number(el.hoursPerWeek.value);
    const currency = el.currency.value;

    if (!salary || salary <= 0) return alert('Please enter a valid monthly salary.');
    if (!hoursPerDay || hoursPerDay <= 0) return alert('Please enter valid hours per day.');
    if (!hoursPerWeek || hoursPerWeek <= 0 || hoursPerWeek > 168) {
      return alert('Please enter valid working hours per week (1–168).');
    }

    const hoursPerMonth = hoursPerWeek * WEEKS_PER_MONTH;
    const daysPerMonth = hoursPerMonth / hoursPerDay;
    const dailyCost = salary / daysPerMonth;
    const hourlyCost = salary / hoursPerMonth;

    displayResult({ daysPerMonth, hoursPerMonth, dailyCost, hourlyCost, currency });

    pushHistory(STORAGE_KEYS.COST_HISTORY, {
      id: Date.now(),
      salary, currency, hoursPerDay, hoursPerWeek,
      daysPerMonth, hoursPerMonth, dailyCost, hourlyCost,
      timestamp: new Date().toISOString()
    });
    renderHistory();
  });

  el.clearBtn.addEventListener('click', () => {
    if (confirm('Clear all cost calculation history?')) {
      clearHistoryFor(STORAGE_KEYS.COST_HISTORY);
      renderHistory();
    }
  });

  function displayResult({ daysPerMonth, hoursPerMonth, dailyCost, hourlyCost, currency }) {
    el.daysPerMonth.textContent = daysPerMonth.toFixed(2);
    el.hoursPerMonth.textContent = hoursPerMonth.toFixed(2) + ' h';
    el.dailyCost.textContent = formatMoney(dailyCost, currency);
    el.hourlyCost.textContent = formatMoney(hourlyCost, currency);
    renderMultipliers(hourlyCost, dailyCost, currency);
    el.result.style.display = 'block';
  }

  function renderMultipliers(hourly, daily, currency) {
    el.multipliersBody.innerHTML = FREELANCER_MULTIPLIERS.map(m => `
      <tr>
        <td class="mult">${m}×</td>
        <td class="val">${formatMoney(hourly * m, currency)}</td>
        <td class="val">${formatMoney(daily * m, currency)}</td>
      </tr>
    `).join('');
  }

  function renderHistory() {
    const history = loadJSON(STORAGE_KEYS.COST_HISTORY, []);
    if (history.length === 0) {
      el.historyList.innerHTML = '<div class="empty">No calculations yet. Your history will appear here.</div>';
      return;
    }
    el.historyList.innerHTML = history.map(item => {
      const hpw = historyHoursPerWeek(item);
      const weekLabel = hpw != null ? `${hpw}h/wk` : `${item.daysPerWeek} d/wk`;
      return `
      <div class="history-item clickable" data-id="${item.id}" data-type="cost">
        <div class="details">
          <div class="main">${formatMoney(item.hourlyCost, item.currency)} / h · ${formatMoney(item.dailyCost, item.currency)} / day</div>
          <div class="sub">Salary ${formatMoney(item.salary, item.currency)} · ${item.hoursPerDay}h/day · ${weekLabel}</div>
        </div>
        <div class="history-actions">
          <button class="icon-btn share" data-id="${item.id}" data-type="cost" title="Copy share link" aria-label="Copy share link">${SHARE_ICON}</button>
          <button class="icon-btn delete" data-id="${item.id}" data-type="cost" title="Delete" aria-label="Delete">×</button>
        </div>
      </div>`;
    }).join('');
  }

  function restore(item) {
    const hpw = historyHoursPerWeek(item) ?? getSettings().hoursPerWeek;
    updateSettings({
      monthlySalary: item.salary,
      currency: item.currency,
      hoursPerDay: item.hoursPerDay,
      hoursPerWeek: hpw
    });

    const hoursPerMonth = item.hoursPerMonth ?? (hpw * WEEKS_PER_MONTH);
    const daysPerMonth = item.daysPerMonth ?? (hoursPerMonth / item.hoursPerDay);

    displayResult({
      daysPerMonth,
      hoursPerMonth,
      dailyCost: item.dailyCost,
      hourlyCost: item.hourlyCost,
      currency: item.currency
    });
    el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderHistory();
  return { restore, renderHistory };
}


// ============================================================
// Shared history event delegation (delete + click-to-restore)
// ============================================================
export function initHistoryDelegation({ calc, cost, onShare }) {
  const typeMap = {
    calc: { key: STORAGE_KEYS.CALC_HISTORY, feature: calc },
    cost: { key: STORAGE_KEYS.COST_HISTORY, feature: cost }
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest?.('.icon-btn');
    if (btn) {
      const type = btn.dataset.type;
      if (!type || !typeMap[type]) return;
      e.stopPropagation();
      const id = Number(btn.dataset.id);

      if (btn.classList.contains('delete')) {
        deleteHistoryEntry(typeMap[type].key, id);
        typeMap[type].feature.renderHistory();
        return;
      }

      if (btn.classList.contains('share') && typeof onShare === 'function') {
        const item = loadJSON(typeMap[type].key, []).find(h => h.id === id);
        if (item) onShare(type, item);
        return;
      }
    }

    const itemEl = e.target.closest?.('.history-item.clickable');
    if (!itemEl) return;
    const itemType = itemEl.dataset.type;
    if (!typeMap[itemType]) return;

    const id = Number(itemEl.dataset.id);
    const item = loadJSON(typeMap[itemType].key, []).find(h => h.id === id);
    if (item) typeMap[itemType].feature.restore(item);
  });
}
