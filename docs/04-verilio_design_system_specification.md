# Verilio Design System Specification

## Document Control

**Product:** Verilio  
**Document:** Design System Specification  
**File:** `docs/04-verilio_design_system_specification.md`  
**Status:** Draft v0.1  
**Primary source:** `docs/01-verilio_product_requirements_document.md`  
**Related documents:** `docs/02-verilio_requirements_analysis.md`, `docs/03-verilio_ux_flows.md`  
**Primary platform:** Web application  
**Primary user:** Independent freelancer / solo consultant  
**Product category:** Freelancer time tracking, reporting, and invoicing  
**Working tagline:** **Track your work. Bill with confidence.**

---

# 1. Purpose

This document defines the visual and interaction system for Verilio.

It translates the product requirements into a reusable UI foundation for:

- Application shell and navigation.
- Typography.
- Color semantics.
- Spacing and layout.
- Buttons and actions.
- Form controls.
- Date and time controls.
- Tables and dense data views.
- Status indicators.
- Timer states.
- Reports and charts.
- Dialogs and confirmations.
- Invoice editing and invoice presentation.
- Loading, empty, success, and error states.
- Responsive behavior.
- Accessibility.

The PRD requires Verilio to feel simpler than a workforce-management product, use fast interactions, clear hierarchy, dense but readable tables, strong date filtering, minimal navigation, keyboard-friendly forms, and its own visual identity rather than reproducing Clockify's design.

Where the PRD does not specify an exact visual value, this document introduces a **proposed design-system decision**. Those decisions should be treated as implementation defaults that may be refined through visual design work without changing product behavior.

---

# 2. Source-Derived Design Constraints

The following constraints come directly from the product requirements and should be treated as authoritative.

## 2.1 Product Character

Verilio should feel:

- Professional.
- Clear.
- Calm.
- Trustworthy.
- Useful.
- Focused on independent work.

Verilio should not feel:

- Corporate for its own sake.
- Surveillance-oriented.
- Overloaded with workforce-management features.
- Visually derivative of Clockify.

## 2.2 UX Priorities

The interface should prioritize:

- Fast interactions.
- Clear hierarchy.
- Dense but readable tables.
- Strong date filtering.
- Minimal navigation.
- Keyboard-friendly forms where practical.
- Desktop-first responsive behavior.

## 2.3 Core Product Loop

The interface should continually reinforce the relationship:

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

The design should make state transitions in this loop obvious, especially:

- Running vs stopped time.
- Billable vs non-billable time.
- Invoiced vs uninvoiced time.
- Draft vs sent vs paid vs void invoices.
- Active vs archived records.

---

# 3. Design Principles

## DS-PRIN-001 — Work First

The interface should foreground the work the freelancer is doing, not administrative chrome.

The Timer, Timesheet, Reports, and Invoices are more important than decorative dashboards or secondary analytics.

## DS-PRIN-002 — Calm Density

Verilio should support dense information without becoming visually noisy.

Use:

- Compact rows.
- Strong column alignment.
- Clear labels.
- Restrained borders.
- Limited surface nesting.
- Predictable spacing.

Avoid:

- Excessive cards.
- Large decorative areas.
- Repeated headings that add no hierarchy.
- Heavy borders around every control.

## DS-PRIN-003 — State Must Be Explicit

Important financial and tracking state must never depend on color alone.

Examples:

```text
Billable
Invoiced
Draft
Sent
Paid
Overdue
Void
Archived
Running
```

Each state should have text, iconography where useful, and semantic color.

## DS-PRIN-004 — Money Requires Visual Confidence

Financial values should be:

- Easy to scan.
- Right-aligned in tables.
- Clearly associated with currency.
- Visually distinct from durations.
- Never presented as an ambiguous aggregate when currencies differ.

## DS-PRIN-005 — Time Is a Primary Data Type

Durations and timestamps should use consistent formatting across Timer, Timesheet, Reports, and Invoices.

## DS-PRIN-006 — Preserve Context

When editing an item, Verilio should keep its hierarchy visible.

Example:

```text
M4Trade
└── Windows
    └── Bug Fix
```

This is preferable to showing disconnected IDs or ambiguous labels.

## DS-PRIN-007 — Destructive Actions Are Deliberate

Delete, Void, Archive, and other destructive actions should be visually differentiated and require confirmation where specified by requirements.

## DS-PRIN-008 — Accessible by Default

Keyboard access, visible focus, labels, contrast, and semantic structure are foundational design-system requirements rather than later polish.

---

# 4. Brand Direction

## 4.1 Brand Personality

Verilio should communicate:

```text
accurate
reliable
quietly confident
organized
modern
independent
professional
```

