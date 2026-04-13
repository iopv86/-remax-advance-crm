# Plan: Login Logo Fix + Dark Mode Audit

## Summary
The login page's mobile logo renders a house icon instead of the AE brand monogram. Across all dashboard pages, hardcoded light-mode hex colors (`#FAFAF9`, `white`, `#f1f5f9`, etc.) are baked into `style={}` props and break completely in Obsidian dark mode. This plan fixes both issues surgically using the established CSS-variable system already defined in `globals.css`.

## User Story
As an agent using the CRM, I want the dark mode (Obsidian) to look as polished as light mode, and I want the login page to display the correct brand identity on all screen sizes.

## Problem → Solution
- Login mobile: house SVG in red box → AE monogram inline SVG (matching left panel + Stitch design)
- Dashboard layout: hardcoded blue gradient → `.page-bg` CSS class (already has dark override)
- All pages: `style={{ background: "#FAFAF9" }}` etc → `className="bg-background"` or CSS vars
- Contact detail: multiple `"white"` hardcoded backgrounds → `var(--card)` / `var(--background)`

## Metadata
- **Complexity**: Medium
- **Source PRD**: N/A (session backlog items)
- **PRD Phase**: N/A
- **Estimated Files**: 7 files

---

## UX Design

### Before (dark mode)
```
┌─────────────────────────────────────────┐
│ SIDEBAR (dark ✓)  │ MAIN AREA           │
│                   │ bg: bright white    │ ← broken
│                   │ #f8fbff gradient    │
│                   │                     │
│                   │ Cards: white ✗      │
│                   │ Table head: white ✗ │
│                   │ Contact 2-pane: w ✗ │
└─────────────────────────────────────────┘

LOGIN (mobile):
[🏠 house icon in red box]  ← wrong icon
```

### After (dark mode)
```
┌─────────────────────────────────────────┐
│ SIDEBAR (dark ✓)  │ MAIN AREA           │
│                   │ bg: #0D0D0D ✓       │
│                   │ page-bg gold glow   │
│                   │                     │
│                   │ Cards: #161614 ✓    │
│                   │ Table head: dark ✓  │
│                   │ Contact: dark ✓     │
└─────────────────────────────────────────┘

LOGIN (mobile):
[AE monogram svg]  ← correct
```

### Interaction Changes
| Touchpoint | Before | After | Notes |
|---|---|---|---|
| Login mobile logo | House icon in `#e11d48` box | AE monogram SVG (white stroke + red crossbar) | Same as desktop left panel |
| Dashboard main bg | Blue-tinted white gradient | `page-bg` class | Already handles dark mode |
| Contacts page bg | `#FAFAF9` | `bg-background` | CSS var |
| Pipeline page bg | `#FAFAF9` + `white` cards | `bg-background` + `bg-card` | CSS vars |
| Contact detail | Multiple `white` panes | `bg-background` / `bg-card` | CSS vars |
| Table header | `rgba(250,250,249,0.5)` | `bg-muted/50` | Tailwind |
| Filter bar | `rgba(243,244,243,0.5)` | `bg-muted/30` | Tailwind |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `app/globals.css` | 56–183 | CSS var definitions for light + dark — the source of truth for all color tokens |
| P0 | `app/globals.css` | 226–233 | `.page-bg` class — has dark mode override, use instead of gradient |
| P0 | `app/login/page.tsx` | 142–158 | Mobile logo section to replace (the `md:hidden` block) |
| P1 | `app/dashboard/layout.tsx` | 1–18 | Dashboard shell — main bg is the biggest dark mode break |
| P1 | `app/dashboard/contacts/[id]/page.tsx` | 100–470 | Most hardcoded colors — ~8 occurrences |
| P2 | `app/dashboard/pipeline/page.tsx` | 20–90 | 4 hardcoded backgrounds |
| P2 | `app/dashboard/contacts/page.tsx` | 35–45 | 1 hardcoded bg |
| P2 | `app/dashboard/properties/page.tsx` | 15–25 | 1 hardcoded bg |
| P2 | `app/dashboard/contacts/contacts-table.tsx` | 110–220 | Table head + badge bg |
| P2 | `app/dashboard/contacts/contacts-filter-bar.tsx` | 48–58 | Filter pill container bg |

