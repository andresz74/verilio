# Verilio Codex Build Prompt

## Document Control

**Product:** Verilio  
**Document:** Codex Build Prompt  
**File:** `docs/07-verilio_codex_build_prompt.md`  
**Status:** Draft v0.1  
**Purpose:** Master implementation instruction set for Codex  
**Depends on:**

- `docs/01-verilio_product_requirements_document.md`
- `docs/02-verilio_requirements_analysis.md`
- `docs/03-verilio_ux_flows.md`
- `docs/04-verilio_design_system_specification.md`
- `docs/05-verilio_technical_architecture.md`
- `docs/06-verilio_mvp_implementation_plan.md`

---

# 1. Role

You are the implementation agent for **Verilio**, a freelancer time-tracking, reporting, and invoicing application.

Your job is to build the Verilio MVP according to the project documentation.

You must treat the project documentation as the authoritative source of product intent, business rules, UX behavior, design-system expectations, technical architecture, and implementation order.

Do not redesign the product from first principles.

Do not silently introduce new product behavior.

Do not replace approved architecture with your preferred stack.

Do not expand MVP scope beyond the documented P0/P1/P2 boundaries.

---

# 2. Mandatory Reading Before Coding

Before making implementation changes, read these documents in order:

```text
docs/01-verilio_product_requirements_document.md
docs/02-verilio_requirements_analysis.md
docs/03-verilio_ux_flows.md
docs/04-verilio_design_system_specification.md
docs/05-verilio_technical_architecture.md
docs/06-verilio_mvp_implementation_plan.md
```

Use them for different purposes:

| Document | Primary Use |
|---|---|
| `01` | Product vision, scope, core workflows, non-goals |
| `02` | P0/P1/P2 requirements, business rules, edge cases |
| `03` | User flows, interaction behavior, provisional UX decisions |
| `04` | Visual system, components, accessibility, UI behavior |
| `05` | Approved technical architecture and ADRs |
| `06` | Milestones, slices, acceptance gates, execution sequence |

If documents appear to conflict:

1. Do not guess silently.
2. Prefer explicit later architecture/implementation decisions when they are clearly intended to resolve earlier ambiguity.
3. Preserve PRD product intent.
4. Surface any true blocker before implementing contradictory behavior.

---

# 3. Product Goal

Verilio should let a solo freelancer complete this loop:

```text
Clients
  ↓
Projects
  ↓
Tasks
  ↓
Time
  ↓
Reports
  ↓
Invoices
  ↓
Payments
```

The complete MVP should support:

```text
Track
→ Review
→ Report
→ Invoice
→ Download PDF
→ Mark Sent
→ Mark Paid
```

The product promise is:

> **Track your work. Bill with confidence.**

---

# 4. MVP User

The primary user is:

```text
Independent freelancer / solo consultant
```

Do not introduce:

- Team management.
- Employee monitoring.
- Roles and permissions.
- Timesheet approvals.
- GPS.
- Screenshots.
- Kiosks.
- Payroll.
- Scheduling.
- Staffing.
- Multi-company workspaces.

unless a future approved document explicitly adds them.

---

# 5. Approved Technology Stack

Use the architecture defined in `docs/05-verilio_technical_architecture.md`.

## Monorepo

```text
pnpm
TypeScript
```

## Frontend

```text
React
TypeScript
Vite
React Router
TanStack Query
React Hook Form
Zod
Tailwind CSS
CSS custom properties
Radix UI primitives
TanStack Table
Recharts
Lucide React
```

## Backend

```text
Node.js
TypeScript
Fastify
Zod
REST / JSON
```

## Database

```text
PostgreSQL
Drizzle ORM
```

## Testing

```text
Vitest
React Testing Library
MSW
PostgreSQL integration tests
Playwright
```

## PDF

```text
Server-side invoice PDF generation
```

---

# 6. Explicit Architecture Constraints

The following decisions are already made.

Do not replace them without an approved documentation change.

## 6.1 No Redux for MVP

Use:

```text
Server state → TanStack Query
Form state   → React Hook Form
URL state    → React Router search params
Local UI     → useState / useReducer
```

Do not add Redux Toolkit simply because the application has many screens.

---

## 6.2 No MUI as Primary UI System

Do not use MUI as the Verilio design foundation.

Use:

```text
Tailwind
+
CSS custom properties
+
Radix primitives
+
Verilio-owned components
```

Feature code should consume Verilio UI abstractions where they exist.

---

## 6.3 No Next.js for MVP App

Use React + Vite.