It should avoid the visual language of employee monitoring, corporate HR systems, or overly playful consumer apps.

## 4.2 Brand Mark

A logo is not specified by the PRD.

### Proposed Direction

Prefer a simple wordmark and compact symbol that can work in:

- Sidebar/header.
- Favicon.
- Invoice branding.
- Future mobile/desktop launcher icons.

The symbol should remain legible at 16–24 px.

Avoid embedding time-clock imagery too literally; the product extends into reports and invoicing.

## 4.3 Product Name Usage

Use:

**Verilio**

Avoid stylizations such as:

```text
VERILIO
verilio.
VeriLio
```

unless a future brand exercise explicitly changes the wordmark.

---

# 5. Design Tokens

The following token system is **proposed** because the PRD defines semantic needs but not exact values.

Use semantic tokens in components rather than hard-coded one-off values.

---

# 6. Color System

## 6.1 Color Strategy

The base UI should be neutral and calm.

Use the brand/accent color primarily for:

- Primary actions.
- Active navigation.
- Focus states.
- Selected controls.
- Running-timer emphasis.

Do not use saturated accent color as large decorative backgrounds throughout the product.

## 6.2 Proposed Semantic Palette

Exact values may be refined during implementation, but the semantic roles should remain stable.

```text
color.background.canvas
color.background.surface
color.background.subtle
color.background.elevated

color.text.primary
color.text.secondary
color.text.muted
color.text.inverse

color.border.default
color.border.strong
color.border.focus

color.accent.default
color.accent.hover
color.accent.active
color.accent.subtle

color.success.default
color.success.subtle
color.warning.default
color.warning.subtle
color.danger.default
color.danger.subtle
color.info.default
color.info.subtle
```

## 6.3 Proposed Brand Accent

A restrained blue-violet / indigo family is recommended for the initial product because it communicates trust without reading as accounting-software green or copying Clockify blue.

Example implementation starting point:

```text
Accent 50   #F4F3FF
Accent 100  #E9E7FF
Accent 500  #635BDB
Accent 600  #554CCB
Accent 700  #473FB3
```

These are provisional visual values, not product requirements.

## 6.4 Neutral Palette

Recommended neutral direction:

```text
Canvas       near-white
Surface      white
Subtle       cool/light neutral
Border       light neutral gray
Primary text near-black / dark slate
Secondary    medium slate
Muted        softer slate
```

Avoid pure black for normal body text where a softer dark neutral improves readability.

## 6.5 Semantic State Colors

Suggested roles:

| State | Semantic treatment |
|---|---|
| Running timer | Accent + explicit `Running` text |
| Billable | Positive/info semantic + `Billable` text |
| Non-billable | Neutral + `Non-billable` text |
| Not invoiced | Neutral/warning semantic + label |
| Draft | Neutral/info |
| Sent | Info |
| Paid | Success |
| Overdue | Warning or danger depending severity |
| Void | Muted/danger |
| Archived | Muted |
| Validation error | Danger |
| Save success | Success |

Color alone must never communicate these states.

## 6.6 Dark Mode

Dark mode is not required by the MVP PRD.

### Recommendation

Structure color tokens so dark mode can be added later without rewriting component styles, but do not delay MVP for dark-mode implementation.

---

# 7. Typography

## 7.1 Typography Strategy

Verilio contains a large amount of structured numeric data, so typography must perform well for:

- Durations.
- Currency.
- Dates.
- Tables.
- Form labels.
- Invoice totals.

## 7.2 Proposed Font Stack

Use a system-oriented sans-serif stack initially to avoid font-loading complexity:

