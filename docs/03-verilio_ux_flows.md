# Verilio UX Flows

## Document Control

**Product:** Verilio  
**Document:** UX Flows  
**File:** `docs/03-verilio_ux_flows.md`  
**Status:** Draft v0.1  
**Depends on:**

- `docs/01-verilio_product_requirements_document.md`
- `docs/02-verilio_requirements_analysis.md`

**Primary platform:** Web application  
**Primary user:** Independent freelancer / solo consultant  
**Primary description:** Time tracking, reports, and invoicing for freelancers.  
**Working tagline:** **Track your work. Bill with confidence.**

---

# 1. Purpose

This document defines the user experience flows for the Verilio MVP.

The PRD establishes what Verilio must do. The requirements analysis translates that scope into prioritized functional and business requirements. This document describes **how the user moves through those requirements**: entry points, screens, actions, system responses, decision points, validation states, and exits.

The purpose is to make the MVP implementable without prematurely locking the product into a final visual design.

This is therefore a **behavior and interaction specification**, not a visual design system.

---

# 2. UX Principles

Verilio should feel materially simpler than a workforce-management platform.

The UX should follow these principles.

## 2.1 Keep the Work-to-Invoice Path Obvious

The product should continuously reinforce this relationship:

```text
Client
  ↓
Project
  ↓
Task
  ↓
Time
  ↓
Report
  ↓
Invoice
  ↓
Payment
```

The user should rarely need to wonder where a piece of work goes next.

## 2.2 Optimize Frequent Actions

The highest-frequency interactions are expected to be:

- Start a timer.
- Stop a timer.
- Add a manual entry.
- Edit a recent entry.
- Review today's or this week's time.
- Review a billing period.

These actions should require fewer steps than lower-frequency administrative workflows such as changing business settings.

## 2.3 Preserve Context

When the user navigates between Timer, Timesheet, Reports, and Invoices:

- A running timer must continue.
- Selected date ranges should remain stable where practical.
- Client/project/task relationships must remain coherent.
- Draft data should not disappear because of an accidental navigation when it can be safely preserved.

## 2.4 Prefer Progressive Disclosure

Show the user what is needed for the current task.

Examples:

- Do not show advanced invoice controls before a client is selected.
- Do not show task choices before a project is selected.
- Do not show project choices unrelated to the selected client.
- Do not expose archived entities in normal pickers unless explicitly requested.

## 2.5 Protect Financial Integrity

Actions that can affect money or invoice traceability should be more deliberate than ordinary time-entry edits.

Examples:

- Editing uninvoiced time is straightforward.
- Editing invoiced time is blocked in the ordinary flow.
- Voiding an invoice requires confirmation.
- Paid invoices are locked in the MVP.

## 2.6 Do Not Hide State

The user should be able to tell at a glance:

- Whether a timer is running.
- Whether a time entry is billable.
- Whether a time entry is invoiced.
- Whether an invoice is Draft, Sent, Paid, Overdue, or Void.
- Whether a client/project/task is archived.

Color may reinforce state, but must not be the only indicator.

---

# 3. Approved MVP UX Decisions

The following choices are approved for the private/local MVP. Public deployment and
authentication remain separate release decisions.

| Decision | Approved MVP Choice |
|---|---|
| Deployment | Web app; architecture may later support hosted and self-hosted deployment |
| Authentication | UX should not require multi-user concepts; authentication may be introduced by architecture/deployment needs |
| Invoice tax | Include one percentage tax field |
| Manual time entry | Support both start/end and duration-only modes |
| Multi-currency reports | Never sum incompatible currencies; group financial totals by currency |
| Invoice grouping default | Group imported time by project |
| Paid invoices | Locked in MVP |
| Dashboard | Post-MVP |
| Clockify import | Post-MVP |
| Invoice number | Assign on first saved draft |
| Rate after editing entry metadata | Preserve current snapshot unless user explicitly refreshes/replaces it |
| Client archive cascade | Do not automatically archive child projects |

These choices are intentionally conservative and prioritize historical correctness.

