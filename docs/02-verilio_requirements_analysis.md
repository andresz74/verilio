# Verilio Requirements Analysis

## Document Control

**Product:** Verilio  
**Document:** Requirements Analysis  
**File:** `docs/02-verilio_requirements_analysis.md`  
**Status:** Draft v0.1  
**Source of truth:** `docs/01-verilio_product_requirements_document.md`  
**Primary platform:** Web application  
**Primary user:** Independent freelancer / solo consultant  
**Product category:** Freelancer time tracking, reporting, and invoicing  
**Primary description:** Time tracking, reports, and invoicing for freelancers.  
**Working tagline:** **Track your work. Bill with confidence.**

---

# 1. Purpose

This document translates the Verilio Product Requirements Document into implementation-ready requirements.

The PRD defines the product vision and scope. This document breaks that scope into:

- Requirement priorities.
- Functional requirements.
- Business rules.
- Data requirements.
- Validation rules.
- State transitions.
- Edge cases.
- Error states.
- Non-functional requirements.
- Acceptance criteria.
- MVP boundaries.
- Open decisions that must be resolved before or during implementation.

This document does **not** introduce a materially broader product scope than the PRD.

Where the PRD leaves a decision open, this document labels any proposed implementation choice as a **recommendation**, not as an approved requirement.

---

# 2. Product Scope Summary

Verilio is centered on the freelancer billing loop:

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

The MVP must allow one freelancer to:

1. Configure business and billing defaults.
2. Create and maintain clients.
3. Create and maintain projects and project-specific tasks.
4. Track time with a live timer.
5. Add and edit time manually.
6. Preserve historical hourly rates.
7. Review time in a timesheet.
8. Generate summary and detailed reports.
9. Identify billable, uninvoiced time.
10. Create invoices from tracked time.
11. Add manual invoice line items.
12. Export invoice PDFs.
13. Mark invoices sent, paid, or void.
14. Preserve traceability between time entries and invoice items.

---

# 3. Requirement Priority Model

## P0 — MVP Critical

A P0 requirement is required to complete the core Verilio workflow.

If a P0 requirement is missing, the product cannot reliably complete:

```text
Track → Review → Report → Invoice → Get Paid
```

## P1 — MVP Important

A P1 requirement meaningfully improves the MVP experience but does not block the primary billing workflow.

P1 features should be implemented if they do not delay P0 completion.

## P2 — Post-MVP / Deferred

A P2 requirement is useful but explicitly deferrable until after the MVP is stable.

---

# 4. Requirement Identifier Convention

| Prefix | Area |
|---|---|
| `FR-SET` | Business profile and settings |
| `FR-CLI` | Clients |
| `FR-PRJ` | Projects |
| `FR-TSK` | Tasks |
| `FR-TMR` | Live timer |
| `FR-TME` | Time entries |
| `FR-TMS` | Timesheet |
| `FR-RPT` | Reports |
| `FR-INV` | Invoices |
| `FR-PDF` | Invoice PDF |
| `BR-*` | Business rules |
| `DR-*` | Data requirements |
| `NFR-*` | Non-functional requirements |

---

# 5. Core Domain Relationships

The MVP domain model is:

```text
Freelancer Profile

Client
└── Project
    └── Task

Time Entry
├── Client
├── Project
├── Optional Task
├── Historical Hourly Rate
└── Optional Invoice Relationship

Invoice
└── Invoice Item
    └── Optional Time Entry Relationships
```

Required cardinality:

```text
Client     1 ───── * Project
Project    1 ───── * Task
Client     1 ───── * TimeEntry
Project    1 ───── * TimeEntry
Task       0..1 ── * TimeEntry

Client     1 ───── * Invoice
Invoice    1 ───── * InvoiceItem

InvoiceItem * ───── * TimeEntry
```

The many-to-many relationship between `InvoiceItem` and `TimeEntry` supports grouping several time entries into a single invoice line.

---

# 6. Business Profile and Settings Requirements

## FR-SET-001 — Create and Maintain Business Profile

**Priority:** P0

The user must be able to configure:

- Display name or business name.
- Email.
- Address.
- Default currency.
- Default payment terms.
- Invoice number prefix.
- Default hourly rate.

Optional fields:

- Phone.
- Logo.
- Tax identifier.
- Invoice footer.
- Default invoice notes.

### Acceptance Criteria

- Business profile values can be created and edited.
- Saved values persist across sessions.
- Required fields cannot be saved in an invalid state.
- Values used on future invoices come from the saved profile unless overridden.

## FR-SET-002 — Default Billing Values

**Priority:** P0

The application must support default values for:

- Currency.
- Hourly rate.
- Payment terms.
- Invoice prefix.
- Default tax.
- Default invoice notes.
- Default invoice footer.

### Acceptance Criteria

- New clients/projects/invoices may inherit relevant defaults.
- Editing a default does not retroactively modify historical invoices.
- Editing the default hourly rate does not retroactively modify historical time-entry rate snapshots.

## FR-SET-003 — Appearance Preferences

**Priority:** P2

Potential settings:

- Theme.
- Date format.
- Time format.
- Week start day.

These are explicitly deferrable.

---

# 7. Client Requirements

## FR-CLI-001 — Create Client

**Priority:** P0

The user must be able to create a client with:

- Name.
- Email.
- CC recipients.
- Address.
- Note.
- Currency.
- Default hourly rate.
- Active state.

### Acceptance Criteria

- Name is required.
- Currency is required.
- Client is active by default.
- Saved client appears in the client list.
- Client can be selected when creating a project.
- Client can be selected when tracking time.
- Client can be selected when creating an invoice.

## FR-CLI-002 — Edit Client

**Priority:** P0

The user must be able to edit client information.

### Acceptance Criteria

- Changes apply to future workflows.
- Historical time entries remain linked to the client.
- Existing invoices preserve previously saved invoice data where snapshots are used.
- Changing client currency does not silently change currency on existing invoices.