```css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

If Inter is not bundled, the system stack is acceptable.

The implementation should not depend on a custom paid font.

## 7.3 Numeric Typography

Use tabular numerals where numeric alignment matters:

```css
font-variant-numeric: tabular-nums;
```

Apply to:

- Timer duration.
- Time-entry duration.
- Currency columns.
- Report totals.
- Invoice totals.
- Start/end times where aligned in tables.

## 7.4 Proposed Type Scale

```text
Display / major total   32 px / 40
Page title              24 px / 32
Section title           18 px / 26
Body                    14–16 px / 20–24
Table body              14 px / 20
Secondary / metadata    12–13 px / 18
```

Avoid an oversized marketing-style heading scale inside the product UI.

## 7.5 Weight Usage

```text
400 Regular   body and secondary values
500 Medium    labels, controls, table emphasis
600 Semibold  headings, important totals, primary navigation
700 Bold      rare; only for high-emphasis totals or invoice total
```

---

# 8. Spacing System

Use a 4 px base unit.

Proposed scale:

```text
space-0   0
space-1   4 px
space-2   8 px
space-3   12 px
space-4   16 px
space-5   20 px
space-6   24 px
space-8   32 px
space-10  40 px
space-12  48 px
```

Guidelines:

- Dense tables: 8–12 px vertical cell padding.
- Form fields: 16–24 px group spacing.
- Page sections: 24–32 px separation.
- Major page regions: 32–48 px when needed.

Avoid inconsistent one-off spacing values unless required by layout.

---

# 9. Radius, Borders, and Elevation

## 9.1 Border Radius

Proposed scale:

```text
radius-sm   4 px
radius-md   6–8 px
radius-lg   12 px
radius-full 999 px
```

Use:

- `sm/md` for controls.
- `lg` sparingly for dialogs or larger surfaces.
- `full` for status badges or compact pills only.

## 9.2 Borders

Prefer subtle 1 px borders for:

- Inputs.
- Table separators.
- Dialog boundaries.
- Surface distinctions.

Avoid heavy boxed layouts.

## 9.3 Shadows

Use shadows sparingly.

Appropriate:

- Dropdown/popover.
- Dialog.
- Floating timer-related affordance if introduced.

Avoid card shadows throughout ordinary page content.

---

# 10. Application Shell

## 10.1 Desktop Layout

The PRD defines this navigation:

```text
Timer
Timesheet
Reports

Clients
Projects

Invoices