---

# 4. Primary Navigation Model

The MVP primary navigation is:

```text
Timer
Timesheet
Reports

Clients
Projects

Invoices

Settings
```

## 4.1 Navigation Behavior

- The currently selected section is visibly active.
- Navigation must not interrupt an active timer.
- A persistent running-timer indicator should be visible outside the Timer screen.
- Archived items are not separate top-level destinations.
- Dashboard is not part of the MVP navigation.

## 4.2 Persistent Running Timer Indicator

When a timer is active, the application shell should show a compact indicator containing at least:

```text
Description
Elapsed time
Stop action
```

Optional context:

```text
Client / Project
```

Selecting the indicator returns the user to Timer.

---

# 5. First-Run Setup Flow

## Goal

Get a new user from an empty workspace to their first trackable project with minimal administration.

## Entry Condition

No business profile has been completed.

## Flow

```text
Open Verilio
   ↓
First-run setup
   ↓
Business name / display name
Email
Address
   ↓
Default currency
Default hourly rate
Payment terms
Invoice prefix
   ↓
Save profile
   ↓
Create first client
   ↓
Create first project
   ↓
Optional: add tasks
   ↓
Go to Timer
```

## UX Requirements

The setup should not require every optional invoice field before the user can track time.

Minimum completion should establish:

- Business/display name.
- Email.
- Address.
- Default currency.
- Default hourly rate.
- Payment terms.
- Invoice prefix.

## Exit

User arrives at Timer with the newly created client/project available.

---

# 6. Timer Flow

# 6.1 Empty / Idle Timer

The primary Timer view should contain:

```text
Description
Client
Project
Task (optional)
Billable toggle

[ Start ]
```

The user should be able to type the description immediately.

## Field Dependency

```text
Select Client
   ↓
Project picker becomes scoped to that client
   ↓
Select Project
   ↓
Task picker becomes scoped to that project
```

If the user changes Client after choosing a Project:

- Clear the current Project.
- Clear the current Task.

If the user changes Project:

- Clear the current Task if it does not belong to the new project.

## Defaults

When a project is selected:

- Billable state defaults from the project.
- Rate is resolved later according to the rate hierarchy.

The hourly rate does not need to dominate the Timer UI, but the user should be able to inspect the effective rate for billable work when needed.

---

# 6.2 Start Timer

## User Action

Select **Start**.

## Validation

Before start:

- Client exists.
- Project exists.
- Project belongs to client.
- Task, if selected, belongs to project.
- No other timer is running.

## Success State

The timer becomes active.

Display:

```text
Description
Client / Project / Task
Billable
Elapsed time

[ Stop ]
```

The running state should be visually unmistakable.

---

# 6.3 Start While Another Timer Is Running

## Trigger

User attempts to start another timer while one is active.

## MVP Flow

```text
Attempt Start
   ↓
Active timer detected
   ↓
Dialog / inline decision

"A timer is already running."

[ Keep current timer ]
[ Stop current and start this one ]
```

If **Stop current and start this one**:

1. Stop and save current entry.
2. Create the new running entry.
3. Confirm the new timer is active.

Do not create overlapping running timers.

---

# 6.4 Stop Timer

## User Action

Select **Stop**.

## System Flow

```text
Stop requested
   ↓
Persist end timestamp
   ↓
Calculate duration
   ↓
If billable: resolve/snapshot rate
   ↓
Save completed entry
   ↓
Clear running state
   ↓
Show completed entry in recent time list
```

## Success Feedback

The transition should be obvious without requiring a blocking success dialog.

Example:

```text
Saved · 1h 47m
```

The recent entry should be immediately editable.

---

# 6.5 Recover Running Timer

## Trigger

- Browser refresh.
- Browser restart.
- User navigates back later.

## Flow

```text
Load application
   ↓
Query running entry
   ↓
Running entry exists
   ↓
Recalculate elapsed time from start timestamp
   ↓
Restore running UI
```

The product must not create a second timer because the browser lost local UI state.

---

