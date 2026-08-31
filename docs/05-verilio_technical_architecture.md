# Verilio Technical Architecture

## Document Control

**Product:** Verilio  
**Document:** Technical Architecture  
**File:** `docs/05-verilio_technical_architecture.md`  
**Status:** Draft v0.1  
**Depends on:**

- `docs/01-verilio_product_requirements_document.md`
- `docs/02-verilio_requirements_analysis.md`
- `docs/03-verilio_ux_flows.md`
- `docs/04-verilio_design_system_specification.md`

**Primary platform:** Web application  
**Primary user:** Independent freelancer / solo consultant  
**Architecture style:** TypeScript monorepo, React SPA, REST API, relational database  
**Primary product loop:** **Track → Review → Report → Invoice → Get Paid**

---

# 1. Purpose

This document defines the initial engineering architecture for the Verilio MVP.

The preceding documents establish:

- Product scope and goals.
- Functional and non-functional requirements.
- UX flows and provisional product decisions.
- Visual and component-system requirements.

This document turns those requirements into concrete technical decisions for:

- Frontend framework and libraries.
- Frontend state architecture.
- UI component architecture.
- Backend/API framework.
- Database and persistence.
- Timer reliability.
- Time-zone and date handling.
- Decimal-safe monetary calculations.
- Reporting.
- Invoice generation and traceability.
- PDF generation.
- Authentication/deployment boundaries.
- Testing.
- Security.
- Observability.
- Monorepo structure.
- Local development.
- Deployment evolution.

The architecture intentionally prioritizes correctness and maintainability over framework novelty.

The highest-risk Verilio behaviors are:

1. Timer correctness.
2. Historical hourly-rate correctness.
3. Monetary precision.
4. Invoice/time traceability.
5. Invoice lifecycle integrity.
6. Multi-currency report correctness.

Those risks influence several decisions below.

---

# 2. Architecture Goals

The Verilio architecture should:

1. Keep the frontend entirely TypeScript.
2. Keep backend and shared contracts in TypeScript.
3. Avoid unnecessary client-side global state.
4. Keep the design system independent from a large opinionated UI framework.
5. Treat the server/database as authoritative for persisted business state.
6. Make financial calculations deterministic and testable.
7. Preserve historical values rather than dynamically recalculating them from mutable defaults.
8. Use relational constraints to protect billing integrity.
9. Make the running timer resilient to navigation and refresh.
10. Support several years of time entries without loading the entire history into the browser.
11. Keep deployment provider-neutral.
12. Allow future hosted or self-hosted deployment without redesigning the application domain.

---

# 3. High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
│                                                              │
│  React + TypeScript                                          │
│  React Router                                                │
│  TanStack Query                                              │
│  React Hook Form + Zod                                       │
│  Verilio UI                                                  │
│  Tailwind + CSS variables + Radix primitives                │
│  TanStack Table + Recharts                                  │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ HTTPS / JSON REST API
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                        API Server                            │
│                                                              │
│  Node.js + TypeScript                                       │
│  Fastify                                                    │
│  Shared Zod contracts                                       │
│  Domain services                                            │
│  Authorization boundary                                     │
│  Invoice/timer/report services                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ Drizzle ORM / SQL
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                       PostgreSQL                             │
│                                                              │
│  Users / profile                                            │
│  Clients                                                    │
│  Projects                                                   │
│  Tasks                                                      │
│  Time entries                                               │
│  Invoices                                                   │
│  Invoice items                                              │
│  Invoice ↔ time-entry links                                 │
└──────────────────────────────────────────────────────────────┘

                         +
               Server-side PDF renderer
                         +
              File/storage adapter if needed
```

---

# 4. Repository Strategy

## Decision

Use a **pnpm TypeScript monorepo**.

Recommended root structure:

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
│   └── 05-verilio_technical_architecture.md
│
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## Why

The application benefits from shared:

- Runtime validation schemas.
- TypeScript types.
- Domain calculations.
- Design-system components.
- Database schema/types.
- Invoice rendering models.
- Lint/TypeScript/test configuration.

A monorepo makes those boundaries explicit without requiring published npm packages.

---

# 5. Package Responsibilities

## `apps/web`

Browser application.

Owns:

- Routes.
- Page composition.
- Feature UI.
- Query hooks.
- API client.
- Browser-specific state.
- URL filter state.
- Forms.
- Responsive application shell.

Must not contain authoritative billing logic.

---

## `apps/api`

HTTP application.

Owns:

- Route handlers.
- Authentication/authorization boundary.
- Request validation.
- Transactions.
- Persistence coordination.
- Report queries.
- Timer commands.
- Invoice commands.
- PDF endpoint orchestration.

Route handlers should remain thin and delegate business logic to services.

---

## `packages/contracts`

Shared API contracts.

Owns:

- Zod request schemas.
- Zod response schemas.
- Shared DTO types.
- Enums used over the API.
- Query/filter schemas.

Example:

```text
contracts/
├── clients.ts
├── projects.ts
├── tasks.ts
├── time-entries.ts
├── reports.ts
├── invoices.ts
└── settings.ts
```

The frontend and API may both import this package.

Database row types should **not** become public API contracts automatically.

---

## `packages/db`

Database layer.

Owns:

- Drizzle schema.
- Database client.
- Migrations.
- DB-specific types.
- Repository/query helpers where useful.
- Integration-test database helpers.

---

## `packages/domain`

Pure business rules.

Owns deterministic logic such as:

- Hourly-rate resolution.
- Duration calculations.
- Invoice state rules.
- Money calculations.
- Invoice item grouping.
- Currency grouping rules.
- Eligibility predicates where they can be expressed independently of SQL.

This package should avoid browser-specific code and ideally avoid direct database access.

---

## `packages/ui`

Verilio design-system implementation.

Owns:

- Semantic tokens.
- Primitive UI components.
- Composite controls.
- Accessibility wrappers.
- Shared table components.
- Status presentation.

Feature code imports Verilio components from this package rather than directly importing MUI or raw Radix primitives.

---

## `packages/invoice-pdf`

Server-compatible invoice PDF rendering.

Owns:

- PDF invoice view model.
- Invoice PDF template.
- Formatting helpers specific to the PDF.
- PDF generation tests.

---

## `packages/config`

Shared project configuration where useful.

Possible contents:

- TypeScript configs.
- ESLint configuration.
- Test setup.
- Tailwind shared configuration if required.

---

# 6. Frontend Technology Stack

## Decision

Use:

| Concern | Technology |
|---|---|
| UI framework | React |
| Language | TypeScript |
| Build tool | Vite |
| Routing | React Router |
| Server state | TanStack Query |
| Forms | React Hook Form |
| Runtime validation | Zod |
| Styling | Tailwind CSS + CSS custom properties |
| Accessible primitives | Radix UI |
| Component source patterns | Selected shadcn-style patterns where useful |
| Tables | TanStack Table |
| Charts | Recharts |
| Date utilities | date-fns + timezone utilities |
| Icons | Lucide React |
| Unit/component tests | Vitest + React Testing Library |
| API mocking | MSW |
| End-to-end tests | Playwright |

---

# 7. Why React + Vite

Verilio is primarily an authenticated/interactive application rather than a content-first SEO application.

The MVP needs:

- Rich form behavior.
- Persistent application shell.
- Timer state.
- Client-side filters.
- Data tables.
- Reports.
- Invoice editor.
- Frequent API interactions.

A React SPA with Vite keeps the frontend straightforward.

## Decision

Do **not** use Next.js for the MVP application.

A marketing site can be introduced separately later if required.

---

# 8. UI Library Strategy

## Decision

Do **not** use MUI as Verilio's primary component system.

Use:

```text
Tailwind CSS
      +