A marketing site is separate future work.

---

## 6.4 No GraphQL

Use the approved versioned REST API.

---

## 6.5 No Redis, Queues, or WebSockets Initially

Do not add infrastructure that is not required by a current product need.

The MVP is a modular monolith.

---

## 6.6 PostgreSQL Is Canonical

Do not create parallel SQLite support during MVP.

---

# 7. Repository Structure

Target structure:

```text
verilio/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── contracts/
│   ├── db/
│   ├── domain/
│   ├── ui/
│   ├── invoice-pdf/
│   └── config/
│
├── docs/
│   ├── 01-verilio_product_requirements_document.md
│   ├── 02-verilio_requirements_analysis.md
│   ├── 03-verilio_ux_flows.md
│   ├── 04-verilio_design_system_specification.md
│   ├── 05-verilio_technical_architecture.md
│   ├── 06-verilio_mvp_implementation_plan.md
│   └── 07-verilio_codex_build_prompt.md
│
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

Preserve clear package boundaries.

---

# 8. Package Responsibilities

## `apps/web`

Owns:

- Pages.
- Routes.
- Application layout.
- Feature UI.
- Query hooks.
- Forms.
- URL state.
- Browser interactions.

Must not own authoritative billing logic.

---

## `apps/api`

Owns:

- HTTP routes.
- Validation.
- Authorization boundary.
- Transactions.
- Persistence orchestration.
- Timer commands.
- Report queries.
- Invoice commands.
- PDF endpoint.

Route handlers should be thin.

---

## `packages/contracts`

Owns shared:

- Zod request schemas.
- Response schemas.
- DTOs.
- Query schemas.
- Shared enums.

Do not expose database row types directly as API contracts.

---

## `packages/db`

Owns:

- Drizzle schema.
- Database client.
- Migrations.
- DB-specific helpers.
- Integration-test database support.

---

## `packages/domain`

Owns pure business rules:

- Rate resolution.
- Duration logic.
- Money math.
- Invoice state transitions.
- Invoice grouping.
- Currency grouping.
- Derived invoice behavior.

Avoid React/framework/database dependencies where practical.

---

## `packages/ui`

Owns:

- Tokens.
- Primitive UI.
- Composite UI.
- Shared accessibility behavior.
- Shared data-display components.

---

## `packages/invoice-pdf`

Owns deterministic invoice PDF rendering.

---

# 9. Build Order

Follow the milestone order from `docs/06-verilio_mvp_implementation_plan.md`.

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

Do not skip ahead to visually exciting work if dependencies are not ready.

In particular:

- Do not start with the Timer screen before foundation, settings, clients, projects, and tasks exist.
- Do not build invoicing before time/report behavior is stable.
- Do not build dashboard features before MVP completion.

---

# 10. Slice-Based Implementation

Prefer small vertical slices.

The approved slice sequence is approximately:

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

Each slice should leave the repository working and passing.

---

# 11. P0 / P1 / P2 Policy

## P0

Mandatory for MVP completion.

Implement P0 before polishing P1.

## P1

Useful and recommended, but must not block P0 delivery.

If implementation complexity threatens P0, defer P1 and document it.

## P2

Do not implement during MVP unless explicitly instructed.

Examples include:

- Dashboard.
- Native apps.
- Browser extension.
- Expenses.
- Recurring invoices.
- Client portal.
- Clockify import.

---

# 12. Server Authority Rule

For persisted business state, the server/database is authoritative.

This is especially important for:

- Timer Start.
- Timer Stop.
- Historical rate snapshots.
- Invoice import.
- Invoice totals.
- Invoice state transitions.
- Paid date.
- Void.
- Invoice numbering.

Do not claim success in the UI until the authoritative operation succeeds.

---

# 13. Timer Rules

The Timer is one of the highest-risk areas.

## 13.1 Running Timer Persistence

Represent the running timer as a persisted time entry.

Do not keep the authoritative Timer only in:

- React state.
- localStorage.
- Redux.
- a browser-only interval.

---

## 13.2 Server Timestamps

The server supplies authoritative Start and Stop timestamps.

The browser may render elapsed time using the persisted Start timestamp.

---

## 13.3 One Running Timer

Protect this invariant in:

1. Application/domain logic.
2. PostgreSQL.

Use a database mechanism such as a partial unique index.

This must hold across:

- Double clicks.
- Multiple tabs.
- Racing requests.

---

## 13.4 Timer Rendering

Do not:

- persist every second.
- fetch every second.
- update a global store every second.

Only the visible timer display should tick locally.

---

## 13.5 Recovery

Required behavior:

```text
Start timer
→ navigate
→ reload
→ timer still running
→ stop timer
```

Add E2E coverage.

---

# 14. Time Entry Rules

Supported modes:

```text
timer
range
duration
```

Use:

```text
workDate
startAt
endAt
durationSeconds
```

appropriately.

## Date/Time Types

Distinguish:

```text
Instant
DateOnly
Duration
```

Do not model date-only invoice/work-date fields as timezone-sensitive JavaScript `Date` values.

---

# 15. Historical Rate Rules

Rate resolution order:

```text
Explicit entry rate
→ Project default
→ Client default
→ Business default
```

When a billable entry is finalized:

```text
persist resolved hourly rate on the time entry
```

Reports must use the stored historical rate.

Never recalculate old time using the current project/client/business rate.

---

# 16. Money Rules

Do not use JavaScript floating-point numbers as authoritative persisted money.

Use:

```text
PostgreSQL numeric/decimal
+
decimal-safe TypeScript arithmetic
```

The server owns final monetary calculations.

Frontend calculations may preview but cannot override server truth.

---

# 17. Multi-Currency Rule

Never sum incompatible currencies into one monetary total.

Allowed:

```text
Tracked time: 42h 17m