# 7. Recent Time on Timer Screen

The Timer screen should show a compact list of recent entries, likely grouped by date.

The purpose is not to replace Timesheet. It is to enable rapid correction and reuse.

Suggested row information:

```text
Description
Client / Project / Task
Start–End
Duration
Billable
Invoice state
Actions
```

Recommended quick actions:

- Edit.
- Duplicate.
- Start new timer from entry.

Delete may be available through an overflow action to reduce accidental clicks.

---

# 8. Manual Time Entry Flow

## Entry Points

- Timesheet → Add time.
- Timer recent-list area → Add time.

## Flow

```text
Add Time
   ↓
Choose entry mode
   ├── Start / End
   └── Duration
   ↓
Date
Description
Client
Project
Task optional
Billable
   ↓
Save
```

---

# 8.1 Start / End Mode

Fields:

```text
Date
Start time
End time
Description
Client
Project
Task
Billable
```

The app derives duration.

## Cross-Midnight Case

If end time appears earlier than start time, UX should not silently assume the same date.

Preferred behavior:

- Allow an explicit next-day end date/time, or
- Clearly offer “ends next day” when applicable.

Do not produce negative duration.

---

# 8.2 Duration-Only Mode

Fields:

```text
Date
Duration
Description
Client
Project
Task
Billable
```

### Recommendation

If duration-only entries need a time-of-day for sorting, allow optional start time. Do not fabricate a start time if the user did not provide one.

This may require the technical model to distinguish duration-only entries from timestamp-complete entries.

---

# 8.3 Save Manual Entry

On Save:

- Validate hierarchy.
- Validate positive duration.
- If billable, resolve/snapshot rate.
- Persist entry.
- Return to the originating context.
- Show the new entry immediately.

---

# 9. Edit Time Entry Flow

## Entry Points

- Timer recent entries.
- Timesheet.
- Detailed Report, if editing is exposed there.

## Uninvoiced Entry

Editable:

- Description.
- Client.
- Project.
- Task.
- Start/end.
- Duration.
- Billable state.

### Rate Behavior

When client/project is changed on an existing billable entry, preserve the existing historical rate by default.

Show an explicit control when appropriate:

```text
Current rate: $75/hr
New project default: $85/hr

[ Keep $75 ]   [ Use $85 ]
```

Never silently change the monetary value of historical work.

---

# 9.1 Invoiced Entry Edit Attempt

Ordinary editing should be blocked.

Show:

```text
This time entry is linked to invoice INV-2026-004.
It cannot be edited from the timesheet.

[ View invoice ]
[ Close ]
```

A future invoice-aware correction workflow can be designed later.

---

# 10. Delete Time Entry Flow

## Uninvoiced Entry

```text
Delete
   ↓
Confirmation
   ↓
Delete permanently
```

Confirmation should identify the work:

```text
Delete 2h 15m — “Fix login validation”?
```

## Invoiced Entry

Delete is blocked.

Offer **View invoice**.

---

# 11. Duplicate / Reuse Entry Flow

## Duplicate Entry

Creates a new, editable time entry using copied metadata.

Must not copy:

- ID.
- Invoice association.
- Created timestamp.

Date/time behavior should be explicit.

Recommended behavior:

- Duplicate opens the manual-entry editor prefilled rather than silently saving a duplicate.

## Start Timer From Entry

Copies:

- Description.
- Client.
- Project.
- Task.
- Billable state.

Then starts a brand-new running timer with a new start timestamp.

---

# 12. Timesheet Flow

## Primary Purpose

Historical time review and correction.

## Default View

Recommended default:

```text
This week
```

Display entries grouped by day.

Each day header shows total duration.

Example:

```text
Monday, Aug 31                          7h 24m

Fix NavigationResize       M4Trade / Windows     2h 10m
Code review                M4Trade / Grid        1h 05m
...
```

---

# 12.1 Timesheet Date Navigation

Presets:

- Today.
- Yesterday.
- This week.
- Last week.
- Past two weeks.
- This month.
- Last month.
- Custom range.

