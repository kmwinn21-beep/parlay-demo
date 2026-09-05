# Companies table in Conference Details — structure, styling and behaviour

Reference for the Companies tab of `/conferences/[id]`. Written ahead of the
"group by parent company" view so that work reuses what is here rather than
reinventing it.

Every figure is either quoted source or measured live in Chromium at 1600×1000
on `/conferences/1` → Companies tab. Line numbers are as of commit `9b35ebc`.

---

## 1. Where it lives

### Component chain

| Role | File | Lines |
|---|---|---|
| Tab host (route `/conferences/[id]`) | `app/conferences/[id]/page.tsx` | 4692 |
| **The table itself** | `components/CompanyTable.tsx` | 1563 |
| Shared card-row styling primitives | `components/tableCards.tsx` | 189 |
| Mobile card shell | `components/MobileCardList.tsx` | 23 |
| Count pills (Attendees / Conferences) | `components/CountPills.tsx` | 139 |
| Parent/child glyph inside the type pill | `components/EntityStructureIcon.tsx` | 25 |
| Inline-edit chrome + the `+ Type` placeholders | `components/InlineEditField.tsx` | 70 |
| Per-row kebab | `components/RowActionsKebab.tsx` | 217 |
| Rep picker (SF Owner cell) | `components/RepMultiSelect.tsx` | 196 |
| Attendees drawer (opened by the attendee pill) | `components/CompanyAttendeesDrawer.tsx` | 278 |
| Custom (admin-defined) column cell | `components/CustomColumnCell.tsx` | 157 |
| Horizontal scroller used by the mobile card | `components/ScrollRow.tsx` | 66 |
| Colour system (`getBadgeClass`, `getPreset`) | `lib/colors.ts` | 168 |
| Column order/visibility registry | `lib/useTableColumnConfig.ts` | 295 |
| Bulk parent/child modal | `components/ParentChildModal.tsx` | 260 |

There is **no separate row component**. `CompanyTable.tsx` renders `<thead>`,
`<tbody>` and every cell inline via a `switch (col.key)`. The desktop table and
the mobile card list are two separate JSX blocks in the same file.

### Mount point — `app/conferences/[id]/page.tsx:3768`

```jsx
{activeTab === 'companies' && (
  <div className="card">
    {isLoadingCompanies ? (
      <div className="flex justify-center py-12 min-h-[70vh] items-start">
        <div className="animate-spin w-6 h-6 border-4 border-brand-secondary border-t-transparent rounded-full" />
      </div>
    ) : (
      <CompanyTable
        companies={conferenceCompanies}
        onRefresh={loadCompanies}
        tableName="conference_companies"
        onDecoupleSelected={handleDecoupleCompanies}
        conferenceAttendees={conference?.attendees}
        conferenceLabel={...}
        conferenceId={conference?.id}
      />
    )}
  </div>
)}
```

`CompanyTable` is **shared with the standalone `/companies` page**. The
conference variant is distinguished only by `tableName="conference_companies"`
(separate admin column config) and by `conferenceId` being non-null, which is
what enables the kebab column and the clickable attendee pill.

### Markup type

A **real `<table>`** with `tableLayout: 'fixed'`, `border-collapse: separate`,
`border-spacing: 0px 8px`. Not a grid, not divs.

```
<div className="card">                                    ← page-level, p-6
  <div ref={companyTableRef} className="hidden lg:block bg-gray-50 rounded-lg px-2">   ← CARD_TABLE_WRAP
    <div className="overflow-x-auto">                      ← CARD_TABLE_SCROLL_X
      <table className="w-full text-sm border-separate [border-spacing:0_0.5rem]" style={{tableLayout:'fixed'}}>
```

The `px-2` inset is on the **non-scrolling** wrapper, deliberately — padding on
the scrollport would be inside it and cards would slide through the margin.

### Data source

`loadCompanies` (`page.tsx:972`) fetches **`/api/companies`** (all companies),
filters to the ids present in `conference.attendees`, then overrides
`attendee_count` / `attendee_summary` with conference-scoped counts. There is no
conference-specific companies endpoint.

`/api/companies` already returns `parent_company_id`, `parent_company_name`, and
a derived `entity_structure` (`'Parent' | 'Child' | null`, computed in SQL at
`app/api/companies/route.ts:66-79`), and `loadCompanies` spreads `...c`, so all
three reach the table.