Billable:
USD  $8,240.00
EUR  €2,180.00
```

Not allowed:

```text
Total billable value: $10,420.00
```

when the result contains multiple currencies and no conversion exists.

---

# 18. Invoice Traceability

Use:

```text
Invoice
  ↓
InvoiceItem
  ↓
InvoiceItemTimeEntry
  ↓
TimeEntry
```

Do not rely only on a single `invoiceId` field on `TimeEntry`.

The system must support:

```text
Time → Invoice
Invoice → Source Time
```

---

# 19. Draft Reservation Rule

A time entry linked to a non-void invoice is reserved.

That includes Draft.

Therefore:

```text
linked to Draft
→ no longer eligible for another invoice
→ reports show Invoiced
```

Removing it from the Draft restores eligibility.

Voiding the invoice restores eligibility.

---

# 20. Invoice State Machine

Stored states:

```text
draft
sent
paid
void
```

Allowed transitions:

```text
draft → sent
draft → void

sent → paid
sent → void
```

For MVP:

```text
paid = terminal/read-only
void = terminal/read-only
```

Do not expose arbitrary status mutation.

Use explicit lifecycle commands.

---

# 21. Overdue

Overdue is derived.

```text
status = sent
AND dueDate < current business date
AND paidAt = null
→ display Overdue
```

Do not store `overdue` as the primary lifecycle state.

---

# 22. Invoice Snapshots

Persist invoice presentation data.

At minimum snapshot:

- Seller/business identity.
- Client identity.
- Invoice monetary values.
- Invoice line descriptions/quantities/rates/amounts.

Changing current business/client data must not silently alter historical invoice output.

---

# 23. PDF Rules

Generate PDF server-side from saved invoice data.

Do not generate a historical invoice PDF by re-querying mutable current rates/client identity as the source of truth.

PDF must be deterministic from saved invoice data.

---

# 24. UI Design Rules

Follow `docs/04-verilio_design_system_specification.md`.

Core visual character:

```text
Professional
Calm
Trustworthy
Dense but readable
Minimal navigation
Restrained surfaces
Clear financial state
```

Do not copy Clockify's visual design.

---

# 25. UI Component Boundary

Feature code should prefer:

```tsx
import { Button, Dialog, Field } from "@verilio/ui";
```

over direct primitive-library imports.

If a required shared component does not exist:

1. Decide whether it belongs in `packages/ui`.
2. Implement the reusable Verilio abstraction there if appropriate.
3. Use it from the feature.

Do not create duplicate button/dialog/input systems in different features.

---

# 26. Tailwind Usage

Tailwind is an implementation tool, not the public design-system API.

Use semantic tokens and shared variants.

Avoid spreading repeated raw Tailwind recipes across the application when they represent reusable components.

Feature-level layout classes are acceptable.

---

# 27. Accessibility Requirements

Primary workflows must be keyboard accessible.

Ensure:

- Visible focus.
- Proper labels.
- Accessible dialogs.
- Focus restoration.
- Keyboard-capable selectors.
- State not represented only by color.
- Semantic tables.

Do not postpone basic accessibility until the end.

---

# 28. Form Strategy

Use:

```text
React Hook Form
+
Zod
```

Frontend validation is for UX.

Server validation is authoritative.

Where frontend and API share the same data contract, reuse Zod schemas.

Do not duplicate equivalent validation logic unnecessarily.

---

# 29. Server State Strategy

Use TanStack Query.

Examples:

```text
["settings"]
["clients"]
["projects"]
["tasks", projectId]
["timer", "current"]
["timeEntries", filters]
["reports", "summary", filters]
["reports", "detailed", filters]
["invoices", filters]
["invoice", invoiceId]
```

Invalidate the smallest meaningful set after mutations.

Do not mirror all server data into a second global client store.

---

# 30. URL State

Use URL search parameters for navigable filter state where practical.

Examples:

- Timesheet date range.
- Report date range.
- Client/project filters.
- Invoice status filters.

This should support:

- Reload.
- Browser Back/Forward.
- Bookmarking.

---

# 31. Database Rules

Use relational constraints to protect important invariants.

Examples:

- Foreign keys.
- One running timer per user.
- Unique invoice numbers.
- Valid owner scope.
- Invoice/time relationship integrity.

Do not rely only on disabled buttons to protect financial correctness.

---

# 32. Transactions

Use transactions for multi-step financial operations.

Required candidates:

- Invoice time import.
- Draft item/link updates.
- Void.
- Invoice-number allocation.
- Any operation that could partially reserve/release time.

If partial failure could leave inconsistent billing state, the operation belongs in a transaction.

---

# 33. Concurrency

Even though the UX is single-user, assume:

- Multiple browser tabs.
- Retries.
- Double clicks.
- Future multiple devices.

Protect business invariants on the server/database.

---

# 34. API Style

Use versioned REST:

```text
/api/v1/...
```

Prefer explicit command endpoints for lifecycle behavior.

Examples:

```text
POST /api/v1/timer/start
POST /api/v1/timer/stop

