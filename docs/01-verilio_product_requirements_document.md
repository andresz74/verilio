# Verilio Product Requirements Document

## Product

**Product name:** Verilio  
**Document status:** Draft v0.1  
**Product type:** Freelancer time tracking, reporting, and invoicing application  
**Primary platform:** Web application  
**Primary user:** Independent freelancer / solo consultant  
**Primary description:** Time tracking, reports, and invoicing for freelancers.  
**Working tagline:** **Track your work. Bill with confidence.**  
**PRD revision:** Verilio naming and positioning adopted on August 31, 2026.  

---

## 1. Product Summary

Verilio is a focused time-tracking, reporting, and invoicing system for freelancers.

It should let a freelancer organize work by client, project, and task; track time with a timer or manual entries; review and filter historical time; calculate billable amounts; generate reports; create invoices from uninvoiced billable time; export invoices as PDF; and track invoice status.

Verilio is inspired by useful workflow patterns found in tools such as Clockify, but it is **not intended to reproduce Clockify feature-for-feature or visually clone it**. The goal is a smaller, simpler product centered on the needs of an individual freelancer.

Core workflow:

```text
Client
  ↓
Project
  ↓
Task
  ↓
Track time
  ↓
Review time entries
  ↓
Generate report
  ↓
Select billable, uninvoiced time
  ↓
Create invoice
  ↓
Export PDF
  ↓
Mark invoice sent / paid
```

---

## 2. Problem Statement

Freelancers often need multiple related capabilities:

- Track time while working.
- Correct or add time manually later.
- Organize work by client, project, and task.
- Separate billable and non-billable work.
- Understand how many hours were worked during a period.
- Calculate billable revenue using historical hourly rates.
- Identify work that has not yet been invoiced.
- Turn tracked time into an invoice.
- Export a professional PDF invoice.
- Track whether an invoice is draft, sent, paid, overdue, or void.

Many existing products include these capabilities, but useful freelancer features may be locked behind paid plans or bundled with broader team-management features that a solo freelancer does not need.

Verilio should provide a focused workflow without employee monitoring, workforce management, team permissions, scheduling, GPS tracking, screenshots, kiosks, payroll, or other enterprise-oriented functionality.

---

## 3. Product Vision

Build Verilio as a simple, trustworthy freelancer work ledger that connects **time worked** to **money billed**.

Verilio should make it easy to answer:

- What am I working on right now?
- How much time did I spend on this client or project?
- How much of that time is billable?
- What is the billable value of that work?
- Which time entries have not been invoiced yet?
- What should I invoice this client for?
- Has the client paid the invoice?

The experience should be faster and less cluttered than a workforce-management platform.

---

## 4. Product Goals

### 4.1 Primary Goals

1. Allow the user to track time quickly and accurately.
2. Organize time using clients, projects, and optional tasks.
3. Support both live timer entries and manual time entries.
4. Preserve historical billing accuracy when hourly rates change.
5. Provide useful detailed and summary reports.
6. Make it easy to find billable time that has not yet been invoiced.
7. Generate invoices from tracked time.
8. Export invoices as PDF.
9. Track invoice lifecycle and payment state.
10. Keep the product simple enough for a single freelancer to operate without administrative overhead.

### 4.2 Secondary Goals

- Make historical time easy to search and edit.
- Provide clean date-range filtering.
- Support different currencies by client.
- Keep clients and projects archivable rather than forcing deletion.
- Make reports useful for both billing and personal productivity review.
- Make the data model extensible for expenses and payments later.

---

## 5. Non-Goals for the MVP

The first version will **not** include:

- Multi-user teams.
- Roles and permissions.
- Employee monitoring.
- Screenshots.
- GPS tracking.
- Kiosk mode.
- Time-off management.
- Scheduling or shift planning.
- Timesheet approval workflows.
- Payroll.
- Forecasting.
- Project staffing.
- Desktop application.
- Native mobile applications.
- Browser extension.
- QuickBooks or accounting integrations.
- Calendar integrations.
- Recurring invoices.
- Automatic payment collection.
- Automatic invoice emailing.
- Expense tracking.
- Advanced taxes by jurisdiction.
- Multi-company workspaces.

These may be evaluated later if they serve the freelancer use case.

---

## 6. Target User

### Primary Persona: Independent Freelancer

A developer, designer, consultant, or other independent professional who:

- Works for multiple clients.
- Has one or more projects per client.
- Tracks work by task or category.
- Bills by the hour for at least some work.
- Needs reports for a week, month, or billing period.
- Creates invoices based on time worked.
- Wants to know which work has already been billed.
- Does not need employee-management features.

### Example Usage

```text
Client: M4Trade
Project: Windows
Task: Bug Fix
Description: Fix resize limits
Billable: Yes
Rate: $85/hour
Duration: 1h 47m
```

---

## 7. Information Architecture

Primary navigation:

```text
Timer
Timesheet
Reports

Clients
Projects

Invoices

Settings
```

A dashboard may be added after the core workflow is complete.

### 7.1 Timer

Used for live time tracking.

### 7.2 Timesheet

Used to review, create, edit, and organize historical time entries.

### 7.3 Reports

Used for summary and detailed analysis of tracked time and billable value.

### 7.4 Clients

Used to manage client contact and billing information.

### 7.5 Projects

Used to manage projects and their tasks.

### 7.6 Invoices

Used to create, review, export, and track invoices.

### 7.7 Settings

Used to manage freelancer/business information and invoice defaults.

---

## 8. Core Domain Model

```text
Freelancer Profile

Clients
└── Client
    └── Projects
        └── Project
            └── Tasks

Time Entries
├── Client
├── Project
├── Optional Task
├── Description
├── Start / End
├── Duration
├── Billable status
├── Historical hourly rate
└── Optional invoice reference

Invoices
└── Invoice
    └── Invoice Items
        └── Optional references to Time Entries
```

---

# 9. Functional Requirements

## 9.1 Freelancer / Business Profile

The user must be able to configure information used on invoices.

### Required fields

- Display name or business name.
- Email.
- Address.
- Default currency.
- Default payment terms.
- Invoice number prefix.
- Default hourly rate.

### Optional fields

- Phone.
- Logo.
- Tax identifier.
- Invoice footer.
- Invoice notes template.

### Example

```text
Business Name: Andres Consulting
Currency: USD
Payment Terms: 30 days
Invoice Prefix: INV-
Default Hourly Rate: $85
```

---

## 9.2 Clients

The user must be able to create, edit, archive, reactivate, and view clients.

### Client fields

- ID.
- Name.
- Email.
- CC recipients.
- Address.
- Note.
- Currency.
- Default hourly rate.
- Active / archived state.
- Created timestamp.
- Updated timestamp.

### CC Recipients

The initial UI may support up to three CC recipients, matching the workflow used as reference.

### Client list requirements

The client list should support:

- Search by name.
- Filter active / archived / all.
- Create new client.
- Edit client.
- Archive client.
- Reactivate client.
- Display currency.

### Rules

- A client may have many projects.
- A client may have many invoices.
- A client may define its own currency.
- Client currency should be used as the default currency for new invoices for that client.
- Archiving a client must not delete historical time entries, projects, or invoices.

---

## 9.3 Projects

The user must be able to create, edit, archive, reactivate, and view projects.

### Project fields

- ID.
- Client ID.
- Name.
- Optional color.
- Default hourly rate.
- Billable by default.
- Note.
- Active / archived state.
- Created timestamp.
- Updated timestamp.

### Project list requirements

The project list should support:

- Search by project name.
- Filter active / archived / all.
- Filter by client.
- Create project.
- Edit project.
- Archive project.
- Reactivate project.
- Show total tracked time where useful.