---

## 2. The row

### Column inventory, left to right

Order and visibility come from `useTableColumnConfig('conference_companies')`;
the registry default order is `lib/useTableColumnConfig.ts:158-169`. Widths come
from `DEFAULT_WIDTHS` (`CompanyTable.tsx:137`) and are user-resizable by drag.

| # | Column | Displays / field | Width | Align | Empty state |
|---|---|---|---|---|---|
| 0 | Selection | checkbox | `selectionColumnWidth(true)` = **40px** | left, `ml-3` | always shown |
| 1 | `name` | `company.name` + parent subtitle | **220px** (`maxWidth`), **sticky left: 40px** | left | — |
| 2 | `type` | `company.company_type` + entity glyph | **160px** | left | `+ Type` |
| 3 | `sfowner` | `parseRepIds(assigned_user)` → initials pills | **140px** | left | `+ Rep` |
| 4 | `status` | `status` CSV + `my_user_status_ids` | **140px** | left | `+ Status` |
| 5 | `attendees` | `attendee_count` (conference-scoped) | **110px** | left | `badge-gray` with `0` |
| 6 | `conferences` | `conference_count` | **120px** | left | `conferenceBadgeClass(0)` with `0` |
| 7 | `wse` | `company.wse`, header label `{unitTypeLabel}'s` | **110px** (uses `colWidths.actions`) | left | `+ {unitTypeLabel}` |
| 8 | `value` | `formatValuePill(wse, avgCostPerUnit)` | **120px** | left | `<span className="text-gray-300">—</span>` |
| 9 | `updated_on` | `fmtDate(updated_at)` | **110px** | left | `—` from `fmtDate` |
| 10 | `relationships` | `relationship_count` | `w-24` = **96px** | left | renders **nothing** |
| 11..n | custom columns | `col.data_key` | `minWidth: 120` | left | per `CustomColumnCell` |
| last | kebab | `RowActionsKebab` | **48px**, **sticky right: 0** | `px-2` | always (only when `conferenceId != null`) |

Header widths measured live: `40, 220, 160, 140, 140, 110, 120, 110, 120, 110, 96, 48`.

### The `+ Type` / `+ Rep` / `+ Unit` placeholders

Two distinct implementations. The shared one —
`components/InlineEditField.tsx:66-70`:

```jsx
/** Placeholder shown in an empty cell, matching the SF Owner "+ Rep" affordance. */
export function InlineEditPlaceholder({ label }: { label: string }) {
  return (
    <span className="text-[10px] text-gray-300 hover:text-gray-400 transition-colors">+ {label}</span>
  );
}
```

Used by Type, Status and Units. The conditionals:

```jsx
// Type — CompanyTable.tsx:1290
{company.company_type
  ? <span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}><EntityStructureIcon structure={company.entity_structure} />{company.company_type}</span>
  : <InlineEditPlaceholder label="Type" />}

// Status — CompanyTable.tsx:1354  (both global and user-scoped lists must be empty)
{(company.status || '').split(',').map(s => s.trim()).filter(s => s && s !== 'Unknown').length === 0 && (company.my_user_status_ids || []).length === 0 && <InlineEditPlaceholder label="Status" />}

// Units — CompanyTable.tsx:1382
{company.wse != null ? ( ...pill... ) : <InlineEditPlaceholder label={unitTypeLabel} />}
```

**SF Owner does not use the shared component** — it has its own copy with the
same classes (`CompanyTable.tsx:1325`):

```jsx
{!company.assigned_user && (
  <span className="text-[10px] text-gray-300 hover:text-gray-400 transition-colors">+ Rep</span>
)}
```

All measured at `fontSize: 10px`, `color: rgb(209,213,219)` (gray-300).

### Row JSX

`CompanyTable.tsx:1237-1428`. Preceded by (`:1226-1236`):

```jsx
const rowSelected = selectedIds.has(company.id);
const frozenBg = '';
const dimmed = actionsCompanyId != null && actionsCompanyId !== company.id;
const focused = focusedCompanyId === company.id;
```

The row element itself:

```jsx
<tr
  key={company.id}
  onClick={onCompanyCardClick(company.id)}
  className={`group ${cardRowClass(rowSelected, focused)} ${cardEmphasisClass({ focused, otherFocused: focusedCompanyId != null && !focused, dimmed })}`}
>
```

