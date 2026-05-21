---
name: ui-components
description: Use when working on src/components/, src/app/(app)/ pages, styling, forms, charts, accessibility, or UX patterns. Covers the three-layer component hierarchy, design tokens, Tailwind conventions, financial UX, charts, forms, and accessibility requirements.
---

# UI Architecture — Components, Styling & UX

Source: `docs/philosophy.md` sections 21-27 (UI Architecture, Styling, UX,
Charts, Forms, Accessibility, Performance).

## Three-Layer Component Hierarchy

```
Layer 1 — Primitives (components/ui/)
    |
Layer 2 — Composed Components (components/ + domain-scoped)
    |
Layer 3 — Page Views (app/ pages)
```

**Layer 1 — Primitives:** Stateless, style-only, accessible base pieces.
`Button`, `Input`, `Card`, `Badge`, `Dialog`. Know nothing about budgets or
transactions. These are the atoms.

**Layer 2 — Composed:** Combine primitives with data. `BudgetCard`,
`TransactionRow`, `SpendingChart`. Receive data as props. Domain-scoped
components live near the feature they serve; truly shared composed components
live in `components/`.

**Layer 3 — Page Views:** Assembled from Layer 2. Handle routing params,
top-level Suspense/error boundaries. Thin.

## Component Rules

- **Single Responsibility.** A component renders one thing. `BudgetCard`
  renders a budget card; it does not also manage a delete modal.
- **Loading, error, and empty states** apply to data-bound widgets, forms,
  lists, cards, charts, and page sections. Tiny primitives (buttons, badges)
  need pending/disabled/error feedback where relevant, but not artificial empty
  states unless they render a collection.
- **Compound components for complex UI patterns** (multi-step forms, dashboard
  widgets, accordion groups).
- **Separate logic from rendering.** Extract data-fetching and derived state
  into custom hooks.
- **Co-locate state with the component that owns it.** Don't lift state higher
  than necessary. Context only for truly global concerns (theme, session,
  feature flags).

## Server vs. Client Components

- **Default to Server Components.** Opt into `"use client"` only for
  interactivity (event handlers, browser APIs, React state/effects).
- **Push `"use client"` boundary as low as possible.** Page = server component;
  interactive filter inside = client component.
- **Fetch data in Server Components.** Pass data down as props.
- Many finance screens can be server-first with small client islands for
  filters, tables, charts, and form controls.

## Styling & Design System

### Token-First Styling

All design tokens are CSS custom properties in `globals.css`. Tailwind maps
to these. One CSS variable change repaints the entire app.

### Tailwind Conventions

- **`cn()` everywhere** for conditional classes. Never string interpolation.
- **No arbitrary magic values for tokens.** If writing `text-[#3b82f6]` or
  `p-[13px]`, add it to the token system.
- **Variants via `cva`** (class-variance-authority). Define variants in one
  place, not scattered conditional strings.
- **Semantic color names.** `bg-brand-*`, `text-success`, `border-danger`.
  Never raw Tailwind palette colors (`text-red-500`) in domain components.
- **Mobile-first breakpoints.** `sm:`, `md:`, `lg:` expand upward.
- **No inline `style={{}}`** except for truly dynamic values Tailwind cannot
  express (chart colors from data, progress percentages).

### Theming

- Dark mode via `.dark` class on `<html>`.
- Never hardcode colors. Always use semantic tokens.
- Finance-specific semantic colors: income (green), expense (red), neutral —
  defined to work in both light and dark modes.

## UX Principles — Personal Finance Context

### Clarity Over Cleverness

Financial data is stressful. The UI must reduce cognitive load.

- **Surface the most important number prominently.** Net worth, budget
  remaining, spending vs. target as the largest visual element.
- **Progressive disclosure.** Show summary, hide detail. Let users drill in.
- **Labels are sacred.** Never abbreviate financial terms ambiguously.
- **Contextual comparison.** "$420 on dining — 40% over your $300 budget"
  is better than "$420 on dining" alone.