The selected range should be plainly visible.

---

# 12.2 Timesheet Search

Description search should filter visible entries.

If no results:

```text
No time entries match this search in the selected date range.
```

Do not imply the user's entire history is empty.

---

# 12.3 Timesheet Empty State

If there are no entries in the selected range:

```text
No time tracked for this period.

[ Start timer ]   [ Add time manually ]
```

---

# 13. Client List Flow

## Client List

Display at least:

- Name.
- Currency.
- Status where needed.
- Primary actions.

Controls:

```text
Search
Status: Active / Archived / All
[ New client ]
```

## Empty State

```text
No clients yet.
Create a client before organizing project work.

[ Create client ]
```

---

# 14. Create Client Flow

## Fields

```text
Name *
Email
CC recipients
Address
Currency *
Default hourly rate
Notes
```

## Defaults

- Currency inherits freelancer default.
- Hourly rate may inherit freelancer default or remain blank to indicate fallback.

### Recommendation

Prefer displaying inheritance explicitly rather than copying values invisibly.

Example:

```text
Hourly rate
Use business default — $85/hr
```

This reduces confusion when the default changes.

## Save

Successful save returns to:

- Client list, or
- The initiating flow if client creation was launched contextually.

---

# 15. Archive Client Flow

## Trigger

User selects Archive.

## Confirmation

Explain consequences:

```text
Archive M4Trade?

Historical time and invoices will remain available.
The client and its projects will no longer be available for new time entries until reactivated.

[ Cancel ] [ Archive ]
```

Archiving does **not** delete or automatically archive projects.

---

# 16. Project List Flow

Controls:

```text
Search
Client filter
Status: Active / Archived / All
[ New project ]
```

Each project should clearly show its client.

Recommended row information:

```text
Project name
Client
Billable default
Rate or inherited-rate indicator
Status
```

---

# 17. Create Project Flow

Fields:

```text
Client *
Project name *
Color
Billable by default
Hourly rate override
Notes
```

## Rate UX

Make inheritance clear:

```text
Hourly rate
○ Use client/business rate ($85/hr)
○ Override: [        ]
```

Avoid making a blank field ambiguous between “free”, “zero rate”, and “inherit”.

---

# 18. Project Detail Flow

MVP project detail sections:

```text
Tasks
Notes
Settings
```

Not included:

- Assignees.
- Access.
- Forecast.
- Staffing.
- Team permissions.

Tasks should be the primary content area because they directly support time tracking.

---

# 19. Task Management Flow

## Add Task

```text
Project Detail
   ↓
Tasks
   ↓
Add task
   ↓
Name
   ↓
Save
```

Tasks can be:

- Renamed.
- Archived.
- Reactivated.

Archived tasks remain visible in historical time.

---

# 20. Reports Entry Flow

Opening Reports should default to **Summary**.

Suggested layout structure:

```text
Reports
[ Summary ] [ Detailed ]

Date range
Filters

Report content
```

Filters should be shared conceptually between Summary and Detailed so switching report type does not unexpectedly reset the user's analysis.

---

# 21. Report Filter Flow

Filters:

```text
Date range
Client
Project
Task
Billable status
Invoice status
```

Dependencies:

- Project options should narrow when Client is selected.
- Task options should narrow when Project is selected.

Invoice status:

```text
All
Not invoiced
Invoiced
```

Billable status:

```text
All
Billable
Non-billable
```

A visible **Clear filters** action should restore the default report state.

---

# 22. Summary Report Flow

The report must answer, at minimum:

```text
How much time?
How much billable time?
How much non-billable time?
What billable value?
Where did the time go?
```

Display:

- Total tracked duration.
- Billable duration.
- Non-billable duration.
- Billable value.
- Hours by day.
- Hours by project.
- Grouped data.

---

# 22.1 Multi-Currency Report UX

If the active result contains multiple currencies, do not show:

```text
Total billable value: $12,435
```

unless all values are genuinely in the same currency.

Instead show something like:

```text
Billable value
USD  $8,240.00
EUR  €2,180.00
```