---

## 3. Styling specifics

### Rows are individually rounded cards, not a continuous body

Because a `<tr>` cannot take a border-radius, **all card styling is applied to
the cells** via arbitrary child selectors, and the gap between rows is
`border-spacing`. From `components/tableCards.tsx`:

```js
export const CARD_TABLE_WRAP    = 'bg-gray-50 rounded-lg px-2';
export const CARD_TABLE_SCROLL_X = 'overflow-x-auto';
export const CARD_TABLE_HEAD    = '[&>tr>th]:bg-gray-50';
export const CARD_TABLE         = 'border-separate [border-spacing:0_0.5rem]';

export function cardRowClass(selected: boolean, focused = false): string {
  return [
    '[&>td]:transition-colors [&>td]:border-y [&>td]:border-gray-200',
    '[&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg',
    '[&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg',
    focused
      ? '[&>td]:bg-brand-highlight/25 [&>td]:border-gray-500'
      : selected
        ? '[&>td]:bg-blue-50 [&>td]:border-brand-secondary/40'
        : '[&>td]:bg-white sm:[&:hover>td]:bg-brand-highlight/20',
  ].join(' ');
}
```

### Measured values

| Property | Value |
|---|---|
| Row height | **58px** (single-line name; grows — the name wraps) |
| Gap between rows | **8px** — `border-spacing: 0px 8px`, *not* margin or border |
| Cell vertical padding | **12px** top / **12px** bottom (`py-3`) — every column |
| Cell horizontal padding | **12px** (`px-3`) for data columns; **1px** for the checkbox column (checkbox offset by `ml-3`); **8px** for the kebab column (`px-2`) |
| Border radius | **8px** — left corners on `td:first-child`, right corners on `td:last-child`; middle cells `0px` |
| Border | **1px solid `rgb(229,231,235)`** (gray-200), `border-y` on all cells + `border-l` on first + `border-r` on last |
| Row fill | `rgb(255,255,255)` |
| Table ground | `rgb(249,250,251)` (gray-50), `rounded-lg` (8px), `px-2` inset |
| Vertical align | `middle` |
| Row transition | `opacity 0.2s cubic-bezier(0,0,0.2,1)`; cells separately `transition-colors` |

### States

| State | Trigger | Measured |
|---|---|---|
| Hover | pointer, `sm:` and up only | cell bg → `rgba(110, 231, 183, 0.2)` (brand-highlight at 20%) |
| Selected | checkbox | cell bg → `rgb(239, 246, 255)` (blue-50) |
| Focused ("picked") | click on row background | cell bg → `rgba(110, 231, 183, 0.25)`, border → `rgb(107,114,128)` (gray-500); **all other rows drop to `opacity: 0.2`** |
| Dimmed | another row's kebab is open | `opacity: 0.4` |

**Known bug (out of scope, separate pass):** the *selected* state's intended
border (`[&>td]:border-brand-secondary/40`) **does not render**. Both it and
`[&>td]:border-gray-200` are same-specificity arbitrary variants, and Tailwind
emits `border-brand-secondary/40` *before* `border-gray-200`, so gray-200 wins.
Measured on a selected row: `borderTopColor: rgb(229,231,235)` on every cell.
The focused state's `border-gray-500` *does* win (later in palette order).

### Sticky columns

| Cell | position | offset | z-index |
|---|---|---|---|
| checkbox `td` | sticky | `left: 0px` | 10 |
| name `td` | sticky | `left: 40px` (computed by `companyNameStickyLeft`) | 10 |
| kebab `td` | sticky | `right: 0px` | 10 |
| matching `th`s | sticky | same | **30**, `bg-gray-50` |

The header row is **not** vertically sticky — `CARD_TABLE_HEAD`, not
`CARD_TABLE_STICKY_HEAD`. Comment at `CompanyTable.tsx:1182-1186` says this is
deliberate: the table grows with the page rather than scrolling in a capped
height, and a pinned header would collide with the already-pinned conference tab
bar.

### Typography — company name vs. parent subtitle

Company name (`CompanyTable.tsx:1250`):

```jsx
className="font-medium text-brand-secondary hover:underline text-sm break-words whitespace-normal leading-snug text-left"
```

