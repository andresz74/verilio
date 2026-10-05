# Verilio MVP Implementation Plan

## Document Control

**Product:** Verilio  
**Document:** MVP Implementation Plan  
**File:** `docs/06-verilio_mvp_implementation_plan.md`  
**Status:** Draft v0.1; core MVP complete, distribution workstream active\
**Distribution revision:** 2026-10-05\
**Depends on:**

- `docs/01-verilio_product_requirements_document.md`
- `docs/02-verilio_requirements_analysis.md`
- `docs/03-verilio_ux_flows.md`
- `docs/04-verilio_design_system_specification.md`
- `docs/05-verilio_technical_architecture.md`

**Primary platform:** Web application  
**Primary user:** Independent freelancer / solo consultant  
**Architecture style:** TypeScript modular monolith  
**Primary product loop:** **Track → Review → Report → Invoice → Get Paid**

---

# 1. Purpose

This document turns the approved Verilio requirements, UX flows, design-system specification, and technical architecture into an executable MVP delivery plan.

It defines:

- Build phases.
- Vertical slices.
- Task sequencing.
- Technical dependencies.
- Acceptance gates.
- Test expectations.
- Risk-focused hardening.
- P0/P1/P2 boundaries.
- Milestone exit criteria.
- Recommended implementation order for Codex or a human engineering workflow.

The goal is to reduce ambiguity once implementation begins.

This document should be treated as the execution roadmap for the MVP.

---

# 2. Delivery Strategy

The implementation should proceed through **vertical slices**, not isolated infrastructure layers.

A vertical slice should produce a usable end-to-end capability such as:

```text
Create client
→ persist client
→ list client
→ edit client
→ archive client
```

or:

```text
Start timer
→ persist running entry
→ recover after refresh
→ stop timer
→ save completed entry
```

This is preferable to spending a long period building every database table, every API route, and every frontend page before any complete workflow exists.

The implementation should continuously produce working product behavior.

---

# 3. Delivery Principles

## IMP-PRIN-001 — P0 Before P1

P0 requirements define MVP completeness.

P1 should not delay a P0 milestone.

## IMP-PRIN-002 — Integrity Before Polish

For high-risk features, correctness takes priority over visual refinement.

Highest-risk areas:

1. Timer correctness.
2. Historical hourly-rate correctness.
3. Monetary precision.
4. Invoice/time traceability.
5. Invoice lifecycle integrity.
6. Multi-currency reporting.

## IMP-PRIN-003 — Server Is Authoritative

Persisted business state is authoritative on the server/database.

The UI may preview, cache, or optimistically prepare data, but high-risk commands must be confirmed by server state.

## IMP-PRIN-004 — Keep the Architecture Small

Do not introduce Redux, Redis, WebSockets, queues, microservices, GraphQL, or MUI as the core design system unless a later approved product requirement justifies them.

## IMP-PRIN-005 — Implement Tests With the Slice

Critical business rules should be tested when the feature is built, not deferred to a final testing phase.

## IMP-PRIN-006 — Preserve Product Terminology

Use the same terms across UI, API, domain, tests, and documentation.

Examples:

```text
Billable
Non-billable
Invoiced
Not invoiced
Draft
Sent
Paid
Void
Archived
Running
```

---

# 4. Milestone Overview

Recommended MVP milestones:

```text
M0  Repository & Engineering Foundation
M1  Application Shell & Business Settings
M2  Clients
M3  Projects & Tasks
M4  Time Tracking
M5  Timesheet
M6  Reports
M7  Invoice Core
M8  Invoice PDF & Lifecycle
M9  MVP Hardening & Release Gate
```

## Current Delivery State

The core private/local fixed-owner MVP is complete, and private-alpha dogfooding is active.
M0–M9 below retain the complete historical build plan and acceptance gates; they are not
replaced by distribution tasks. Product refinements remain separate from the next delivery
track: self-hosted distribution (section 33).

Private/self-hosted first is accepted. Public hosted SaaS may be evaluated later and still
requires authentication, secure session management, and authorization before public exposure.

Optional P1 refinement follows after M9.

---

# 5. Milestone Dependency Graph

```text
M0 Foundation
   ↓
M1 Settings
   ↓
M2 Clients
   ↓
M3 Projects & Tasks
   ↓
M4 Time Tracking
   ↓
M5 Timesheet
   ↓
M6 Reports
   ↓
M7 Invoice Core
   ↓
M8 PDF & Lifecycle
   ↓
M9 Hardening
```

Some work can overlap, but this ordering reflects domain dependency.

---

# 6. M0 — Repository & Engineering Foundation

## Objective

Create the project structure, tooling, database connectivity, shared packages, and minimum application skeleton needed for feature development.

## Primary Deliverable

A working monorepo where `pnpm dev` starts the web app and API, the API connects to PostgreSQL, and test/typecheck/lint commands work.

## M0.1 — Monorepo Bootstrap

Create:

```text
apps/
├── web/
└── api/

packages/
├── contracts/
├── db/
├── domain/
├── ui/
├── invoice-pdf/
└── config/
```

Add:

```text
pnpm-workspace.yaml
tsconfig.base.json
root package.json
```

### Acceptance Criteria

- Workspace packages resolve correctly.
- TypeScript project references/imports work.
- Apps and packages can run independently where required.
- No circular package dependencies.

## M0.2 — Frontend Bootstrap

Configure:

```text
React
TypeScript
Vite
React Router
TanStack Query
Tailwind CSS
```

Create root providers, router, placeholder app shell, error-boundary strategy, and global token/style entry point.

### Acceptance Criteria

- Web app runs locally.
- React Router is active.
- TanStack Query provider is configured.
- Tailwind works.
- CSS custom-property tokens can be consumed.

## M0.3 — API Bootstrap

Configure:

```text
Node.js
Fastify
TypeScript
Pino
Zod
```

Create:

- API entry point.
- Environment validation.
- Request IDs.
- Error handler.
- `/health/live`.
- `/health/ready`.

### Acceptance Criteria

- API starts locally.
- Readiness verifies database connectivity.
- Invalid environment configuration fails clearly.
- API errors use the standard envelope.

## M0.4 — PostgreSQL & Drizzle

Configure PostgreSQL, Drizzle ORM, and checked-in migrations.