## FR-CLI-003 — Archive and Reactivate Client

**Priority:** P0

### Acceptance Criteria

- Archived clients are hidden from normal selection lists by default.
- Archived clients remain visible in historical time entries, reports, and invoices.
- Existing projects and invoices remain intact.
- Reactivating a client restores it to normal selection lists.

## FR-CLI-004 — Search and Filter Clients

**Priority:** P1

The client list should support:

- Search by name.
- Filter active.
- Filter archived.
- Show all.

## FR-CLI-005 — CC Recipients

**Priority:** P1

The client may store multiple CC recipients.

### Source Constraint

The PRD states that the initial UI **may** support up to three CC recipients. This is not a strict product rule.

### Recommendation

For MVP UI simplicity, support up to three visible CC fields while storing recipients as a list.

---

# 8. Project Requirements

## FR-PRJ-001 — Create Project

**Priority:** P0

The user must be able to create a project with:

- Client.
- Name.
- Optional color.
- Default hourly rate.
- Billable-by-default setting.
- Note.
- Active state.

### Acceptance Criteria

- Client is required.
- Name is required.
- Project belongs to exactly one client.
- Project is active by default.
- Project becomes available in the timer and manual-entry forms.

## FR-PRJ-002 — Edit Project

**Priority:** P0

The user must be able to edit project information.

### Acceptance Criteria

- Updating the project rate affects future rate resolution only.
- Historical time-entry rate snapshots remain unchanged.
- Historical time entries remain linked to the project.

## FR-PRJ-003 — Archive and Reactivate Project

**Priority:** P0

### Acceptance Criteria

- Archived projects disappear from normal new-entry selection lists by default.
- Historical time entries remain visible.
- Historical reports remain valid.
- Existing invoices remain valid.
- Project tasks are preserved.

## FR-PRJ-004 — Search and Filter Projects

**Priority:** P1

The project list should support:

- Search by project name.
- Filter by client.
- Filter active / archived / all.

## FR-PRJ-005 — Project Tracked-Time Summary

**Priority:** P2

Showing total tracked time in the project list is useful but not essential to the core billing flow.

---

# 9. Task Requirements

## FR-TSK-001 — Create Project Task

**Priority:** P0

A task belongs to exactly one project.

Required field:

- Name.

### Acceptance Criteria

- Task appears in the selected project's task list.
- Task becomes selectable when tracking time for that project.

## FR-TSK-002 — Edit Task

**Priority:** P0

The user must be able to rename a task.

Historical time entries continue to reference the same task record.

## FR-TSK-003 — Archive and Reactivate Task

**Priority:** P0

### Acceptance Criteria

- Archived tasks are hidden from normal new-entry selection.
- Historical entries using the task remain valid.
- Task can be reactivated.

## FR-TSK-004 — Task Search and Filter

**Priority:** P1

Support:

- Search by task name.
- Active / archived filtering.

## BR-TSK-001 — Tasks Are Project-Specific

Tasks are not global categories in the MVP.

A task must belong to one project.

## BR-TSK-002 — Task Is Optional on Time Entry

A time entry may exist without a task.

This rule is explicitly supported by the PRD.

---

# 10. Live Timer Requirements

## FR-TMR-001 — Start Timer

**Priority:** P0

The timer form must support:

- Description.
- Client.
- Project.
- Optional task.
- Billable toggle.
- Start action.

### Acceptance Criteria

- A valid client and project are selected before start.
- Project selection is constrained to the selected client.
- Task selection is constrained to the selected project.
- Start timestamp is persisted.
- Running timer state is visible immediately.

## FR-TMR-002 — Display Running Timer

**Priority:** P0

While running, display:

- Description.
- Client.
- Project.
- Task, if present.
- Elapsed duration.
- Billable state.
- Stop action.

### Acceptance Criteria

- Elapsed time is calculated from the persisted start timestamp.
- Refreshing the page does not reset elapsed time.
- Navigating to another Verilio screen does not stop the timer.

## FR-TMR-003 — Stop Timer

**Priority:** P0

Stopping a timer must:

1. Persist end timestamp.
2. Calculate duration.
3. Resolve and snapshot the billable hourly rate if applicable.
4. Save the entry.
5. Clear running state.

## BR-TMR-001 — Only One Running Timer

Only one timer may run at a time for the user.

## FR-TMR-004 — Starting While a Timer Is Running

**Priority:** P0

The application must prevent two simultaneous running timers.

The PRD says a second start must require stopping or switching the current timer.

### Recommendation

For MVP, support only:

```text
Stop current timer → start new timer
```

A dedicated "switch timer" workflow can be added later.

## FR-TMR-005 — Timer Recovery After Refresh

**Priority:** P0

The timer must recover after page refresh.

### Acceptance Criteria

- The application finds the current running time entry.
- Elapsed duration resumes from authoritative timestamps.
- Browser refresh does not create duplicate entries.

---

# 11. Manual Time Entry Requirements

## FR-TME-001 — Create Manual Entry

**Priority:** P0

The user must be able to create an entry using:

- Date.
- Start time and end time.

The approved MVP also supports:

- Direct duration input.

Both range and duration-only entry modes are required in MVP because freelancers frequently
know duration without precise start/end timestamps.

## FR-TME-002 — Required Manual Entry Fields

**Priority:** P0

Required:

- Date.
- Description.
- Client.
- Project.
- Billable state.
- Valid duration.

Optional:

- Task.

## FR-TME-003 — Edit Time Entry

**Priority:** P0

The user must be able to edit:

- Description.
- Client.
- Project.
- Task.
- Start.
- End.
- Duration.
- Billable state.

### Acceptance Criteria

- Duration recalculates after timestamp changes.
- Changing project/task must preserve valid hierarchy.
- Editing hierarchy on an already-billable completed entry preserves its historical rate and
  currency unless the user explicitly refreshes them.
