# Verilio MVP Implementation Plan

## Document Control

**Product:** Verilio  
**Document:** MVP Implementation Plan  
**File:** `docs/06-verilio_mvp_implementation_plan.md`  
**Status:** Draft v0.1  
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

Implement description, Client, Project, optional Task, Billable, and Start.

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

Uninvoiced entries may be deleted with confirmation.

Invoice-protected entries are rejected once invoice relationships exist.

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

## M7.7 — Eligible Time Query

Implement:

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

## M7.8 — Import Time Transaction

Implement:

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

## M7.9 — Draft Reservation

Imported time is reserved immediately once linked to a saved Draft.

It must disappear from other invoice-import queries and show as Invoiced in reports.

## M7.10 — Remove Imported Time

Removing a Draft invoice item removes time links, recalculates totals, and restores source-time eligibility.

Whole grouped-line removal is sufficient for MVP.

## M7.11 — Manual Invoice Items

Support description, quantity, unit price, amount.

Reject negative amounts in MVP.

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

## M7.14 — Import Dialog

Display eligible count, duration, billable value, selectable entries, and grouping.

## M7.15 — Traceability UI

Support:

```text
Time → Invoice
Invoice item → Source time
```

## M7.16 — Reports Integration

Complete Invoiced/Not invoiced report filtering.

## M7 Exit Gate

The user can create a Draft invoice, import billable uninvoiced time, group by project, add manual items, save, see source entries become invoiced, remove an item, and see source time become uninvoiced again.

Double invoicing must be prevented.

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
→ create invoice
→ import time
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

Affects authentication, storage, and packaging.

May remain open through private/local development, but must be resolved before public deployment.

## OD-B — Authentication

May remain deferred locally, but public hosted access requires authentication.

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
S33  Invoice Draft API
S34  Eligible-time/import API
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