Add local development setup through Docker/Docker Compose or equivalent.

### Acceptance Criteria

- Database starts locally.
- API connects successfully.
- A migration can be generated and applied.
- Integration tests can use PostgreSQL.

## M0.5 — Shared Contracts

Create initial shared schemas for:

```text
CurrencyCode
DateOnly
DecimalString
Id
Pagination
ApiError
```

### Acceptance Criteria

- Frontend and API can import shared schemas.
- Database row types are not automatically exposed as API DTOs.

## M0.6 — Domain Utility Foundation

Add tested utilities for:

- Date-only handling.
- Duration boundaries.
- Decimal-safe money.
- Currency metadata.

### Acceptance Criteria

- No authoritative monetary code uses JavaScript float arithmetic.
- Date-only values cannot shift because of timezone conversion.

## M0.7 — Testing Foundation

Configure:

```text
Vitest
React Testing Library
MSW
Playwright
PostgreSQL integration testing
```

### Acceptance Criteria

- Unit tests run.
- Component tests run.
- API integration test can hit PostgreSQL.
- Playwright can open the local app.

## M0 Exit Gate

Do not begin feature milestones until:

- Web and API run.
- PostgreSQL works.
- Shared contracts compile.
- Lint/typecheck/test scripts work.
- The UI package can render a styled component.
- Health endpoints pass.

---

# 7. M1 — Application Shell & Business Settings

## Objective

Establish the Verilio shell and persistent business profile required by the rest of the application.

## M1.1 — Application Shell

Implement primary navigation:

```text
Timer
Timesheet
Reports

Clients
Projects

Invoices

Settings
```

Add desktop sidebar, responsive shell behavior, page header pattern, and placeholder running-timer shell area.

### Acceptance Criteria

- Navigation works.
- Current section is visibly active.
- Keyboard navigation works.
- Unsupported MVP features do not appear.

## M1.2 — Core Design Tokens

Implement semantic tokens for background, surfaces, text, borders, accent, success, warning, danger, muted state, radii, spacing, and typography.

### Acceptance Criteria

- Shared components consume semantic tokens.
- Important state colors are not hard-coded in feature code.

## M1.3 — UI Primitive Set A

Implement:

```text
Button
IconButton
TextInput
TextArea
Field
FormError
Checkbox
Switch
Dialog
StatusBadge
Spinner
InlineError
```

### Acceptance Criteria

- Keyboard/focus behavior works.
- Visible focus styles exist.
- Dialog focus management works.
- Components export from `@verilio/ui`.

## M1.4 — Business Profile Schema

Create `business_profiles`.

Include:

- Business/display name.
- Email.
- Address.
- Phone.
- Default currency.
- Default hourly rate.
- Payment terms.
- Invoice prefix.
- Next invoice number.
- Default tax.
- Default invoice notes.
- Invoice footer.
- Timezone.
- Logo reference if implemented.

### Acceptance Criteria

- One profile per owner.
- Required defaults persist.
- Money uses decimal-safe types.
- Timezone is an IANA identifier.

## M1.5 — Settings API

Implement:

```text
GET /api/v1/settings
PUT /api/v1/settings
```

### Acceptance Criteria

- Shared Zod schemas.
- Server-side validation.
- Profile persists.
- Updating defaults does not alter historical records.

## M1.6 — Settings UI

Implement sections:

```text
Business
Billing
Invoice Defaults
```

Use React Hook Form + Zod.

### Acceptance Criteria

- Required fields validate.
- Existing values load.
- Save failure preserves input.
- Success feedback is non-blocking.

## M1 Exit Gate

The user can configure and persist business identity, currency, default hourly rate, payment terms, invoice prefix, and related invoice defaults.

---

# 8. M2 — Clients

## Objective

Implement complete P0 client management.

## M2.1 — Client Database Model

Create `clients` with owner ID, name, email, CC recipients, address, note, currency, default hourly rate, active state, and timestamps.

Add index:

```text
(user_id, active)
```

## M2.2 — Client Contracts

Create Client DTO, create/update requests, and list filters.

Validation:

- Name required.
- Currency required.
- Email valid if supplied.
- Rate non-negative.

## M2.3 — Client API

Implement:

```text
GET    /api/v1/clients
POST   /api/v1/clients
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id
POST   /api/v1/clients/:id/archive
POST   /api/v1/clients/:id/reactivate
```

Rules:

- Archive instead of delete.
- Historical references remain valid.
- Owner scope enforced.

## M2.4 — Client UI

Implement list, create, edit, archive confirmation, reactivate, and currency display.

P1 if schedule permits:

- Search.
- Active/archived/all filter.

## M2.5 — Client Selector

Create `ClientSelect`.

Requirements:

- Active clients by default.
- Searchable where practical.
- Accessible keyboard behavior.
- Reusable throughout Verilio.

## M2 Exit Gate

The user can create, edit, archive, and reactivate clients and use active clients in selectors.

---

# 9. M3 — Projects & Tasks

## Objective

Implement the Client → Project → Task hierarchy.

## M3.1 — Project Database Model

Create `projects` with owner ID, client ID, name, color, default hourly rate, billable-by-default, note, active state, and timestamps.

## M3.2 — Project API

Implement create/edit/list/archive/reactivate.

Rules:

- Exactly one client.
- Archived clients are not valid for new work.
- Archive preserves history.

## M3.3 — Project UI

Implement project list, create/edit form, archive/reactivate, and Project detail.

P1:

- Search/filter by client/status.

## M3.4 — Rate Inheritance UX

Display:

```text
Use inherited rate
or
Override rate
```

A blank field must not ambiguously mean zero vs inherited.

## M3.5 — Project Selector

Create `ProjectSelect`.

Rules:

- Requires client context.
- Only matching client projects.
- Active by default.
- Changing client clears incompatible project/task selection.

## M3.6 — Task Database Model

Create `tasks` with project ID, name, active state, and timestamps.

## M3.7 — Task API

Implement:

```text
GET    /api/v1/projects/:id/tasks
POST   /api/v1/projects/:id/tasks
PATCH  /api/v1/tasks/:id
POST   /api/v1/tasks/:id/archive
POST   /api/v1/tasks/:id/reactivate
```

## M3.8 — Task UI

Implement project-detail task management:

- Add.
- Rename.
- Archive.
- Reactivate.

