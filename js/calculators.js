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
// Hours Calculator
// ============================================================
export function initHoursCalculator({ getSettings, updateSettings }) {
  const el = {
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    hoursPerDay: document.getElementById('hoursPerDay'),
    button: document.getElementById('calcHoursBtn'),
    result: document.getElementById('hoursResult'),
    totalDays: document.getElementById('totalDays'),
    weekendDaysOut: document.getElementById('weekendDays'),
    workingDays: document.getElementById('workingDays'),
    totalHours: document.getElementById('totalHours'),
    historyList: document.getElementById('hoursHistory'),
    clearBtn: document.getElementById('clearHoursHistory')
  };

  el.button.addEventListener('click', () => {
    const startStr = el.startDate.value;
    const endStr = el.endDate.value;
    const hoursPerDay = Number(el.hoursPerDay.value);
    const { weekendDays } = getSettings();

    if (!startStr || !endStr) return alert('Please select both start and end dates.');
    if (!hoursPerDay || hoursPerDay <= 0) return alert('Please enter a valid number of hours per day.');

    const counts = countDaysInRange(startStr, endStr, weekendDays);
    if (!counts) return alert('End date must be on or after the start date.');

    const totalHours = counts.workingDays * hoursPerDay;
    displayResult({ ...counts, totalHours });

    pushHistory(STORAGE_KEYS.HOURS_HISTORY, {
      id: Date.now(),
      startDate: startStr,
      endDate: endStr,
      hoursPerDay,
      weekendDays: [...weekendDays],
      totalDays: counts.totalDays,
      workingDays: counts.workingDays,
      weekendCount: counts.weekendCount,
      totalHours,
      timestamp: new Date().toISOString()
    });
    renderHistory();
  });

  el.clearBtn.addEventListener('click', () => {
    if (confirm('Clear all hours calculation history?')) {
      clearHistoryFor(STORAGE_KEYS.HOURS_HISTORY);
      renderHistory();
    }
  });

  function displayResult({ totalDays, workingDays, weekendCount, totalHours }) {
    el.totalDays.textContent = totalDays;
    el.weekendDaysOut.textContent = weekendCount;
    el.workingDays.textContent = workingDays;
    el.totalHours.textContent = totalHours.toLocaleString() + ' h';
    el.result.style.display = 'block';
  }

  function renderHistory() {
    const history = loadJSON(STORAGE_KEYS.HOURS_HISTORY, []);
    if (history.length === 0) {
      el.historyList.innerHTML = '<div class="empty">No calculations yet. Your history will appear here.</div>';
      return;
    }
    el.historyList.innerHTML = history.map(item => `
      <div class="history-item clickable" data-id="${item.id}" data-type="hours">
        <div class="details">
          <div class="main">${item.totalHours.toLocaleString()} hours · ${item.workingDays} days</div>
          <div class="sub">${formatDate(item.startDate)} → ${formatDate(item.endDate)} · ${item.hoursPerDay}h/day</div>
        </div>
        <button class="delete" data-id="${item.id}" data-type="hours" title="Delete">×</button>
      </div>
    `).join('');
  }

  function restore(item) {
    el.startDate.value = item.startDate;
    el.endDate.value = item.endDate;
    updateSettings({
      weekendDays: [...item.weekendDays],
      hoursPerDay: item.hoursPerDay
    });
    displayResult({
      totalDays: item.totalDays,
      workingDays: item.workingDays,
      weekendCount: item.weekendCount,
      totalHours: item.totalHours
    });
    el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderHistory();
  return { restore, renderHistory };
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
        <button class="delete" data-id="${item.id}" data-type="cost" title="Delete">×</button>
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
// Payslip Calculator
// ============================================================
export function initPayslipCalculator({ getSettings, updateSettings }) {
  const el = {
    button: document.getElementById('calcPayslipBtn'),
    salary: document.getElementById('payslipSalary'),
    currency: document.getElementById('payslipCurrency'),
    recordedHours: document.getElementById('payslipRecordedHours'),
    hoursPerDay: document.getElementById('payslipHoursPerDay'),
    hoursPerWeek: document.getElementById('payslipHoursPerWeek'),
    overtimeMultiplier: document.getElementById('payslipOvertimeMultiplier'),
    overtimeMultiplierValue: document.getElementById('payslipOvertimeMultiplierValue'),
    belowTimeMultiplier: document.getElementById('payslipBelowTimeMultiplier'),
    belowTimeMultiplierValue: document.getElementById('payslipBelowTimeMultiplierValue'),
    result: document.getElementById('payslipResult'),
    hourlyRate: document.getElementById('payslipHourlyRate'),
    hoursDecimal: document.getElementById('payslipHoursDecimal'),
    expectedHours: document.getElementById('payslipExpectedHours'),
    totalPay: document.getElementById('payslipTotalPay'),
    historyList: document.getElementById('payslipHistory'),
    clearBtn: document.getElementById('clearPayslipHistory')
  };

  function syncMultiplierUI(slider, valueEl) {
    const v = Number(slider.value);
    valueEl.textContent = `${v.toFixed(2)}x`;
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 3;
    const pct = ((v - min) / (max - min)) * 100;
    slider.style.setProperty('--fill', `${pct}%`);
  }
  [
    [el.overtimeMultiplier, el.overtimeMultiplierValue],
    [el.belowTimeMultiplier, el.belowTimeMultiplierValue]
  ].forEach(([slider, valueEl]) => {
    syncMultiplierUI(slider, valueEl);
    slider.addEventListener('input', () => syncMultiplierUI(slider, valueEl));
  });

  // Exposed to the Invoice feature so it can read current payslip inputs.
  function computeFromInputs() {
    const salary = Number(el.salary.value);
    const currency = el.currency.value;
    const recordedRaw = el.recordedHours.value;
    const hoursPerDay = Number(el.hoursPerDay.value);
    const hoursPerWeek = Number(el.hoursPerWeek.value);

    if (!salary || salary <= 0) return { error: 'Please enter a valid monthly salary.' };
    const recordedHours = parseRecordedHours(recordedRaw);
    if (!Number.isFinite(recordedHours)) {
      return { error: 'Please enter recorded hours as hh:mm (e.g. 42:30) or decimal (e.g. 42.5).' };
    }
    if (!hoursPerDay || hoursPerDay <= 0) return { error: 'Please enter valid hours per day.' };
    if (!hoursPerWeek || hoursPerWeek <= 0 || hoursPerWeek > 168) {
      return { error: 'Please enter valid working hours per week (1–168).' };
    }

    const expectedHours = hoursPerWeek * WEEKS_PER_MONTH;
    const hourlyRate = salary / expectedHours;
    const overtimeMultiplier = Number(el.overtimeMultiplier.value);
    const belowTimeMultiplier = Number(el.belowTimeMultiplier.value);

    let totalPay;
    if (recordedHours >= expectedHours) {
      const overtimeHours = recordedHours - expectedHours;
      totalPay = hourlyRate * expectedHours + hourlyRate * overtimeHours * overtimeMultiplier;
    } else {
      totalPay = hourlyRate * recordedHours * belowTimeMultiplier;
    }

    return {
      salary, currency, recordedRaw, recordedHours,
      hoursPerDay, hoursPerWeek, expectedHours, hourlyRate,
      overtimeMultiplier, belowTimeMultiplier, totalPay
    };
  }

  el.button.addEventListener('click', () => {
    const r = computeFromInputs();
    if (r.error) return alert(r.error);

    displayResult(r);
    pushHistory(STORAGE_KEYS.PAYSLIP_HISTORY, {
      id: Date.now(),
      salary: r.salary,
      currency: r.currency,
      recordedInput: r.recordedRaw,
      recordedHours: r.recordedHours,
      hoursPerDay: r.hoursPerDay,
      hoursPerWeek: r.hoursPerWeek,
      expectedHours: r.expectedHours,
      hourlyRate: r.hourlyRate,
      overtimeMultiplier: r.overtimeMultiplier,
      belowTimeMultiplier: r.belowTimeMultiplier,
      totalPay: r.totalPay,
      timestamp: new Date().toISOString()
    });
    renderHistory();
  });

  el.clearBtn.addEventListener('click', () => {
    if (confirm('Clear all payslip history?')) {
      clearHistoryFor(STORAGE_KEYS.PAYSLIP_HISTORY);
      renderHistory();
    }
  });

  function displayResult(r) {
    el.hourlyRate.textContent = formatMoney(r.hourlyRate, r.currency);
    el.hoursDecimal.textContent = `${r.recordedHours.toFixed(2)} h (${formatHoursAsHM(r.recordedHours)})`;
    el.expectedHours.textContent = r.expectedHours.toFixed(2) + ' h';
    el.totalPay.textContent = formatMoney(r.totalPay, r.currency);
    el.result.style.display = 'block';
  }

  function renderHistory() {
    const history = loadJSON(STORAGE_KEYS.PAYSLIP_HISTORY, []);
    if (history.length === 0) {
      el.historyList.innerHTML = '<div class="empty">No payslips yet. Your history will appear here.</div>';
      return;
    }
    el.historyList.innerHTML = history.map(item => `
      <div class="history-item clickable" data-id="${item.id}" data-type="payslip">
        <div class="details">
          <div class="main">${formatMoney(item.totalPay, item.currency)} · ${formatHoursAsHM(item.recordedHours)}</div>
          <div class="sub">Salary ${formatMoney(item.salary, item.currency)} · ${formatMoney(item.hourlyRate, item.currency)}/h</div>
        </div>
        <button class="delete" data-id="${item.id}" data-type="payslip" title="Delete">×</button>
      </div>
    `).join('');
  }

  function restore(item) {
    const hpw = historyHoursPerWeek(item) ?? getSettings().hoursPerWeek;
    updateSettings({
      monthlySalary: item.salary,
      currency: item.currency,
      hoursPerDay: item.hoursPerDay,
      hoursPerWeek: hpw
    });
    el.recordedHours.value = item.recordedInput;
    if (typeof item.overtimeMultiplier === 'number') {
      el.overtimeMultiplier.value = item.overtimeMultiplier;
      syncMultiplierUI(el.overtimeMultiplier, el.overtimeMultiplierValue);
    }
    if (typeof item.belowTimeMultiplier === 'number') {
      el.belowTimeMultiplier.value = item.belowTimeMultiplier;
      syncMultiplierUI(el.belowTimeMultiplier, el.belowTimeMultiplierValue);
    }

    displayResult({
      hourlyRate: item.hourlyRate,
      recordedHours: item.recordedHours,
      expectedHours: item.expectedHours,
      totalPay: item.totalPay,
      currency: item.currency
    });
    el.result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  renderHistory();
  return { restore, renderHistory, computeFromInputs };
}

// ============================================================
// Shared history event delegation (delete + click-to-restore)
// ============================================================
export function initHistoryDelegation({ hours, cost, payslip }) {
  const typeMap = {
    hours: { key: STORAGE_KEYS.HOURS_HISTORY, feature: hours },
    cost: { key: STORAGE_KEYS.COST_HISTORY, feature: cost },
    payslip: { key: STORAGE_KEYS.PAYSLIP_HISTORY, feature: payslip }
  };

  document.addEventListener('click', e => {
    const target = e.target;
    const type = target.dataset?.type;

    if (target.classList.contains('delete') && type && typeMap[type]) {
      e.stopPropagation();
      const id = Number(target.dataset.id);
      deleteHistoryEntry(typeMap[type].key, id);
      typeMap[type].feature.renderHistory();
      return;
    }

    const itemEl = target.closest('.history-item.clickable');
    if (!itemEl) return;
    const itemType = itemEl.dataset.type;
    if (!typeMap[itemType]) return;

    const id = Number(itemEl.dataset.id);
    const item = loadJSON(typeMap[itemType].key, []).find(h => h.id === id);
    if (item) typeMap[itemType].feature.restore(item);
  });
}