CSS custom-property design tokens
      +
Radix UI primitives
      +
selected owned component patterns
      ↓
@verilio/ui
      ↓
feature components
```

## Reasoning

The Verilio design specification requires:

- A custom semantic color system.
- Calm density.
- Restrained borders.
- Minimal shadows.
- Compact professional tables.
- Custom timer states.
- Custom invoice states.
- Custom invoice presentation.
- A visual identity that does not inherit another product's design language.

MUI could be wrapped and extensively themed, but that would make Verilio depend on a Material-oriented component model that the project would then spend effort overriding.

A headless/primitives strategy lets Verilio own its visual API from the start.

---

# 9. Verilio UI Component Boundary

Feature code should generally import:

```tsx
import {
  Button,
  Dialog,
  Field,
  MoneyInput,
  DateRangePicker,
  DataTable,
} from "@verilio/ui";
```

Feature code should not normally import:

```tsx
import * as Dialog from "@radix-ui/react-dialog";
```

directly.

## Rule

Underlying UI libraries are implementation details of `@verilio/ui`.

This allows:

- Centralized accessibility behavior.
- Centralized variants.
- Consistent tokens.
- Future primitive replacement.
- Easier design QA.

## Tailwind Usage Rule

Tailwind may be used in feature code for:

- Page layout.
- Grid/flex composition.
- Local responsive arrangement.

Reusable controls and repeated visual variants belong in `@verilio/ui`.

---

# 10. Proposed UI Layers

```text
UI Primitives
│
├── Button
├── IconButton
├── TextInput
├── Checkbox
├── Switch
├── Dialog
├── Popover
├── DropdownMenu
├── Tooltip
└── StatusBadge

Composite UI
│
├── MoneyInput
├── DurationInput
├── SearchSelect
├── DateRangePicker
├── DataTable
└── FormField

Domain UI
│
├── ClientSelect
├── ProjectSelect
├── TaskSelect
├── TimerComposer
├── RunningTimer
├── TimeEntryRow
├── TimesheetDayGroup
├── ReportFilterBar
├── InvoiceLineItemTable
├── InvoiceTotals
└── InvoiceTimeImportDialog
```

Domain UI may live in `apps/web/features` when it is application-specific rather than generally reusable.

---

# 11. Design Tokens Implementation

Design tokens should be represented as semantic CSS custom properties.

Example:

```css
:root {
  --color-bg-canvas: ...;
  --color-bg-surface: ...;
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-border-default: ...;

  --color-accent-default: ...;
  --color-success-default: ...;
  --color-warning-default: ...;
  --color-danger-default: ...;

  --radius-sm: ...;
  --radius-md: ...;
  --radius-lg: ...;
}
```

Tailwind should consume these semantic values.

## Rule

Feature code should not become dependent on arbitrary palette values such as:

```text
indigo-600
slate-300
green-500
```

for important semantic states.

Prefer:

```text
accent
border
success
warning
danger
muted
```

through the token layer.

---

# 12. Frontend State Architecture

Verilio should separate state according to ownership.

```text
SERVER STATE
TanStack Query

FORM STATE
React Hook Form

URL STATE
React Router search parameters

LOCAL UI STATE
useState / useReducer

GLOBAL CLIENT STATE
None initially
```

---

# 13. Redux Decision

## Decision

Do **not** use Redux in the MVP.

## Why

Most Verilio state belongs elsewhere:

### Server state

Examples:

- Clients.
- Projects.
- Tasks.
- Time entries.
- Current running timer.
- Reports.
- Invoices.
- Settings.

These belong in TanStack Query.

### Form state

Examples:

- Client form.
- Project form.
- Manual time-entry form.
- Invoice editor.
- Settings.

These belong in React Hook Form.

### Navigable filter state

Examples:

- Report date range.
- Report filters.
- Timesheet date range.
- Invoice list filters.

These should live in URL search parameters where practical.

### Local UI state

Examples:

- Dialog open state.
- Selected tab.
- Popover state.
- Unsaved row editing.

Use local React state.

Redux Toolkit may be revisited if Verilio later requires:

- Complex offline synchronization.
- Multi-window desktop state.
- Large undo/redo workflows.
- Substantial client-only workflow state shared across distant features.

---

# 14. TanStack Query Strategy

TanStack Query is responsible for server-state lifecycle.

Example query keys:

```text
["settings"]
["clients", filters]
["client", clientId]

["projects", filters]
["project", projectId]

["tasks", projectId]

["timer", "current"]

["timeEntries", filters]

["reports", "summary", filters]
["reports", "detailed", filters]