POST /api/v1/invoices/:id/mark-sent
POST /api/v1/invoices/:id/mark-paid
POST /api/v1/invoices/:id/void
```

Do not encode lifecycle rules as arbitrary generic status PATCHes.

---

# 35. Error Model

Return consistent structured errors.

Example:

```json
{
  "error": {
    "code": "TIME_ENTRY_INVOICED",
    "message": "This time entry is linked to an invoice.",
    "fieldErrors": null,
    "requestId": "..."
  }
}
```

Use stable domain error codes where the frontend needs behavior-specific handling.

---

# 36. Testing Policy

Write tests with the feature.

Do not defer all business-rule testing until M9.

Use:

```text
Unit
Integration
Component
End-to-end
```

---

# 37. Required High-Risk Tests

At minimum, cover:

## Timer

- One running timer.
- Concurrent Start.
- Reload recovery.
- Stop correctness.
- Cross-midnight behavior.

## Rates

- Rate fallback hierarchy.
- Historical snapshot stability.
- Mid-month rate changes.

## Money

- Decimal-safe calculations.
- Rounding.
- Multiple currencies.

## Invoice

- Draft reserves time.
- Same time cannot enter two invoices.
- Removing Draft item releases time.
- Void releases time.
- Paid locks invoice.
- Invoice snapshots remain stable.
- Invoice number uniqueness.
- PDF uses saved data.

---

# 38. End-to-End Scenario

Maintain an E2E scenario that verifies:

```text
1. Configure business.
2. Create client.
3. Create project.
4. Create task.
5. Start timer.
6. Navigate away.
7. Reload.
8. Stop timer.
9. Add manual entry.
10. Review Timesheet.
11. Review Reports.
12. Create invoice.
13. Import time.
14. Save Draft.
15. Confirm source time is Invoiced.
16. Download PDF.
17. Mark Sent.
18. Mark Paid.
19. Confirm invoice locked.
20. Confirm traceability.
```

This is the MVP's primary functional proof.

---

# 39. Definition of Done

A slice is complete only when:

1. Code compiles.
2. Typecheck passes.
3. Lint passes.
4. Relevant tests pass.
5. Server-side validation exists.
6. Error states are handled.
7. Accessibility basics exist.
8. Relevant product terminology matches docs.
9. No known P0 rule is knowingly broken.
10. Documentation is updated if implementation changes an approved decision.

---

# 40. When to Ask for Clarification

Do **not** ask questions merely because there are several reasonable implementation details.

Use engineering judgment when the documentation already defines the expected behavior.

Ask only when a missing product decision materially blocks correct implementation.

Examples that may require explicit product approval:

- Tax/discount calculation order.
- Hosted authentication provider.
- Public deployment model.
- Invoice numbering rule if project decision changes.
- A new state transition not defined in docs.
- A feature that would expand P0/P1/P2 scope.

---

# 41. When Not to Ask

Do not ask for confirmation on routine implementation choices that fit the architecture, such as:

- File naming within an approved feature structure.
- Whether to write a helper function.
- Whether to add an obvious index supporting a documented query.
- Whether to write a unit test for a documented business rule.
- Whether to reuse an existing Verilio UI component.

Proceed with the documented intent.

---

# 42. Documentation Drift Policy

If implementation reveals that a documented decision must change:

1. Stop before silently diverging.
2. Identify the conflict.
3. Update the relevant project document if the change is approved.
4. Then implement the updated decision.

The code should not quietly become a different product than the documentation.

---

# 43. Dependency Policy

Before adding a dependency, evaluate:

1. Does the current stack already solve this?
2. Is this dependency reasonably maintained?
3. Does it impose a visual/design system Verilio would have to fight?
4. Can it be isolated behind a Verilio abstraction?
5. Does it introduce a paid/commercial dependency for a core feature?
6. Is it justified by an actual current requirement?

Avoid adding large overlapping libraries for convenience.

---

# 44. Seed Data

Development seed data may include:

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
billable entries
non-billable entry
multiple dates

Invoices:
Draft
Sent
Paid
Void
```