- Changing a non-billable entry to billable resolves and snapshots the current rate and Client
  currency; changing it back clears both snapshots.

## FR-TME-004 — Delete Time Entry

**Priority:** P0

The user must be able to delete a time entry with confirmation.

### Acceptance Criteria

- Uninvoiced entries can be deleted.
- Invoiced entries cannot be deleted through the ordinary delete flow.
- The UI explains why an invoiced entry is protected.

## FR-TME-005 — Duplicate Time Entry

**Priority:** P1

The user should be able to duplicate an entry.

The duplicated entry must receive a new ID and must not inherit an invoice relationship.

## FR-TME-006 — Start New Timer From Existing Entry

**Priority:** P1

The user should be able to start a new timer using metadata from a prior entry.

The new timer must not reuse old timestamps, duration, or invoice state.

---

# 12. Time and Duration Business Rules

## BR-TME-001 — Timestamp Storage

Persist timestamps rather than formatted display strings.

## BR-TME-002 — Duration Storage

Persist duration in seconds.

## BR-TME-003 — Non-Negative Duration

Duration must be greater than or equal to zero.

A completed time entry with zero duration should be rejected unless explicitly supported later.

## BR-TME-004 — Duration Recalculation

If start or end changes, duration must be recalculated.

## BR-TME-005 — Running Entry

A running entry may have:

```text
startAt = timestamp
endAt   = null
```

Its current display duration is derived.

## BR-TME-006 — Invalid Ranges

The application must reject:

- End before start.
- Missing start for timestamp-based entries.
- Missing end for completed timestamp-based entries.
- Negative direct durations.

## BR-TME-007 — Cross-Midnight Work

A time entry may cross midnight.

Example:

```text
Start: 11:30 PM
End:    1:00 AM next day
Duration: 1h 30m
```

### Source Status

The PRD does not explicitly discuss cross-midnight work.

### Recommendation

Allow it because timestamp storage naturally supports it and rejecting it would be unnecessarily restrictive.

---

# 13. Historical Hourly Rate Requirements

## FR-TME-007 — Snapshot Hourly Rate

**Priority:** P0

When a billable time entry is finalized, the resolved hourly rate must be copied onto the time entry.

## BR-RATE-001 — Rate Resolution Order

The PRD defines the suggested order:

```text
1. Explicit time-entry rate
2. Project default rate
3. Client default rate
4. Freelancer default rate
```

## BR-RATE-002 — Historical Rate Stability

Changing:

- Freelancer rate.
- Client rate.
- Project rate.

must not silently change historical time-entry rates.

## BR-RATE-003 — Non-Billable Entry

A non-billable time entry has no billable amount.

The stored hourly-rate behavior for non-billable entries is not explicitly fixed by the PRD.

### Recommendation

Store `hourlyRate = null` for non-billable entries unless the user later converts the entry to billable.

## BR-RATE-004 — Billable Amount

For each billable time entry:

```text
billableAmount = durationHours × historicalHourlyRate
```

Example:

```text
Duration: 2h 30m
Rate: $85/hour
Amount: $212.50
```

---

# 14. Timesheet Requirements

## FR-TMS-001 — Group Entries by Date

**Priority:** P0

Display historical entries grouped by date.

## FR-TMS-002 — Daily Totals

**Priority:** P0

Each date group must show total duration.

## FR-TMS-003 — Weekly Totals

**Priority:** P1

The timesheet should show weekly totals where applicable.

## FR-TMS-004 — Entry Metadata

**Priority:** P0

Each entry should display at least:

- Description.
- Client.
- Project.
- Task.
- Start/end.
- Date.
- Duration.
- Billable state.
- Invoice state.

## FR-TMS-005 — Date Navigation

**Priority:** P1

Support:

- Today.
- Yesterday.
- This week.
- Last week.
- Past two weeks.
- This month.
- Last month.
- Custom range.

## FR-TMS-006 — Search Description

**Priority:** P1

The user should be able to search time entries by description text.

---

# 15. Report Requirements

## FR-RPT-001 — Summary Report

**Priority:** P0

The summary report must display:

- Total tracked duration.
- Billable duration.
- Non-billable duration.
- Billable value.

Optional:

- Average hourly rate.

## FR-RPT-002 — Detailed Report

**Priority:** P0

The detailed report must show individual time entries.

Suggested columns:

- Date.
- Description.
- Client.
- Project.
- Task.
- Start.
- End.
- Duration.
- Billable.
- Rate.
- Amount.
- Invoice status.

## FR-RPT-003 — Date Range Filter

**Priority:** P0

Reports must support date-range filtering.

## FR-RPT-004 — Client Filter

**Priority:** P0

Reports must support filtering by client.

## FR-RPT-005 — Project Filter

**Priority:** P0

Reports must support filtering by project.

## FR-RPT-006 — Task Filter

**Priority:** P1

Reports should support filtering by task.

## FR-RPT-007 — Billable Filter

**Priority:** P0

Support:

```text
All
Billable
Non-billable
```

## FR-RPT-008 — Invoice Status Filter

**Priority:** P0

Support:

```text
All
Not invoiced
Invoiced
```

This is critical to the billing workflow.

## FR-RPT-009 — Summary Grouping

**Priority:** P0

Support grouping by:

- Client.
- Project.
- Task.

The PRD also lists grouping by description.

### Recommendation

Treat description grouping as P1 because grouping arbitrary free text is less critical than client/project/task grouping.

## FR-RPT-010 — Hours by Day Chart

**Priority:** P1

The summary report should include hours by day.

## FR-RPT-011 — Hours by Project Chart

**Priority:** P1

The summary report should include hours by project.

## FR-RPT-012 — CSV Export

**Priority:** P1

The PRD specifies CSV export for the MVP report system.

Exported data should reflect active filters.

## FR-RPT-013 — Multi-Currency Reporting

**Priority:** P0 rule / P2 advanced feature

The PRD states that each client may use a different currency.

### Requirement