## M3.9 — Task Selector

Create `TaskSelect`.

Rules:

- Project-scoped.
- Optional.
- Active by default.

## M3.10 — Hierarchy Tests

Test:

- Wrong-client project rejected.
- Wrong-project task rejected.
- Changing client clears project/task.
- Changing project clears incompatible task.
- Archived records remain historical.

## M3 Exit Gate

The user can create Client → Project → Task and select the hierarchy coherently in a form.

---

# 10. M4 — Time Tracking

## Objective

Deliver reliable live and manual time tracking with historical billing-rate snapshots.

## M4.1 — Time Entry Database Model

Create `time_entries`.

Recommended fields:

```text
id
user_id
client_id
project_id
task_id
description
mode
work_date
start_at
end_at
duration_seconds
billable
hourly_rate
created_at
updated_at
```

Modes:

```text
timer
range
duration
```

## M4.2 — One-Running-Timer Constraint

Create database protection for one active timer per user.

### Required Integration Test

Concurrent start requests:

- One succeeds.
- One returns conflict.

## M4.3 — Rate Resolution Logic

Implement:

```text
Explicit entry rate
→ Project default
→ Client default
→ Business default
```

Persist the resolved rate on a completed billable time entry.

## M4.4 — Get Current Timer

Implement:

```text
GET /api/v1/timer/current
```

Return running entry or null plus `serverNow`.

## M4.5 — Start Timer

Implement:

```text
POST /api/v1/timer/start
```

Validate hierarchy and running-timer invariant.

Server supplies authoritative start timestamp.

## M4.6 — Stop Timer

Implement:

```text
POST /api/v1/timer/stop
```

Server:

- Loads running timer.
- Supplies end time.
- Calculates duration.
- Snapshots rate.
- Persists completion.

## M4.7 — Timer Composer

Implement Activity (the `description` field), Client, Project, optional Task, Billable, and Start.

## M4.8 — Running Timer UI

Display explicit running state and elapsed time.

Use a local one-second display tick from server-aligned timestamps.

Do not refetch or persist every second.

## M4.9 — Global Running Indicator

Timer remains visible in the application shell while navigating.

## M4.10 — Recovery

On reload:

```text
query current timer
→ restore display
```

Required E2E:

```text
start
→ reload
→ still running
→ stop
```

## M4.11 — Manual Entry API

Support range and duration modes.

Validation:

- Positive duration.
- Valid hierarchy.
- Cross-midnight timestamps.
- Work date.
- Billable rate resolution.

## M4.12 — Manual Entry UI

Support:

```text
Start / End
Duration
```

Fields:

- Date.
- Start/end or duration.
- Description.
- Client.
- Project.
- Task.
- Billable.

## M4.13 — Edit Entry

Uninvoiced entries are editable.

Changing Client/Project preserves the historical rate unless the user explicitly replaces/refreshes it.

## M4.14 — Delete Entry

Completed entries never linked to an Invoice may be deleted with confirmation. A non-Void Invoice link
blocks editing and deletion. A Void-only link releases Time for correction and re-invoicing, but
historical Invoice links are retained and still block hard deletion with a domain conflict.

## M4 Exit Gate

The user can start a timer, navigate away, reload, stop it, and see correct duration/rate; they can also create, edit, and delete manual uninvoiced entries.

---

# 11. M5 — Timesheet

## Objective

Make historical time easy to review and correct.

## M5.1 — Time Entry List API

Implement date-filtered and paginated time-entry queries.

## M5.2 — Work-Date Grouping

Group by `workDate`, not UTC calendar date.

## M5.3 — Timesheet UI

Implement:

- Date groups.
- Daily totals.
- Entry metadata.
- Edit.
- Delete.
- Add Time.

P1:

- Weekly totals.
- Date presets.
- Description search.
- Duplicate.
- Start timer from entry.

## M5.4 — Time Entry Row

Display:

```text
Description
Client / Project / Task
Start–End where available
Duration
Billable / Non-billable
Invoice state
```

## M5.5 — Empty State

```text
No time tracked for this period.
[ Start Timer ] [ Add Time ]
```

## M5 Exit Gate

The user can review work by date, see daily totals, add missing time, edit entries, and delete uninvoiced entries.

---

# 12. M6 — Reports

## Objective

Turn tracked time into billing intelligence.

## M6.1 — Summary Report API

Implement:

```text
GET /api/v1/reports/summary
```

Filters:

- Date.
- Client.
- Project.
- Task.
- Billable.
- Invoice state.

## M6.2 — Summary Aggregates

Return:

- Total seconds.
- Billable seconds.
- Non-billable seconds.
- Billable totals by currency.
- Client/project/task groups.
- Hours by day.
- Hours by project.

For monetary values, calculate and currency-round each completed billable Time Entry first, then
sum those rounded entry amounts for overall and grouped totals across the full filtered dataset.
Summary must reconcile with Detailed across pagination. Keep currencies separate and keep this
Report boundary independent from Invoice Item grouping and calculation rules.

## M6.3 — Detailed Report API

Implement paginated:

```text
GET /api/v1/reports/detailed
```

Return:

```text
Date
Description
Client
Project
Task
Start
End
Duration
Billable
Rate
Amount
Invoice state
```

## M6.4 — Multi-Currency Safety

Never aggregate incompatible monetary totals.

Test USD + EUR results as separate values.

## M6.5 — Shared Report Filters

Implement URL-backed date/client/project/task/billable/invoice-state filters.

Switching Summary/Detailed preserves filter context.

## M6.6 — Summary UI

Display:

```text
Total tracked
Billable
Non-billable
Billable value by currency
```

P1:

- Hours-by-day chart.
- Hours-by-project chart.

## M6.7 — Detailed UI

Use TanStack Table with pagination.

## M6.8 — CSV Export

P1, but included if the MVP schedule permits.

Generate server-side from active filters, not the current page only.

## M6 Exit Gate

The user can select a billing period and see correct tracked time, billable time, billable value, and detailed entries without misleading multi-currency totals.

---

# 13. M7 — Invoice Core

## Objective

Create invoice Drafts from tracked work while preserving traceability and preventing double invoicing.

Approved MVP rules for this milestone are: one percentage tax field; percentage
or fixed-amount discounts; Project grouping by default; number assignment on the
first successful Draft save; immediate Draft reservation of linked Time; exactly
one currency per Invoice with no conversion; and Paid/Void as terminal states.