Measured: `14px / weight 500 / rgb(58,80,107) / line-height 19.25px`.

Parent company subtitle — the smaller gray line under a child company
(`CompanyTable.tsx:1256-1268`):

```jsx
{company.parent_company_name && company.parent_company_id != null && (
  <p className="text-[10px] text-gray-400 mt-0.5">
    <button
      type="button"
      onClick={() => openQuickView(company.parent_company_id!, company.name)}
      className="hover:text-brand-secondary hover:underline text-left"
    >
      {company.parent_company_name}
    </button>
  </p>
)}
```

`10px`, `text-gray-400`, `margin-top: 2px`. It is a **button, not a link** — it
opens the parent in the same quick-view drawer, passing the child's name so the
drawer can render "Parent of {child}". The identical block exists in the mobile
card at `:1013-1023`.

### Header cells

`thCls` (`CompanyTable.tsx:634`):

```js
'px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-brand-primary whitespace-nowrap relative'
```

Non-sortable headers use the same string minus `cursor-pointer
hover:text-brand-primary`. Sortable keys are `name | company_type | status |
attendee_count | conference_count`.

---

## 4. Pills and badges

### Company type pill

```jsx
<span className={`${getBadgeClass(company.company_type, colorMaps.company_type || {})} inline-flex items-center gap-1`}>
  <EntityStructureIcon structure={company.entity_structure} />
  {company.company_type}
</span>
```

`getBadgeClass` (`lib/colors.ts:139`) returns `inline-flex px-2 py-0.5
rounded-lg text-xs font-semibold ` + the preset's `badgeClass`. So the pill is
**`rounded-lg` (8px), not a full pill** — unlike the count/rep pills, which are
`rounded-full`.

Colour is **admin-driven**: the value is looked up in `colorMaps.company_type`
(from `config_options` category `company_type`) and mapped through `getPreset` to
one of 11 presets (`lib/colors.ts:20-108`); each `badgeClass` is
`bg-{c}-100 text-{c}-{700|800} border border-{c}-300`. Unset colour falls back to
**gray**. `'Competitor'` is special-cased to red regardless of config
(`colors.ts:141`).

Measured on a live "Operator" pill with no colour configured:

```
fontSize: 12px   fontWeight: 600   padding: 2px 8px
radius:   8px    bg: rgb(243,244,246)   color: rgb(75,85,99)   border: 1px solid rgb(209,213,219)
box:      69 x 22
```

`EntityStructureIcon` (`components/EntityStructureIcon.tsx`) draws a 12×12 inline
SVG inside the pill — a building glyph for `'Parent'`, a house/arrow glyph for
`'Child'`, `null` otherwise.

`'Competitor'` additionally wraps the pill in `CompetitorTypePill`
(`CompanyTable.tsx:68-92`), adding a hover tooltip for the competitor sub-type.
**The desktop table does not use this wrapper** — only the mobile card (`:1053`)
and two other call sites do.

### Other pills in the row

| Pill | Classes | Measured |
|---|---|---|
| Attendee count | `.badge-gray` = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700`; clickable adds `hover:ring-2 hover:ring-brand-secondary/40 transition-shadow` | 12px / 500 / radius 9999px / pad 2px 10px |
| Conference count | `conferenceBadgeClass(n)` — **count-graded**: ≥4 green, 3 yellow, 2 blue, else gray; `min-w-[1.5rem] px-2 py-0.5 rounded-full text-xs font-semibold` | 12px / 600 / radius 9999px / pad 2px 8px / min-width 24px |
| Rep initials | `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium` + `getPreset(colorMaps.user?.[…]).badgeClass`, 12×12 person SVG at `opacity-70` | 10px, rounded-full |
| Units (WSE) | `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200` + thermometer SVG | hardcoded yellow |
| Value | `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap` | hardcoded green |
| Relationships | `inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200` — a **button**, opens a popup | hardcoded green |
| Status | `getBadgeClass(s, colorMaps.status)` per value, wrapped in `flex flex-wrap gap-1` | config-driven |

Both count pills come from `components/CountPills.tsx` and carry a portal tooltip
on hover (desktop) or tap (touch, detected at runtime via
`matchMedia('(hover: hover)')`, not by breakpoint). The attendee pill's tooltip is
suppressed when `onClick` is supplied — the conference case, where clicking opens
`CompanyAttendeesDrawer`.

---

## 5. Behaviour

### Pagination

`components/CompanyTable.tsx:350-394` — filtering and sorting resolve in one
`useMemo` producing `filtered`, then:

```jsx
const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
```

`PAGE_SIZE = 100` (`:128`), `page` state (`:236`), reset to 1 on filter/search
change (`:309-311`), pager rendered only when `filtered.length > PAGE_SIZE`
(`:1443-1454`).

**Pre-existing bug:** `filterHierarchy` and `sortKey` are **not** in the
`setPage(1)` reset dep list, so changing either on page 3 leaves you on page 3 of
a possibly shorter list.

### `filterHierarchy`

State at `:235`, matcher at `:374-376`, UI at `:808-815`:

```jsx
const matchHierarchy = !filterHierarchy
  || (filterHierarchy === 'parent' && !c.parent_company_id)
  || (filterHierarchy === 'child' && !!c.parent_company_id);
