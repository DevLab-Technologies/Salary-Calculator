// Invoice modal, saved customers CRUD, and print-ready preview rendering.

import {
  escapeHtml,
  formatDate,
  formatHoursAsHM,
  formatMoney,
  previousMonthRange,
  todayISO,
  workingHoursInRange
} from './utils.js';

import {
  DEFAULT_INVOICE_DESCRIPTION,
  STORAGE_KEYS,
  loadJSON,
  readString,
  removeKey,
  saveJSON,
  writeString
} from './storage.js';

export function initInvoice({ getSettings, onSettingsChange, computePayslip }) {
  const el = {
    modal: document.getElementById('invoiceModal'),
    preview: document.getElementById('invoicePreview'),
    openBtn: document.getElementById('openInvoiceBtn'),
    closeBtn: document.getElementById('closeInvoiceBtn'),
    closeXBtn: document.getElementById('closeInvoiceModal'),
    printBtn: document.getElementById('printInvoiceBtn'),

    customerName: document.getElementById('invoiceCustomerName'),
    customerAddress: document.getElementById('invoiceCustomerAddress'),
    serviceStart: document.getElementById('invoiceServiceStart'),
    serviceEnd: document.getElementById('invoiceServiceEnd'),
    issueDate: document.getElementById('invoiceIssueDate'),
    number: document.getElementById('invoiceNumber'),

    customerSelect: document.getElementById('invoiceCustomerSelect'),
    saveCustomerBtn: document.getElementById('saveCustomerBtn'),
    deleteCustomerBtn: document.getElementById('deleteCustomerBtn')
  };

  let currentPayslip = null;

  wireCustomerControls();
  wireModalControls();
  wirePreviewTriggers();

  // ============================================================
  // Customers (saved list)
  // ============================================================
  function loadCustomers() {
    const list = loadJSON(STORAGE_KEYS.CUSTOMERS, null);
    if (Array.isArray(list)) return list;

    // One-time migration from legacy single-customer storage
    const legacy = loadJSON(STORAGE_KEYS.LEGACY_INVOICE_CUSTOMER, null);
    const migrated = (legacy && legacy.name)
      ? [{ id: Date.now(), name: legacy.name, address: legacy.address || '' }]
      : [];
    saveJSON(STORAGE_KEYS.CUSTOMERS, migrated);
    return migrated;
  }

  function saveCustomers(customers) {
    saveJSON(STORAGE_KEYS.CUSTOMERS, customers);
  }

  function setLastCustomerId(id) {
    if (id) writeString(STORAGE_KEYS.LAST_CUSTOMER_ID, String(id));
    else removeKey(STORAGE_KEYS.LAST_CUSTOMER_ID);
  }

  function getLastCustomerId() {
    return readString(STORAGE_KEYS.LAST_CUSTOMER_ID);
  }

  function renderCustomerSelect(selectedId) {
    const customers = loadCustomers();
    const sid = selectedId == null ? '' : String(selectedId);
    el.customerSelect.innerHTML =
      '<option value="">— New customer —</option>' +
      customers.map(c => {
        const isSelected = String(c.id) === sid ? ' selected' : '';
        return `<option value="${c.id}"${isSelected}>${escapeHtml(c.name)}</option>`;
      }).join('');
  }

  function loadCustomerIntoForm(customer) {
    el.customerName.value = customer ? customer.name : '';
    el.customerAddress.value = customer ? (customer.address || '') : '';
  }

  function wireCustomerControls() {
    el.customerSelect.addEventListener('change', e => {
      const id = e.target.value;
      if (!id) {
        loadCustomerIntoForm(null);
        setLastCustomerId('');
      } else {
        const customer = loadCustomers().find(c => String(c.id) === String(id));
        if (customer) {
          loadCustomerIntoForm(customer);
          setLastCustomerId(customer.id);
        }
      }
      refreshPreview();
    });

    el.saveCustomerBtn.addEventListener('click', () => {
      const name = el.customerName.value.trim();
      const address = el.customerAddress.value.trim();
      if (!name) {
        alert('Enter a customer name before saving.');
        el.customerName.focus();
        return;
      }
      const customers = loadCustomers();
      const selectedId = el.customerSelect.value;
      let savedId = null;

      if (selectedId) {
        const idx = customers.findIndex(c => String(c.id) === String(selectedId));
        if (idx !== -1) {
          customers[idx] = { ...customers[idx], name, address };
          savedId = customers[idx].id;
        }
      }
      if (savedId == null) {
        // Merge by name if an entry already exists
        const existing = customers.find(c => c.name.trim().toLowerCase() === name.toLowerCase());
        if (existing) {
          existing.address = address;
          savedId = existing.id;
        } else {
          const newCustomer = { id: Date.now(), name, address };
          customers.push(newCustomer);
          savedId = newCustomer.id;
        }
      }

      saveCustomers(customers);
      renderCustomerSelect(savedId);
      setLastCustomerId(savedId);
    });

    el.deleteCustomerBtn.addEventListener('click', () => {
      const id = el.customerSelect.value;
      if (!id) {
        alert('Select a saved customer to delete.');
        return;
      }
      if (!confirm('Delete this saved customer?')) return;
      const remaining = loadCustomers().filter(c => String(c.id) !== String(id));
      saveCustomers(remaining);
      renderCustomerSelect('');
      loadCustomerIntoForm(null);
      setLastCustomerId('');
      refreshPreview();
    });
  }

  // ============================================================
  // Modal open/close
  // ============================================================
  function openModal() {
    const r = computePayslip();
    if (r.error) { alert(r.error); return; }
    currentPayslip = r;

    if (!el.issueDate.value) el.issueDate.value = todayISO();
    if (!el.number.value) el.number.value = generateInvoiceNumber();
    if (!el.serviceStart.value || !el.serviceEnd.value) {
      const period = previousMonthRange();
      el.serviceStart.value = period.start;
      el.serviceEnd.value = period.end;
    }

    // Populate saved-customers list and preselect the last-used one if still present
    const customers = loadCustomers();
    const lastId = getLastCustomerId();
    const lastCustomer = lastId ? customers.find(c => String(c.id) === String(lastId)) : null;
    renderCustomerSelect(lastCustomer ? lastCustomer.id : '');

    // Only prefill form inputs if empty (preserves in-progress edits)
    if (lastCustomer && !el.customerName.value && !el.customerAddress.value) {
      loadCustomerIntoForm(lastCustomer);
    }

    renderPreview(currentPayslip);
    el.modal.classList.add('active');
    el.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    el.modal.classList.remove('active');
    el.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function refreshPreview() {
    if (currentPayslip) renderPreview(currentPayslip);
  }

  function wireModalControls() {
    el.openBtn.addEventListener('click', openModal);
    el.closeBtn.addEventListener('click', closeModal);
    el.closeXBtn.addEventListener('click', closeModal);
    el.printBtn.addEventListener('click', () => window.print());

    el.modal.addEventListener('click', e => {
      if (e.target === el.modal) closeModal();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && el.modal.classList.contains('active')) closeModal();
    });
  }

  function wirePreviewTriggers() {
    const inputs = [
      el.customerName, el.customerAddress, el.serviceStart,
      el.serviceEnd, el.issueDate, el.number
    ];
    inputs.forEach(input => input.addEventListener('input', refreshPreview));

    // Re-render when employee/bank settings change while modal is open
    onSettingsChange((next, prev) => {
      if (!el.modal.classList.contains('active')) return;
      if (
        next.employeeName !== prev.employeeName ||
        next.employeeAddress !== prev.employeeAddress ||
        next.bankDetails !== prev.bankDetails
      ) refreshPreview();
    });
  }

  // ============================================================
  // Invoice number
  // ============================================================
  function generateInvoiceNumber() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const suffix = Math.floor(100 + Math.random() * 900);
    return `INV-${yyyy}${mm}${dd}-${suffix}`;
  }

  // ============================================================
  // Preview rendering
  // ============================================================
  function renderPreview(payslip) {
    const settings = getSettings();

    const customerName = el.customerName.value.trim();
    const customerAddress = el.customerAddress.value.trim();
    const serviceStart = el.serviceStart.value;
    const serviceEnd = el.serviceEnd.value;
    const issueDate = el.issueDate.value;
    const invoiceNumber = el.number.value.trim();

    const employeeName = (settings.employeeName || '').trim();
    const employeeAddress = (settings.employeeAddress || '').trim();
    const bankDetails = (settings.bankDetails || '').trim();
    const lineDescription = (settings.invoiceDescription || '').trim() || DEFAULT_INVOICE_DESCRIPTION;

    const periodLabel = (serviceStart && serviceEnd)
      ? `${formatDate(serviceStart)} — ${formatDate(serviceEnd)}`
      : '—';

    // Period-specific expected hours (falls back to monthly average)
    const periodExpected = workingHoursInRange(
      serviceStart, serviceEnd, payslip.hoursPerDay, settings.weekendDays
    );
    const expectedHours = periodExpected ?? payslip.expectedHours;

    el.preview.innerHTML = `
      <div class="inv-header">
        <div class="inv-title">INVOICE</div>
        <div class="inv-meta">
          <div class="muted">Invoice No.</div>
          <div>${escapeHtml(invoiceNumber || '—')}</div>
          <div class="muted" style="margin-top:8px">Issue Date</div>
          <div>${formatDate(issueDate)}</div>
        </div>
      </div>

      <div class="inv-parties">
        <div class="inv-party">
          <h4>From</h4>
          <div class="name">${escapeHtml(employeeName || '[Your Name]')}</div>
          <div class="addr">${escapeHtml(employeeAddress || '[Your address — set in Settings]')}</div>
        </div>
        <div class="inv-party">
          <h4>Bill To</h4>
          <div class="name">${escapeHtml(customerName || '[Customer Name]')}</div>
          <div class="addr">${escapeHtml(customerAddress || '[Customer address]')}</div>
        </div>
      </div>

      <div class="inv-period">
        <strong>Service Period:</strong> ${periodLabel}
      </div>

      <table class="inv-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="num">Hours</th>
            <th class="num">Rate</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              ${escapeHtml(lineDescription)}
              <div class="sub">
                Expected: ${expectedHours.toFixed(2)} h
                · ${payslip.hoursPerDay} h/day
                · ${payslip.hoursPerWeek} h/week
              </div>
            </td>
            <td class="num">${payslip.recordedHours.toFixed(2)} (${formatHoursAsHM(payslip.recordedHours)})</td>
            <td class="num">${formatMoney(payslip.hourlyRate, payslip.currency)}</td>
            <td class="num">${formatMoney(payslip.totalPay, payslip.currency)}</td>
          </tr>
          <tr class="inv-total-row">
            <td colspan="3" class="num">Total Due</td>
            <td class="num">${formatMoney(payslip.totalPay, payslip.currency)}</td>
          </tr>
        </tbody>
      </table>

      <div class="inv-bank">
        <h4>Payment Details</h4>
        <div class="details">${escapeHtml(bankDetails || '[Add bank account details in Settings]')}</div>
      </div>

      <div class="inv-footer">Thank you for your business.</div>
    `;
  }
}