## M7.1 — Invoice Tables

Create:

```text
invoices
invoice_items
invoice_item_time_entries
```

Invoice fields include number, client, state, currency, date-only issue/due/paid dates, seller/client snapshots, totals, notes, and timestamps.

## M7.2 — Invoice Snapshots

Persist seller/client presentation data.

Required test:

```text
save invoice
→ change current client address
→ invoice snapshot remains unchanged
```

## M7.3 — Invoice State Machine

Implement:

```text
draft → sent
draft → void
sent  → paid
sent  → void
```

Paid/Void terminal in MVP.

## M7.4 — Invoice Numbering

Approved rule:

```text
assign on first successful Draft save
```

Make transaction-safe and unique.

## M7.5 — Invoice Calculation Domain

Implement:

- Line amount.
- Subtotal.
- Discount.
- Tax.
- Total.

Approved calculation policy:

- Round each `quantity × unit price` line to currency minor units using Decimal
  `ROUND_HALF_UP`.
- Subtotal is the sum of persisted rounded line amounts.
- Apply a percentage or fixed discount to subtotal; the rounded discount cannot
  exceed subtotal.
- Apply one percentage tax to the discounted taxable subtotal.
- Total is taxable subtotal plus rounded tax.
- Persisted server calculations are authoritative.

## M7.6 — Invoice API

Implement list/create/get/edit-Draft.

Generic PATCH must not allow arbitrary state transitions.

Initial Invoice creation may include staged manual Items and one staged Time-import selection:

```text
manualItems[]

timeImport
  from
  to
  timeEntryIds[]
  grouping: project | task | individual
```

This is submitted only when the user explicitly selects Save Draft. Import Time and Add manual
Item do not implicitly create or autosave an Invoice.

## M7.7 — Eligible Time Query

For a brand-new unsaved Invoice, implement context-based discovery:

```text
GET /api/v1/invoices/eligible-time
  ?clientId=...
  &currency=...
  &from=...
  &to=...
```

For an already-saved Draft, retain:

```text
GET /api/v1/invoices/:id/eligible-time
```

Eligibility:

```text
same client
billable
inside date range
historical Time Entry currency matches Invoice currency
not linked to a non-void invoice
```

The two query paths must reuse the same eligibility rules. The non-ID query is read-only: it does
not persist an Invoice, allocate a number, create relationships, or reserve selected Time.

## M7.8 — Import Time Transaction

For an unsaved New Invoice:

1. Query eligible Time from the current Client, currency, and date-range context.
2. Select Time and grouping locally.
3. Stage the resulting line-item representation in the editor.
4. Include the staged selection in the explicit initial Save Draft request.
5. Revalidate every selected entry on the server.
6. Transactionally create the Invoice, allocate its number, persist snapshots/Items/relationships,
   calculate totals, and reserve linked Time.

For an already-saved Draft, retain the transactional command:

```text
POST /api/v1/invoices/:id/import-time
```

Server revalidates entry eligibility.

Grouping:

```text
project
task
individual
```

Default: `project`.

Initial Save Draft and saved-Draft import must share the same server eligibility, grouping, and
double-invoicing protection. Two concurrent initial saves attempting to reserve the same Time
Entry cannot both succeed; the losing transaction must return a stable conflict without partial
Invoice, Item, relationship, reservation, or numbering writes.

## M7.9 — Draft Reservation

Imported time is reserved immediately once linked to a saved Draft.

It must disappear from other invoice-import queries and show as Invoiced in reports.

Locally staged Time on an unsaved New Invoice is not linked, reserved, or Invoiced. Reservation
begins only after the explicit Save Draft transaction succeeds.

## M7.10 — Remove Imported Time

Removing a Draft invoice item removes time links, recalculates totals, and restores source-time eligibility.

Whole grouped-line removal is sufficient for MVP.

## M7.11 — Manual Invoice Items

Support description, quantity, unit price, amount.

Reject negative amounts in MVP.

Manual Items may be staged locally while composing a New Invoice and are persisted with the first
successful Save Draft. On a saved Draft, the existing server-backed Item commands remain valid.

## M7.12 — Invoice List UI

Display invoice number, client, issue/due dates, amount, currency, and status.

## M7.13 — Invoice Editor

One-page structure:

```text
Client & Dates
Imported Time / Line Items
Totals
Notes / Terms
Actions
```

Use React Hook Form with explicit Save Draft.

For a New Invoice, keep editable fields, staged manual Items, and staged Time
selection/grouping in editor state. Render staged line Items and calculation previews without
creating a temporary Invoice. Preserve that composition if Save Draft fails so the user can
correct unavailable Time or validation errors and retry.

After the first successful save, replace provisional editor state with the authoritative saved
Draft response. Subsequent imports and Item changes use the saved-Draft commands.

## M7.14 — Import Dialog

Display eligible count, duration, billable value, selectable entries, and grouping.

The dialog supports both contexts:

- Unsaved New Invoice: query by Client/currency/date context and stage the selection locally.
- Saved Draft: query by Invoice ID and persist the import through the transactional command.

Opening the dialog or selecting Import does not autosave a New Invoice.

## M7.15 — Traceability UI

Support:

```text
Time → Invoice
Invoice item → Source time
```

## M7.16 — Reports Integration

Complete Invoiced/Not invoiced report filtering.

## M7 Exit Gate

The user can open New Invoice, select a Client and import period, discover and stage billable
uninvoiced Time, group by Project, stage manual Items, and then select Save Draft once. The server
revalidates eligibility and atomically creates the Invoice, Items, source relationships,
authoritative totals, number, and reservation. Only after that successful save do source entries
become Invoiced.

For a saved Draft, the user can import additional eligible Time transactionally, remove an
imported Item, and see released source Time become uninvoiced and eligible again.

Double invoicing must be prevented for saved-Draft imports and concurrent initial Draft saves.

---

# 14. M8 — Invoice PDF & Lifecycle

## Objective

Complete the billing cycle.

## M8.1 — Invoice Presentation Model

Create a canonical saved-data DTO used by web preview and PDF.

## M8.2 — PDF Renderer

Implement `packages/invoice-pdf`.

Required content:

- Seller.
- Client.
- Invoice number.
- Issue/due dates.
- Line items.
- Quantity/hours.
- Rate.
- Amount.
- Subtotal.
- Tax.
- Discount.
- Total.
- Currency.
- Notes.
- Payment terms.
- Optional logo.

## M8.3 — PDF API

Implement:

```text
GET /api/v1/invoices/:id/pdf
```

Return deterministic PDF from saved invoice data.

## M8.4 — PDF Tests

Verify required fields, persisted totals, snapshot use, and historical stability.

## M8.5 — Mark Sent

Implement explicit command endpoint.

Preconditions:

- Draft.
- Saved.
- Valid dates.
- At least one line.
- Stable number.

## M8.6 — Mark Paid

Implement explicit command with paid date.

Result:

```text
status = paid
paidAt = date
read-only
```

## M8.7 — Void

Implement explicit Void command transaction.

Result:

- History retained.
- Number retained.
- Source time released.
- Source Time may be edited and re-invoiced, but not hard-deleted: historical Invoice Item/Time
  links remain. Saved Invoice Items, totals, and PDF are the historical billing record; live
  source details may change after Void without adding source-Time snapshots.

## M8.8 — Derived Overdue

Display Overdue when Sent + past due date + unpaid.

## M8.9 — Invoice State UI

Draft:

- Save.
- PDF.
- Mark Sent.
- Void.

Sent:

- PDF.
- Mark Paid.
- Void.

Paid:

- Read-only.
- Paid date.
- PDF.

Void:

- Read-only.
- Explain source time is available again.

## M8 Exit Gate

The user can complete:

```text
Draft → PDF → Sent → Paid
```

and:

```text
Draft/Sent → Void → source time eligible again
```

---

# 15. M9 — MVP Hardening & Release Gate

## Objective

Verify the complete product loop and harden the highest-risk behavior.

## M9.1 — Critical E2E

Automate:

```text
configure profile
→ create client
→ create project
→ create task
→ start timer
→ navigate
→ reload
→ stop
→ add manual time
→ Timesheet
→ Reports
→ open New Invoice
→ compose/import time
→ save Draft
→ verify Invoiced
→ PDF
→ Sent
→ Paid
→ locked invoice
→ source traceability
```

## M9.2 — Timer Hardening

Test:

- Double-click Start.
- Multiple tabs.
- Reload.
- Browser restart.
- Stop failure.
- Clock skew.
- Cross-midnight.
- DST boundary where practical.

## M9.3 — Billing Hardening

Test:

- Mid-month rate change.
- Rate hierarchy.
- Historical rate stability.
- Billable ↔ non-billable transitions.
- Decimal precision.
- Currency rounding.
- Multi-currency reports.

## M9.4 — Invoice Hardening

Test:

- Same time cannot enter two Drafts.
- Concurrent import.
- Removing Draft item releases time.
- Void releases time.
- Paid locks.
- Snapshot remains stable.
- Invoice number uniqueness.
- PDF uses persisted totals.

## M9.5 — Accessibility Gate

Review navigation, selectors, Timer, manual entry, Timesheet, Reports, Invoice editor, Import dialog, and lifecycle dialogs.

Requirements:

- Keyboard completion.
- Visible focus.
- Labels.
- Dialog focus restoration.
- Status not dependent on color.

## M9.6 — Responsive Gate

Verify desktop first, tablet usability, and narrow-screen Timer/manual-entry usability.

## M9.7 — Error-State Gate

Verify:

- Failed save preserves forms.
- Timer Start failure never shows false running state.
- Timer Stop failure never shows false stopped state.
- Invoice calculation failure blocks transitions.
- API conflicts surface meaningful UX.

## M9.8 — Migration and Operational Gate

Verify the complete checked-in migration chain against an empty PostgreSQL database, including
the one-time best-effort Time Entry currency and Invoice payment-terms/footer backfills. Run the
integration suite against that fresh schema. Verify compiled API startup, web production-build
serving, `/health/live`, `/health/ready`, structured logs, request IDs, and documented environment
validation.

## M9.9 — Private Release Boundary

The MVP release target remains local/private fixed-owner mode. Browser requests never control
the owner ID. Documentation must state clearly that public Internet deployment requires a later
authentication and authorization decision.

## M9 Exit Gate — MVP Complete

MVP is complete only if:

```text
Track
→ Review
→ Report
→ Invoice
→ Download PDF
→ Mark Sent
→ Mark Paid
```

works reliably and all P0 integrity rules pass.

---

# 16. P1 Refinement Backlog

After P0 is stable, implement in approximate value order:

1. Client search/filter.
2. Project search/filter.
3. Task search/filter.
4. Date presets.
5. Description search.
6. Weekly Timesheet totals.
7. Duplicate time entry.
8. Start timer from prior entry.
9. Task report filter refinements.
10. Report grouping by description.
11. Hours-by-day chart.
12. Hours-by-project chart.
13. CSV export if deferred.
14. Tablet polish.
15. Additional mobile polish.

## Timer Recent Continue — P1 issue #13

Completed Recent entries expose **Continue activity**: one action starts a new Timer using only
description, Client, Project, optional Task, and billable state. Historical identity, timestamps,
work date, duration, rate/currency snapshots, and Invoice state/history are excluded; the source
entry is unchanged. Normal server Start/Stop determines the new timestamps and eventual rate.
Description remains free-form text, distinct from a structured Task.

Reuse the existing Start mutation, active-Timer replacement decision, and R2 authoritative
reconciliation. Invoiced/Void-history sources are reusable; current hierarchy validation still
applies. Cover context isolation, keyboard access, replacement, ambiguous outcomes, and historical
rate independence. Timesheet Continue remains deferred. Timer terminology is specified in #15
below without changing this reuse behavior.

## Timer Recent Activity Groups — P1 issue #14

Derive frontend-only groups from the bounded Recent response using exact stored description,
Client ID, Project ID, nullable Task ID, and billable state. Preserve API order by first occurrence
and member order. Sum only completed integer durations and count only loaded completed sessions;
keep the running Timer separate. No entity, API, schema, or persisted membership is introduced.