```

Options are `''` (All Companies), `'parent'` (**Parent / Standalone** — lumps
true parents in with standalones), `'child'`.

### Sorting

Single-key flat sort inside the `filtered` memo. Keys: `name | company_type |
status | attendee_count | conference_count` (`SortKey`, `:124`). `status`
lowercases the raw CSV; everything else lowercases strings and compares raw.

### Row focus

`useCardFocus()` (`components/tableCards.tsx:130-150`) holds a single
`focusedId: number | null`, focuses on background click, and releases on a
`mousedown` outside `regionRef` (the desktop wrapper, `CompanyTable.tsx:1181`).
The guard:

```js
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [contenteditable="true"]';

export function isCardBackgroundClick(e: MouseEvent): boolean {
  const target = e.target as HTMLElement | null;
  return !!target && !target.closest(INTERACTIVE_SELECTOR);
}
```

`closest()` walks ancestors, so a click on an `<svg>` inside a `<button>` is
correctly ignored. Focused row keeps `opacity: 1`; **every other row drops to
`0.2`**.

### Selection

`selectedIds: Set<number>` (`:238`) is the single source, driving:

| Consumer | Line |
|---|---|
| Header "select all" — `selectedIds.size === filtered.length` | `:1192` |
| Per-row checkbox → `toggleSelect` | `:1241` desktop, `:994` mobile |
| Bulk bar visibility (`size >= 1`), Decouple (`size >= 2`) | `:726`, `:746` |
| Edit Fields → `PATCH /api/companies/bulk` | `:531` |
| Merge → `mergePickerItems` | `:475` |
| Assign Outreach → `companyIds` | `:1471` |
| Rep Relationship → `entityIds` + `entityNames` | `:1482-1483` |
| Decouple → `onDecoupleSelected(selectedIds)` → `handleDecoupleCompanies` | `:759` → `page.tsx:1379` |
| Add to Conference → `companyIds` + `companyNames` | `:1506-1507` |
| Delete → `DELETE /api/companies/{id}` per id | `:489-492` |
| Row fill (`bg-blue-50`), "Showing N of M" count | `:1225`, `:975` |

### Mobile

Entirely separate JSX (`:978-1177`): `<div className="block lg:hidden -mx-6">` →
`MobileCardList` (`bg-gray-50/50 p-2 space-y-2`) → one `MobileCard`
(`bg-white rounded-lg border border-gray-200 shadow-sm`) per company. Shares the
pill components and the parent-subtitle markup, not the column switch.

### Persistence

**`CompanyTable.tsx` persists nothing.** Zero `localStorage` /
`sessionStorage` calls. Sort, search, filters, column widths and the filter-pane
open state all reset on unmount.

The app-wide pattern elsewhere is a plain key read in a mount `useEffect`, written
on change, try/catch-wrapped in the newer call sites:
`SidebarCollapseContext.tsx:28-35`, `FloatingNavHiddenContext.tsx:127-136`,
`parlay-conferences-layout` in `app/conferences/page.tsx:329`.

### Segmented controls

**There is no shared `SegmentedControl` component.** The pattern is inlined in at
least four places. The closest precedent is the meetings group-mode control in
this same page (`app/conferences/[id]/page.tsx:3892-3913`):

```jsx
<div className="inline-flex flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden">
  {opts.map((opt, i) => (
    <button ... className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
      active ? 'bg-brand-secondary text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
    }`}>
```

### Existing grouping precedent

`MeetingsTable` already groups rows in a card table (`groupMode: 'date' | 'rep' |
'outcome'`) with collapsible sections and a `GroupHeader` component
(`MeetingsTable.tsx:844-883`). **Its group header is
`<td colSpan={tableColSpan}>`** (`:1884`) — a full-width banner, so the markup is
not reusable where per-column roll-ups must align. What is reusable is its
collapse-state shape (`isCollapsed(key)` / `toggleGroup(key)` over a `Set`) and
its `Fragment` + `key` emission structure. `React` is imported as a namespace in
`CompanyTable.tsx:3`, so `<React.Fragment key=…>` needs no new import.

---

## 6. Parent/child data

### Field availability

All three fields are present on every row at runtime. Verified live with a seeded
family:

```
{ id: 2, name: 'MorningStar Senior Living',
  parent_company_id: null, parent_company_name: null, entity_structure: 'Parent' }
{ id: 3, name: 'Twenty20 Management',
  parent_company_id: 2, parent_company_name: 'MorningStar Senior Living', entity_structure: 'Child' }
```

**Typing gap:** the conference page's own state type (`page.tsx:344`) does not
declare these three fields. They arrive at runtime and are typed by
`CompanyTable`'s `Company` interface (`:35-58`). If anyone narrows that state
type or maps instead of spreading, grouping breaks silently with no compile
error.

### Referential integrity

A child **cannot** point at a parent with no row in the companies table. Deleting
a company runs `UPDATE companies SET parent_company_id = NULL, entity_structure =
NULL WHERE parent_company_id = ?` (`app/api/companies/[id]/route.ts:456`), and
`parent_company_id` references `companies(id)`.

A child at a conference **can** have a parent that is not at that conference:
`loadCompanies` filters to companies with an attendee at this conference, so a
parent with no attendees here is filtered out while its children remain.
`parent_company_name` is still populated on the child in that case.

### Hierarchy depth

**No chains deeper than one level exist.** A query for any `child → parent →
grandparent` triple returns zero rows, and the creation path prevents them:
`POST /api/companies/parent-child` reassigns grandchildren straight to the top
parent (`route.ts:69-72`). The one contradicting signal is `MAX_GENERATIONS = 12`
in `app/api/companies/parent-child/refresh/route.ts:22`, which walks generation by
generation — the repair path is written as if chains can occur. Defensive
flattening to the topmost present ancestor is therefore correct but is expected
never to fire.

---

## 7. Decisions taken for the "group by parent company" view

Recorded here so a later session doesn't relitigate them.

| # | Decision |
|---|---|
| 1 | **Persistence** — persist via the app-wide `localStorage` pattern (`SidebarCollapseContext` shape, try/catch). Key `parlay-conference-companies-grouped`, global, not per-conference. |
| 2 | **`filterHierarchy`** — reset to `''` and hide the control while grouped; stash the prior value and restore it on return to flat. Never silently discard it. |
| 3 | **Sorting** — one extracted comparator used at both levels. Families order by the value shown on their group row (roll-up for `attendee_count`, the parent's own value otherwise). Families with no attending parent sort last within the tie. Ungrouped companies keep the flat comparator; the section boundary outranks the sort. |
| 4 | **Row focus** — do **not** register `onClick` on the group `<tr>`. That, not the chevron `<button>`, is the mechanism that stops a group header stealing focus. The button is still wanted for keyboard and semantics. |
| 5 | **Pagination** — page size becomes **100 top-level entries** (a family counts as one). Pager reads the grouped length; `groupByParent` joins the `setPage(1)` dep list. |
| 6 | **Selection** — the group checkbox includes the parent when present, and is derived (`checked` / `indeterminate` via ref callback). Pure display change; no bulk-action code touched. |
| 7 | **Mobile** — group-header card followed by **indented** child cards. Collapse `Set` shared with desktop. |
| 8 | **Default collapse** — families render **expanded**. Collapsing is the user's move. |
| 9 | **Count labels** — the "Showing N of M companies" line keeps counting companies and appends the family count, so the two units are visibly different. |
| 10 | **Scope** — conference-scoped only (`conferenceId != null`). The standalone `/companies` page does not get the view. |