Time duration may still be aggregated globally.

No exchange-rate conversion occurs in MVP.

---

# 23. Detailed Report Flow

Recommended columns:

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

The table should support dense professional use without becoming visually noisy.

Useful row action:

- Open/edit time entry if uninvoiced.
- View invoice if invoiced.

---

# 24. CSV Export Flow

## Trigger

Select **Export CSV**.

## Behavior

CSV reflects current:

- Date range.
- Filters.
- Report mode where relevant.

The UI should communicate that export uses the current filter state.

Example:

```text
Export 84 filtered entries as CSV
```

---

# 25. Invoice List Flow

Invoice list should answer:

- What is outstanding?
- What was paid?
- What is still a draft?
- What is overdue?

Display:

```text
Invoice number
Client
Issue date
Due date
Total
Currency
Status
```

Primary action:

```text
[ New invoice ]
```

Recommended filters:

- Status.
- Client.
- Date range.

---

# 26. New Invoice Flow

The invoice creation flow should be staged enough to prevent mistakes but not become a wizard with unnecessary screens.

Recommended structure:

```text
Invoice Editor

1. Client & dates
2. Imported time / line items
3. Totals
4. Notes / terms
5. Preview / actions
```

These can live on one page with sections rather than five separate screens.

---

# 26.1 Select Client

Selecting a client should populate defaults:

- Currency.
- Client billing address.
- Client contact information.
- Default payment terms from business settings.

Invoice currency becomes fixed to the invoice once saved unless explicitly changed while still editable.

---

# 26.2 Select Billing Period

User chooses a date range.

Then offer:

```text
[ Import uninvoiced time ]
```

The date range is an import filter, not necessarily an invoice issue/due-date control.

---

# 27. Import Uninvoiced Time Flow

## Entry

From Invoice Editor:

```text
Import uninvoiced time
```

## Eligibility

Show entries where:

```text
Client = invoice client
Billable = true
Not reserved by another non-void invoice
Date in selected billing period
```

## Import UI

Display summary:

```text
38 eligible entries
42h 17m
USD $3,593.25
```

Then list entries with selection controls.

Each entry should show enough information to verify billing:

```text
Date
Description
Project
Task
Duration
Rate
Amount
```

Controls:

```text
Select all
Select none
Grouping: Project / Task / Individual entries

[ Import selected ]
```

Default grouping: **Project**.

---

# 28. Imported Invoice Items Flow

After import, source entries become represented by invoice line items.

Example:

```text
Windows
18.25 h × $85.00       $1,551.25

Forms
11.50 h × $85.00         $977.50
```

The user should be able to inspect which source time entries produced a grouped line.

Recommended interaction:

```text
Windows · 12 time entries
[ View source entries ]
```

This is important for invoice traceability.

---

# 29. Remove Imported Time From Draft

If a user removes imported time before/during Draft editing:

```text
Remove from invoice
   ↓
Remove source relationship
   ↓
Recalculate invoice item / totals
   ↓
Time becomes uninvoiced again
```

If a grouped line contains multiple entries, the UX should distinguish:

- Remove the entire line.
- Remove selected source entries.

For MVP, removing the entire grouped line is sufficient if partial grouped-line editing introduces excessive complexity.

---

# 30. Manual Invoice Item Flow

From the invoice editor:

```text
[ Add line item ]
```

Fields:

```text
Description
Quantity
Unit price
Amount (calculated)
```

Manual items have no source time-entry relationship.

MVP should reject negative values because credit-note functionality is out of scope.

---

# 31. Invoice Totals Flow

Calculate:

```text
Subtotal
Discount
Tax
Total
```

Approved tax UX:

```text
Tax (%)
```

Discount UX:

```text
Discount type: Percentage / Fixed
Discount value
```

Recalculation should occur immediately and visibly.

Do not allow a display total that differs from the persisted calculation.

The server-authoritative order is: round each line amount to currency minor units, sum the
subtotal, apply and round the discount, calculate tax on the discounted subtotal, then calculate
the total. Monetary rounding uses Decimal `ROUND_HALF_UP`.