### Trust & Safety

- **Confirmation for destructive actions.** Explicit confirmation required.
- **Optimistic UI with reconciliation.** Optimistic updates must roll back
  visually and explain if the server fails.
- **Audit trail visible.** Show "last updated" and "last synced" timestamps.
- **Sensitive data masking.** Account numbers, balances — provide show/hide
  toggle. Default to masked in shared contexts.

### Make States Explicit

Every important component needs intentional states: loading, empty, error,
success, stale, disabled, partial data, syncing, offline/degraded.

### Locale & Currency Formatting

Use `Intl.NumberFormat` and `Intl.DateTimeFormat`. Never hardcode currency
symbols, decimal separators, or date orderings.

## Charts & Data Visualization

- **Charts answer a question.** No decorative charts.
- **Wrap chart library components.** Never use `<BarChart>` directly — use
  `<SpendingByCategory />` which internally uses the chart library.
- **All chart colors from CSS variables.** Never hardcode hex values.
- **Responsive containers always.** Charts adapt to container width.
- **Custom tooltips.** Match the design system.
- **Graceful empty state.** Meaningful message, not a blank or broken chart.
- **Accessibility:** `aria-label` on containers, data table alternative.

### Financial Chart Conventions

- Green for income/positive, red for expense/negative.
- Always label axes with units (months, currency).
- Bar charts for categorical comparison. Line charts for time trends.
  Donut/pie sparingly — 6 or fewer segments only.
- Pair every chart with: headline metric, comparison context, trend direction,
  date range.

## Forms & Validation

- **One Zod schema per form**, defined in the domain module. Shared between
  client and server validation.
- **Never duplicate validation logic.** Zod schema is the single source of truth.
- **Field-level error display.** Errors next to the field, not banner at top.
- **Validate on blur, not on change.**

### Financial Form Conventions

- Smart defaults (current month, monthly period).
- Currency inputs: accept various formats, normalize on blur, store as integer
  cents.
- One primary action per screen.
- Disable submit while submitting, show spinner on button.
- Reset form on successful submission.

## Accessibility

Non-negotiables (WCAG AA minimum):

- Color contrast, keyboard navigation, screen reader labels
- Semantic HTML first
- All interactive elements reachable by keyboard with logical tab order
- Visible focus states
- Label every form control
- `aria-describedby` for field errors
- Support reduced motion
- Never convey information by color alone — icons + color together
- `aria-live` via `LiveRegion` on high-impact create forms (transaction,
  account, budget); other flows may use toast plus visible UI updates alone
- Destructive confirm dialogs show inline `errorMessage` when mutations fail
  (no duplicate error toast; success may still toast)
- Destructive confirm dialogs use `trigger` + `DialogTrigger` so focus returns
  to the opening control on close

## Performance

- **LCP < 2.5s.** Fetch primary content server-side in Server Components.
- **CLS < 0.1.** Reserve space for async content with Skeleton components.
  CLS in a finance app breeds anxiety.
- **INP < 200ms.** Expensive computations in Server Components or background
  jobs, not in render. Virtualize long lists.
- **Bundle < 200 KB gzipped (main route).** Dynamic imports for heavy
  components. Named imports from large libraries.

## Self-Audit Checklist

Before completing UI work, verify:

- [ ] Component has loading, error, and empty states
- [ ] Component uses semantic color tokens, not raw Tailwind colors
- [ ] `cn()` used for conditional classes (no string interpolation)
- [ ] `"use client"` boundary pushed as low as possible
- [ ] Data fetched in Server Components, passed as props
- [ ] No business logic in components — domain functions handle decisions
- [ ] Charts wrapped in domain-specific components, colors from CSS vars
- [ ] Forms use shared Zod schema for client + server validation
- [ ] Currency inputs normalize to integer cents
- [ ] Keyboard navigable, screen reader labels present
- [ ] Destructive actions require confirmation
- [ ] Dynamic content updates use `aria-live`
- [ ] No layout shift from loading states (Skeleton with fixed dimensions)