Verilio must not present a misleading aggregate money total that sums incompatible currencies.

### Recommendation

For MVP:

- Time totals may aggregate across currencies.
- Monetary totals should either be grouped by currency, or require a single-currency filter context.
- Automatic currency conversion is out of scope.

---

# 16. Invoice Requirements

## FR-INV-001 — Invoice List

**Priority:** P0

Display:

- Invoice number.
- Client.
- Issue date.
- Due date.
- Total.
- Currency.
- Status.

## FR-INV-002 — Create Invoice

**Priority:** P0

The user must be able to:

1. Select a client.
2. Choose a billing date range.
3. Find billable, uninvoiced entries.
4. Select entries.
5. Choose grouping.
6. Review line items.
7. Add manual line items.
8. Set issue date.
9. Set due date.
10. Add notes.
11. Save draft.

## FR-INV-003 — Import Billable Uninvoiced Time

**Priority:** P0

Default eligible time must satisfy:

```text
client matches invoice client
AND billable = true
AND not already linked to an active invoice
AND falls within selected date range
```

## FR-INV-004 — Select Time Entries

**Priority:** P0

The user must be able to choose which eligible time entries are included.

## FR-INV-005 — Group Imported Time

**Priority:** P0

Supported grouping options from the PRD:

- One line per time entry.
- Group by project.
- Group by task.

Recommended default:

```text
Group by project
```

## FR-INV-006 — Manual Invoice Items

**Priority:** P0

The user must be able to add manual invoice items that are not linked to time entries.

## FR-INV-007 — Invoice Totals

**Priority:** P0

Support:

- Subtotal.
- Tax.
- Discount.
- Total.

## FR-INV-008 — Tax

**Priority:** P0

The approved MVP includes one percentage tax field. Tax applies after discount and is rounded
to Invoice-currency minor units using Decimal `ROUND_HALF_UP`.

## FR-INV-009 — Discount

**Priority:** P0

The PRD allows:

- Percentage discount.
- Fixed discount.

The approved MVP implements one discount type selector with:

```text
Percentage
Fixed amount
```

Discount applies to subtotal before tax and cannot exceed subtotal.

## FR-INV-010 — Save Draft

**Priority:** P0

New invoices can be saved as Draft.

## FR-INV-011 — Edit Draft

**Priority:** P0

Draft invoices can be edited.

## FR-INV-012 — Mark Sent

**Priority:** P0

The user can manually mark an invoice Sent.

## FR-INV-013 — Mark Paid

**Priority:** P0

The user can manually mark an invoice Paid.

The PRD usage flow states that a paid date is recorded.

### Data Requirement

A `paidAt` or equivalent field is required even though the PRD's example `Invoice` type does not include it.

This is derived directly from the stated user flow.

## FR-INV-014 — Void Invoice

**Priority:** P0

The user can void an invoice.

### Acceptance Criteria

- Invoice remains historically visible.
- Invoice number remains reserved.
- Source time entries become eligible for invoicing again.
- Void invoice is excluded from outstanding revenue.

## FR-INV-015 — Duplicate Invoice

**Priority:** P2

The PRD states invoice duplication may be added later.

---

# 17. Invoice State Model

The PRD's stored statuses are:

```text
draft
sent
paid
void
```

`overdue` may be derived.

Recommended state model:

```text
Draft
  ├──→ Sent
  └──→ Void

Sent
  ├──→ Paid
  └──→ Void

Paid
  └──→ [Locked in MVP]

Void
  └──→ [Terminal in MVP]
```

## BR-INV-001 — Overdue Is Derived

Recommended derived rule:

```text
status = sent
AND dueDate < today
AND paidAt is null
→ display Overdue
```

The PRD explicitly allows overdue to be derived rather than stored.

## BR-INV-002 — Paid Invoice Protection

The PRD states paid invoices should be immutable except through an explicit reopen/edit workflow added later.

Therefore, in MVP:

- Paid invoices cannot be edited.
- Paid invoices cannot have line items removed.
- Paid invoices cannot have linked time entries changed through the invoice flow.

---

# 18. Invoice and Time Traceability

## BR-INV-003 — Explicit Time Relationships

The system must preserve which time entries produced which invoice items.

Recommended structure:

```text
Invoice
  └── InvoiceItem
      └── InvoiceItemTimeEntry[]
          └── TimeEntry
```

## BR-INV-004 — Prevent Double Invoicing

A time entry linked to a non-void invoice must not be offered for import into another invoice.

## BR-INV-005 — Void Restores Eligibility

Voiding an invoice must make its source time entries eligible for invoicing again.

## BR-INV-006 — Removing Entry From Draft

### Source Gap

The PRD does not explicitly state what happens when an imported time entry is removed from a draft invoice.

### Recommendation

Removing a time entry from a draft should immediately return it to the uninvoiced pool.

## BR-INV-007 — Saved Draft and "Invoiced" State

For MVP, **Draft invoices reserve their linked time entries** as soon as the import transaction
succeeds.

This prevents accidental double billing before the invoice is sent.

---

# 19. Invoice Numbering Requirements

## FR-INV-016 — Sequential Invoice Number

**Priority:** P0

The business profile contains:

- Invoice prefix.
- Next invoice number.

Example:

```text
INV-001
INV-002
```

An invoice number is assigned transactionally when the draft is first saved.

Reason:

- Drafts already reserve time entries.
- PDF preview may require a stable invoice number.
- This reduces numbering behavior differences across invoice states.

The number remains stable through edits and lifecycle transitions and is never reused after Void.

---

# 20. Invoice Currency Requirements

## BR-CUR-001 — One Currency Per Invoice

Each invoice uses exactly one currency.

## BR-CUR-002 — Client Currency Default

The client's currency becomes the default for a new invoice.

## BR-CUR-003 — Existing Invoice Stability

Changing client currency must not update historical invoice currency.

## BR-CUR-004 — No Automatic Conversion

Cross-currency conversion is out of scope for MVP.