### Rules

- A project belongs to one client.
- A project may have many tasks.
- A project may have many time entries.
- Project rate may override the freelancer default rate.
- Archiving a project must preserve historical data.

---

## 9.4 Tasks

Tasks are project-specific categories used to organize time entries.

Example:

```text
M4Trade / Windows

- Desktops
- Forms
- Grid
- Kendo Components
- Menus
- Messages Window
- Theme Toggle
- Toolbar
- Windows
```

### Task fields

- ID.
- Project ID.
- Name.
- Active / archived state.
- Created timestamp.
- Updated timestamp.

### Requirements

The user must be able to:

- Add a task to a project.
- Rename a task.
- Archive a task.
- Reactivate a task.
- Filter active / archived tasks.
- Search tasks by name.

### MVP simplification

Do not implement task assignees, task permissions, forecasting, or team ownership.

---

## 9.5 Time Tracking

Time tracking is the primary product feature.

The user must be able to create time through two methods:

1. Running timer.
2. Manual time entry.

### 9.5.1 Live Timer

The timer form should support:

- Description.
- Client.
- Project.
- Optional task.
- Billable toggle.
- Start button.
- Stop button.

While running, display:

- Description.
- Client / project / task.
- Elapsed duration.
- Running state.
- Stop action.

### Timer rules

- Only one timer may run at a time for the user.
- Starting a new timer while another timer is active must require stopping or switching the current timer.
- The timer must preserve the start timestamp so elapsed time can be recalculated reliably.
- The timer should survive a page refresh.

### 9.5.2 Manual Time Entries

The user must be able to create an entry manually with:

- Date.
- Start time.
- End time.
- Or direct duration.
- Description.
- Client.
- Project.
- Optional task.
- Billable toggle.

### 9.5.3 Editing Time Entries

The user must be able to edit:

- Description.
- Client.
- Project.
- Task.
- Start time.
- End time.
- Duration.
- Billable state.

The app should recalculate duration after start/end changes.

### 9.5.4 Deleting Time Entries

The user must be able to delete a time entry with confirmation.

If the time entry is linked to an invoice, deletion should be blocked or require a special invoice-aware flow.

---

## 9.6 Historical Hourly Rate

This is a critical billing requirement.

The hourly rate used for a time entry must be stored on that time entry when the entry is created or finalized.

### Why

If a project rate changes from `$75/hour` to `$85/hour`, historical work performed at `$75/hour` must remain billed at the historical rate unless the user explicitly changes it.

### Rate resolution order

Suggested rate lookup when creating a billable time entry:

```text
1. Explicit rate on time entry, if manually supplied
2. Project default rate
3. Client default rate
4. Freelancer default rate
```

The resulting rate should be copied into the time entry as a historical snapshot.

---

## 9.7 Timesheet

The Timesheet is the primary historical view of time entries.

### Requirements

The user must be able to:

- View entries grouped by date.
- View daily totals.
- View weekly totals.
- Edit an entry.
- Delete an entry.
- Duplicate an entry.
- Start a new timer based on a previous entry.
- Add a manual entry.
- Search descriptions.

### Date navigation

Support common ranges:

- Today.
- Yesterday.
- This week.
- Last week.
- Past two weeks.
- This month.
- Last month.
- Custom range.

### Entry display

A row should show at least:

```text
Description
Client / Project / Task
Start – End
Date
Duration
Billable state
Invoice state
```

---

## 9.8 Reports

Verilio should have two primary report modes:

1. Summary.
2. Detailed.

### 9.8.1 Report Filters

Reports should support filtering by:

- Date range.
- Client.
- Project.
- Task.
- Billable / non-billable.
- Invoice status.

Invoice status filter:

```text
All
Not invoiced
Invoiced
```

### 9.8.2 Summary Report

Display:

- Total tracked duration.
- Billable duration.
- Non-billable duration.
- Billable value.
- Optional average hourly rate.

Example:

```text
Aug 1 – Aug 31

Total tracked     42h 32m
Billable          38h 17m
Non-billable       4h 15m
Billable value    $3,253.25
```

### Charts

Initial charts should include:

- Hours by day.
- Hours by project.

Possible later charts:

- Hours by client.
- Billable vs non-billable.
- Revenue by period.

### Grouping

Support grouping by:

- Client.
- Project.
- Task.
- Description.

### 9.8.3 Detailed Report

Display individual time entries in a table.

Suggested columns:

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
Invoice status
```

### Report export

MVP should support CSV export.

PDF report export may be added after invoice PDF generation is stable.

---

## 9.9 Billable Amount Calculation

For a billable time entry:

```text
billable amount = duration in hours × historical hourly rate
```

Example:

```text
Duration: 2h 30m
Rate: $85/hour
Amount: $212.50
```

Calculations should use precise decimal arithmetic for money.

Do not use floating-point arithmetic for persisted monetary values.

---

## 9.10 Invoices

Invoices should be a first-class product feature.

### Invoice list

Display:

- Invoice number.
- Client.
- Issue date.
- Due date.
- Total.
- Currency.
- Status.

### Invoice statuses

```text
Draft
Sent
Paid
Overdue
Void
```

`Overdue` may be derived from due date and payment state rather than stored directly.

### Creating an invoice

The user should be able to:

1. Choose a client.
2. Choose a billing date range.
3. Find billable, uninvoiced time entries.
4. Select which entries to include.
5. Choose how entries are grouped.
6. Review invoice line items.
7. Add manual line items.
8. Set issue date.
9. Set due date.
10. Add notes.
11. Save as draft.

### Import time workflow

Example:

```text
Client: M4Trade
Period: Aug 1 – Aug 31

Show:
✓ Billable
✓ Not invoiced

38 entries
42h 17m
$3,593.25

[ Import Time ]
```

### Invoice item grouping

Initial grouping options:

- One line per time entry.
- Group by project.
- Group by task.

Recommended default:

```text
Group by project
```

### Example

```text
Windows
18.25 hours × $85 = $1,551.25

Forms
11.50 hours × $85 = $977.50