Settings
```

### Proposed Desktop Shell

Use a persistent left navigation rail/sidebar and a flexible main content region.

```text
┌────────────────┬──────────────────────────────────────┐
│ Verilio        │ Page title / contextual actions      │
│                ├──────────────────────────────────────┤
│ Timer          │                                      │
│ Timesheet      │ Main page content                    │
│ Reports        │                                      │
│                │                                      │
│ Clients        │                                      │
│ Projects       │                                      │
│                │                                      │
│ Invoices       │                                      │
│                │                                      │
│ Settings       │                                      │
└────────────────┴──────────────────────────────────────┘
```

## 10.2 Sidebar Behavior

Recommended:

- Width approximately 220–248 px.
- Active destination has clear text + selected treatment.
- Icons may support scanning but labels remain visible on desktop.
- Avoid nested navigation until project complexity requires it.

## 10.3 Running Timer in Global Shell

Because the timer should survive navigation, the interface should provide persistent awareness when a timer is running.

### Proposed Pattern

Show a compact running indicator in the shell containing:

- Running label/icon.
- Current description, truncated.
- Elapsed duration.
- Link/action back to Timer.

Do not place a destructive Stop button in a location where accidental clicks are likely unless interaction testing supports it.

---

# 11. Page Header Pattern

Each primary page should use a predictable header:

```text
Page title                         Primary action
Optional description              Secondary actions
```

Examples:

```text
Clients                            + New Client
Projects                           + New Project
Invoices                           + New Invoice
Timesheet                          + Add Time
```

Keep header height compact.

---

# 12. Buttons

## 12.1 Button Hierarchy

### Primary

Use for one dominant page or dialog action.

Examples:

- Start Timer.
- Save.
- Create Invoice.
- Import Time.
- Mark Paid.

### Secondary

Use for supportive actions:

- Cancel.
- Preview PDF.
- Export CSV.
- Duplicate.

### Quiet / Ghost

Use for low-emphasis actions:

- Edit.
- More menu.
- Clear filters.

### Danger

Use for destructive actions:

- Delete.
- Void Invoice.

## 12.2 Button Labels

Use verb-first labels:

```text
Start Timer
Stop Timer
Add Time
Save Client
Create Invoice
Import Time
Download PDF
Mark Sent
Mark Paid
Void Invoice
```

Avoid vague labels such as `OK`, `Submit`, or `Proceed` where a specific verb is available.

## 12.3 Icon Buttons

Icon-only buttons require:

- Accessible name.
- Tooltip where meaning is not universally obvious.
- Minimum 40–44 px target size for important actions.

---

# 13. Forms

## 13.1 Form Layout

Use visible labels above fields by default.

Recommended order:

```text
Label
Input
Help text or validation error
```

Do not rely on placeholders as labels.

## 13.2 Field Width

Use widths that reflect content:

- Currency: compact.
- Hourly rate: compact.
- Date: compact.
- Client/project selectors: medium/full.
- Address/notes: full width.

## 13.3 Required Fields

Required status should be clear but restrained.

Use:

- Required marker where necessary.
- Validation on save/blur as appropriate.
- Explicit error text.

## 13.4 Validation

Error presentation should include:

- Error border/state.
- Text explanation.
- Focus movement to the first invalid field on submit when appropriate.

Color alone is insufficient.

## 13.5 Disabled vs Read-Only

Use disabled controls when interaction is unavailable.

Use read-only displays when values should remain legible/selectable, such as locked Paid invoice fields.

---

# 14. Selectors: Client, Project, Task

These selectors appear throughout Verilio and should share a common component pattern.

## 14.1 Client Selector

Should support:

- Search.
- Client name.
- Optional currency metadata where useful.
- Archived clients excluded by default.

## 14.2 Project Selector

Must be constrained by selected client.

Display:

- Project name.
- Optional project color indicator.

When no client is selected, the project selector should communicate that a client must be chosen first.

## 14.3 Task Selector

Must be constrained by selected project.

Task remains optional.

## 14.4 Empty Selector States

Example:

```text
No projects for this client.
Create Project
```

Where practical, creation can be offered inline or through a clear navigation path.

---

# 15. Toggle and Checkbox Patterns

## 15.1 Billable Toggle

Billable state is financially meaningful.

Use an explicit label:

```text
Billable
```

Avoid a standalone unlabeled icon.

The current state should remain clear both on and off.

## 15.2 Bulk Selection

Use checkboxes for selecting time entries during invoice import.

Requirements:

- Row checkbox.
- Select all visible/eligible entries.
- Selected count visible.
- Summary updates as selection changes.

---

# 16. Date Controls

Date filtering is a core UX requirement.

## 16.1 Date Range Component

Use a shared date-range control for:

- Timesheet.
- Reports.
- Invoice import.

Presets may include:

```text
Today
Yesterday
This week
Last week
Past two weeks
This month
Last month
Custom range
```

## 16.2 Date Range Display

Display the resolved range clearly:

```text
Aug 1 – Aug 31, 2026
```

Avoid hiding the active range only inside a dropdown.

## 16.3 Invoice Dates

Issue date and due date are date-only values.

Use date controls that do not imply timezone-sensitive timestamps.

---

# 17. Time Inputs and Duration Inputs

## 17.1 Time-of-Day Input

Use localized 12h/24h formatting based on future preference settings or environment defaults.

## 17.2 Duration Input

If duration-only manual entry is supported, accept a user-friendly format such as:

```text
1:30
1h 30m
90m
```

The parser behavior belongs in implementation specifications, but the UI should normalize the saved/displayed value consistently.

## 17.3 Duration Display

Recommended display:

```text
1h 47m
38h 17m
```

Use clock-style display for the running timer:

```text
01:47:23
```

This distinction makes live elapsed time feel active while reports remain readable.

---

# 18. Timer Component

The Timer is the highest-frequency interaction in Verilio.

## 18.1 Idle Timer Layout

Recommended structure:

```text
[ What are you working on?                         ]
[ Client ] [ Project ] [ Task ] [ Billable ] [ START ]
```

On narrower screens, stack fields without compromising Start visibility.

## 18.2 Running State

Running state should be unmistakable.

Display:

- Running indicator.
- Description.
- Client/project/task.
- Elapsed duration with tabular numerals.
- Stop action.

### Proposed visual treatment

- Accent border or subtle accent surface.
- Elapsed duration receives strong typographic emphasis.
- Stop action is distinct from Start.

Do not use aggressive flashing or continuous animation.

## 18.3 Start and Stop Color Semantics

Do not automatically treat Stop as a destructive-danger action.

Stopping a timer is a normal workflow action, not deletion.

Recommended:

- Start: primary accent.
- Stop: strong neutral or controlled contrasting treatment.

## 18.4 Persistence Feedback

After stop/save:

```text
Time entry saved
```

Use brief non-blocking feedback.

---

# 19. Tables and Dense Data Views

Tables are central to Timesheet, Reports, Clients, Projects, and Invoices.

## 19.1 Table Principles

- Compact rows.
- Sticky header when long data requires it.
- Strong numeric alignment.
- Clear hover/focus state.
- Row actions remain discoverable.
- No unnecessary vertical card wrapping around every row.

## 19.2 Alignment

Recommended:

```text
Text / names       left
Dates              left or center, consistently
Durations          right
Rates              right
Currency amounts   right
Status             left/center
Actions            right
```

## 19.3 Row Actions

Common actions can use an overflow menu:

```text
Edit
Duplicate
Start Timer From Entry
Archive
Delete
```

High-frequency actions may remain visible if testing shows value.

## 19.4 Responsive Tables

On small screens:

- Prioritize essential columns.
- Collapse secondary metadata into a stacked row detail.
- Do not shrink text below accessible reading sizes.
- Avoid forcing the entire desktop table into an unreadable width.

---

# 20. Timesheet Design Pattern

## 20.1 Date Group

Each group should show:

```text
Monday, Aug 31                         6h 12m
```

The total should align consistently across groups.

## 20.2 Entry Row

Recommended visual hierarchy:

```text
Fix resize limits                     1h 47m
M4Trade · Windows · Bug Fix           Billable · Not invoiced
10:15 AM – 12:02 PM
```

Desktop table layout may place these values in columns rather than stacked text.

## 20.3 Invoice State

Use an explicit small status label:

```text
Not invoiced
Invoiced
```

If invoiced, allow navigation to the associated invoice where practical.

---

# 21. Status Badges

Badges should be compact and semantic.

## 21.1 Invoice Badges

Required labels:

```text
Draft
Sent
Paid
Overdue
Void
```

## 21.2 Entity Badges

```text
Active
Archived
```

Active may often be implicit and does not need a badge everywhere.

## 21.3 Time Badges

```text
Billable
Non-billable
Invoiced
Not invoiced
```

Avoid combining too many badges in one row. Where density becomes high, use text/icon pairs or a compact secondary line.

---

# 22. Filters

## 22.1 Filter Bar

Reports and data lists should share a consistent filter pattern.

Recommended order for Reports:

```text
Date Range | Client | Project | Task | Billable | Invoice Status | Clear
```

## 22.2 Active Filter Visibility

A user should be able to understand the current report context without reopening each control.

Selected values should remain visible in closed controls.

## 22.3 Clear Filters

Provide a single `Clear filters` action when filters differ from defaults.

---

# 23. Report Summary Metrics

Summary metrics should not become a dashboard of decorative cards.

Recommended composition:

```text
Total tracked     42h 32m
Billable          38h 17m
Non-billable       4h 15m
Billable value    $3,253.25
```

Possible presentation:

- One compact horizontal metric strip on desktop.
- 2×2 grid on tablet.
- Stacked rows on narrow screens.

Use typography and spacing rather than heavy card borders for separation.

---

# 24. Charts

The PRD requires initial report charts for:

- Hours by day.
- Hours by project.

## 24.1 Chart Principles

- Charts supplement numeric data; they do not replace it.
- Axis labels must be readable.
- Tooltips must be keyboard-accessible where feasible.
- Use a limited semantic palette.
- Do not encode important differences by hue alone.
- Include textual values or table alternatives for accessibility.

## 24.2 Hours by Day

Recommended:

- Bar chart for discrete daily duration.
- Consistent duration axis.
- Selected report date range clearly visible.

## 24.3 Hours by Project

Recommended:

- Horizontal bar chart for readable project labels.
- Project color may be used if defined, but should not be the only identifier.

## 24.4 Multi-Currency Reports

Financial charts must not aggregate incompatible currencies into one monetary series unless currency conversion is explicitly implemented later.

---

# 25. Empty States

Empty states should guide the next useful action.

## 25.1 First Client

```text
No clients yet.
Create your first client to organize projects and billable work.
[ Create Client ]
```

## 25.2 First Project

```text
No projects yet.
Create a project for this client before tracking project time.
[ Create Project ]
```

## 25.3 No Time Entries

```text
No time tracked for this period.
[ Start Timer ]  [ Add Time ]
```

## 25.4 No Invoiceable Time

```text
No billable, uninvoiced time found for this client and date range.
```

Do not imply an error if the empty result is legitimate.

---

# 26. Dialogs and Drawers

## 26.1 When to Use Dialogs

Use dialogs for focused, short-lived tasks:

- Delete confirmation.
- Archive confirmation.
- Void invoice confirmation.
- Small create/edit forms if context benefits from staying on the page.

## 26.2 When to Use Full Pages

Prefer full pages for:

- Invoice editor.
- Business settings.
- Complex project detail.
- Detailed reports.

## 26.3 Dialog Actions

Order actions consistently.

Example:

```text
Cancel   Delete
```

The danger action must have explicit wording.

## 26.4 Focus Behavior

Dialogs must:

- Move focus inside on open.
- Keep keyboard focus within the dialog while active.
- Return focus to the invoking control on close.

---

# 27. Notifications and Feedback

## 27.1 Toasts / Non-Blocking Feedback

Appropriate for:

- Time entry saved.
- Client created.
- Invoice marked sent.
- Invoice marked paid.
- CSV export prepared.

## 27.2 Inline Feedback

Prefer inline messaging for:

- Validation.
- Invoice calculation errors.
- Timer persistence errors.
- Protected invoiced time-entry edits.

## 27.3 Undo

Where safe, consider undo for low-risk archive operations.

Do not rely on undo instead of explicit confirmation for financial/destructive operations such as Void invoice.

---

# 28. Loading States

## 28.1 Page Loading

Use skeletons for structured list/table content where beneficial.

Avoid large spinners that replace an entire page if partial layout can remain stable.

## 28.2 Action Loading

Buttons performing saves should:

- Enter a loading state.
- Prevent duplicate submission.
- Preserve label meaning where possible.

Example:

```text
Saving…
Generating PDF…
Importing…
```

## 28.3 Timer Loading

Timer start/stop requires clear authoritative feedback.

Do not optimistically show a timer as running if persistence failed.

---

# 29. Client and Project Color Usage

Projects may have an optional color.

### Proposed Usage

Use project color as a small secondary identifier:

- Dot.
- Short accent stripe.
- Chart series marker.

Do not fill entire rows/cards with project color.

A project remains identifiable by text when color is unavailable.

---

# 30. Invoice Editor

The invoice editor is a high-stakes data-entry screen and should feel more deliberate than ordinary CRUD forms.

## 30.1 Proposed Structure

```text
Invoice header
├── Client
├── Invoice number
├── Issue date
└── Due date