---

# 32. Invoice Dates Flow

Fields:

```text
Issue date
Due date
```

Due date may be precomputed from default payment terms.

Example:

```text
Issue: Aug 31, 2026
Terms: 30 days
Due: Sep 30, 2026
```

Changing issue date may offer to recalculate due date while the user is editing a Draft.

Do not silently change a manually overridden due date.

---

# 33. Save Draft Flow

## User Action

Select **Save Draft**.

## System Actions

```text
Validate invoice
   ↓
Assign invoice number if first save
   ↓
Persist invoice snapshots
   ↓
Persist invoice items
   ↓
Persist source time relationships
   ↓
Reserve linked time entries from other invoice imports
   ↓
Show Draft state
```

### Success

The URL/route should now identify the saved invoice.

The user can safely leave and return later.

---

# 34. Draft Invoice Edit Flow

Draft allows:

- Update dates.
- Update notes.
- Update line items.
- Import more eligible time.
- Remove linked time.
- Add/remove manual items.
- Update tax/discount.

Any removed time becomes uninvoiced immediately after the change is saved.

---

# 35. Invoice Preview Flow

Preview should reflect the data that will be used to generate PDF.

It should include:

- Business identity.
- Client identity.
- Invoice number.
- Issue/due date.
- Items.
- Totals.
- Notes.
- Terms.

Preview should not pull mutable live client/project information in a way that differs from saved invoice snapshots.

---

# 36. Download PDF Flow

## Trigger

```text
[ Download PDF ]
```

## Behavior

Generate/download a PDF from saved invoice data.

If unsaved editor changes exist, UX should either:

- Require save first, or
- Save automatically with explicit feedback before generating.

### Recommendation

Require the invoice to be saved before PDF generation. This keeps PDF output deterministic and traceable.

---

# 37. Mark Invoice Sent Flow

## Preconditions

Invoice must:

- Be saved.
- Contain at least one valid line item.
- Have valid issue/due dates.
- Have a stable invoice number.

## Action

```text
[ Mark sent ]
```

Recommended lightweight confirmation:

```text
Mark INV-2026-004 as sent?
```

After transition:

- Status = Sent.
- Linked time remains reserved/invoiced.
- Invoice may display Overdue later if due date passes unpaid.

Automatic email delivery is not part of MVP.

---

# 38. Overdue Display Flow

Overdue is derived when:

```text
Stored status = Sent
Due date < current date
Paid date = null
```

UI displays:

```text
Overdue
```

without requiring a persisted `overdue` status.

---

# 39. Mark Paid Flow

## Entry

Invoice detail → **Mark paid**.

## Flow

```text
Mark paid
   ↓
Paid date
   ↓
Confirm
   ↓
status = Paid
paidAt = selected date
```

Default paid date may be today, but the user should be able to choose the actual payment date.

## Result

- Invoice becomes Paid.
- Invoice is locked against ordinary editing.
- Invoice remains historically visible.
- Linked time remains invoiced.

---

# 40. Paid Invoice Flow

Paid invoice is read-only in MVP.

Available actions may include:

- View.
- Download PDF.

Not available:

- Edit line items.
- Remove linked time.
- Change totals.

Reopening/audit workflows are post-MVP.

---

# 41. Void Invoice Flow

## Entry

Invoice detail → **Void invoice**.

## Confirmation

Because voiding changes future billing eligibility, confirmation should be explicit:

```text
Void INV-2026-004?

The invoice will remain in your records.
Its linked time entries will become available to invoice again.

[ Cancel ] [ Void invoice ]
```

## System Result

```text
status = Void
   ↓
Keep invoice number/history
   ↓
Release source time entries
   ↓
Exclude invoice from outstanding revenue
```

Void is terminal in MVP.

---

# 42. Invoice Traceability Flow

Users must be able to navigate both directions.

## Time → Invoice

From an invoiced time entry:

```text
Invoice: INV-2026-004
[ View invoice ]
```