---

## Patterns to Mirror

### CSS_VAR_PATTERN
```tsx
// SOURCE: app/dashboard/page.tsx:128
// GOOD: uses var(--background) — adapts to dark mode automatically
<div className="flex flex-col min-h-screen" style={{ background: "var(--background)" }}>

// SOURCE: app/globals.css:60-70
// :root defines --background: #FAFAF9 (light)
// .dark defines --background: #0D0D0D (Obsidian)
```

### PAGE_BG_CLASS
```tsx
// SOURCE: app/globals.css:229-233 (light) + 207-210 (dark)
// .page-bg already handles both modes — use this for main content areas
<div className="page-bg min-h-screen">

// DO NOT use: style={{ background: "radial-gradient(... #f8fbff ...)" }}
// USE instead: className="page-bg"
```

### CARD_PATTERN
```tsx
// SOURCE: app/globals.css:266-272
// .card-base uses var(--card) which is #ffffff light / #161614 dark
<div className="card-base p-4">
// OR with Tailwind: className="bg-card border border-border rounded-xl"
```

### TAILWIND_SEMANTIC_COLORS
```tsx
// SOURCE: app/globals.css @theme inline — these Tailwind classes use CSS vars
// bg-background  → var(--background)  → #FAFAF9 light / #0D0D0D dark
// bg-card        → var(--card)        → #ffffff  light / #161614 dark
// bg-muted       → var(--muted)       → #f1f5f9  light / #1c1c1a dark
// bg-secondary   → var(--secondary)   → #f1f5f9  light / #1c1c1a dark
// border-border  → var(--border)      → rgba(203,213,225,0.8) / rgba(255,255,255,0.07)
// text-foreground → var(--foreground) → #0f172a  light / #e8e3dc dark
// text-muted-foreground → var(--muted-foreground) → #64748b / #7a7368
```

### AE_MONOGRAM_PATTERN
```tsx
// SOURCE: app/login/page.tsx:43-62 (left panel monogram)
// SOURCE: .stitch/designs/login.html:128-140 (Stitch reference)
// This is the canonical inline AE monogram — use it for mobile logo too
<div className="relative w-9 h-9 flex items-center justify-center">
  <div className="absolute w-full" style={{ height: 3, background: "#e11d48", top: "50%", transform: "translateY(-50%)", zIndex: 10 }} />
  <svg className="w-full h-full fill-none stroke-white" strokeWidth="4" viewBox="0 0 100 100">
    <path d="M20 80 L50 20 L80 80" />
    <path d="M40 80 L40 20 L75 20 M40 80 L75 80" />
  </svg>
</div>
```

---

## Files to Change

| File | Action | Justification |
|---|---|---|
| `app/login/page.tsx` | UPDATE | Fix mobile logo: replace house SVG with AE monogram |
| `app/dashboard/layout.tsx` | UPDATE | Replace hardcoded gradient with `page-bg` class |
| `app/dashboard/contacts/page.tsx` | UPDATE | `#FAFAF9` → `bg-background` |
| `app/dashboard/pipeline/page.tsx` | UPDATE | 4 hardcoded bg → CSS vars |
| `app/dashboard/properties/page.tsx` | UPDATE | `#FAFAF9` → `bg-background` |
| `app/dashboard/contacts/[id]/page.tsx` | UPDATE | ~8 hardcoded colors → CSS vars |
| `app/dashboard/contacts/contacts-table.tsx` | UPDATE | Table head + badge bg → CSS vars |
| `app/dashboard/contacts/contacts-filter-bar.tsx` | UPDATE | Filter container → `bg-muted/30` |