Grid
8.50 hours × $85 = $722.50
```

### Invoice totals

Support:

- Subtotal.
- Tax.
- Discount.
- Total.

Approved MVP behavior:

- One percentage tax field.
- One percentage or fixed discount field.

### Invoice actions

The user must be able to:

- Save draft.
- Edit draft.
- Download PDF.
- Mark sent.
- Mark paid.
- Void invoice.
- Duplicate invoice later.

### Invoice and time-entry relationship

When billable time is included in a saved invoice:

- Time entries become linked to the invoice.
- They must appear as `invoiced` in reports.
- They must not appear in future `uninvoiced time` searches unless the invoice is voided or they are removed from the invoice.

This relationship must preserve traceability between source time and invoice items.

---

## 9.11 Invoice PDF

The user must be able to download a professional PDF invoice.

The PDF should contain:

- Freelancer/business information.
- Client name.
- Client address.
- Invoice number.
- Issue date.
- Due date.
- Invoice status where appropriate.
- Line items.
- Quantity / hours.
- Unit price / rate.
- Line total.
- Subtotal.
- Tax.
- Discount.
- Total amount due.
- Currency.
- Notes.
- Payment terms.
- Optional business logo.

The generated PDF must be deterministic from saved invoice data.

---

## 9.12 Settings

Settings should include:

### Business

- Business / freelancer name.
- Email.
- Address.
- Phone.
- Logo.

### Billing

- Default currency.
- Default hourly rate.
- Payment terms.
- Invoice number prefix.
- Next invoice number.
- Default tax.
- Default invoice notes.
- Default invoice footer.

### Appearance

May be added later:

- Theme.
- Date format.
- Time format.
- Week start day.

---

# 10. Data Requirements

## 10.1 Client

```ts
type Client = {
  id: string;
  name: string;
  email?: string;
  ccRecipients?: string[];
  address?: string;
  note?: string;
  currency: string;
  defaultHourlyRate?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

## 10.2 Project

```ts
type Project = {
  id: string;
  clientId: string;
  name: string;
  color?: string;
  defaultHourlyRate?: string;
  billableByDefault: boolean;
  note?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};
```

## 10.3 Task

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

## 10.4 Time Entry

```ts
type TimeEntry = {
  id: string;
  clientId: string;
  projectId: string;
  taskId?: string;

  description: string;

  mode: "timer" | "range" | "duration";
  workDate: string;
  startAt?: Date;
  endAt?: Date;
  durationSeconds?: number;

  billable: boolean;
  hourlyRate?: string;
  currency?: string;

  createdAt: Date;
  updatedAt: Date;
};
```

`hourlyRate` should use a decimal representation, not a JavaScript floating-point number for persisted money.

## 10.5 Invoice

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

  issueDate: string;
  dueDate: string;
  paidAt?: string;

  status: InvoiceStatus;
  currency: string;

  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  total: string;

  notes?: string;
  paymentTermsDays: number;
  footer?: string;

  createdAt: Date;
  updatedAt: Date;
};
```

## 10.6 Invoice Item

```ts
type InvoiceItem = {
  id: string;
  invoiceId: string;

  description: string;

  quantity: string;
  unitPrice: string;
  amount: string;

  createdAt: Date;
  updatedAt: Date;
};
```

A join table should link invoice items to source time entries when invoice items represent tracked time.

---

# 11. Business Rules

## 11.1 Time

- Store timestamps, not only formatted clock values.
- Store duration in seconds.
- Recalculate duration when start or end changes.
- Prevent negative duration.
- Prevent obviously invalid time ranges.

## 11.2 Billing

- Monetary values must use decimal arithmetic.
- Time entries preserve their historical hourly rate.
- Changing a project/client rate must not silently update historical time entries.
- Non-billable entries have no billable amount.

## 11.3 Invoicing

- Only billable time should be imported into an invoice by default.
- Only uninvoiced time should be imported by default.
- Time entries linked to an active invoice should show as invoiced.
- Voiding an invoice should make its source time eligible for invoicing again.
- Paid invoices should be immutable except through an explicit reopen/edit workflow added later.

## 11.4 Archiving

Archiving must preserve historical relationships.

A user should still be able to view old reports and invoices involving archived clients, projects, or tasks.

---

# 12. UX Requirements

## 12.1 General

Verilio should feel simpler than a workforce-management product.

Priorities:

- Fast interactions.
- Clear hierarchy.
- Dense but readable tables.
- Strong date filtering.
- Minimal navigation.
- Keyboard-friendly forms where practical.
- Responsive desktop-first design.

## 12.2 Visual Direction

Do not reproduce Clockify's visual design.

Use the reference screenshots for workflow understanding only.

The application should develop its own:

- Brand.
- Layout.
- Color system.
- Typography.
- Components.
- Charts.
- Invoice design.

## 12.3 Desktop First

The initial product should optimize for desktop and laptop use.

Tablet support should be acceptable.

Mobile optimization can wait until after the main workflow is stable.

---

# 13. MVP Screens

The MVP should include these screens.

## Core

1. Timer.
2. Timesheet.
3. Clients list.
4. Create/Edit Client.
5. Projects list.
6. Project detail.
7. Project tasks.
8. Create/Edit Project.
9. Create/Edit Task.
10. Reports Summary.
11. Reports Detailed.
12. Invoices list.
13. Create/Edit Invoice.
14. Invoice detail/preview.
15. Settings / Business Profile.

## Supporting dialogs / flows

- Manual time entry.
- Edit time entry.
- Delete confirmation.
- Archive confirmation.
- Import uninvoiced time.
- Invoice PDF preview/download.

---

# 14. MVP User Flows

## 14.1 First-Time Setup

```text
Open application
→ Configure freelancer/business profile
→ Set default currency
→ Set default hourly rate
→ Create first client
→ Create first project
→ Start tracking time
```

## 14.2 Track Work

```text
Open Timer
→ Enter description
→ Select client
→ Select project
→ Optionally select task
→ Confirm billable state
→ Start
→ Stop
→ Time entry is saved
```

## 14.3 Manual Entry

```text
Open Timesheet
→ Add time
→ Enter date and start/end or duration
→ Select client/project/task
→ Enter description
→ Save
```

## 14.4 Review Billing Period

```text
Open Reports
→ Select date range
→ Select client
→ Filter billable
→ Review total hours and billable value
```

## 14.5 Create Invoice From Time

```text
Open Invoices
→ New Invoice
→ Select client
→ Select billing period
→ Import billable + uninvoiced time
→ Review grouped line items
→ Add manual items if needed
→ Review totals
→ Save Draft
→ Download PDF
→ Mark Sent
```

## 14.6 Record Payment

```text
Open invoice
→ Mark Paid
→ Paid date is recorded
→ Invoice disappears from unpaid list
```

---

# 15. MVP Build Phases

## Phase 1 — Foundation

- Application shell.
- Navigation.
- Database.
- Business settings.

## Phase 2 — Clients

- Client CRUD.
- Archive/reactivate.
- Client currency and billing information.

## Phase 3 — Projects and Tasks

- Project CRUD.
- Task CRUD.
- Client/project hierarchy.

## Phase 4 — Time Tracking

- Live timer.
- Manual entries.
- Edit/delete entries.
- Historical rate snapshot.

## Phase 5 — Timesheet

- Historical entry list.
- Daily/weekly grouping.
- Date navigation.
- Search.

## Phase 6 — Reports

- Summary report.
- Detailed report.
- Filters.
- Billable totals.
- Charts.
- CSV export.

## Phase 7 — Invoices

- Invoice CRUD.
- Import uninvoiced time.
- Group invoice items.
- Totals, tax, discount.
- Status lifecycle.

## Phase 8 — Invoice PDF

- Printable invoice template.
- PDF export.
- Business/client details.

## Phase 9 — MVP Hardening

- Complete product-loop verification.
- Billing, Timer, migration, accessibility, and error-state hardening.
- Documentation and private/local release gate.
- Focused performance improvements where they do not expand product scope.

---

# 16. MVP Acceptance Criteria

The MVP is successful when the user can complete all of the following without external tools.

### Setup

- Create freelancer/business profile.
- Configure a default hourly rate and currency.

### Client and project management

- Create a client.
- Create a project for the client.
- Add tasks to the project.

### Time tracking

- Start a timer.
- Stop the timer.
- Save a time entry.
- Add time manually.
- Edit an existing entry.
- Mark entries billable or non-billable.

### Reporting

- Filter a date range.
- Filter by client/project/task.
- See total tracked time.
- See billable time.
- See billable value.
- View detailed entries.

### Invoicing

- Find billable, uninvoiced time.
- Create an invoice from selected time.
- Review invoice line items.
- Save the invoice as draft.
- Export invoice as PDF.
- Mark invoice sent.
- Mark invoice paid.

### Historical correctness

- Changing a project's hourly rate does not alter the rate stored on old time entries.
- Invoiced time is not offered for invoicing again.
- Voiding an invoice returns its source time to the uninvoiced pool.

---

# 17. Future Features

Possible post-MVP additions:

- Expenses.
- Payments table with partial payments.
- Automated overdue reminders and collection workflows.
- Email invoices.
- Recurring invoices.
- Payment-provider integration.
- Tax presets.
- Multiple freelancer businesses/workspaces.
- Calendar integration.
- Browser extension.
- Desktop timer.
- Mobile timer.
- Project budgets.
- Project estimates.
- Revenue forecasting.
- Retainers.
- Fixed-fee projects.
- Public invoice/payment links.
- Client portal.
- Data import from Clockify.

---

# 18. Product Risks

## 18.1 Scope Creep

The biggest risk is gradually rebuilding a full workforce-management product.

**Mitigation:** every feature should be evaluated against the freelancer workflow:

```text
Track → Review → Report → Invoice → Get Paid
```

## 18.2 Billing Accuracy

Incorrect time/rate calculations would make the product untrustworthy.

**Mitigation:** preserve historical rates, use decimal arithmetic, and test billing calculations thoroughly.

## 18.3 Invoice Traceability

A user must always be able to understand which time entries produced an invoice.

**Mitigation:** maintain explicit relationships between time entries and invoice items.

## 18.4 Timer Reliability

A timer that loses state after refresh or browser interruption would be frustrating.

**Mitigation:** persist running timer state server-side with authoritative timestamps and database protection for one running Timer per owner.

---

# 19. Product Decision Status

The private/local MVP uses a fixed server-controlled owner. Public deployment and its
authentication model remain open and must be resolved before exposing Verilio to the public
Internet.

The following MVP decisions are approved:

- One percentage tax field; percentage or fixed discount; discount before tax.
- Invoice money rounds to currency minor units using Decimal `ROUND_HALF_UP`.
- Manual time supports range and duration-only modes.
- Completed billable time snapshots both its resolved hourly rate and Client currency. Legacy
  currency values were backfilled from the then-current Client as a one-time best effort.
- Reports separate money by currency and perform no automatic currency conversion.
- Each Invoice has exactly one currency; incompatible historical Time cannot be imported.
- Imported Time groups by Project by default and splits lines when historical rates differ.
- Invoice numbers are assigned on first successful Draft save and remain stable.
- A saved Draft immediately reserves linked Time.
- Paid and Void are terminal in MVP. Void preserves historical source relationships while
  releasing Time for active billing.
- Overdue is derived from Sent status, due date, and the current Business date; it is not stored.
- Dashboard and Clockify import remain post-MVP.

---

# 20. Product Identity

## Name

**Verilio**

Verilio is an invented brand name. Its intended association is with a reliable, verifiable record of freelance work: what was done, how long it took, what it was worth, and what was billed.

The name deliberately avoids generic category terms such as "timer," "track," "invoice," or "freelance" so the product can grow beyond time tracking without requiring a rebrand.

## Product Category

**Freelancer time tracking, reporting, and invoicing.**

## Primary Description

> Time tracking, reports, and invoicing for freelancers.

## Working Tagline

> **Track your work. Bill with confidence.**

## Brand Concept

The Verilio product story follows the value of freelance work from activity to payment:

```text
Time
  ↓
Work
  ↓
Record
  ↓
Value
  ↓
Invoice
  ↓
Payment
```

The brand should feel professional, clear, calm, trustworthy, and useful rather than corporate, surveillance-oriented, or overloaded with workforce-management features.

---

# 21. Product Positioning

## Positioning Statement

> **Verilio is a focused time-tracking and invoicing workspace for freelancers — track work, understand billable time, and turn it into invoices without the overhead of workforce-management software.**

## Short Product Description

> **Time tracking, reports, and invoicing for freelancers.**

## Working Tagline

> **Track your work. Bill with confidence.**

## Product Promise

Verilio should make the path from completed work to an accurate invoice shorter and easier to understand. The product should always make it clear what was tracked, what is billable, what remains uninvoiced, what has been invoiced, and what has been paid.

---

# 22. Final MVP Principle

Verilio should remain centered on this loop:

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

Everything else is optional until this workflow is fast, reliable, and pleasant to use.