["invoices", filters]
["invoice", invoiceId]
["invoice", invoiceId, "eligible-time"]
```

## Mutation Strategy

Mutations should invalidate the smallest meaningful set.

Example:

Stopping a timer may invalidate:

```text
["timer", "current"]
["timeEntries", ...]
["reports", ...]
```

Invoice import/save may invalidate:

```text
["invoice", invoiceId]
["timeEntries", ...]
["reports", ...]
["invoices", ...]
```

Avoid manually duplicating the same server entity into multiple client stores.

---

# 15. URL State

Report and list filters should be shareable/bookmarkable where practical.

Examples:

```text
/reports/summary?from=2026-08-01&to=2026-08-31&client=...
/timesheet?range=this-week
/invoices?status=sent
```

Benefits:

- Browser back/forward works naturally.
- Reload preserves report context.
- Links can be bookmarked.
- Filter state is not hidden in global memory.

Zod schemas from `packages/contracts` or route-specific schemas should validate parsed search parameters.

---

# 16. Forms and Validation

## Decision

Use:

```text
React Hook Form
+
Zod
```

Frontend validation improves UX, but API validation remains authoritative.

Example:

```ts
const clientSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().optional(),
  currency: z.string().length(3),
  defaultHourlyRate: decimalStringSchema.optional(),
});
```

## Rule

Do not maintain unrelated frontend-only and backend-only validation definitions when the same contract can be shared.

Business rules that require database state still belong on the server.

---

# 17. Tables

## Decision

Use **TanStack Table** for structured data screens.

Primary consumers:

- Timesheet.
- Detailed Reports.
- Clients.
- Projects.
- Invoices.
- Invoice time-import dialog.
- Invoice line items where suitable.

## Why

TanStack Table provides behavior without imposing a visual system.

That matches Verilio's requirement for a custom dense professional table design.

If large datasets later require row virtualization, add TanStack Virtual without replacing the table architecture.

---

# 18. Charts

## Decision

Use **Recharts** for MVP reporting charts.

Initial chart requirements are limited:

- Hours by day.
- Hours by project.

Charts are supplemental.

The authoritative report values remain available as text/table data.

No chart should combine incompatible currency values into one monetary series.

---

# 19. Backend Technology Stack

## Decision

Use:

| Concern | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| HTTP framework | Fastify |
| Validation | Zod shared contracts |
| ORM/query layer | Drizzle ORM |
| Database | PostgreSQL |
| Logging | Fastify/Pino structured logs |
| API style | Versioned REST/JSON |

---

# 20. Why Fastify

Fastify provides:

- A small framework surface.
- Good performance.
- Plugin structure.
- Structured logging.
- Straightforward TypeScript integration.
- Clear separation between routing and services.

Verilio does not currently require the larger application framework structure of NestJS.

If the backend grows substantially, service/module organization can evolve without changing the API contract.

---

# 21. REST API Decision

## Decision

Use versioned REST endpoints:

```text
/api/v1/...
```

Do not use GraphQL for MVP.

The domain maps naturally to commands/resources, and report endpoints can accept explicit filter objects/query parameters.

The API should return application DTOs rather than raw Drizzle rows.

---

# 22. Proposed API Surface

Representative endpoints:

```text
GET    /api/v1/settings
PUT    /api/v1/settings

GET    /api/v1/clients
POST   /api/v1/clients
GET    /api/v1/clients/:id
PATCH  /api/v1/clients/:id
POST   /api/v1/clients/:id/archive
POST   /api/v1/clients/:id/reactivate

GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
POST   /api/v1/projects/:id/archive
POST   /api/v1/projects/:id/reactivate

GET    /api/v1/projects/:id/tasks
POST   /api/v1/projects/:id/tasks
PATCH  /api/v1/tasks/:id
POST   /api/v1/tasks/:id/archive
POST   /api/v1/tasks/:id/reactivate

GET    /api/v1/timer/current
POST   /api/v1/timer/start
POST   /api/v1/timer/stop

GET    /api/v1/time-entries
POST   /api/v1/time-entries
GET    /api/v1/time-entries/:id
PATCH  /api/v1/time-entries/:id
DELETE /api/v1/time-entries/:id

GET    /api/v1/reports/summary
GET    /api/v1/reports/detailed
GET    /api/v1/reports/detailed.csv

GET    /api/v1/invoices
POST   /api/v1/invoices
GET    /api/v1/invoices/:id
PATCH  /api/v1/invoices/:id
GET    /api/v1/invoices/:id/eligible-time
POST   /api/v1/invoices/:id/import-time
POST   /api/v1/invoices/:id/mark-sent
POST   /api/v1/invoices/:id/mark-paid
POST   /api/v1/invoices/:id/void
GET    /api/v1/invoices/:id/pdf
```

Exact endpoint naming may evolve, but commands that enforce lifecycle rules should remain explicit.

---

# 23. Service Layer

Route handlers should not implement business logic inline.

Recommended services:

```text
SettingsService
ClientService
ProjectService
TaskService
TimerService
TimeEntryService
ReportService
InvoiceService
InvoicePdfService
```

High-risk rules belong in dedicated functions/services with direct tests.

Example:

```ts
invoiceService.markPaid(invoiceId, paidDate)
```

should enforce invoice-state rules rather than allowing a generic PATCH to write arbitrary status values.

---

# 24. Database Decision

## Decision

Use **PostgreSQL as the canonical MVP database**.

Do not use SQLite as a second supported production database in the initial architecture.

## Why

Verilio depends heavily on:

- Relational integrity.
- Transactional invoice operations.
- Reporting/grouping.
- Decimal values.
- Date/time handling.
- Conditional constraints.
- Invoice/time relationship queries.

Supporting PostgreSQL and SQLite simultaneously would introduce avoidable dialect and migration differences.

For local development, run PostgreSQL in Docker or another local Postgres environment.

A future lightweight single-machine distribution may revisit SQLite behind a deliberate portability effort.

---

# 25. ORM Decision

## Decision

Use **Drizzle ORM**.

Reasons:

- Strong TypeScript integration.
- Explicit SQL-oriented schema.
- Good fit for relational queries.
- Less abstraction over important database behavior.
- Migration support.

Complex report queries may use Drizzle's SQL helpers/raw SQL when that is clearer and more efficient than forcing an ORM abstraction.

---

# 26. Core Database Tables

Recommended initial tables:

```text
users
business_profiles

clients
projects
tasks

time_entries

invoices
invoice_items
invoice_item_time_entries
```

Optional infrastructure tables may be added later:

```text
sessions
files
audit_events
```

depending on authentication/deployment choices.

---

# 27. Ownership Model

Even though the MVP UI is single-user, persisted domain records should be scoped to an owner.

Recommended infrastructure model:

```text
User
└── BusinessProfile
    └── domain records scoped by userId
```

A local-only MVP may bootstrap one fixed local user record.

## Why

This avoids designing a database that assumes global singleton rows and later requires a risky ownership migration before hosted use.

This does **not** introduce teams, workspaces, roles, or multi-company UX.

---

# 28. Time Entry Data Model

The UX specification provisionally supports both:

- Start/end entries.
- Duration-only entries.

Therefore the architecture should not force every completed entry to have both timestamps.

Recommended model:

```ts
type TimeEntryMode =
  | "timer"
  | "range"
  | "duration";

type TimeEntry = {
  id: string;
  userId: string;

  clientId: string;
  projectId: string;
  taskId: string | null;

  description: string;

  mode: TimeEntryMode;

  workDate: DateOnly;

  startAt: Instant | null;
  endAt: Instant | null;

  durationSeconds: number;

  billable: boolean;
  hourlyRate: Decimal | null;

  createdAt: Instant;
  updatedAt: Instant;
};
```

## Rules

### Timer mode

```text
startAt required
endAt null while running
endAt required when complete
```

### Range mode

```text
startAt required
endAt required
```

### Duration mode

```text
durationSeconds required
startAt/endAt may be null
```

`workDate` is required for all modes.

---

# 29. Work Date Rule

`workDate` is the date used for:

- Timesheet grouping.
- Report filtering by work day.
- Billing-period inclusion.

For timestamp-based entries, derive `workDate` from the start timestamp in the user's configured timezone.

For duration-only entries, the user supplies `workDate`.

This avoids using UTC calendar boundaries for user-facing day grouping.

---

# 30. Timer Persistence Architecture

The running timer must be represented by persisted server state.

## Start Flow

```text
POST /timer/start
        ↓