Line items
├── Imported tracked time
└── Manual items

Totals
├── Subtotal
├── Tax
├── Discount
└── Total

Notes / payment terms

Actions
├── Save Draft
├── Preview / Download PDF
└── Mark Sent (when valid)
```

## 30.2 Imported Time

Imported time should visibly indicate its origin.

Example:

```text
Windows — 18.25 h × $85.00
Source: 12 time entries
```

Allow access to source time entries where practical to preserve traceability.

## 30.3 Line Item Table

Suggested columns:

```text
Description | Quantity | Rate | Amount | Actions
```

Right-align numeric columns.

## 30.4 Totals

Totals should be visually anchored on the right on desktop.

Example:

```text
Subtotal        $3,251.25
Tax                 0.00
Discount            0.00
────────────────────────
Total           $3,251.25
```

`Total` receives the strongest emphasis.

---

# 31. Invoice Status Actions

## Draft

Primary actions:

- Save changes.
- Download/preview PDF if valid.
- Mark Sent.
- Void.

## Sent

Primary actions:

- Download PDF.
- Mark Paid.
- Void.

## Paid

The PRD states paid invoices should be immutable in MVP.

Presentation:

- Read-only invoice fields.
- Paid badge.
- Paid date.
- Download PDF remains available.

## Void

Presentation:

- Clear Void label.
- Read-only historical view.
- Explain that source time is available for invoicing again.

---

# 32. Invoice PDF Visual Specification

The PDF is both a product output and part of Verilio's brand.

## 32.1 PDF Character

It should feel:

- Professional.
- Minimal.
- Easy to scan.
- Suitable for sending directly to a client.

## 32.2 Page Structure

Recommended:

```text
Verilio / Business identity                  INVOICE
Business contact                             Invoice #
                                             Issue date
                                             Due date