---

# 21. Invoice Snapshot Requirements

The PRD requires invoice history to remain accurate even if related entities change.

## DR-INV-001 — Snapshot Business Identity

Saved/finalized invoice data should preserve the business identity required to reproduce the invoice PDF.

## DR-INV-002 — Snapshot Client Identity

Saved invoice data should preserve:

- Client name.
- Client billing address.
- Relevant billing contact data.

## DR-INV-003 — Snapshot Monetary Values

Invoice items must preserve:

- Description.
- Quantity.
- Unit price.
- Amount.

They must not be dynamically recomputed from current project/client rates after invoice creation.

---

# 22. Invoice PDF Requirements

## FR-PDF-001 — Generate Invoice PDF

**Priority:** P0

The user must be able to download a professional invoice PDF.

## FR-PDF-002 — Required PDF Content

**Priority:** P0

Include:

- Freelancer/business information.
- Client name.
- Client address.
- Invoice number.
- Issue date.
- Due date.
- Invoice status where appropriate.
- Line items.
- Quantity/hours.
- Unit rate.
- Line total.
- Subtotal.
- Tax.
- Discount.
- Total due.
- Currency.
- Notes.
- Payment terms.
- Optional logo.

## BR-PDF-001 — Deterministic Rendering

The generated PDF must be reproducible from saved invoice data.

Changing live client/project settings must not change a historical invoice PDF unexpectedly.

---

# 23. Data Requirements

## DR-CLI-001 — Client