Seed data must not be required for runtime behavior.

---

# 45. Migration Policy

Use checked-in Drizzle migrations.

Do not:

- mutate previously applied production migrations casually.
- make destructive history changes without review.
- rely on runtime auto-sync in place of migrations.

Financial-history schema changes require extra care.

---

# 46. Security Baseline

Even in a private MVP:

- Validate input server-side.
- Avoid exposing secrets.
- Treat client/invoice data as private.
- Do not log passwords/tokens/private payloads unnecessarily.
- Do not expose predictable public invoice URLs.
- Keep owner-scoped data boundaries in the schema.

Before public deployment, authentication and authorization become mandatory.

---

# 47. Performance Baseline

Do not optimize prematurely, but preserve correct architecture.

Required:

- Server-side report aggregation.
- Pagination for large detail lists.
- No full-history browser load.
- Local timer tick only.
- Appropriate indexes.
- No per-second server persistence.

---

# 48. Implementation Reporting

After each completed slice, report:

```text
Slice completed
Files changed
What now works
Tests added/updated
Commands run
Known limitations
Next slice
```

If a blocker exists, report:

```text
Blocking decision
Why it blocks implementation
Relevant documentation sections
Recommended option
Alternatives
```

Do not hide known failures.

---

# 49. Stop Conditions

Stop and surface the issue if:

- A requested change violates a P0 business rule.
- An implementation would silently change historical billing behavior.
- A new dependency conflicts with an approved ADR.
- A database change would make invoice traceability unreliable.
- A requirement cannot be implemented without resolving a documented open product decision.
- Tests expose a contradiction in existing specifications.

---

# 50. First Task

Begin with **M0 — Repository & Engineering Foundation**.

The first concrete implementation sequence is:

```text
1. Inspect current repository state.
2. Read docs/01 through docs/06.
3. Initialize/verify pnpm workspace.
4. Create/verify apps/web.
5. Create/verify apps/api.
6. Create/verify packages/contracts.
7. Create/verify packages/db.
8. Create/verify packages/domain.
9. Create/verify packages/ui.
10. Create/verify packages/invoice-pdf.
11. Configure strict TypeScript.
12. Configure React/Vite.
13. Configure Fastify.
14. Configure PostgreSQL/Drizzle.
15. Add health endpoints.
16. Add shared schemas.
17. Add lint/typecheck/test scripts.
18. Add smoke tests.
19. Run the repository checks.
20. Report M0 progress before proceeding.
```

Do not build product features before the foundation is passing.

---

# 51. Final Instruction

Build Verilio as a focused, reliable freelancer work ledger.

Optimize for:

```text
clarity
correctness
historical integrity
billing confidence
small architecture
accessible UI
maintainable TypeScript
```

Avoid:

```text
scope creep
premature infrastructure
hidden financial assumptions
browser-only business truth
duplicated state
visual framework lock-in
silent divergence from documentation
```

The implementation is successful when the user can trust the full path:

```text
Work
→ Time
→ Report
→ Invoice
→ Payment
```

and the codebase preserves that trust through explicit domain rules, tested financial behavior, and a small modular architecture.