Bill To
Client name
Client address

Description                 Qty/Hours      Rate       Amount
────────────────────────────────────────────────────────────
...

                                      Subtotal      $...
                                      Tax           $...
                                      Discount      $...
                                      Total         $...

Notes
Payment terms
```

## 32.3 PDF Typography

Use print-safe typography and high contrast.

Avoid tiny type.

Suggested minimum body size:

```text
9–10 pt
```

## 32.4 PDF Color

The invoice should remain readable if printed in grayscale.

Brand accent may be used sparingly for:

- Wordmark.
- Divider.
- Total emphasis.

Do not rely on color for invoice status or financial meaning.

## 32.5 Determinism

The visual template must render from saved invoice snapshots, not live mutable client/project data.

---

# 33. Navigation and Keyboard Interaction

## 33.1 Keyboard-Friendly Forms

The PRD explicitly prioritizes keyboard-friendly forms where practical.

Requirements:

- Logical tab order.
- Enter submits only when safe/expected.
- Escape closes dialogs/popovers where appropriate.
- Searchable selectors support keyboard navigation.

## 33.2 Keyboard Shortcuts

Global shortcuts are not required by the PRD.

### Recommendation

Do not add global shortcuts in early MVP unless there is a clear high-frequency benefit and no browser conflict.

Potential later shortcut:

```text
Start/stop timer
```

but only after explicit UX testing.

---

# 34. Accessibility Specification

## 34.1 Target

Aim for WCAG 2.2 AA where practical, consistent with the product requirements.

## 34.2 Focus

Every interactive element must provide a visible focus indicator.

Do not remove browser focus outlines without a replacement.

## 34.3 Labels

Inputs, toggles, checkboxes, selects, and icon buttons require accessible labels.

## 34.4 Contrast

Text and essential controls must meet AA contrast requirements.

Status badges should be checked in both normal and disabled/read-only contexts.

## 34.5 Motion

Respect `prefers-reduced-motion`.

The running timer should not require animation to communicate activity.

## 34.6 Tables

Use semantic table markup for true tabular data.

Provide:

- Header associations.
- Accessible names for row actions.
- Logical reading order.

## 34.7 Charts

Charts require a textual or tabular equivalent for essential values.

## 34.8 Error Messages

Errors must be announced appropriately and remain visually associated with the relevant field.

---

# 35. Responsive Behavior

## 35.1 Desktop

Primary layout target.

Recommended content width strategy:

- Fluid main region.
- Sensible max-width for forms/settings.
- Full available width for Timesheet, Reports, and Invoice tables.

## 35.2 Tablet

Requirements:

- Sidebar may collapse.
- Filter bars may wrap.
- Tables may reduce nonessential columns.
- Invoice totals remain readable without horizontal clipping.

## 35.3 Mobile Web

The PRD does not require full mobile optimization initially, but the design system should preserve usability for:

- Current timer.
- Start/stop timer.
- Manual time entry.

Recommended mobile navigation:

- Collapsible menu rather than permanently compressed desktop sidebar.

Do not force desktop table density onto narrow screens.

---

# 36. Content and Microcopy

## 36.1 Voice

Use concise, direct language.

Prefer:

```text
Create Client
Add Time
No invoiceable time found
Mark Paid
```

Avoid:

```text
Successfully execute creation
No records available at this moment
Proceed with payment completion
```

## 36.2 Financial Language

Use consistent terms:

```text
Billable
Non-billable
Invoiced
Not invoiced
Invoice
Amount
Rate
Subtotal
Tax
Discount
Total
Paid
```

Do not alternate between `billed` and `invoiced` for the same state unless there is a defined difference.

## 36.3 Time Language

Use:

```text
Tracked time
Duration
Start
End
Running
Stopped
```

---

# 37. Iconography

Use one consistent icon family.

Icons should be simple outline or restrained filled forms.

Common concepts:

- Timer/play.
- Stop.
- Calendar.
- Client/person/business.
- Project/folder.
- Task/checklist.
- Reports/chart.
- Invoice/document.
- Download.
- Edit.
- Archive.
- Delete.
- More/overflow.

Icons support labels; they should not replace critical text labels in primary workflows.

---

# 38. Component Inventory

The initial reusable component library should include:

## Foundations

- `Text`
- `Heading`
- `Stack`
- `Inline`
- `Divider`
- `Surface`

## Actions

- `Button`
- `IconButton`
- `MenuButton`

## Forms

- `TextInput`
- `TextArea`
- `NumberInput`
- `MoneyInput`
- `DateInput`
- `TimeInput`
- `DurationInput`
- `Select`
- `SearchSelect`
- `Checkbox`
- `Switch`
- `Field`
- `FormError`

## Domain Selectors

- `ClientSelect`
- `ProjectSelect`
- `TaskSelect`
- `DateRangePicker`

## Data Display

- `Table`
- `DataTable`
- `EmptyState`
- `StatusBadge`
- `CurrencyAmount`
- `Duration`
- `ProjectMarker`

## Feedback

- `Alert`
- `Toast`
- `Skeleton`
- `Spinner`
- `InlineError`

## Overlay

- `Dialog`
- `Popover`
- `DropdownMenu`
- `Tooltip`

## Verilio Domain Components

- `TimerComposer`
- `RunningTimer`
- `TimeEntryRow`
- `TimesheetDayGroup`
- `ReportFilterBar`
- `ReportMetric`
- `InvoiceStatusBadge`
- `InvoiceLineItemTable`
- `InvoiceTotals`
- `InvoiceTimeImportDialog`
- `InvoicePreview`

---

# 39. Component State Requirements

Each interactive component should define at minimum:

```text
Default
Hover
Focus
Active/Pressed
Disabled
Loading (where relevant)
Error (where relevant)
Read-only (where relevant)
```

Domain components may additionally define:

```text
Running
Billable
Invoiced
Archived
Paid
Void
```

---

# 40. Design Token Naming Convention

Recommended naming style:

```text
--color-bg-canvas
--color-bg-surface
--color-text-primary
--color-text-secondary
--color-border-default
--color-accent-default
--color-success-default
--color-warning-default
--color-danger-default