```ts
type Client = {
  id: string;
  name: string;
  email?: string;
  ccRecipients?: string[];
  address?: string;
  note?: string;
  currency: string;
  defaultHourlyRate?: Decimal;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

## DR-PRJ-001 — Project

```ts
type Project = {
  id: string;
  clientId: string;
  name: string;
  color?: string;
  defaultHourlyRate?: Decimal;
  billableByDefault: boolean;
  note?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

## DR-TSK-001 — Task

```ts
type Task = {
  id: string;
  projectId: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

## DR-TME-001 — Time Entry

```ts
type TimeEntry = {
  id: string;
  clientId: string;
  projectId: string;
  taskId?: string;

  description: string;

  startAt: Date;
  endAt?: Date;
  durationSeconds: number;

  billable: boolean;
  hourlyRate?: Decimal;

  createdAt: Date;
  updatedAt: Date;
};
```

### Note

The PRD example includes `invoiceId?: string`, but also recommends a join table between invoice items and time entries.

### Recommendation

Do **not** store a single `invoiceId` on `TimeEntry` if the join table is the authoritative relationship.

Instead, derive invoice state through the invoice-item relationship.

## DR-INV-004 — Invoice

Recommended MVP shape derived from the PRD:

```ts
type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "void";

type Invoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;

  issueDate: DateOnly;
  dueDate: DateOnly;
  paidAt?: DateOnly;

  status: InvoiceStatus;
  currency: string;

  subtotal: Decimal;
  taxAmount: Decimal;
  discountAmount: Decimal;
  total: Decimal;

  notes?: string;

  createdAt: Date;
  updatedAt: Date;
};
```

## DR-INV-005 — Invoice Item

```ts
type InvoiceItem = {
  id: string;
  invoiceId: string;

  description: string;

  quantity: Decimal;
  unitPrice: Decimal;
  amount: Decimal;

  createdAt: Date;
  updatedAt: Date;
};
```

## DR-INV-006 — Invoice Item / Time Entry Join

```ts
type InvoiceItemTimeEntry = {
  invoiceItemId: string;
  timeEntryId: string;
};
```

---

# 24. Monetary Precision Requirements

## NFR-MNY-001 — Decimal-Safe Money

**Priority:** P0

Persisted monetary values must not use JavaScript floating-point values as the authoritative representation.

Acceptable implementation strategies include:

- Database decimal/numeric type.
- Integer minor units where appropriate.
- Decimal library with database-safe serialization.

## NFR-MNY-002 — Consistent Rounding

**Priority:** P0

A single documented rounding strategy must be used consistently: Decimal `ROUND_HALF_UP` at
Invoice currency minor-unit boundaries, with sufficient precision retained for fractional-hour
quantity calculations. Line amounts are rounded first, subtotal is their sum, discount applies
to subtotal, and tax applies to the discounted taxable subtotal.

---

# 25. Date and Time Requirements

## NFR-DT-001 — Timestamp Consistency

**Priority:** P0

Store time-entry timestamps consistently.

## NFR-DT-002 — Local Display

**Priority:** P0

Display dates/times in the user's configured or local timezone.

## NFR-DT-003 — Invoice Dates

**Priority:** P0

Invoice issue/due/paid dates should behave as date-only values and must not shift because of timezone conversion.

## NFR-DT-004 — Timer Refresh Reliability

**Priority:** P0

Elapsed time must be derived from authoritative timestamps rather than a browser-only counter.

---

# 26. Archive and Delete Rules

## BR-ARC-001 — Prefer Archive for Domain Records

Archive rather than hard-delete:

- Clients.
- Projects.
- Tasks.

## BR-ARC-002 — Preserve Historical References

Archived entities remain visible where referenced historically.

## BR-ARC-003 — Time Entry Deletion

Time entries may be hard-deleted only when they are not invoice-protected.

## BR-ARC-004 — Invoice Deletion

### Source Gap

The PRD does not define invoice deletion.

### Recommendation

Do not support invoice deletion in MVP after first save.

Use:

```text
Draft → Void
```

for abandoned invoices if historical numbering must be preserved.

If draft deletion is desired later, define numbering consequences first.

---

# 27. Validation Requirements

## Client Validation

- Name required.
- Currency required.
- Email, if provided, must be syntactically valid.
- Default hourly rate must be non-negative.

## Project Validation

- Client required.
- Name required.
- Default hourly rate must be non-negative if present.

## Task Validation

- Project required.
- Name required.

## Time Entry Validation

- Client required.
- Project required.
- Project must belong to selected client.
- Task, if present, must belong to selected project.
- Description required according to the PRD's manual-entry requirements.
- Duration must be positive for completed entries.
- Start/end range must be valid.
- Billable entry must resolve a valid non-negative hourly rate before financial calculations.

## Invoice Validation

- Client required.
- Currency required.
- Issue date required.
- Due date required.
- At least one line item should exist before marking Sent.
- Quantities must be non-negative.
- Unit prices must be non-negative unless credit-note functionality is explicitly introduced later.
- Total calculation must be internally consistent.

---

# 28. Error Handling Requirements

## NFR-ERR-001 — User-Correctable Errors

Validation errors must:

- Explain what is wrong.
- Appear near the relevant control where practical.
- Preserve entered values.
- Avoid losing unsaved work.

## NFR-ERR-002 — Failed Saves

If persistence fails:

- Do not pretend the operation succeeded.
- Preserve the user's current form data.
- Display a retryable error.

## NFR-ERR-003 — Timer Persistence Failure

A failed timer start/stop is high severity.

The UI must clearly indicate whether the timer is actually running according to persisted state.

## NFR-ERR-004 — Invoice Calculation Failure

If invoice totals cannot be calculated reliably:

- Prevent finalization/sending state changes.
- Show an explicit error.
- Preserve draft data.

---

# 29. Accessibility Requirements

## NFR-A11Y-001 — Keyboard Accessibility

**Priority:** P0

All primary workflows must be operable by keyboard.

## NFR-A11Y-002 — Form Labels

**Priority:** P0

Inputs must have programmatically associated labels.

## NFR-A11Y-003 — Focus Visibility

**Priority:** P0

Interactive elements must have visible focus states.

## NFR-A11Y-004 — Contrast

**Priority:** P0

UI should target WCAG AA contrast.

## NFR-A11Y-005 — Color Independence

**Priority:** P0

Billable state, invoice state, validation, and active/archive state must not rely on color alone.

## NFR-A11Y-006 — Dialog Focus

**Priority:** P0

Dialogs must:

- Move focus appropriately when opened.
- Contain focus where required.
- Restore focus when closed.

---

# 30. Responsive Requirements

## NFR-RWD-001 — Desktop First

**Priority:** P0

Primary optimization target:

- Desktop.
- Laptop.

## NFR-RWD-002 — Tablet Usability

**Priority:** P1

Core workflows should remain usable on tablet.

## NFR-RWD-003 — Mobile Timer Usability

**Priority:** P1

Even before full mobile optimization, the following should remain usable:

- Start timer.
- Stop timer.
- View current timer.
- Add manual entry.

Native mobile apps remain out of scope.

---

# 31. Security and Privacy Requirements

## NFR-SEC-001 — Sensitive Business Data

Verilio stores:

- Client names.
- Work descriptions.
- Hourly rates.
- Billing addresses.
- Invoice totals.
- Contact information.

These must be treated as private application data.

## NFR-SEC-002 — Authorization

**Priority:** P0 if authentication exists

Server-side authorization must prevent one user's data from being accessed by another user.

## NFR-SEC-003 — Password Storage

**Priority:** P0 if password authentication exists

Passwords must never be stored in plaintext.

## NFR-SEC-004 — Input Validation

**Priority:** P0

All externally supplied data must be validated server-side.

## NFR-SEC-005 — Private Invoice Access

**Priority:** P0

Private invoices must not be exposed through predictable unauthenticated URLs.

---

# 32. Performance Requirements

The PRD does not define quantitative performance targets.

The following are implementation recommendations.

## NFR-PERF-001 — Common Interaction Responsiveness

Primary list/filter interactions should feel immediate for normal freelancer-sized datasets.

## NFR-PERF-002 — Report Scalability

Report queries should be performed in a way that can handle several years of time entries without requiring the entire dataset to be loaded into the browser.

## NFR-PERF-003 — Timer Independence

Timer accuracy must not depend on render frequency or browser tab activity.

---

# 33. MVP Screen Requirements

| Screen | Priority | Purpose |
|---|---:|---|
| Timer | P0 | Live tracking |
| Timesheet | P0 | Historical time management |
| Clients list | P0 | Client management |
| Create/Edit Client | P0 | Client data |
| Projects list | P0 | Project management |
| Project detail | P0 | Project settings and tasks |
| Create/Edit Project | P0 | Project data |
| Create/Edit Task | P0 | Task management |
| Reports Summary | P0 | Hours and billable value |
| Reports Detailed | P0 | Time-entry analysis |
| Invoices list | P0 | Invoice lifecycle |
| Create/Edit Invoice | P0 | Invoice composition |
| Invoice detail/preview | P0 | Review/status/PDF |
| Settings / Business Profile | P0 | Billing identity/defaults |
| Dashboard | P2 | Overview after core workflow |

Supporting flows:

| Flow | Priority |
|---|---:|
| Manual time entry | P0 |
| Edit time entry | P0 |
| Delete confirmation | P0 |
| Archive confirmation | P0 |
| Import uninvoiced time | P0 |
| Invoice PDF preview/download | P0 |

---

# 34. End-to-End Acceptance Scenario

The MVP must support the following without an external spreadsheet or time-tracking system.

```text
1. Configure Verilio business profile.
2. Set default currency and hourly rate.
3. Create client "M4Trade".
4. Create project "Windows".
5. Create task "Bug Fix".
6. Start timer:
   "Fix resize limits".