## Invoice → Time

From an imported invoice item:

```text
12 source entries
[ View source time ]
```

This relationship should remain inspectable even after projects/tasks are archived.

---

# 43. Settings Flow

Sections:

```text
Business
Billing
Invoice defaults
```

## Business

- Name.
- Email.
- Address.
- Phone.
- Logo.
- Tax identifier where supported.

## Billing

- Default currency.
- Default hourly rate.
- Payment terms.
- Default tax.

## Invoice Defaults

- Invoice prefix.
- Next invoice number.
- Default notes.
- Footer.

Changing defaults must include a subtle reminder that historical entries/invoices are not retroactively altered.

---

# 44. Global Entity Picker Behavior

Client/project/task pickers appear frequently, so they should behave consistently.

## Client Picker

- Active clients by default.
- Searchable.
- Optional contextual **Create client** action.

## Project Picker

- Requires or infers a client context.
- Shows only active projects for the client.
- Searchable.
- Optional contextual **Create project** action.

## Task Picker

- Requires project context.
- Optional.
- Shows active tasks only.
- Searchable when list is long.
- Optional contextual **Create task** action.

Contextual creation can reduce navigation friction but is P1 if it complicates implementation.

---

# 45. Global Empty States

Empty states should direct the user toward the next meaningful action.

Examples:

## No Projects

```text
No projects yet.
Create a project to begin organizing time for this client.

[ Create project ]
```

## No Time

```text
No time tracked for this period.

[ Start timer ] [ Add time ]
```

## No Eligible Invoice Time

```text
No billable, uninvoiced time was found for this client and period.

Try another date range, or add a manual invoice item.
```

## No Invoices

```text
No invoices yet.
Create an invoice when you're ready to bill tracked work.

[ New invoice ]
```

---

# 46. Global Confirmation Strategy

Do not confirm harmless, reversible actions.

Require confirmation for:

- Delete time entry.
- Archive client/project/task where consequence may be unclear.
- Void invoice.
- Stop-and-replace an existing running timer.

Do not require blocking confirmation for:

- Normal save.
- Start timer.
- Stop timer.
- Filter changes.
- Report navigation.

---

# 47. Unsaved Changes Behavior

Forms with meaningful unsaved work should guard against accidental loss.

High-value examples:

- Invoice editor.
- Business settings.
- Large client/project forms if edited.

Recommended behavior:

```text
You have unsaved changes.

[ Stay ] [ Discard changes ]
```

The timer itself should not rely on unsaved browser-only state after Start.

---

# 48. Keyboard Interaction Goals

Without prescribing final shortcuts, the UX should support efficient keyboard use.

Minimum expectations:

- Logical tab order.
- Enter submits forms where safe.
- Escape closes dialogs where safe.
- Search and selection components are keyboard navigable.
- Timer Start/Stop should not require pointer-only interaction.

Future shortcuts can be added after usability testing.

---

# 49. Mobile / Narrow-Screen Flow Priorities

The MVP is desktop-first, but narrow screens should preserve these core workflows:

1. See whether a timer is running.
2. Start timer.
3. Stop timer.
4. Add manual time.
5. Review recent entries.

Dense reports and invoice editing may use simplified or stacked layouts on narrow screens rather than attempting to preserve desktop tables unchanged.

---

# 50. Error-State UX

# 50.1 Save Failure

```text
Couldn't save your changes.
Your entries are still here.

[ Try again ]
```

Never clear the form after a failed save.

---

# 50.2 Timer Start Failure

Timer state must remain unambiguous.

```text
Timer could not be started.
No time is currently being recorded.

[ Try again ]
```

Do not begin a purely visual timer if the authoritative start failed.

---

# 50.3 Timer Stop Failure

```text
Timer could not be stopped.
It is still recorded as running.

[ Try again ]
```

This is preferable to falsely showing a stopped timer while persisted state says otherwise.

---

# 50.4 Invoice Calculation Error

Prevent state transitions such as Mark Sent if totals are invalid.