--space-1
--space-2
--space-3
...

--radius-sm
--radius-md
--radius-lg

--font-size-sm
--font-size-md
--font-size-lg
```

Components should consume semantic tokens rather than palette indexes where possible.

---

# 41. CSS / Implementation Guidance

The PRD does not mandate a styling technology.

### Recommendation

The design system should expose semantic primitives that can be implemented with:

- CSS custom properties.
- CSS Modules, vanilla CSS, Tailwind, or another project-selected strategy.

The architecture document should make the final tooling choice.

Regardless of styling technology:

- Avoid inline hard-coded color values throughout feature code.
- Centralize tokens.
- Centralize shared component variants.
- Keep domain state names consistent with product terminology.

---

# 42. Design QA Checklist

Before a feature is considered visually complete, confirm:

## Hierarchy

- Is the primary action obvious?
- Is secondary information visually secondary?
- Is financial state explicit?

## Density

- Does the screen remain readable with realistic data volume?
- Are tables compact without feeling cramped?

## State

- Can the user distinguish billable/non-billable?
- Can the user distinguish invoiced/uninvoiced?
- Can the user distinguish Draft/Sent/Paid/Void?
- Is archived state explicit where relevant?

## Accessibility

- Can the workflow be completed by keyboard?
- Are labels present?
- Is focus visible?
- Is meaning preserved without color?
- Is contrast sufficient?

## Responsiveness

- Does desktop layout use available space well?
- Does tablet layout reflow without clipped primary actions?
- Can timer/manual time remain usable on mobile web?

## Integrity

- Are currencies always shown with monetary totals?
- Are durations clearly distinct from money?
- Does invoice display use saved/snapshotted values?

---

# 43. Screen-Level Design Guidance

## Timer

Design priority:

```text
Description → Client/Project/Task → Billable → Start/Stop
```

The elapsed timer is the dominant state when running.

## Timesheet

Design priority:

```text
Date context → entries → duration totals → edit actions
```

## Clients

Design priority:

```text
Search/filter → client identity → currency/status → edit/archive
```

## Projects

Design priority:

```text
Client context → project identity → rate/billable defaults → tasks
```

## Reports

Design priority:

```text
Date/filter context → summary values → chart → detailed/grouped data
```

## Invoices

Design priority:

```text
Invoice state → client/date context → line items → totals → lifecycle actions
```

## Settings

Design priority:

```text
Business identity → billing defaults → invoice defaults
```

---

# 44. What the Design System Must Not Introduce

The design system must not imply unsupported MVP features such as:

- Teams.
- Assignees.
- Employee avatars/presence.
- Approvals.
- GPS/location.
- Screenshots.
- Payroll.
- Scheduling.
- Resource planning.
- Time off.
- Multi-company switching.

Do not add UI chrome for features that are explicitly outside MVP scope.

---

# 45. Proposed Initial Visual Direction Summary

The initial Verilio UI should look and feel like a focused professional work ledger rather than an enterprise operations dashboard.

Recommended characteristics:

```text
Neutral canvas
White/light surfaces
Restrained indigo accent
Strong dark text
Compact typography
Tabular numerals
Subtle borders
Minimal shadows
Dense readable tables
Small explicit status badges
Clear date filters
High-confidence invoice totals
```

The design should convey:

```text
"I know what I worked on."
"I know what it is worth."
"I know what I have invoiced."
"I know what has been paid."
```

---

# 46. Definition of Design-System Ready

The design system is ready to support MVP implementation when it provides stable patterns for:

1. Application navigation.
2. Page headers.
3. Typography.
4. Semantic colors.
5. Spacing.
6. Buttons.
7. Forms and validation.
8. Client/project/task selectors.
9. Date/time/duration inputs.
10. Timer idle/running states.
11. Tables and row actions.
12. Timesheet date groups.
13. Report filters and summary metrics.
14. Report chart styling.
15. Status badges.
16. Dialogs and confirmations.
17. Invoice editor.
18. Invoice status presentation.
19. Invoice totals.
20. Invoice PDF layout.
21. Empty/loading/error feedback.
22. Accessibility states.
23. Desktop/tablet/mobile-web reflow rules.

---

# 47. Relationship to Subsequent Documents

This document defines **how Verilio should look and behave consistently**, but it does not define the final engineering implementation.

The next architecture document should decide:

- Styling technology.
- Component-library structure.
- Token implementation.
- Chart library.
- Date/time libraries.
- Form architecture.
- Accessibility tooling.
- Invoice/PDF rendering technology.

The implementation plan should then map these components to milestones and feature work.

---

# 48. Final Design Principle

Verilio should visually reinforce the product promise:

> **Track your work. Bill with confidence.**

Every major interface should make one or more of these things clearer:

```text
What am I doing?
How long did it take?
Who was it for?
Is it billable?
What is it worth?
Has it been invoiced?
Has it been paid?
```

If a visual element does not improve clarity, speed, trust, or hierarchy, it should be reconsidered.