7. Stop timer.
8. Confirm historical hourly rate was saved.
9. Add another manual time entry.
10. Open Timesheet and review both entries.
11. Open Reports.
12. Filter to M4Trade for the billing period.
13. Confirm total hours.
14. Confirm billable hours.
15. Confirm billable value.
16. Open Invoices.
17. Create invoice for M4Trade.
18. Import billable, uninvoiced entries.
19. Group by project.
20. Add a manual line item if needed.
21. Save Draft.
22. Confirm source time no longer appears as uninvoiced.
23. Generate invoice PDF.
24. Mark invoice Sent.
25. Mark invoice Paid.
26. Confirm paid date is recorded.
27. Confirm source time remains linked to the invoice.
```

---

# 35. Edge Case Analysis

## 35.1 Timer Already Running

**Scenario:** User presses Start while another timer exists.

**Required outcome:** Do not create a second running timer.

**MVP behavior recommendation:** Prompt to stop the current timer before starting the new one.

## 35.2 Browser Refresh During Active Timer

**Required outcome:** Restore the active timer based on persisted timestamps.

## 35.3 Browser Closed for Several Hours

**Required outcome:** On return, the timer still reflects elapsed time from the persisted start timestamp.

The system should not assume that browser activity equals working time.

## 35.4 Project Archived While Historical Entries Exist

**Required outcome:** Existing entries remain valid and visible.

## 35.5 Client Archived With Active Projects

### Source Gap

The PRD does not define cascade behavior.

### Recommendation

Archiving a client should not automatically archive projects.

However, projects under an archived client should not be available for new time tracking unless the client is reactivated.

## 35.6 Task Archived After It Was Used

**Required outcome:** Historical entries continue to display the task.

## 35.7 Rate Changes Mid-Month

**Required outcome:** Entries before and after the change retain their own historical rate snapshots.

Reports must calculate value per entry, not by multiplying aggregate project hours by the project's current rate.

## 35.8 Billable Entry Changed to Non-Billable

### Source Gap

The PRD allows editing billable state but does not define rate handling.

### Recommendation

If not invoiced:

- Set billable = false.
- Exclude it from billable totals.
- Preserve or clear historical hourly rate according to chosen data strategy.

If invoiced:

- Block ordinary edit and require invoice-aware correction later.

## 35.9 Non-Billable Entry Changed to Billable

### Recommendation

If not invoiced:

- Resolve a rate using the current rate hierarchy.
- Snapshot that rate.
- Recalculate billable amount.

## 35.10 Time Entry Imported Into Draft Invoice

**Required outcome:** Entry is reserved and excluded from other invoice import searches.

## 35.11 Time Entry Removed From Draft Invoice

**Recommended outcome:** Entry immediately becomes uninvoiced again.

## 35.12 Draft Invoice Voided

**Required outcome:** Linked time entries become eligible for future invoices.

## 35.13 Paid Invoice Edit Attempt

**Required outcome:** Block ordinary editing.

## 35.14 Currency Changed on Client After Invoice Creation

**Required outcome:** Existing invoice currency stays unchanged.

## 35.15 Existing Client Address Changes

**Required outcome:** Historical invoice PDF should still reflect invoice-snapshotted billing information.

## 35.16 Zero-Hour Invoice Item

### Source Gap

Not explicitly addressed.

### Recommendation

Reject zero-quantity invoice items unless a future non-time flat-fee workflow requires them.

## 35.17 Negative Invoice Item

### Source Gap

Not explicitly addressed.

### Recommendation

Reject negative amounts in MVP because credit notes/refunds are not in scope.

## 35.18 Empty Invoice

### Recommendation

Allow saving an empty Draft if useful during composition, but prevent Mark Sent / PDF final workflow until at least one valid line exists.

---

# 36. MVP Boundary Matrix

## Included in MVP

- Single freelancer profile.
- Client CRUD.
- Client archive/reactivate.
- Project CRUD.
- Project archive/reactivate.
- Project-specific tasks.
- Timer.
- Manual time entries.
- Time editing/deletion.
- Historical hourly rates.
- Timesheet.
- Summary reports.
- Detailed reports.
- Date/client/project/task filtering.
- Billable/non-billable filtering.
- Invoiced/uninvoiced filtering.
- CSV report export.
- Invoice creation.
- Import billable uninvoiced time.
- Invoice grouping.
- Manual invoice items.
- Invoice tax/discount in a simplified form.
- Invoice PDF.
- Draft/Sent/Paid/Void lifecycle.
- Paid date.
- Invoice/time traceability.

## Explicitly Deferred

- Multi-user teams.
- Roles and permissions.
- Employee monitoring.
- Screenshots.
- GPS.
- Kiosk.
- Time off.
- Scheduling.
- Approvals.
- Payroll.
- Forecasting.
- Staffing.
- Desktop app.
- Native mobile app.
- Browser extension.
- Accounting integrations.
- Calendar integrations.
- Recurring invoices.
- Automatic payment collection.
- Automatic invoice email delivery.
- Expense tracking.
- Advanced tax jurisdictions.
- Multi-company workspaces.
- Client portal.
- Payment-provider integration.
- Public invoice links.
- Fixed-fee projects.
- Retainers.
- Revenue forecasting.
- Project estimates/budgets.
- Clockify import.

---

# 37. P0 Requirements Summary

The following are mandatory to declare MVP complete:

### Foundation

- Business profile.
- Billing defaults.
- Persistent storage.

### Clients

- Create.
- Edit.
- Archive/reactivate.

### Projects

- Create.
- Edit.
- Archive/reactivate.

### Tasks

- Create.
- Edit.
- Archive/reactivate.

### Time

- Start timer.
- Stop timer.
- Timer survives refresh.
- Manual entry.
- Edit entry.
- Delete uninvoiced entry.
- Billable state.
- Historical hourly-rate snapshot.

### Timesheet

- Historical list.
- Daily grouping.
- Daily totals.
- Entry metadata.

### Reports

- Summary.
- Detailed.
- Date range.
- Client/project filters.
- Billable filter.
- Invoice status filter.
- Correct billable value calculation.

### Invoices

- Invoice list.
- Create invoice.
- Import eligible time.
- Select imported entries.
- Group imported time.
- Manual items.
- Totals.
- Save draft.
- Edit draft.
- Mark sent.
- Mark paid.
- Paid date.
- Void invoice.
- Prevent double billing.
- Restore time eligibility after void.

### PDF

- Deterministic professional invoice PDF.

### Integrity

- Decimal-safe money.
- Archive preservation.
- Invoice/time traceability.
- Historical invoice stability.

---

# 38. P1 Requirements Summary

Recommended for the initial release if schedule permits:

- Client search/filter.
- Project search/filter.
- Task search/filter.
- Duplicate time entry.
- Start timer from previous entry.
- Weekly timesheet totals.
- Date presets.
- Description search.
- Task report filter.
- Report grouping by description.
- Charts.
- CSV export.
- Percentage/fixed discount selector.
- Tablet usability.
- Strong mobile timer usability.

---

# 39. P2 Requirements Summary

Defer until after the core workflow is stable:

- Dashboard.
- Project tracked-time summary in project list.
- Appearance settings.
- Invoice duplication.
- Native apps.
- Browser extension.
- Expenses.
- Full payment ledger / partial payments.
- Email invoice delivery.
- Recurring invoices.
- Payment integration.
- Tax presets and advanced jurisdiction logic.
- Multiple workspaces/businesses.
- Calendar integration.
- Project budgets and estimates.
- Revenue forecasting.
- Client portal.
- Clockify import.

---

# 40. Product Decision Status

Only the public deployment and authentication model remain open. The private/local MVP retains
the fixed server-controlled owner and must not be represented as public multi-user deployment.

## OD-001 — Deployment Model

Options:

- Local/self-hosted.
- Hosted SaaS.
- Both.

## OD-002 — Authentication in First Version

Question:

Should authentication exist if the first deployment is single-user?

## OD-003 — Tax in First Release

Question:

Should tax be in the first invoice implementation or immediately after the first invoice milestone?

**Approved:** Include one percentage tax field; apply it after discount.

## OD-004 — Manual Duration-Only Entry

Question:

Should manual entries support duration-only input in addition to start/end timestamps?

**Approved:** Yes.

## OD-005 — Multi-Currency Report Behavior

Question:

How should monetary totals behave across multiple currencies?

**Approved:** Group financial totals by historical Time Entry currency; do not auto-convert.

## OD-006 — Invoice Grouping Default

Options:

- Per time entry.
- By project.
- By task.

**Approved:** Group by Project, splitting lines by historical hourly rate.

## OD-007 — Paid Invoice Reopening

Question:

Should paid invoices ever be reopenable?

**Approved for MVP:** No. Paid is terminal and read-only.

## OD-008 — Dashboard Timing

Question:

MVP or first post-MVP feature?

**Deferred:** Post-MVP.

## OD-009 — Clockify Import Priority

Question:

Should historical Clockify import be prioritized after MVP?

**Deferred:** Re-evaluate after MVP.

## OD-010 — Invoice Number Assignment

Question:

Assign number:

- When draft is created/saved.
- When sent/finalized.

**Approved:** Assign transactionally on first successful Draft save.

## OD-011 — Rate Behavior After Entry Metadata Edit

Question:

If an uninvoiced time entry changes project/client, should its rate automatically update?

**Approved:** Preserve stored rate and currency unless an explicit refresh is requested.

## OD-012 — Client Archive Cascade

Question:

Should archiving a client automatically archive its projects?

**Approved:** No automatic cascade; prevent new work selection beneath an archived Client.

---

# 41. Traceability to PRD

This analysis is derived from the Verilio PRD and preserves its central sections.

| Requirements Analysis Area | PRD Source Area |
|---|---|
| Product scope | §§1–5 |
| Target user | §6 |
| Navigation | §7 |
| Domain model | §8 |
| Business profile | §9.1 |
| Clients | §9.2 |
| Projects | §9.3 |
| Tasks | §9.4 |
| Timer/manual time | §9.5 |
| Historical rates | §9.6 |
| Timesheet | §9.7 |
| Reports | §9.8 |
| Billable calculations | §9.9 |
| Invoices | §9.10 |
| Invoice PDF | §9.11 |
| Settings | §9.12 |
| Data model | §10 |
| Business rules | §11 |
| UX principles | §12 |
| MVP screens | §13 |
| User flows | §14 |
| Build phases | §15 |
| Acceptance criteria | §16 |
| Future scope | §17 |
| Risks | §18 |
| Open decisions | §19 |
| Product identity | §§20–22 |

---

# 42. Definition of MVP Complete

Verilio MVP is complete when one freelancer can reliably complete this workflow:

```text
Configure business profile
        ↓
