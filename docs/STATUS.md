# Status (16 November 2026)

An honest summary of what was built and verified, what is partial, and what remains.

## Verified

- **Backend tests: 46 passing** (`python manage.py test apps`), on SQLite.
- **Frontend tests: 19 passing** (`npm test`), TypeScript strict type check clean, production build succeeds.
- **Language check passing**: 630 keys used in code; English, French and Kinyarwanda files identical in structure.
- **Manually checked in a browser** against the running app with demo data: landing page, sign-in, landlord Overview (real counts), property detail, unit Digital Property Passport (conditions, history, photo comparison), maintenance request detail with timeline, Rent & Finances totals, the inspection wizard's first step, the tenant home in Kinyarwanda (including dates), switching to French without signing out (saved to the account), and the full 4-step "Report a Problem" with a photo, the landlord notification and the protected photo download.

## Completed (phases 1–5)

- Accounts: sign up (landlord/manager), sign in/out, password reset by email, change password, profile, language and text-size preferences, role-based redirect, CSRF, rate limiting.
- Property and unit management with photos; property portfolio cards; property page tabs (Overview | Units | Condition | Maintenance | Expenses); property managers with optional money permission.
- Secure tenant invitations (hashed single-use links, 14 days, copy/WhatsApp share, new link, cancel), acceptance creating a tenant account, move-out with history kept and tenant access removed.
- Digital Property Passport: room-by-room inspections (move-in / regular / move-out), Good / Needs attention / Damaged / Not checked, notes, photos, resumable drafts, locking on completion, condition history, photo history and side-by-side comparison.
- Tenant maintenance reporting (4 guided steps, camera capture, reference number), status tracking with a plain-language progress bar and timeline, messages, extra photos.
- Landlord maintenance workspace: list (default) and board views; filters by status, priority, property, kind and dates; search; sort by urgency; approve/start/resolve/close/re-open; assign repair person; internal notes; before/after photos; record repair with cost.
- Expenses with receipts, per property and category, totals, and no double counting of repair costs.
- Rent: monthly charges generated from tenancy terms, manual payments (cash / mobile money / bank), month-by-month status, outstanding and overdue, tenant view when shared.
- Financial summary: rent due vs received, outstanding, maintenance vs other expenses, net cash flow, occupancy, per-property table, simple monthly bar chart with a text table for screen readers, written definitions and exclusions.
- Overview dashboard with "Needs Your Attention" (urgent first, overdue rent, empty units), counters from the database, recent repairs, recent activity, quick actions. Tenant home with the large "Report a Problem" button.
- In-app notifications (unread state, links to records, de-duplication of repeated messages).
- English, Kinyarwanda and French throughout; audit log; protected file access; OpenAPI docs at `/api/docs/`.

## Partial / needs attention

- **Kinyarwanda needs a native-speaker review** before real use (31 uncertain terms listed in `frontend/src/locales/review.json`). French review is recommended.
- **PostgreSQL**: the code targets PostgreSQL and uses only portable features, but the test suite was run on SQLite here because the local PostgreSQL servers need a password that was not available. Run `migrate` and the tests once with `DATABASE_URL` set.
- **Browser end-to-end tests**: journeys A–F are automated at the API level (`apps/core/tests/test_journeys.py`, with real sessions and CSRF), and key screens are covered by component tests; there is no Playwright/Cypress suite driving a real browser yet.
- **Accessibility**: designed for WCAG 2.2 AA (contrast tokens, labels, focus, target sizes, reduced motion), but no formal audit with a screen reader or automated tool (axe) has been done, and zoom/large-text testing was limited.
- **Responsive layouts** were built mobile-first, but only spot-checked; a full pass on real phones and tablets is still to do.
- **Email** is printed to the console in development; real delivery needs SMTP settings. In-app notifications work without it.
- **Progressive web app**: a web manifest is included; there is no service worker or offline mode.
- **Help page** contact phone/email are placeholders for the operator to fill in.

## Not built (possible next steps)

- Real mobile-money or bank payment integration (payments are recorded manually by design).
- Technician accounts (repair people are recorded by name/phone, as allowed for the first version).
- Organisation model for several co-owners/staff; lease document uploads; recurring expense templates.
- Exports (PDF/Excel) of the passport, inspections and financial summary (an inspection can be printed from the browser).
- Route-level code splitting to make the first load lighter on slow connections.