server validates hierarchy
        ↓
server verifies no running timer exists
        ↓
server resolves authoritative start time
        ↓
insert running time entry
        ↓
return entry + serverNow
```

## Stop Flow

```text
POST /timer/stop
        ↓
server loads running entry
        ↓
server resolves authoritative end time
        ↓
server calculates duration
        ↓
server resolves rate snapshot if billable
        ↓
update entry in transaction
        ↓
return completed entry
```

The browser never becomes the authoritative duration source for timer-created entries.

---

# 31. Preventing Multiple Running Timers

Protect this rule at more than one layer.

## Application Layer

`TimerService.start()` checks for an active running entry.

## Database Layer

Use a PostgreSQL constraint/index strategy that permits only one running timer per user.

Conceptually:

```text
unique running entry where:
user_id = X
AND mode = timer
AND end_at IS NULL
```

A partial unique index is a suitable PostgreSQL mechanism.

This protects against:

- Double clicks.
- Multiple browser tabs.
- Racing API calls.

---

# 32. Timer Clock Skew

The server should return:

```text
startAt
serverNow
```

The frontend may calculate an approximate server/client offset:

```text
offset = serverNow - clientNowAtResponse
```

The running display can then use server-aligned elapsed time.

Stopping the timer still uses the server's authoritative end timestamp, so display drift cannot corrupt persisted billing duration.

---

# 33. Historical Rate Architecture

Rate resolution is server-side.

Resolution order:

```text
1. Explicit entry rate
2. Project default rate
3. Client default rate
4. Business default rate
```

When a billable entry is finalized, persist the resolved rate on `time_entries.hourly_rate`.

Reports calculate billable value from:

```text
time_entry.duration_seconds
×
time_entry.hourly_rate
```

They must not use the project's current rate.

---

# 34. Editing Historical Rates

The UX requires avoiding silent monetary changes.

For an uninvoiced billable entry:

- Editing client/project does not silently refresh `hourlyRate`.
- The API accepts an explicit rate replacement when the user chooses it.
- If a non-billable entry becomes billable, the server resolves a new rate unless an explicit one is supplied.

For an invoiced entry:

- Ordinary time-entry edit/delete endpoints reject changes that would break invoice traceability.

---

# 35. Money Representation

## Decision

Use decimal-safe arithmetic.

### Database

Use PostgreSQL `numeric`/`decimal` columns.

### TypeScript

Treat numeric DB values as strings at persistence boundaries and convert them into a decimal type for calculations.

Use a decimal arithmetic library in `packages/domain`.

Do not use JavaScript `number` as the authoritative representation of persisted money.

---

# 36. Currency Model

Store ISO currency code with monetary contexts that require it.

Examples:

```text
USD
EUR
PEN
```

Each invoice has exactly one currency.

Clients supply the default invoice currency.

No automatic currency conversion exists in MVP.

---

# 37. Currency Rounding

Different currencies may use different display/accounting minor units.

The domain layer should expose currency metadata and a single rounding function.

Conceptually:

```ts
roundMoney(amount, currency)
```

Rules:

- Keep sufficient precision during intermediate time × rate calculation.
- Round line/invoice monetary amounts through one documented policy.
- Persist calculated invoice values.
- Never let frontend-only rounding define authoritative totals.

The exact decimal scale and rounding mode should be covered by domain tests.

---

# 38. Date and Time Architecture

Use three concepts distinctly:

## Instant

A timestamp representing a moment.

Examples:

- Timer start.
- Timer end.
- Created timestamp.

Transmit as ISO-8601 UTC timestamps.

## Date-only

Calendar date with no timezone.

Examples:

- Invoice issue date.
- Invoice due date.
- Paid date.
- Time-entry `workDate`.

Transmit as:

```text
YYYY-MM-DD
```

Do not deserialize date-only values into JavaScript `Date` objects that can shift calendar day.

## Duration

Store seconds as an integer.

---

# 39. Time Zone

Store an IANA timezone for the user/business profile.

Example:

```text
America/New_York
```

Use it for:

- Deriving `workDate` from timer timestamps.
- Displaying time-entry timestamps.
- Resolving report day boundaries.

Use date-fns plus timezone-aware utilities in the web application and equivalent server-side helpers.

Avoid treating the server machine's timezone as product state.

---

# 40. Reporting Architecture

Reports should be computed by the server/database.

Do not load years of time entries and aggregate everything in the browser.

## Summary endpoint

Returns:

```text
date range
total seconds
billable seconds
non-billable seconds
billable totals grouped by currency
grouped durations
chart-ready daily/project series
```

## Detailed endpoint

Returns paginated/filterable time-entry rows.

Filters:

- Date range.
- Client.
- Project.
- Task.
- Billable status.
- Invoice status.

---

# 41. Multi-Currency Reports

The report service may aggregate durations across all selected entries.

Financial values must group by currency.

Example response:

```json
{
  "billableTotals": [
    { "currency": "USD", "amount": "8240.00" },
    { "currency": "EUR", "amount": "2180.00" }
  ]
}
```

Do not return one fake "total revenue" value when multiple currencies are present.

---

# 42. Report Pagination

Detailed reports and timesheet history should support server-side pagination or cursor-based loading.

MVP implementation may use page/limit semantics if simpler.

The architecture should not assume the entire history fits in one response.

CSV export is generated server-side from the full filtered query rather than only the currently visible page.

---

# 43. Invoice Persistence Model

Recommended invoice fields include:

```text
id
user_id
invoice_number
client_id

status
currency

issue_date
due_date
paid_at

seller_snapshot
client_snapshot

subtotal
tax_amount
discount_amount
total

notes

created_at
updated_at
```

`overdue` is derived, not persisted as a primary stored state.

---

# 44. Invoice Snapshots

Use PostgreSQL JSONB or explicit snapshot columns for immutable presentation data.

Recommended:

```text
seller_snapshot JSONB
client_snapshot JSONB
```

Example seller snapshot:

```json
{
  "businessName": "Andres Consulting",
  "email": "...",
  "address": "...",
  "taxIdentifier": "..."
}
```

Example client snapshot:

```json
{
  "name": "M4Trade",
  "email": "...",
  "address": "..."
}
```

## Why

Changing current profile/client data must not silently rewrite historical invoice presentation.

---

# 45. Invoice Items

Each invoice item persists:

```text
description
quantity
unit_price
amount
sort_order
```

Manual items have no time-entry links.

Imported time items link source time entries through:

```text
invoice_item_time_entries
```

---

# 46. Invoice/Time Traceability

Canonical relationship:

```text
Invoice
  └── InvoiceItem
      └── InvoiceItemTimeEntry
          └── TimeEntry
