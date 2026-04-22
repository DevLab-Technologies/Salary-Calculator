// Pure utility functions and constants — no DOM, no storage, no side effects.

export const CURRENCY_SYMBOLS = Object.freeze({
  USD: '$',
  SAR: '﷼',
  EUR: '€',
  GBP: '£',
  AED: 'د.إ',
  EGP: 'E£'
});

export const CURRENCY_OPTIONS = Object.freeze(['USD', 'SAR', 'EUR', 'GBP', 'AED', 'EGP']);

export const FREELANCER_MULTIPLIERS = Object.freeze([2, 3, 4, 5]);

export const WEEKS_PER_YEAR = 52;
export const MONTHS_PER_YEAR = 12;
export const WEEKS_PER_MONTH = WEEKS_PER_YEAR / MONTHS_PER_YEAR;

export const WEEKDAY_NAMES = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

export function formatMoney(amount, currency) {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${symbol} ${formatted}`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatHoursAsHM(decimalHours) {
  const totalMinutes = Math.round(decimalHours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Accepts "hh:mm" (e.g. "42:30") or a decimal string (e.g. "42.5"). Returns decimal hours or NaN.
export function parseRecordedHours(raw) {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;

  if (s.includes(':')) {
    const parts = s.split(':');
    if (parts.length !== 2) return NaN;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    if (h < 0 || m < 0 || m >= 60) return NaN;
    return h + m / 60;
  }

  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// Counts calendar days between startStr and endStr (inclusive), splitting into
// workingDays and weekendCount based on weekendDaysArr (0=Sun..6=Sat).
// Returns { totalDays, workingDays, weekendCount } or null on invalid input.
export function countDaysInRange(startStr, endStr, weekendDaysArr) {
  if (!startStr || !endStr) return null;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return null;

  let totalDays = 0;
  let weekendCount = 0;
  let workingDays = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    totalDays++;
    if (weekendDaysArr.includes(cursor.getDay())) weekendCount++;
    else workingDays++;
    cursor.setDate(cursor.getDate() + 1);
  }

  return { totalDays, workingDays, weekendCount };
}

export function workingHoursInRange(startStr, endStr, hoursPerDay, weekendDaysArr) {
  const counts = countDaysInRange(startStr, endStr, weekendDaysArr);
  return counts ? counts.workingDays * hoursPerDay : null;
}

// First day and last day of the month preceding the reference date (defaults to today).
export function previousMonthRange(referenceDate = new Date()) {
  const first = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const last = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
  return {
    start: first.toISOString().split('T')[0],
    end: last.toISOString().split('T')[0]
  };
}

// Average monthly working hours based on a weekly schedule.
export function avgMonthlyHours(hoursPerWeek) {
  return hoursPerWeek * WEEKS_PER_MONTH;
}