Create client
        ↓
Create project
        ↓
Create task
        ↓
Track time
        ↓
Edit/review time
        ↓
See accurate historical rates
        ↓
Run billing-period report
        ↓
Find billable uninvoiced time
        ↓
Create invoice
        ↓
Import and group time
        ↓
Generate PDF
        ↓
Mark Sent
        ↓
Mark Paid
```

And the following integrity conditions are true:

- Historical hourly rates do not change silently.
- Monetary calculations are decimal-safe.
- Archived records do not break history.
- Invoiced time cannot be accidentally billed twice.
- Voiding an invoice restores source-time eligibility.
- Historical invoice data remains reproducible.
- Timer state survives navigation and refresh.
- Reports clearly distinguish tracked, billable, and invoiced work.

---

# 43. Requirements Analysis Outcome

The PRD supports a focused MVP with four critical product capabilities:

```text
1. TIME CAPTURE
   Timer + manual entries

2. WORK ORGANIZATION
   Clients + projects + tasks

3. BILLING INTELLIGENCE
   Reports + historical rates + uninvoiced detection

4. INVOICING
   Time import + PDF + lifecycle + traceability
```

The highest implementation risks are not visual complexity. They are:

- Timer correctness.
- Historical-rate correctness.
- Monetary precision.
- Invoice/time traceability.
- Invoice state integrity.
- Multi-currency reporting correctness.

These areas should receive disproportionate design, architecture, and test attention in subsequent project documents.
