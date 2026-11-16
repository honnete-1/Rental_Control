# Architecture and decisions

## Overview

```
Browser (React SPA)  ──/api, /media──▶  Django + DRF (modular monolith)  ──▶  PostgreSQL
   react-i18next, TanStack Query          business rules, permissions,          (SQLite fallback
   React Router, React Hook Form + Zod    money calculations, file checks        for local dev)
                                                 │
                                                 └──▶ file storage: local disk or S3-compatible
```

- **Modular monolith.** One Django project, one app per domain (`accounts`, `properties`, `inspections`, `maintenance`, `finance`, `notifications`, `core`). Simple to run and deploy; boundaries are clear enough to split later.
- **The API is the source of truth.** Permissions, status rules, rent charges and all totals are computed on the server. The frontend only displays them and never stores records in browser storage (it only remembers language, text size, theme and a couple of view preferences).

## Authentication and security

| Concern | Decision |
|---|---|
| Sessions | Django session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). No tokens in browser storage. |
| CSRF | Django CSRF on every write. DRF only checks CSRF for signed-in users, so sign-up, sign-in, password reset and invitation acceptance call `enforce_csrf()` explicitly. |
| Passwords | Django's PBKDF2 hashing and password validators (min. 8 characters, not common, not numeric, not similar to the name/email). |
| Rate limiting | Sign-in / sign-up / reset / invitations: 10 per minute per IP. Uploads: 60 per hour per user. Global anon/user limits. All configurable. |
| Object-level access | Every queryset starts from `apps/properties/access.py` (`managed_properties`, `finance_properties`, `active_tenancies`…). Guessing another ID returns **404**, never someone else's data. Covered by tests for each resource. |
| Roles | `landlord`, `manager`, `tenant`, `admin`. Sign-up can only create landlord or manager accounts; tenant accounts are created only through an invitation; admins via `createsuperuser`. |
| Uploads | File content is checked with Pillow (not just the extension), max size enforced, random file names, PDF signature checked for receipts. Files are served by `protected_media`, which checks the signed-in user may see the record that owns the file. |
| Errors | One consistent JSON format `{code, detail, fields}`; the frontend translates by `code`, so errors appear in the user's language. No stack traces leak (`DEBUG=false`). |
| Audit log | `AuditLog` records important actions (property/unit changes, invitations, status changes, repairs, expenses, payments, password changes) with actor, time and IP. Read-only in the admin. |
| Admin | Shows user accounts and the audit log only; property, tenant and money records are intentionally not registered. |

## Data model

```
User ─┬─< Property (owner) ─┬─< Unit ─┬─< Tenancy >─ User (tenant)
      │                     │         ├─< TenantInvitation (hashed single-use token, 14 days)
      │                     │         ├─< Inspection ─┬─< InspectionItem (area × element × condition)
      │                     │         │               └─< InspectionPhoto
      │                     │         ├─< MaintenanceRequest ─┬─< MaintenanceUpdate (timeline)
      │                     │         │                       ├─< MaintenancePhoto (reported/before/after)
      │                     │         │                       └── Repair (1:1)
      │                     │         └─< Repair (also without a request)
      │                     ├─< PropertyManagerAssignment >─ User (manager, can_view_finances)
      │                     └─< Expense (optional unit, request, and 1:1 repair)
      └─< Notification                 Tenancy ─< RentCharge (one per month), ─< RentPayment
AuditLog (actor, action, object, property_id, details)
```

Key rules:

- **One active tenancy per unit** — partial unique constraint (`moved_out_on IS NULL`).
- **Tenant history isolation** — maintenance requests and inspections store the `tenancy` they belong to. A tenant only ever sees records linked to *their own* tenancies; after a move-out a new tenant cannot see the previous tenant's requests, while the landlord keeps the full property history (tested).
- **Evidence cannot be silently rewritten** — completed inspections are locked (no edit, no new or removed photos, no delete). `MaintenanceUpdate` entries are append-only (no update/delete endpoints). Properties and units with history cannot be deleted.
- **No double counting** — a repair's cost is stored *once*, as an `Expense` linked one-to-one to the `Repair`. Editing the repair cost updates that expense; the expense itself cannot be edited separately; adding a second expense for the same request is refused.
- **Money** — whole Rwandan francs as `PositiveBigIntegerField` (RWF has no minor unit in daily use). No floats anywhere. Currency is stored on expenses (`RWF`) to prepare for other markets.
- **Time** — stored in UTC (`USE_TZ=True`); business timezone `Africa/Kigali` for "today", month boundaries and display.
- **Maintenance statuses** — `new → under_review → approved → in_progress → resolved → closed`, with an explicit allowed-transitions table (e.g. resolved can be re-opened). Invalid moves return `409 invalid_transition`. Only staff change statuses.

## Financial definitions

Implemented in `apps/finance/services.py` and shown in the app under "How is this calculated?":

- **Rent due** — monthly rent charges (generated from the tenancy's rent and due day; the first month is due on the move-in day at the earliest) whose due date is in the period.
- **Rent received** — payments recorded with a payment date in the period (cash basis).
- **Still to be paid (outstanding)** — all rent due up to the end of the period minus all payments up to then. Payments are applied to the oldest charge first to show each month's status.
- **Expenses** — expenses dated in the period; "repairs and maintenance" vs "other".
- **Net cash flow** — rent received − expenses. Explicitly **not** verified profit: unrecorded taxes, loan payments, depreciation and anything not entered are excluded.
- Rental_Control **does not process payments**. Mobile money / bank payments are recorded by hand.

## Frontend

- **Routing** — public pages, `/landlord/*` (landlord and manager), `/tenant/*` (tenant). `RequireRole` redirects for convenience; the API enforces the real rules.
- **Design system** — Tailwind CSS 4 tokens in `src/index.css` (navy `#142B45`, teal `#0D9488`; darker shades `#0F766E`, `#B45309`, `#15803D`, `#B91C1C` are used wherever text sits on colour so contrast is ≥ 4.5:1). shadcn/ui-style components are written in `src/components/ui` (Button with `cva`, Dialog on Radix) rather than generated by the shadcn CLI, to keep dependencies small.
- **Accessibility** — 17px base text (20px in "Larger text" mode), 44px minimum targets, visible focus ring, skip link, labelled landmarks, breadcrumbs, `Field` wires labels/hints/errors with `aria-describedby`/`aria-invalid`, status badges always show an icon plus a word, accessible tabs (arrow keys), focus moves to the new heading at each wizard step, toasts in an `aria-live` region, reduced-motion respected, tables become labelled cards on small screens.
- **Guided workflows** — `GuidedFormStepper` ("Step 2 of 4", Back/Next/Cancel) for adding a property, inviting a tenant, inspections (room by room, saved at each step so it can be resumed) and reporting a problem.
- **Data fetching** — TanStack Query; mutations invalidate the affected lists so counters update immediately.

## Trade-offs

- **Session auth instead of JWT**: safer for a browser app (no token in JavaScript) and simpler; a mobile app later would need token auth added.
- **SQLite fallback**: lets the project start with zero setup; production must set `DATABASE_URL` to PostgreSQL.
- **Rent charges generated on read** (`ensure_rent_charges`) rather than by a scheduler: no background worker to operate; idempotent thanks to a unique constraint.
- **Payment allocation computed, not stored**: simpler and always consistent; a stored `PaymentAllocation` table can be added if partial allocations need to be edited by hand.
- **Owner on Property instead of an Organization model**: one owner per property, with managers via assignments. An `Organization` layer (several co-owners/staff) is a possible next step.
- **Single JS bundle (~258 KB gzip)**: acceptable for now; route-level code splitting would improve first load on slow mobile connections.