Single sessions retain direct actions. Multi-session groups show count/duration, context and
billable state, reuse #13 Continue, and expand with keyboard-accessible buttons to individual
dates/timestamps, modes, rates, Invoice/history state and permitted Edit/Delete actions. Rates and
Invoice states stay per-session, never misleading group aggregates. Existing query invalidation
after Edit/Delete drives regrouping. Cover identity differences, order, duration, rate/history
variance, expansion, Continue, correction, and narrow-screen reachability. Timesheet remains
ungrouped by activity; Reports is unchanged. Timer terminology is specified in #15 below.

## Timer Activity Terminology — P1 issue #15

Present the Timer composer's free-form `description` as **Activity**, with placeholder and idle
heading **What are you working on?**. Keep **Start something else** while another Timer runs,
and keep **Task (optional)** as a distinct structured Project Task selector. The running Timer
uses the activity text as its primary title without adding a redundant label.

Use **Recent activities** with “Grouped from the 10 most recent completed entries. Full history
belongs in Timesheet.” Keep **Continue activity**, **sessions**, and Show/Hide sessions wording.
These are Timer presentation terms, not an Activity entity or internal field rename; the
API/domain/database field and validation key remain `description`. Associate errors accessibly
with Activity. Preserve #13 Continue, #14 grouping, and R2 recovery behavior.

Test visible/accessibility labels in idle and running composers, Task distinction, validation
association, Recent wording, and unchanged Continue/group controls. Manual historical entry
dialogs, Timesheet, Reports, and Invoice surfaces retain **Description**; only Timer-composer E2E
selectors change to Activity.

---

# 17. Explicitly Deferred P2 Work

Do not add during MVP:

- Dashboard.
- Native mobile app.
- Desktop app.
- Browser extension.
- Expenses.
- Partial-payment ledger.
- Automatic invoice emailing.
- Recurring invoices.
- Payment integration.
- Tax jurisdiction presets.
- Multi-company workspaces.
- Calendar integration.
- Budgets/estimates.
- Revenue forecasting.
- Retainers.
- Client portal.
- Clockify import.

---

# 18. Remaining Release Decisions

## OD-A — Deployment Model

**Resolved:** Private/self-hosted first. Public hosted SaaS may be evaluated later.

Docker Compose is the canonical provider-neutral runtime; source-built and prebuilt images
converge on that runtime. Platform packaging remains a thin wrapper. See ADR-015 in
[docs/05](05-verilio_technical_architecture.md) and the
[distribution plan](09-verilio_self_hosted_distribution_plan.md).

## OD-B — Authentication

Authentication remains deferred for trusted private fixed-owner operation. Public hosted access
still requires authentication, secure session management, and server-side authorization.
Self-hosted distribution does not implement or remove that requirement.

## OD-C — Duration-Only Manual Entry

Approved and implemented for MVP alongside range entry.

## OD-D — Hosted File Storage

Only blocks hosted logo upload, not core billing.

---

# 19. Recommended Delivery Slices

Suggested commit/PR-sized slices:

```text
S01  Monorepo bootstrap
S02  Web/API local dev
S03  PostgreSQL + migrations
S04  Shared contracts
S05  Money/date domain utilities
S06  UI tokens + primitives
S07  App shell
S08  Business settings backend
S09  Business settings frontend
S10  Clients backend
S11  Clients frontend
S12  Client selector
S13  Projects backend
S14  Projects frontend
S15  Project selector
S16  Tasks backend
S17  Tasks frontend
S18  Task selector
S19  Time-entry schema
S20  Timer backend
S21  Timer frontend
S22  Timer recovery/concurrency tests
S23  Manual-time backend
S24  Manual-time frontend
S25  Time-entry edit/delete
S26  Timesheet API
S27  Timesheet UI
S28  Summary reports
S29  Detailed reports
S30  Report filters
S31  Charts/CSV P1
S32  Invoice schema/domain
S33  Invoice create/save Draft API
S34  Context and saved-Draft eligible-time/import API
S35  Invoice editor
S36  Import-time UI
S37  Traceability/report invoice state
S38  Invoice PDF
S39  Sent/Paid/Void lifecycle
S40  End-to-end hardening
```

Each slice should leave the repository passing.

---

# 20. Definition of Done for Every Slice

A slice is complete only when:

1. Code compiles.
2. Typecheck passes.
3. Lint passes.
4. Relevant unit tests pass.
5. Relevant integration/component tests pass.
6. Error states are handled.
7. Accessibility basics are present.
8. Terminology matches the specifications.
9. No known P0 rule is knowingly violated.
10. Documentation is updated if an agreed decision changes.

---

# 21. Change Review Checklist

## Product

- Which requirement IDs are satisfied?
- Is P2 scope being introduced accidentally?
- Does the workflow match the UX document?

## Domain

- Does this alter historical behavior?
- Does it affect money?
- Does it affect invoice eligibility?
- Does it affect Timer correctness?

## API

- Server-side validation?
- Owner scope?
- Conflict/race handling?
- Useful domain error code?

## Database

- Constraint required?
- Transaction required?
- Index required?
- Migration preserves history?

## Frontend

- TanStack Query for server state?
- RHF/local state for forms/UI?
- URL filters where appropriate?
- No unnecessary global state?
- No direct primitive-library leakage where Verilio UI exists?

## UI

- Semantic tokens?
- State explicit without color only?
- Keyboard support?
- Appropriate data density?

## Testing

- High-risk rule covered?
- Race needs PostgreSQL integration test?
- E2E scenario needs extension?

---

# 22. Suggested Branch and Commit Strategy

Examples:

```text
feat/settings-profile
feat/clients-crud
feat/projects-tasks
feat/timer-start-stop
feat/manual-time
feat/timesheet
feat/reports-summary
feat/invoice-import
feat/invoice-pdf
```

Prefer behavior-oriented commits such as:

```text
feat(timer): persist running timer on server
```

rather than vague file-oriented messages.

---

# 23. Development Seed Data

Recommended development seed:

```text
Business:
Andres Consulting
USD
$85/hr

Client:
M4Trade

Projects:
Windows
Forms
Grid

Tasks:
Bug Fix
Development
Code Review

Time:
multiple billable entries
one non-billable entry
multiple days

Invoices:
one Draft
one Sent
one Paid
one Void
```

Seed data must never be required for production behavior.

---

# 24. Test Fixture Strategy

Maintain deterministic fixtures for:

- Historical rate changes.
- Cross-midnight entries.
- Multi-currency reports.
- Draft reservation.
- Void release.
- Paid locking.
- Invoice snapshot stability.
- PDF generation.

---

# 25. Environment Progression

Recommended:

```text
Local Development
        ↓
CI/Test
        ↓
Private Staging
        ↓
Private Production / Self-hosted
        ↓
Public Hosted Deployment if chosen
```

Hosted authentication must not become an invisible late-stage requirement.

---

# 26. CI Gate

Before merging to main:

```text
pnpm lint
pnpm typecheck
pnpm test
integration tests
```

Playwright may run on main-branch merges or selected PRs if runtime becomes significant.

Full E2E must pass before release.

---

# 27. Release Readiness Checklist

## Product

- All P0 requirements complete.
- Financial rules resolved.
- No P2 dependency for the core flow.

## Timer

- One-running-timer invariant.
- Refresh recovery.
- Multi-tab concurrency.

## Time

- Manual entry.
- Historical rate snapshot.
- Cross-midnight behavior.

## Reports

- Correct totals.
- Multi-currency separation.
- Invoice state filters.

## Invoices

- Draft reservation.
- Double-invoicing prevention.
- Manual items.
- Deterministic totals.
- Sent/Paid/Void.
- Paid lock.

## PDF

- Required fields.
- Snapshots.
- Historical stability.

## Accessibility

- Core workflows keyboard-accessible.
- Dialogs correct.
- State not color-only.

## Operations

- Migrations apply.
- Health checks pass.
- Environment documented.
- Backup expectations documented for deployment target.

---

# 28. Recommended First Implementation Session

Do not start by building the Timer screen.

Start with M0:

```text
1. Initialize pnpm workspace.
2. Create apps/web.
3. Create apps/api.
4. Create packages/contracts.
5. Create packages/db.
6. Create packages/domain.
7. Create packages/ui.
8. Configure strict TypeScript.
9. Configure Vite.
10. Configure Fastify.
11. Configure PostgreSQL + Drizzle.
12. Add health endpoints.
13. Add lint/typecheck/test commands.
14. Add one smoke E2E test.
```

Then proceed to Settings.

---

# 29. Implementation Risk Register

## Risk 1 — Timer Looks Correct but Persists Incorrectly

Mitigation:

- Server timestamps.
- DB uniqueness.
- Integration tests.
- No optimistic success.

## Risk 2 — Historical Rates Recalculate

Mitigation:

- Snapshot on completion.
- Reports use entry rate.
- Explicit edit behavior.
- Regression fixtures.

## Risk 3 — Invoice Double Billing

Mitigation:

- Join-table traceability.
- Transactional import.
- Revalidation.
- Concurrency tests.

## Risk 4 — Financial Rounding Drift

Mitigation:

- Decimal-safe domain functions.
- One rounding policy.
- Server-authoritative totals.
- Deterministic fixtures.

## Risk 5 — Product Becomes Overbuilt

Mitigation:

- P0/P1/P2 gate.
- No Redis/queues/WebSockets.
- No teams.
- No Dashboard before MVP.

## Risk 6 — UI Library Escapes Design-System Boundary

Mitigation:

- `@verilio/ui`.
- Import review.
- No direct Radix usage where a Verilio component exists.

---

# 30. Documentation Update Policy

Implementation may expose specification gaps.

When that happens:

1. Do not silently diverge.
2. Record the decision.
3. Update the relevant source document.
4. Update architecture/implementation plan if affected.

Typical triggers:

- Invoice calculation rule.
- Authentication decision.
- Deployment choice.
- Storage provider.
- New state transition.
- Schema change affecting historical correctness.

---

# 31. Handoff to Codex

Once this implementation plan is accepted, the next document should be:

```text
docs/07-verilio_codex_build_prompt.md
```

That document should instruct Codex to:

- Read `docs/01` through `docs/06` before coding.
- Respect P0/P1/P2 boundaries.
- Follow the chosen architecture.
- Work in milestone/slice order.
- Keep the repository passing after each slice.
- Avoid unapproved libraries/infrastructure.
- Preserve timer/financial integrity.
- Write tests with critical slices.
- Ask only when an unresolved product decision truly blocks implementation.

---

# 32. Final Implementation Principle

Verilio should be built in the same order that product value emerges:

```text
Foundation
    ↓
Business identity
    ↓
Clients
    ↓
Projects
    ↓
Tasks
    ↓
Time
    ↓
Timesheet
    ↓
Reports
    ↓
Invoices
    ↓
PDF
    ↓
Payment state
```

The implementation should continuously protect the product promise:

> **Track your work. Bill with confidence.**

A feature is ready only when the user-visible workflow works **and** the underlying historical and financial data remains trustworthy.

---

# 33. Post-MVP Self-Hosted Distribution Workstream

This is the next delivery track after the completed core MVP and current private-alpha
operations. It packages the existing runtime; it does not reopen the application-domain
milestones, alter billing rules, or solve public authentication. LAN, VPN, Tailscale/tailnet,
and other trusted private networks remain the supported boundary. `LOCAL_USER_ID` is
server-controlled; the browser never chooses the owner. Direct public Internet exposure remains
unsupported.

The full operational execution plan is [docs/09](09-verilio_self_hosted_distribution_plan.md).
The [private-alpha runbook](08-private_alpha_self_hosted_deployment.md) remains the source of
current archive-based release and existing-host snapshot procedures.

## D1 — Canonical Generic Container Contract

**Status:** In progress; D01 and D02 complete. D05 has verified anonymous registry pull and the
clean-host runtime for the initial `linux/amd64` release. Registry-backed provenance remains
outside D05; existing archive provenance is unchanged.

Deliver:

- configurable application image references
- no unnecessary host-specific assumptions
- source snapshot compatibility
- tests for local/registry image source

D01 proves repository interpolation with local defaults and custom repository strings; it does
not prove registry pulls, registry-backed provenance, or a clean-host registry installation.

## D2 — Official Image Publishing

**Status:** Complete for the initial `linux/amd64` official publishing path. D03 defined the
contract; D04 successfully published the exact tested images for `v0.1.1-alpha.5` using immutable
tags, verified OCI metadata, and verified anonymous access. D05 clean-host installation has also
passed on Ubuntu 24.04.5 LTS; this does not establish platform, ARM64/multi-architecture, or public
Internet support.