```

Do not rely on a single `invoiceId` column on `time_entries` as the only relationship.

Invoice state for a time entry can be derived through these links.

For performance, report queries may join/aggregate this relationship efficiently or use a safe derived view.

---

# 47. Draft Reservation Rule

A time entry linked to a non-void invoice is considered reserved/invoiced for import eligibility.

That includes Draft.

The eligible-time query must exclude those entries.

This prevents double billing across:

- Multiple draft invoices.
- Multiple browser tabs.
- Repeated import actions.

---

# 48. Invoice Transactions

High-risk invoice commands must use database transactions.

Examples:

## Save/import time

Transaction should cover:

- Invoice update.
- Invoice item writes.
- Time-entry relationship writes.
- Validation that source time is still eligible.

## Void invoice

Transaction should cover:

- Invoice state transition.
- Relationship behavior needed to release source time.

The API must detect race conditions rather than silently double-assigning time.

---

# 49. Invoice State Machine

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
paid → terminal/read-only
void → terminal/read-only
```

State transitions should occur through command methods/endpoints, not arbitrary client PATCH values.

---

# 50. Overdue Calculation

Display Overdue when:

```text
status = sent
AND dueDate < current business date
AND paidAt IS NULL
```

The API may return:

```text
displayStatus: "overdue"
```

while persisted `status` remains `sent`.

---

# 51. Invoice Numbering

## Provisional Architecture Decision

Assign the invoice number on first successful Draft save.

The numbering operation must be transaction-safe.

Recommended:

- Store the next sequence in business profile/settings or a dedicated sequence source.
- Lock/update transactionally.
- Never reuse numbers from Paid/Sent/Void invoices.
- Preserve number after Void.

If the product decision changes later to assign on Sent, this section must be revised before implementation.

---

# 52. Invoice Calculations

Authoritative invoice calculations run on the server.

The browser may preview calculations using the shared domain package, but server output wins.

Calculation pipeline:

```text
line quantities × unit prices
        ↓
line amounts
        ↓
subtotal
        ↓
discount
        ↓
tax
        ↓
total
```

The exact tax/discount ordering must be explicitly defined before invoice calculation implementation.

The product documents currently leave some tax behavior open.

---

# 53. PDF Architecture

## Decision

Generate PDFs server-side from a saved invoice view model.

Recommended implementation:

```text
packages/invoice-pdf
```

using a server-compatible React PDF renderer.

## Why

- Deterministic output from saved invoice data.
- No browser-only print dependency.
- Easy API download endpoint.
- Works for future email/automation features.
- Keeps the PDF template versioned with the application.

The web invoice preview and PDF renderer should consume the same canonical invoice presentation DTO, even if they use separate rendering technologies.

---

# 54. PDF Flow

```text
GET /api/v1/invoices/:id/pdf
        ↓
authorize invoice
        ↓
load saved invoice + items + snapshots
        ↓
build InvoicePresentationModel
        ↓
render PDF
        ↓
stream application/pdf response
```

Do not recalculate old invoice values from current project/client rates during PDF generation.

---

# 55. File Storage

The MVP may need file storage for:

- Optional business logo.

Create a small storage abstraction rather than coupling domain code to a cloud provider.

Conceptual interface:

```ts
interface FileStorage {
  put(...): Promise<StoredFile>;
  get(...): Promise<...>;
  delete(...): Promise<void>;
}
```

Possible implementations:

- Local filesystem for private/self-hosted development.
- S3-compatible object storage for hosted deployment.

Logo upload is not allowed to block core MVP billing functionality.

---

# 56. Authentication and Deployment Boundary

The product documents leave first deployment/authentication unresolved.

## Architecture Position

The system should be authentication-ready, but the first private local development milestone does not require a full multi-user authentication feature.

### Local/private mode

A fixed local user may be bootstrapped.

### Public deployment

A public Internet deployment must not ship as an unauthenticated private-data application.

Authentication must be introduced before public hosted access.

## Data Model Rule

All root records remain owner-scoped from the beginning.

This minimizes future migration risk.

---

# 57. Authentication Implementation

Authentication provider/library is intentionally **not locked in this document** because the deployment model is still an open product decision.

Requirements for the eventual implementation:

- Secure session management.
- HttpOnly cookies where cookie sessions are used.
- CSRF-safe state-changing requests.
- Server-side authorization on every owner-scoped resource.
- No passwords stored in plaintext.
- Same-origin deployment preferred for web/API when practical.

A dedicated architecture decision should be recorded when hosted authentication is selected.

---

# 58. Security Architecture

## API Validation

Every request is validated server-side.

## Authorization

Never trust client-supplied owner IDs.

The owner/user comes from authenticated server context.

## Invoice URLs

Invoice IDs must not imply public accessibility.

## XSS

Invoice notes and descriptions are plain text in MVP unless rich text is explicitly added later.

Do not render unsanitized HTML from user data.

## Uploads

If logo uploads are implemented:

- Validate MIME/type.
- Limit size.
- Avoid executing uploaded content.
- Generate safe storage names.

## Secrets

Use environment variables/secrets management.

Never commit secrets into the repository.

---

# 59. Error Model

Use a consistent API error envelope.

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

Useful categories:

```text
VALIDATION_ERROR
NOT_FOUND
CONFLICT
FORBIDDEN
TIMER_ALREADY_RUNNING
NO_RUNNING_TIMER
TIME_ENTRY_INVOICED
INVOICE_STATE_INVALID
TIME_ENTRY_ALREADY_INVOICED
INVOICE_CALCULATION_ERROR
```

The frontend maps known codes to user-friendly UX.

---

# 60. HTTP Semantics

Recommended mapping:

```text
400  malformed/invalid request
401  authentication required
403  authenticated but forbidden
404  resource not found
409  domain conflict/race condition
422  semantically invalid business input where useful
500  unexpected server failure
```

Do not return `200 OK` with an error-shaped body for failed commands.

---

# 61. Optimistic UI Policy

Use optimistic UI selectively.

Safe examples:

- Low-risk local presentation state.

Avoid optimistic success for:

- Timer Start.
- Timer Stop.
- Invoice state transitions.
- Invoice import.
- Mark Paid.
- Void.

For these operations, persisted server state should be confirmed before the UI claims success.

This follows the UX requirement that timer and financial state remain unambiguous.

---

# 62. Testing Strategy