```text
Invoice totals could not be calculated correctly.
Review the line items before continuing.
```

---

# 51. Core UX State Diagram

```text
                 ┌──────────────┐
                 │   Clients    │
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │   Projects   │
                 └──────┬───────┘
                        │
                 ┌──────▼───────┐
                 │    Tasks     │
                 └──────┬───────┘
                        │
         ┌──────────────▼──────────────┐
         │          Timer             │
         └──────────────┬──────────────┘
                        │
                 ┌──────▼───────┐
                 │  Time Entry  │
                 └──────┬───────┘
                        │
          ┌─────────────┴──────────────┐
          │                            │
   ┌──────▼───────┐             ┌──────▼───────┐
   │  Timesheet   │             │   Reports    │
   └──────────────┘             └──────┬───────┘
                                      │
                               billable +
                               uninvoiced
                                      │
                               ┌──────▼───────┐
                               │   Invoice    │
                               │    Draft     │
                               └──────┬───────┘
                                      │
                               ┌──────▼───────┐
                               │     Sent     │
                               └───┬──────┬───┘
                                   │      │
                                   │      └────────► Void
                                   │
                               ┌───▼──────┐
                               │   Paid   │
                               └──────────┘
```

---

# 52. Critical End-to-End UX Scenario

The first complete usability test should use this scenario.

```text
1. Open Verilio.

2. Configure business profile:
   Currency: USD
   Default rate: $85/hr

3. Create client:
   M4Trade

4. Create project:
   Windows

5. Create task:
   Bug Fix

6. Open Timer.

7. Enter:
   "Fix resize limits"

8. Select:
   M4Trade / Windows / Bug Fix

9. Start timer.

10. Navigate to Clients and back.
    Confirm timer continues.

11. Stop timer.

12. Open Timesheet.
    Confirm the entry exists with correct duration and billable state.

13. Add a manual entry for the same client.

14. Open Reports.

15. Select current billing period and M4Trade.

16. Confirm:
    - total time
    - billable time
    - billable value
    - entries are Not invoiced

17. Open Invoices → New invoice.

18. Select M4Trade and the billing period.

19. Import billable, uninvoiced time.

20. Keep default grouping: Project.

21. Save Draft.

22. Return to Reports.
    Confirm source entries now show Invoiced.

23. Return to invoice.

24. Preview and download PDF.

25. Mark invoice Sent.

26. Mark invoice Paid with payment date.

27. Confirm invoice is locked.

28. Confirm time entries still link back to the invoice.
```

If this flow is fast, understandable, and resistant to billing mistakes, the core Verilio UX is working.

---

# 53. UX Acceptance Criteria

The MVP UX is acceptable when:

- The user can start tracking from an idle Timer without unnecessary navigation.
- The user always knows whether a timer is running.
- Refresh/navigation does not lose timer state.
- Client → Project → Task dependencies are predictable.
- Manual time entry supports common correction workflows.
- Historical rates never change silently in the UI.
- Timesheet clearly distinguishes billable and invoiced states.
- Reports make uninvoiced work easy to identify.
- Multi-currency money is never combined misleadingly.
- Invoice import clearly shows which time is being billed.
- Grouped invoice items remain traceable to source entries.
- Draft invoices reserve source time from duplicate billing.
- Removing/voiding releases time correctly.
- Paid invoices cannot be accidentally altered.
- PDF generation uses saved invoice data.
- Destructive actions explain their consequences.
- Empty states offer an appropriate next action.
- Primary workflows remain keyboard accessible.

---

# 54. Inputs for the Next Design Documents

This UX-flow specification should feed directly into:

```text
04-verilio_design_system_specification.md
05-verilio_technical_architecture.md
06-verilio_mvp_implementation_plan.md
```

The design-system document should define how these states and interactions are expressed visually.

The technical-architecture document should define how persistent timer state, historical rates, decimal-safe calculations, invoice snapshots, invoice/time relationships, and date/time behavior are implemented reliably.

The implementation plan should then break the approved requirements and flows into buildable vertical slices.
