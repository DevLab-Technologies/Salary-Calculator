# Salary Calculator

A zero-dependency, offline-first calculator for working hours, hourly/daily cost, payslips, and freelance invoices. Everything runs in the browser — no backend, no tracking, all data stored locally in `localStorage`.

## Features

- **Working Hours** — count working days and hours between two dates, excluding configurable weekend days.
- **Hourly / Daily Cost** — derive hourly and daily cost from a monthly salary, with built-in **freelancer rate multipliers** (2x, 3x, 4x, 5x).
- **Payslip Calculator** — compute total pay from monthly salary and recorded hours. Accepts `hh:mm` or decimal input.
- **Invoice Generator** — produce a print-ready invoice (PDF via the browser's print dialog) from a calculated payslip. Includes:
  - From / Bill To sections (your details come from Settings)
  - Service period, issue date, and auto-generated invoice number
  - Expected hours for the actual service period (not the monthly average)
  - Bank account details
- **Saved Customers** — save and pick from multiple customer profiles when generating invoices.
- **Settings** — one place to set your weekend days, work schedule, salary, currency, and invoice details (name, address, bank info).
- **History** — the last 50 calculations of each type are saved. Click any entry to restore it; ✕ to delete.

## Project Structure

```
├── index.html           — Markup only (no inline styles/scripts)
├── css/
│   └── styles.css       — All styles, grouped by concern
├── js/
│   ├── app.js           — Bootstrap: settings state, tabs, input sync
│   ├── utils.js         — Pure helpers and constants (no DOM, no storage)
│   ├── storage.js       — localStorage wrapper + settings persistence/migration
│   ├── calculators.js   — Hours, Cost, Payslip features + history delegation
│   └── invoice.js       — Invoice modal + saved-customers CRUD
├── assets/
│   └── favicon.svg
└── README.md
```

### Architecture notes

- **ES modules.** `index.html` loads a single `<script type="module" src="js/app.js">`; everything else is imported.
- **Single source of truth for settings.** `app.js` owns a `settings` object, persists it, and notifies subscribers. Inputs that appear in multiple tabs (hours/day, hours/week, currency, salary) are wired through a `bindSharedField` helper so editing any one keeps the rest in sync.
- **Self-contained features.** Each calculator exposes `{ restore, renderHistory, computeFromInputs? }`. `initHistoryDelegation` handles clicks for delete and restore across all three.
- **No frameworks, no build step.** Open the file, or serve it statically — that's it.

## Running Locally

ES modules don't load from `file://`, so serve over HTTP:

```bash
# Python 3
python3 -m http.server 8000

# Node
npx serve
```

Then open <http://localhost:8000>.

## Deployment

Deploys as a static site — any static host works (Cloudflare Pages, Netlify, GitHub Pages, Vercel, S3/CloudFront).

### Cloudflare Pages

```bash
npx wrangler pages deploy . --project-name=salary-calculator --branch=main
```

## Data & Privacy

All state is stored in `localStorage` under the `workCalc.*` namespace:

| Key | Contents |
| --- | --- |
| `workCalc.settings` | Preferences (weekend days, schedule, salary, currency, invoice details) |
| `workCalc.hoursHistory` | Last 50 working-hours calculations |
| `workCalc.costHistory` | Last 50 cost calculations |
| `workCalc.payslipHistory` | Last 50 payslips |
| `workCalc.customers` | Saved customer profiles |
| `workCalc.lastCustomerId` | ID of the most recently used customer |

No data leaves the browser. Clearing site data in the browser wipes everything.

## Browser Support

Modern evergreen browsers (Chrome, Firefox, Safari, Edge). Requires support for ES modules and `localStorage`.

## License

MIT