Testing should concentrate on business integrity, not only component rendering.

Use four layers:

```text
Unit
Integration
Component
End-to-end
```

---

# 63. Domain Unit Tests

Use Vitest.

High-priority test areas:

- Rate resolution.
- Duration calculation.
- Cross-midnight logic.
- Currency rounding.
- Invoice line calculation.
- Tax/discount calculation.
- Invoice grouping by project/task.
- Invoice state transitions.
- Overdue derivation.
- Multi-currency total grouping.

Consider property-based tests for money and duration invariants if useful.

---

# 64. Database Integration Tests

Run against real PostgreSQL in integration tests.

Recommended tooling:

- Testcontainers or CI Postgres service.

Test:

- One-running-timer constraint.
- Invoice/time reservation race conditions.
- Archive/history joins.
- Report queries.
- Transaction rollback.
- Invoice number uniqueness.
- Deletion protection behavior.

Do not rely only on mocked repositories for these rules.

---

# 65. Frontend Component Tests

Use:

```text
Vitest
React Testing Library
MSW
```

Test user-observable behavior:

- Form validation.
- Client → Project → Task dependency clearing.
- Timer states.
- Invoiced time protection.
- Invoice import selection.
- Multi-currency report display.
- Dialog focus behavior.
- Keyboard navigation for critical components.

Avoid tests that merely snapshot implementation markup.

---

# 66. End-to-End Tests

Use Playwright.

The critical PRD/UX scenario becomes the primary E2E suite:

```text
setup
→ create client
→ create project
→ create task
→ start timer
→ navigate away
→ stop timer
→ add manual time
→ report
→ create invoice
→ import time
→ save draft
→ generate PDF
→ mark sent
→ mark paid
```

Additional E2E cases:

- Timer survives reload.
- Second timer is blocked.
- Draft reserves imported time.
- Void releases imported time.
- Paid invoice is locked.
- Archived project remains in historical entry display.

---

# 67. PDF Tests

Test:

- Required invoice fields appear.
- Monetary totals match persisted values.
- Client/business snapshot data is used.
- Historical PDF output does not change because current client data changed.

Avoid fragile pixel-perfect snapshots as the only validation.

A small set of visual regression fixtures may be added later.

---

# 68. Accessibility Testing

Use multiple layers:

- Semantic component implementation.
- React Testing Library accessibility assertions.
- Automated accessibility checks where practical.
- Playwright keyboard-flow tests.
- Manual keyboard review for primary workflows.

Critical dialogs and selectors need deliberate focus testing.

---

# 69. Logging

Fastify/Pino provides structured server logging.

Include:

- Request ID.
- Route.
- Status.
- Duration.
- Error code.
- User/owner identifier in a privacy-conscious internal form.

Do not log:

- Passwords.
- Session tokens.
- Full invoice/client private data unnecessarily.

---

# 70. Observability

MVP minimum:

- Structured logs.
- Request IDs.
- Clear startup/configuration failures.
- Health endpoint.

Possible later additions:

- Error tracking service.
- Metrics.
- OpenTelemetry.
- Performance tracing.

Do not block MVP on a large observability platform.

---

# 71. Health Endpoints

Recommended:

```text
GET /health/live
GET /health/ready
```

Readiness may verify database connectivity.

These support containers and future hosted deployment.

---

# 72. Local Development

Recommended local stack:

```text
Node.js
pnpm
PostgreSQL
Docker / Docker Compose
```

Possible commands:

```text
pnpm dev
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm db:migrate
pnpm db:studio
```

Exact scripts belong in repository setup.

---

# 73. Environment Configuration

Separate browser-safe and server-only configuration.

Examples:

```text
API_PORT
DATABASE_URL
APP_ORIGIN
STORAGE_PATH
SESSION_SECRET   # once auth exists
```

Do not expose database credentials or private secrets through Vite environment variables.

Validate server environment variables at startup.

---

# 74. Deployment Shape

Recommended initial deployable shape:

```text
Web static assets
     +
Fastify API
     +
PostgreSQL
```

The API may serve the built SPA in a simple single-container deployment, or web/API may be separate services.

Prefer same-origin routing where practical:

```text
https://verilio.example/
https://verilio.example/api/v1/...
```

This simplifies:

- Cookies/auth later.
- CORS.
- Deployment configuration.

---

# 75. Self-Hosted Compatibility

Avoid mandatory dependencies on:

- Proprietary databases.
- Proprietary queues.
- Proprietary auth providers.
- Proprietary object storage.

Provider adapters may be added later.

A normal PostgreSQL database should remain sufficient for core product data.

---

# 76. Background Jobs

No background queue is required for core MVP workflows.

PDF generation can initially occur on request.

Future features may justify jobs:

- Automatic invoice emailing.
- Payment reminders.
- Recurring invoices.
- Scheduled exports.

Do not introduce Redis/queue infrastructure before there is a product requirement.

---

# 77. Real-Time Infrastructure

No WebSocket/SSE infrastructure is required for the single-user MVP.

Timer accuracy comes from timestamps, not a real-time socket.

TanStack Query invalidation/refetch is sufficient for ordinary navigation.

If future multi-device synchronization requires live updates, evaluate SSE/WebSockets then.

---

# 78. Caching

Do not introduce an external cache in MVP.

Use:

- PostgreSQL indexes.
- Efficient report queries.
- TanStack Query browser cache.

Redis is not justified for the initial product.

---

# 79. Database Indexing Strategy

Initial indexes should support:

```text
clients(user_id, active)
projects(user_id, client_id, active)
tasks(project_id, active)

time_entries(user_id, work_date)
time_entries(client_id, work_date)
time_entries(project_id, work_date)
time_entries(task_id, work_date)

invoices(user_id, status)
invoices(client_id, issue_date)

invoice_item_time_entries(time_entry_id)
```

Add indexes based on actual query plans rather than speculative indexing everywhere.

The one-running-timer rule also requires its dedicated constraint/index.

---

# 80. Data Migration Strategy

Use checked-in Drizzle migrations.

Rules:

- Every schema change receives a migration.
- Do not modify already-applied production migration history.
- Prefer additive migrations.
- Financial-history migrations require explicit review.
- Backups should precede destructive production migrations.

---

# 81. Data Export and Backup

MVP report CSV is a product feature.

Full backup/export is not yet defined as a product requirement, but self-hosted operation benefits from database-level backup instructions.

Hosted deployment should eventually define:

- Automated PostgreSQL backups.
- Restore procedure.
- File-storage backup where logos/assets exist.

---

# 82. Feature Folder Strategy

Recommended frontend organization:

