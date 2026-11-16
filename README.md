# Rental_Control

**Rental property condition, maintenance and profit management — built to be simple enough for anyone.**

Rental_Control helps landlords in Rwanda (and later elsewhere) manage their rental houses in one place:

- **Properties and units** — every house, apartment or room, with photos and occupancy.
- **Digital Property Passport** — a dated history of each unit: room-by-room inspections, photos, repairs and costs.
- **Report a Problem** — tenants report problems from their phone in 4 steps, with photos, and follow the repair.
- **Maintenance workspace** — landlords review, approve, track and record repairs, with a timeline that can't be rewritten.
- **Expenses, rent and profitability** — recorded rent, expenses, what is still owed, and net cash flow per property.
- **English, Kinyarwanda and French** everywhere, switchable at any time without signing out.

The interface is designed for older and non-technical users: large text and buttons, plain words, a label on every icon, guided step-by-step forms, confirmations before anything destructive, and an optional larger-text mode.

---

## Contents

- [Quick start (local)](#quick-start-local)
- [Demo accounts](#demo-accounts)
- [Running the tests](#running-the-tests)
- [Project structure](#project-structure)
- [Using PostgreSQL](#using-postgresql)
- [API documentation](#api-documentation)
- [Further documentation](#further-documentation)
- [Status: what is done, partial and remaining](#status)

## Quick start (local)

Requirements: **Python 3.12**, **Node.js 20+** (tested with 22), and optionally **PostgreSQL 14+**.

### 1. Backend (Django API, port 8000)

```bash
cd backend
python -m venv .venv
# Windows:   .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env        # then edit: set DJANGO_DEBUG=true and DEMO_PASSWORD
python manage.py migrate
python manage.py seed_demo     # optional: fictional demo data (development only)
python manage.py runserver 127.0.0.1:8000
```

Without `DATABASE_URL`, the backend uses a local SQLite file so you can start immediately. Use PostgreSQL for anything beyond local testing (see below).

### 2. Frontend (React web app, port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The development server forwards `/api` and `/media` to the backend, so both run on one address and cookies work without extra configuration.

## Demo accounts

`python manage.py seed_demo` creates fictional, development-only records (all marked `is_demo`, emails ending in `@demo.rentalcontrol.test`):

| Account | Role | What you can try |
|---|---|---|
| `landlord@demo.rentalcontrol.test` | Landlord | 3 properties (Kibagabaga Residence A1/A2/B1, Remera Family House, Kicukiro Shops), open and resolved repairs, inspections with photos, rent and expenses |
| `manager@demo.rentalcontrol.test` | Property manager | Manages Kibagabaga Residence only, without money permission |
| `tenant@demo.rentalcontrol.test` | Tenant (Kinyarwanda) | Lives in Kibagabaga A1; has a resolved kitchen sink leak (RWF 45,000) and an open light problem |
| `tenant2@demo.rentalcontrol.test` | Tenant (French) | Lives in Remera Family House; has an urgent ceiling leak and one unpaid month |

The password for all four is the `DEMO_PASSWORD` you set in `backend/.env`. The seed command refuses to run unless `ALLOW_DEMO_SEED=true`, and `seed_demo --reset` removes only demo records.

Photos in the demo data are generated plain images labelled "DEMO PHOTO", not real photographs.

## Running the tests

```bash
# Backend: 46 tests — auth, permissions, data isolation, invitations, inspections,
# maintenance status rules, repair costs, finance calculations, and journeys A–F.
cd backend && python manage.py test apps

# Frontend: 19 tests — language switching, accessible components, form validation,
# dashboard states, mobile navigation, the Report a Problem flow (EN and RW).
cd frontend && npm test

# Language coverage: every key used in the code exists in EN, and FR/RW match EN exactly.
cd frontend && npm run i18n:check

# Type check and production build
cd frontend && npm run build
```

## Project structure

```
backend/                     Django + Django REST Framework (modular monolith)
  config/                    settings (all from environment variables), URLs
  apps/core/                 audit log, error format, upload validation, dashboards, search,
                             protected media, demo seed command, journey tests
  apps/accounts/             custom User (email login, role, language, text size), auth API
  apps/properties/           Property, Unit, Tenancy, TenantInvitation, PropertyManagerAssignment,
                             access rules (access.py), Digital Property Passport endpoint
  apps/inspections/          Inspection, InspectionItem, InspectionPhoto, passport builder
  apps/maintenance/          MaintenanceRequest, MaintenanceUpdate (timeline), MaintenancePhoto, Repair
  apps/finance/              Expense, RentCharge, RentPayment, ledger and summary calculations
  apps/notifications/        in-app notifications
frontend/                    React 19 + TypeScript + Vite + Tailwind CSS 4
  src/components/            AppSidebar/TopNavigation (layouts), LanguageSwitcher, PropertyCard,
                             UnitCard, MaintenanceRequestCard, StatusBadge, InspectionChecklist,
                             PhotoUploader, PhotoComparison, ActivityTimeline, DashboardMetricCard,
                             NotificationPanel, GuidedFormStepper, ConfirmationDialog, EmptyState,
                             LoadingSkeleton, AccessibleDataTable, ui/ (shadcn-style primitives)
  src/pages/public|landlord|tenant/
  src/locales/en|rw|fr/      common, properties, maintenance, inspections, finances (+ review.json)
  scripts/check-translations.mjs
docs/                        ARCHITECTURE.md, TRANSLATIONS.md, DEPLOYMENT.md
```

## Using PostgreSQL

```sql
-- in psql as a superuser
CREATE USER rental_control WITH PASSWORD 'choose-a-strong-password';
CREATE DATABASE rental_control OWNER rental_control;
```

Then in `backend/.env`:

```
DATABASE_URL=postgres://rental_control:choose-a-strong-password@localhost:5432/rental_control
```

and run `python manage.py migrate`. The schema uses only portable Django features (including a partial unique constraint for "one active tenant per unit", which PostgreSQL supports natively).

## API documentation

With the backend running: **http://localhost:8000/api/docs/** (Swagger UI) and **/api/schema/** (OpenAPI 3 YAML). Through the frontend dev server the same pages are at http://localhost:5173/api/docs/.

Administrators sign in at **/admin/** (create one with `python manage.py createsuperuser`). The admin area shows accounts and the read-only audit log only — not landlords' property data.

## Further documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — design decisions, data model, permissions, financial definitions.
- [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md) — how languages work, how to add one, review status.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production setup checklist.

## Status

See [docs/STATUS.md](docs/STATUS.md) for an honest list of completed, partial and remaining work.