Deliver:

- registry namespace decision
- release image publishing
- immutable version tags
- source/version metadata
- pull verification

## D3 — Generic Self-Hosted Release Bundle

**Status:** In progress; D02 package shape and D05 clean-host validation complete. D06 generic
install/update and backup/rollback documentation remains planned.

Deliver:

- Compose package
- environment template
- secret/bootstrap process
- install/update docs
- backup/rollback guidance
- clean-host install verification

## D4 — Platform Compatibility

**Status:** Planned.

Order:

1. CasaOS
2. Portainer
3. Proxmox Docker VM
4. additional platforms based on demand

## D5 — Fresh Source-Based Installer

**Status:** Planned.

Deliver:

- one supported source installation command
- prerequisite checks
- safe config/secrets
- exact source identity
- canonical runtime
- health/rollback output

## D6 — Hardening

**Status:** Possible later work; not complete.

Possible later work:

- SBOM
- signing/attestation
- additional architectures
- install CI
- upgrade matrix

## PR-Sized Distribution Slices

```text
D01  Parameterize Verilio API/Gateway image repositories
D02  Add prebuilt-image Compose mode/package
D03  Define GHCR image/version naming contract
D04  Publish tagged release images to GHCR
D05  Verify clean-host install from published images
D06  Add generic self-host install/update documentation
D07  Add CasaOS app package and test it
D08  Verify/document Portainer Stack installation
D09  Verify/document Proxmox Docker-VM installation
D10  Add fresh source-based private installer
D11  Evaluate SBOM/signing and multi-arch publishing
```

**D01 — COMPLETE:** [issue #23](https://github.com/andresz74/verilio/issues/23) /
[PR #24](https://github.com/andresz74/verilio/pull/24), merged 2026-10-04.
**D02 — COMPLETE:** [issue #27](https://github.com/andresz74/verilio/issues/27) /
[PR #28](https://github.com/andresz74/verilio/pull/28). The package generator copies canonical Compose, writes explicit
repository/version configuration with portable secret paths, and includes runtime support files.
No images or secrets are generated; no registry is contacted.

**D03 — COMPLETE:** [issue #29](https://github.com/andresz74/verilio/issues/29) /
[PR #30](https://github.com/andresz74/verilio/pull/30). The official repositories are
`ghcr.io/andresz74/verilio-api` and
`ghcr.io/andresz74/verilio-gateway`, with exact immutable Git release tags and `linux/amd64` only.
The non-secret contract is [`deploy/official-images.env`](../deploy/official-images.env).
OCI source/version/full-revision requirements and public/anonymous-pull intent are documented;
the first official images were published and anonymously verified under D04 below.

**D04 — COMPLETE:** Implementation: [issue #31](https://github.com/andresz74/verilio/issues/31) /
[PR #32](https://github.com/andresz74/verilio/pull/32). First operational publication validation:
[issue #33](https://github.com/andresz74/verilio/issues/33),
[workflow run 37318991060](https://github.com/andresz74/verilio/actions/runs/37318991060).
The qualification workflow published the same tested local image objects using immutable release
tags, verified OCI source/version/revision metadata and digests, and verified anonymous access.

- Release: `v0.1.1-alpha.5`.
- Source commit: `db222d2446a1f12b5e29059665a6db7f2b4d1783`.
- Platform: `linux/amd64`.
- API: `ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5`.
- API digest: `sha256:9d76436b4dd86cbca0b8a53cfe42be7554878b7e98d69298cee568364e1450e6`.
- Anonymous API verification: **passed**.
- Gateway: `ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5`.
- Gateway digest: `sha256:dcb455a392453ac5e6514bb6a1047095df49612263e25cbe9724494ef21fceb8`.
- Anonymous Gateway verification: **passed**.

`v0.1.1-alpha.4` remains an untouched failed pre-publication qualification attempt, not a
published image release.

**D05 — COMPLETE:** [issue #39](https://github.com/andresz74/verilio/issues/39), validated
2026-10-05 on a fresh isolated OrbStack Ubuntu 24.04.5 LTS `linux/amd64` host, with host file
sharing disabled and its own Docker Engine 29.1.3 / Compose 2.40.3. Only the generated D02
package was transferred; no source checkout, local images, credentials, or build output was
transferred. Node/pnpm were absent; Git was installed as a Docker package dependency but unused.

- Release: `v0.1.1-alpha.5`; image source: `db222d2446a1f12b5e29059665a6db7f2b4d1783`.
- API: `ghcr.io/andresz74/verilio-api:v0.1.1-alpha.5`.
- API RepoDigest: `ghcr.io/andresz74/verilio-api@sha256:9d76436b4dd86cbca0b8a53cfe42be7554878b7e98d69298cee568364e1450e6`.
- Gateway: `ghcr.io/andresz74/verilio-gateway:v0.1.1-alpha.5`.
- Gateway RepoDigest: `ghcr.io/andresz74/verilio-gateway@sha256:dcb455a392453ac5e6514bb6a1047095df49612263e25cbe9724494ef21fceb8`.
- Both images were absent before anonymous Compose pull with an empty Docker credential config;
  pulled digests matched D04 exactly. Canonical Compose config contained no builds and retained
  `postgres:17.9-alpine`.
- PostgreSQL bootstrap/health, migration (exit 0), API/Gateway health, and packaged SPA/deep-route/
  live/ready/database-connected smoke checks passed before and after full container recreation.
- Only Gateway published a host port, at `127.0.0.1:8080`; API/PostgreSQL published none.
- Business Settings `Verilio D05 Validation 2026-10-05T19:45:21Z`, saved through the public API,
  survived recreation with the same `verilio_pgdata` volume and stable server owner UUID.
- No source build/toolchain or GHCR login was used. The disposable stack, volume, and host were
  removed after evidence capture; NC110 and existing installations were untouched.

D05 is complete; D06 generic install/update documentation is next and remains planned.
D06–D11 are not complete. This single-host validation does not establish CasaOS, Portainer,
Proxmox, ARM64/multi-architecture, upgrade/restore qualification, or public Internet readiness.

D02 consumes the canonical runtime, not a second production Compose stack. D03 establishes
registry identity and release eligibility before D04 publishing. Each slice uses one issue,
one branch, and one PR.