```text
apps/web/src/
├── app/
│   ├── router/
│   ├── providers/
│   ├── layout/
│   └── styles/
│
├── features/
│   ├── timer/
│   ├── timesheet/
│   ├── clients/
│   ├── projects/
│   ├── reports/
│   ├── invoices/
│   └── settings/
│
└── shared/
    ├── api/
    ├── hooks/
    └── utils/
```

A feature may contain:

```text
components/
hooks/
queries/
forms/
routes/
```

Avoid a single global `components/` directory that mixes application-domain components with design-system primitives.

---

# 83. Import Boundaries

Recommended dependency direction:

```text
apps/web features
      ↓
packages/ui
packages/contracts
packages/domain (safe shared helpers)

apps/api
      ↓
packages/contracts
packages/domain
packages/db
packages/invoice-pdf

packages/ui
      ✕ must not import application feature code

packages/domain
      ✕ must not depend on React
      ✕ should avoid database/framework dependencies

packages/contracts
      ✕ must not depend on apps
```

Enforce boundaries through lint rules or package exports where useful.

---

# 84. TypeScript Policy

Use strict TypeScript.

Recommended:

```text
strict: true
noUncheckedIndexedAccess: true
```

Avoid `any` in domain/business code.

Use branded/refined schemas where that materially improves safety for:

- Currency codes.
- Date-only strings.
- Decimal strings.
- IDs.

Do not create excessive type ceremony for ordinary UI-only values.

---

# 85. API Type Policy

The API contract is defined by Zod schemas.

Generate/infer TypeScript types from schemas rather than duplicating interfaces.

Example:

```ts
export const ClientDtoSchema = z.object({
  ...
});

export type ClientDto = z.infer<typeof ClientDtoSchema>;
```

Database models remain separate from public DTOs.

---

# 86. IDs

Use opaque IDs.

UUIDs are appropriate.

Do not expose database sequential IDs if that creates future public-enumeration assumptions.

Invoice numbers remain human-readable business identifiers distinct from internal invoice IDs.

---

# 87. Deletion Policy in Architecture

Clients/projects/tasks:

```text
archive
```

Time entries:

```text
hard delete only when not invoice-protected
```

Invoices:

```text
do not hard-delete after first saved draft in MVP
use Void
```

This supports auditability and invoice numbering integrity.

---

# 88. Concurrency Policy

Single-user UX does not eliminate concurrency.

The application must tolerate:

- Multiple browser tabs.
- Rapid double clicks.
- Retries.
- Future multiple devices.

Protect critical invariants in the database/transaction layer:

- One running timer.
- Time entry reserved by at most one non-void invoice context.
- Unique invoice number.
- Valid invoice state transitions.

Frontend disabling is useful UX but not sufficient protection.

---

# 89. Idempotency

For commands vulnerable to retry duplication, consider idempotency keys.

Highest-value candidates:

- Timer Start.
- Invoice creation.
- Invoice state-transition commands.

This can be introduced where actual retry behavior demonstrates need.

Database uniqueness/transactions remain the first protection.

---

# 90. Performance Budgets

The product documents do not define numeric performance SLAs.

Initial engineering targets:

- Avoid loading complete time history on initial page load.
- Paginate large detailed reports.
- Lazy-load route chunks where useful.
- Keep the application shell and Timer fast.
- Server report queries should aggregate in SQL.
- Avoid rerendering the entire app every second for the timer.

Only the visible running duration component needs a local ticking update.

---

# 91. Timer Rendering Performance

The one-second display tick should be local to the running-timer component.

Do not:

- dispatch a global store action every second.
- refetch the server every second.
- persist a new duration every second.

Persist:

```text
startAt
endAt
durationSeconds when complete
```

Render elapsed display from timestamps.

---

# 92. Invoice Editor State

The invoice editor is the largest form in the MVP.

Use React Hook Form for editable invoice fields.

Imported-time selection is server-backed domain state and should be handled deliberately.

Recommended approach:

1. Query eligible time.
2. User selects entries locally.
3. User submits import command.
4. Server validates eligibility again.
5. Server creates/rebuilds invoice items and relationships transactionally.
6. Frontend refreshes invoice query.

Do not trust a stale browser selection to bypass current invoice eligibility.

---

# 93. Autosave Decision

Do not implement aggressive autosave for invoice editing in first MVP unless UX testing establishes a need.

Prefer explicit **Save Draft** with unsaved-changes protection.

Reason:

- Financial changes are high consequence.
- Explicit persistence boundaries simplify traceability.
- The UX specification already supports Save Draft.

Low-risk settings/forms can also use explicit save initially for consistency.

---

# 94. CSV Export Architecture

Generate detailed CSV from the server using the current report filters.

Benefits:

- Full filtered dataset, not current page only.
- One source of calculation/filter truth.
- Avoid browser memory issues.
- Consistent archived/historical relation handling.

Return:

```text
text/csv
```

with a meaningful filename.

---

# 95. Accessibility Architecture

Accessibility is enforced through the component layer.

`@verilio/ui` should centralize:

- Focus-ring styles.
- Dialog focus behavior.
- Accessible labels.
- Error associations.
- Tooltip behavior.
- Keyboard-capable menus/selects.
- Checkbox/switch semantics.

Feature teams should not reimplement those primitives independently.

Automated checks supplement, not replace, manual keyboard testing.

---

# 96. Dependency Policy

Before adding a dependency, ask:

1. Does it solve a problem already handled by the platform/current stack?
2. Does it impose a visual system Verilio would need to fight?
3. Is it maintained and reasonably scoped?
4. Can it be isolated behind a Verilio abstraction?
5. Does it create a commercial licensing dependency for a core feature?

Prefer smaller focused dependencies over overlapping frameworks.

---

# 97. Architecture Decision Records

The following decisions are considered accepted for the MVP architecture unless explicitly revised.

## ADR-001 — React SPA with Vite

**Decision:** React + TypeScript + Vite.

**Rejected:** Next.js as the core MVP app.

**Reason:** Verilio is primarily an interactive application; SSR/SEO is not a core requirement.

---

## ADR-002 — Tailwind + Headless Primitives

**Decision:** Tailwind CSS + semantic CSS variables + Radix UI underneath Verilio-owned components.

**Rejected:** MUI as the primary design system.

**Reason:** Verilio requires its own visual language, compact data density, and custom financial/timer components.

---

## ADR-003 — No Redux for MVP

**Decision:** TanStack Query + React Hook Form + URL/local state.

**Rejected:** Redux as default global state.

**Reason:** The product does not currently have enough true global client-only state to justify it.

---

## ADR-004 — TanStack Query for Server State

**Decision:** TanStack Query.

**Reason:** Server data dominates Verilio state and needs caching/invalidation/mutation lifecycle.

---

## ADR-005 — React Hook Form + Zod

**Decision:** React Hook Form for form state and Zod for contracts/validation.