## NOT Building
- Dark mode toggle UI (ThemeProvider already handles this via `storageKey="advance-crm-theme"`)
- Dark mode for `/login` page (login is always light — intentional)
- Dark mode for the sidebar (it's always dark — intentional, no changes needed)
- WhatsApp bubble colors (complex, separate task)
- Settings, Tasks, Conversations, Ads, Agents, Ava pages (not in P0 scope — do them if fast)

---

## Step-by-Step Tasks

### Task 1: Fix login mobile logo
- **ACTION**: Replace the `md:hidden` mobile logo section in `app/login/page.tsx`
- **IMPLEMENT**: Remove the house-SVG-in-red-box. Replace with a scaled-down version of the AE monogram (same SVG paths as the left panel, `w-9 h-9` container, `strokeWidth="4"`, red crossbar at 3px height)
- **MIRROR**: `AE_MONOGRAM_PATTERN` — same paths, smaller scale
- **IMPORTS**: None new
- **GOTCHA**: Keep `md:hidden` wrapper so this only shows on mobile. Keep the "Advance Estate" text next to the monogram.
- **VALIDATE**: Open http://localhost:3000/login at 375px width — should see AE monogram, not house

### Task 2: Fix dashboard layout background
- **ACTION**: Edit `app/dashboard/layout.tsx` line 13
- **IMPLEMENT**: 
  ```tsx
  // BEFORE:
  <main className="flex-1 overflow-auto" style={{ background: "radial-gradient(circle at top left, rgba(219,234,254,0.5), transparent 30%), linear-gradient(180deg,#f8fbff 0%,#f3f7fb 50%,#eef3f9 100%)" }}>
  // AFTER:
  <main className="flex-1 overflow-auto page-bg">
  ```
- **MIRROR**: `PAGE_BG_CLASS` — globals.css `.page-bg` already has dark mode override
- **GOTCHA**: Remove the `style={}` entirely, `page-bg` from globals.css handles both modes
- **VALIDATE**: Toggle dark mode — main area should go dark (#0D0D0D) not stay white

### Task 3: Fix contacts/pipeline/properties page backgrounds
- **ACTION**: Replace `style={{ background: "#FAFAF9" }}` with className
- **IMPLEMENT**:
  - `contacts/page.tsx:38` → `className="flex flex-col min-h-screen bg-background"` (remove `style`)
  - `pipeline/page.tsx:23` → same
  - `pipeline/page.tsx:25` → `className="px-8 py-6 shrink-0 bg-background"` (remove `style`)
  - `properties/page.tsx:17` → same as contacts
- **MIRROR**: `TAILWIND_SEMANTIC_COLORS` — `bg-background` maps to CSS var
- **GOTCHA**: Do NOT change any other classes on those divs, only remove `style` and add `bg-background` to className
- **VALIDATE**: Three pages should have dark bg in Obsidian mode

### Task 4: Fix pipeline white card backgrounds
- **ACTION**: Edit `app/dashboard/pipeline/page.tsx` lines ~64 and ~73
- **IMPLEMENT**:
  ```tsx
  // BEFORE: style={{ background: "white", border: "1px solid #e5e7eb" }}
  // AFTER:  className="bg-card border border-border" (remove style entirely)
  // BEFORE: style={{ background: "#e5e7eb" }}  (divider line)
  // AFTER:  className="bg-border"
  ```
- **MIRROR**: `TAILWIND_SEMANTIC_COLORS`
- **VALIDATE**: Pipeline page → dark mode → cards show `#161614` not white

### Task 5: Fix contact detail page (most hardcoded)
- **ACTION**: Edit `app/dashboard/contacts/[id]/page.tsx` — multiple lines
- **IMPLEMENT** each replacement:
  ```tsx
  // Line ~108: style={{ height: "100vh", background: "#f9f9f8" }}
  → className="h-screen bg-background"   (remove style entirely)
  
  // Line ~165: style={{ background: "#e11d48" }}  (score badge — leave as-is, brand color)
  
  // Line ~179: background: "#FAFAF9"
  → "var(--background)"
  
  // Lines ~227,239,251: style={{ background: "white", border: "1px solid #e5e7eb" }}
  → style={{ background: "var(--card)", border: "1px solid var(--border)" }}
  
  // Line ~267: style={{ background: "white", borderColor: "#f0f0ef", ... }}
  → style={{ background: "var(--card)", borderColor: "var(--border)", ... }}
  
  // Line ~420: style={{ background: "#fff1f2" }}  (red muted bg)
  → style={{ background: "var(--red-muted)" }}
  
  // Line ~437: style={{ background: "#f0fdf4" }}  (green muted bg)
  → style={{ background: "var(--emerald-muted)" }}
  
  // Line ~458: style={{ width: "65%", background: "white" }}  (right pane)
  → style={{ width: "65%", background: "var(--card)" }}
  ```
- **MIRROR**: `CSS_VAR_PATTERN`, `CARD_PATTERN`
- **GOTCHA**: Do NOT touch the `#e11d48` score badge — brand red stays. Do NOT touch WhatsApp bubble colors.
- **VALIDATE**: Contact detail page in dark mode — both left profile pane and right pane should be dark

### Task 6: Fix table and filter hardcoded backgrounds
- **ACTION**: Edit `contacts-table.tsx` and `contacts-filter-bar.tsx`
- **IMPLEMENT**:
  ```tsx
  // contacts-table.tsx line ~115:
  // BEFORE: <thead style={{ background: "rgba(250,250,249,0.5)" }}>
  // AFTER:  <thead className="bg-muted/30">
  
  // contacts-table.tsx line ~208:
  // BEFORE: style={{ background: "#f1f5f9", color: "#64748b" }}  (empty state)
  // AFTER:  style={{ background: "var(--secondary)", color: "var(--muted-foreground)" }}
  
  // contacts-filter-bar.tsx line ~52:
  // BEFORE: style={{ background: "rgba(243,244,243,0.5)" }}
  // AFTER:  className uses existing classes, remove style or → "var(--muted)"
  ```
- **MIRROR**: `TAILWIND_SEMANTIC_COLORS`
- **VALIDATE**: Contacts page in dark mode — table header and filter bar should be dark

---

## Validation Commands

### Static Analysis
```bash
cd c:/Users/ivanp/advance-crm && npx tsc --noEmit
```
EXPECT: Zero type errors (no logic changes, only className/style swaps)

### Build
```bash
cd c:/Users/ivanp/advance-crm && npm run build
```
EXPECT: Build succeeds, 18 routes, 0 errors

### Browser Validation
```bash
# Server already running at http://localhost:3000
# Toggle dark mode in the UI (ThemeProvider uses storageKey="advance-crm-theme")
```
EXPECT:
1. http://localhost:3000/login at 375px → AE monogram visible, no house icon
2. http://localhost:3000/dashboard (dark mode) → dark bg, no white flash
3. http://localhost:3000/dashboard/contacts (dark mode) → dark bg, table dark
4. http://localhost:3000/dashboard/pipeline (dark mode) → dark bg, cards dark
5. http://localhost:3000/dashboard/contacts/[any-id] (dark mode) → both panes dark

### Manual Validation
- [ ] Toggle to dark mode → no page should show pure white background
- [ ] Toggle back to light mode → light theme still looks correct (no regressions)
- [ ] Login page on mobile width (375px) → AE monogram appears, not house icon
- [ ] Pipeline kanban cards → dark in dark mode
- [ ] Contact detail left pane profile + right pane WhatsApp → dark in dark mode

---

## Acceptance Criteria
- [ ] Login mobile logo: AE monogram SVG, not house icon
- [ ] Dashboard layout: `page-bg` class, no white-gradient flash in dark mode
- [ ] Contacts, Pipeline, Properties pages: dark background in Obsidian
- [ ] Contact detail page: all panes dark in Obsidian
- [ ] Table headers and filter bar: dark in Obsidian
- [ ] Build passes: 0 errors
- [ ] Light mode regression: none — light mode still looks identical

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `bg-background` in layout conflicts with `page-bg` class | Low | Medium | They both produce correct bg — `page-bg` has the gradient, prefer it for layout |
| Contact detail inline style overrides Tailwind class | Low | Low | Use `var(--css-var)` in style= for complex cases where style= is already there |
| WhatsApp bubble `bg-[#dcf8c6]` breaks in dark | Low | Low | Out of scope — leave for dedicated WhatsApp dark mode task |

## Notes
- The login page (`/login`) is intentionally always light — do NOT add dark mode to it
- The sidebar is intentionally always dark — no changes needed there
- `page-bg` class in `globals.css:229` (light) and `globals.css:207` (dark) already handles both modes — it just needs to be used
- `globals.css` line 5: `@custom-variant dark (&:is(.dark *))` — dark mode triggers via `.dark` class on `<html>`, toggled by next-themes ThemeProvider
- ThemeProvider defaults to `"light"` — user must toggle. `storageKey="advance-crm-theme"` persists preference.