**Reason:** Verilio has many validation-heavy forms and benefits from shared runtime schemas.

---

## ADR-006 — TanStack Table

**Decision:** Headless table behavior via TanStack Table.

**Rejected:** A large styled enterprise grid as the initial table foundation.

**Reason:** Custom density/styling and avoiding unnecessary licensing/visual coupling.

---

## ADR-007 — Fastify REST API

**Decision:** Fastify + versioned REST/JSON.

**Rejected:** GraphQL and a heavier backend framework for MVP.

**Reason:** Domain/API requirements are straightforward resource/command interactions.

---

## ADR-008 — PostgreSQL Canonical Database

**Decision:** PostgreSQL for local development and production.

**Rejected:** Supporting SQLite and PostgreSQL simultaneously in MVP.

**Reason:** Reduce dialect divergence around transactions, reporting, decimal values, and constraints.

---

## ADR-009 — Drizzle ORM

**Decision:** Drizzle ORM with SQL escape hatches.

**Reason:** Strong relational/TypeScript fit without hiding SQL behavior important to reports and billing.

---

## ADR-010 — Server-Authoritative Timer

**Decision:** Running timer persisted as a time entry with authoritative server timestamps.

**Rejected:** Browser-only timer state or Redux-persisted timer state.

**Reason:** Refresh/navigation/multi-tab reliability.

---

## ADR-011 — Decimal-Safe Money

**Decision:** PostgreSQL numeric + decimal arithmetic in TypeScript.

**Rejected:** JavaScript floating-point numbers as authoritative stored money.

**Reason:** Billing correctness.

---

## ADR-012 — Invoice ↔ Time Join Table

**Decision:** Explicit invoice-item/time-entry relationship.

**Rejected:** Only a single invoice ID on time entries.

**Reason:** Grouped invoice items and bidirectional traceability.

---

## ADR-013 — Server-Side PDF

**Decision:** Generate invoice PDF on the server from saved invoice presentation data.

**Rejected:** Browser print as the authoritative PDF workflow.

**Reason:** Determinism and future reuse for automated delivery.

---

## ADR-014 — No Queue/Redis/WebSockets Initially

**Decision:** Keep initial infrastructure to web + API + PostgreSQL.

**Reason:** No current core requirement justifies additional distributed infrastructure.

---

# 98. Open Architecture Decisions

The following remain dependent on unresolved product/deployment choices.

## OAD-001 — Hosted Authentication Provider

Not selected until public-hosted deployment is confirmed.

## OAD-002 — Local vs Hosted First Release

Architecture supports both directions, but operational packaging differs.

## OAD-003 — Tax Calculation Order

Need explicit product rule before invoice math is finalized.

## OAD-004 — Discount/Tax Interaction

Need explicit ordering/rounding rules.

## OAD-005 — Invoice Number Assignment

This document provisionally selects first Draft save; product approval should confirm it.

## OAD-006 — File Storage Provider

Local filesystem vs S3-compatible storage depends on deployment.

## OAD-007 — Duration-Only Manual Entry

Architecture supports it because the UX document provisionally selects it. If product scope changes, `TimeEntry.mode` can still remain useful.

---

# 99. Architecture Risks

## 99.1 Financial Logic Duplicated Between Client and Server

**Risk:** Preview and persisted totals diverge.

**Mitigation:** Shared domain functions where possible; server remains authoritative; contract tests.

---

## 99.2 Timezone Bugs

**Risk:** Work appears under the wrong day or invoice dates shift.

**Mitigation:** Distinguish Instant, DateOnly, Duration; persist IANA timezone; test DST boundaries.

---

## 99.3 Invoice Race Conditions

**Risk:** Same time gets imported into multiple invoices.

**Mitigation:** Transactional server validation and relational constraints/locking.

---

## 99.4 UI Library Leakage

**Risk:** Feature code couples directly to Radix/shadcn implementation.

**Mitigation:** `@verilio/ui` public component boundary.

---

## 99.5 Over-Engineering Single-User MVP

**Risk:** Auth, queues, event buses, Redis, WebSockets, and microservices delay the core product.

**Mitigation:** Modular monolith with explicit package boundaries.

---

# 100. Modular Monolith Decision

Verilio should begin as a **modular monolith**.

That means:

```text
one web app
one API app
one relational database
clear internal modules/packages
```

Do not split Timer, Reports, and Invoices into independent services.

The business domains are tightly related and transactional consistency is valuable.

A modular monolith provides:

- Simpler local development.
- Simpler deployment.
- Easy transactions.
- Shared TypeScript tooling.
- Lower operational burden.

---

# 101. Initial Engineering Sequence

Architecture supports this build order:

```text
1. Monorepo + tooling
2. PostgreSQL + Drizzle
3. Contracts + domain foundations
4. @verilio/ui foundations
5. Application shell
6. Business settings
7. Clients
8. Projects
9. Tasks
10. Timer
11. Manual time
12. Timesheet
13. Reports
14. Invoice domain
15. Invoice editor/import
16. PDF
17. Lifecycle transitions
18. Hardening/testing
```

The detailed work breakdown belongs in:

```text
docs/06-verilio_mvp_implementation_plan.md
```

---

# 102. Definition of Architecture Ready

The architecture is ready for MVP implementation when the repository can support:

- React/Vite web app.
- Fastify API.
- PostgreSQL/Drizzle migrations.
- Shared Zod contracts.
- Verilio UI token/component package.
- TanStack Query.
- React Hook Form.
- Server-authoritative running timer.
- Decimal-safe rate/invoice calculations.
- Date-only + timestamp separation.
- Invoice snapshots.
- Invoice-item/time-entry traceability.
- Server-side reports.
- Server-side invoice PDF.
- Unit/integration/component/E2E testing.

---

# 103. Final Architecture Summary

The Verilio MVP will use:

```text
MONOREPO
pnpm + TypeScript

FRONTEND
React
Vite
React Router
TanStack Query
React Hook Form
Zod
Tailwind CSS
CSS custom properties
Radix UI
TanStack Table
Recharts
Lucide React

BACKEND
Node.js
Fastify
Zod
REST/JSON

DATA
PostgreSQL
Drizzle ORM

DOMAIN
Server-authoritative timer
Historical rate snapshots
Decimal-safe money
Invoice snapshots
Invoice/time join table
Transaction-protected billing rules

PDF
Server-side invoice PDF renderer

TESTING
Vitest
React Testing Library
MSW
PostgreSQL integration tests
Playwright

ARCHITECTURE STYLE
Modular monolith
```

The central technical principle is:

> **Verilio should keep business truth on the server, keep financial history immutable where required, and keep the frontend focused on fast, accessible workflows rather than duplicating backend state machinery.**

This architecture directly supports the product promise:

> **Track your work. Bill with confidence.**
