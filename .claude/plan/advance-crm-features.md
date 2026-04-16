# Implementation Plan: Advance CRM — 6 Features

**Project:** `C:\Users\ivanp\advance-crm`
**Stack:** Next.js 16.2.3 · Tailwind CSS v4 · Supabase SSR · shadcn/ui · Sonner
**Date:** 2026-04-11

---

## Stack & Pattern Summary

| Concern | Implementation |
|---------|---------------|
| Data fetching | Server components → `await createClient()` from `@/lib/supabase/server` |
| Mutations / forms | Client components → `createClient()` from `@/lib/supabase/client` |
| Toast | `sonner` — `toast.success()` / `toast.error()` |
| Design tokens | `globals.css` — `card-glow`, `card-base`, `page-header`, `badge-*`, `status-*` |
| Typography | Playfair h1 (30px, -0.02em) + Inter body + JetBrains Mono for numbers |
| Types | `lib/types.ts` — Contact, Deal, Task, Property fully typed |
| shadcn available | button, input, select, sheet, dialog, textarea, badge, scroll-area, table, tabs |

---

## Feature 1: Acciones Rápidas del Sidebar

### Task Type
- [x] Frontend + Backend (Supabase direct)

### State Found
`components/sidebar.tsx:117` — three `<button>` elements with labels but no `onClick` handlers. Sheet component is already installed at `components/ui/sheet.tsx`.

### Technical Solution

Split sidebar into two files:
1. Keep `sidebar.tsx` lean — import and render `<QuickActionSheets>` above the dark block
2. New `components/quick-action-sheets.tsx` — client component with state + 3 Sheet modals

**State model:**
```ts
const [openSheet, setOpenSheet] = useState<"contact" | "deal" | "task" | null>(null)
```

**Per-sheet form state (controlled inputs) + Supabase insert on submit:**

### Form 1 — Nuevo cliente → `contacts` table
```ts
{ first_name: "", last_name: "", phone: "", lead_classification: "warm" }
supabase.from("contacts").insert({ ...form, created_at: new Date().toISOString() })
```

### Form 2 — Nueva oportunidad → `deals` table
```ts
{ contact_id: "", deal_value: 0, stage: "lead_captured" }
// Need contact picker: fetch contacts for <Select>
supabase.from("deals").insert({ ...form, agent_id: agentId, created_at: ... })
```

### Form 3 — Agendar seguimiento → `tasks` table
```ts
{ contact_id: "", title: "", due_date: "", priority: "medium" }
supabase.from("tasks").insert({ ...form, agent_id: agentId, status: "pending", created_at: ... })
```

**agent_id resolution:** Query `supabase.auth.getUser()` once at component mount; store in state.

### Implementation Steps

1. **Create `components/quick-action-sheets.tsx`** (new client component)
   - `"use client"` directive
   - Import: Sheet, SheetContent, SheetHeader, SheetTitle from `@/components/ui/sheet`
   - Import: Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Button from shadcn
   - Three controlled form states + submit handlers
   - Fetch contacts list on mount for the deal/task contact pickers
   - After successful insert → `toast.success(...)` + close sheet + reset form

2. **Modify `components/sidebar.tsx`**
   - Import `QuickActionSheets`
   - Add `openSheet` prop / or use a simple ref pattern
   - Change button `onClick` to call `setOpenSheet("contact")` etc.
   - Best approach: move state into `QuickActionSheets` and expose a trigger via `forwardRef` or compound component
   - Simplest: lift the 3 buttons inside `QuickActionSheets` so the component owns state completely; sidebar just renders `<QuickActionSheets />`

### Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `components/sidebar.tsx` | Modify | Replace the 3 static buttons with `<QuickActionSheets />` |
| `components/quick-action-sheets.tsx` | Create | Client component: state + 3 Sheet forms |

### Risks
- `agent_id` may be null if user has no row in `agents` table → insert with `agent_id: null` for tasks/deals (nullable FK is safe)
- Contact picker for deals/tasks loads all contacts — scope to limit 50 by name for performance

---

## Feature 2: Alta de Propiedades

### Task Type
- [x] Frontend + Backend (Supabase + Storage)

### State Found
`app/dashboard/properties/page.tsx` — pure server component, renders read-only grid. No create/edit/delete capability. `Property` type already complete in `lib/types.ts`.

### Technical Solution

**Architecture:** Split page into server shell + client interactive layer.

```
app/dashboard/properties/
  page.tsx         ← server: fetch, pass data to client wrapper
  properties-client.tsx   ← client: state for sheet open, selected property, photo upload
```

**Photo upload flow:**
1. User picks file(s) via `<input type="file" multiple accept="image/*">`
2. Client uploads each to Supabase Storage: `storage.from("property-images").upload(path, file)`
3. Get public URL: `storage.from("property-images").getPublicUrl(path).data.publicUrl`
4. Push URLs into `images[]` array → save with property insert

**Form fields mapping to `properties` table:**
```ts
{
  title: string,           // auto-generated or manual
  property_type: PropertyType,
  transaction_type: "sale" | "rent",
  price: number,
  currency: "USD" | "DOP",
  location_city: string,
  location_sector: string,
  bedrooms: number,
  bathrooms: number,
  area_m2: number,
  status: "active" | ...,
  description: string,
  images: string[],        // uploaded URLs
  agent_id: string         // from auth
}
```

**Edit:** Pre-populate form with existing property data, use `supabase.from("properties").update().eq("id", id)`
**Delete:** Confirm dialog → `supabase.from("properties").delete().eq("id", id)` + remove from Storage

### Implementation Steps

1. **Create `components/property-sheet.tsx`** (client component)
   - Full form with all fields
   - File input with preview thumbnails
   - Upload-then-save pattern
   - Handles both create (no id) and edit (with id)

2. **Modify `app/dashboard/properties/page.tsx`**
   - Add `"Nueva propiedad"` button to page header (client component wrapper needed)
   - Convert to re-export that passes data to `<PropertiesClient>`

3. **Create `app/dashboard/properties/properties-client.tsx`**
   - Receives `initialProperties` from server
   - Manages open sheet + selected property
   - Each card gets Edit / Delete icon buttons (pencil + trash)
   - Delete triggers confirm dialog (use shadcn `dialog.tsx` already installed)

4. **Supabase Storage bucket:** `property-images` must exist. Add note in migration doc.

### Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `app/dashboard/properties/page.tsx` | Modify | Pass data to client, add header button |
| `app/dashboard/properties/properties-client.tsx` | Create | Client shell with sheet state |
| `components/property-sheet.tsx` | Create | Full CRUD sheet form |

### Risks
- Storage bucket `property-images` may not exist → document manual creation in Supabase dashboard, or create via API in a migration step
- Large images should be compressed client-side before upload (defer, not in scope now)
- Server component cannot directly control sheet open state → solve by making the header button part of the client wrapper

---

## Feature 3: WhatsApp Directo

### Task Type
- [x] Frontend + Backend (Meta Cloud API + Supabase)

### State Found
Contacts page shows phone numbers as plain text. No send button exists. `Message` type already defined in `lib/types.ts` with `direction`, `channel`, `is_automated` fields. `NEXT_PUBLIC_SUPABASE_*` env vars configured; Meta Cloud API credentials likely in env.

### Technical Solution

**Three sub-tasks:**

#### 3a. Clickable phone numbers (pure frontend)
In contacts table row:
```tsx
<a href={`tel:${c.phone}`} className="...">📞 {c.phone}</a>
<a href={`https://wa.me/${sanitizePhone(c.phone)}`} target="_blank">WhatsApp</a>
```
`sanitizePhone`: strip `+`, spaces, dashes → international format.

#### 3b. WhatsApp composer in conversations page
New client component `<WhatsAppComposer contactId={id} phone={phone} />`:
- Textarea + Send button
- On send: POST `/api/messages`
- Optimistically show sent message in list

#### 3c. API route for sending
```
app/api/messages/route.ts  POST
```
Body: `{ contact_id, content, phone }`

Steps:
1. Call Meta Cloud API: `POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages`
   - headers: `Authorization: Bearer ${WHATSAPP_TOKEN}`
   - body: `{ messaging_product: "whatsapp", to: phone, type: "text", text: { body: content } }`
2. On success: `supabase.from("messages").insert({ contact_id, direction: "outbound", channel: "whatsapp", content, is_automated: false })`
3. Return `{ success: true, message_id }`

**Env vars needed:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`

### Implementation Steps

1. **Modify `app/dashboard/contacts/page.tsx`** — wrap phone in clickable links (pure change, no client needed → keep server component)

2. **Check `app/dashboard/conversations/page.tsx`** — read current state, add composer below message list

3. **Create `app/api/messages/route.ts`** — POST handler

4. **Create `components/whatsapp-composer.tsx`** — client component

### Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `app/dashboard/contacts/page.tsx` | Modify | tel: and wa.me: links |
| `app/dashboard/conversations/page.tsx` | Modify | Add WhatsApp composer |
| `app/api/messages/route.ts` | Create | Send via Meta API + save |
| `components/whatsapp-composer.tsx` | Create | Inline message composer |

### Risks
- Meta Cloud API requires verified WABA and phone number — env vars must be set
- If WHATSAPP_TOKEN not set, route should return 503 gracefully, not crash
- Phone format: Dominican numbers start with `1849`, `1829`, `1809` — ensure `wa.me/` format strips `+` but keeps country code

---

## Feature 4: Propuestas PDF

### Task Type
- [x] Frontend + Backend (Puppeteer)

### State Found
`puppeteer` is already installed as devDependency. `app/api/` directory exists. Properties page renders cards with all data.

### Technical Solution

**Selection UI:** Add checkbox state to properties client. "Generar propuesta" button appears in header when `selectedIds.length > 0`.

**API Route:**
```
app/api/pdf/route.ts  POST
Body: { propertyIds: string[], agentId?: string }
```

Steps:
1. Fetch properties from Supabase by IDs
2. Fetch agent info from Supabase
3. Build HTML string with Advance Estate branding
4. `const browser = await puppeteer.launch({ headless: true })`
5. `const page = await browser.newPage()`
6. `await page.setContent(html, { waitUntil: "networkidle0" })`
7. `const pdf = await page.pdf({ format: "A4", printBackground: true })`
8. Return PDF as `application/pdf` response

**HTML template structure:**
- Cover: logo Advance Estate + RE/MAX Advance branding + agent name/phone
- Per property page: title, type, price, location, specs (bed/bath/m²), description, photo
- Footer: contact info + legal disclaimer

**WhatsApp share:** After download, show button `href="https://wa.me/?text=Adjunto+propuesta..."` (Web Share API fallback)

### Implementation Steps

1. **Modify `app/dashboard/properties/properties-client.tsx`** — add `selectedIds` state, checkboxes per card, "Generar propuesta" button

2. **Create `app/api/pdf/route.ts`** — Puppeteer PDF generation

3. **Create `lib/pdf-template.ts`** — HTML template function (separate for testability)

### Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `app/dashboard/properties/properties-client.tsx` | Modify | Add selection state + generate button |
| `app/api/pdf/route.ts` | Create | Puppeteer PDF generation endpoint |
| `lib/pdf-template.ts` | Create | HTML template for proposals |

### Risks
- Puppeteer in Next.js API routes may have cold start issues — use `puppeteer.launch` with `args: ['--no-sandbox']` for compatibility
- Large PDFs (many properties) may hit route timeout — limit selection to 10 properties max
- Logo assets: need public URL or base64-encode logo for PDF

---

## Feature 5: Ava Matching por Precio

### Task Type
- [x] Backend (Python + SQL migration)

### State Found
`Contact` type in `lib/types.ts` already includes `budget_min`, `budget_max`, `property_type_interest` — but these columns may not exist in the live DB. Must verify and create migration if missing.

`whatsapp-agentkit/agent/tools.py` has `sync_contact_to_crm()` and `sync_message_to_crm()`.

### SQL Migration

```sql
-- Migration: 0003_contact_budget_fields.sql
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS budget_min numeric,
  ADD COLUMN IF NOT EXISTS budget_max numeric,
  ADD COLUMN IF NOT EXISTS budget_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS property_type_interest text;
```

### Python Tool

```python
async def match_properties_for_contact(contact_id: str) -> list[dict]:
    """
    Fetch 1-3 properties matching the contact's budget and property type preference.
    """
    contact = supabase.table("contacts").select(
        "budget_min, budget_max, budget_currency, property_type_interest"
    ).eq("id", contact_id).single().execute()
    
    if not contact.data:
        return []
    
    data = contact.data
    budget_min = data.get("budget_min", 0) or 0
    budget_max = data.get("budget_max", 999_999_999) or 999_999_999
    ptype = data.get("property_type_interest")
    
    query = supabase.table("properties").select(
        "id, title, property_type, price, currency, location_sector, location_city, bedrooms, bathrooms, area_m2, images, status"
    ).eq("status", "active").gte("price", budget_min).lte("price", budget_max)
    
    if ptype:
        query = query.eq("property_type", ptype)
    
    result = query.order("created_at", desc=True).limit(3).execute()
    return result.data or []
```

**Ava integration:** In `main.py`, when Ava captures budget keywords, call `match_properties_for_contact(contact_id)` and format results as a WhatsApp message with property details.

### Implementation Steps

1. **Write SQL migration file** `migrations/0003_contact_budget_fields.sql`
2. **Modify `whatsapp-agentkit/agent/tools.py`** — add `match_properties_for_contact()`
3. **Modify `whatsapp-agentkit/agent/main.py`** — trigger tool when budget is captured in contact

### Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `migrations/0003_contact_budget_fields.sql` | Create | Add budget fields to contacts |
| `whatsapp-agentkit/agent/tools.py` | Modify | Add match_properties_for_contact() |
| `whatsapp-agentkit/agent/main.py` | Modify | Invoke matching when budget captured |

### Risks
- Budget fields may already exist if a prior migration ran — use `ADD COLUMN IF NOT EXISTS`
- Currency mismatch (USD vs DOP) — filter by `budget_currency` OR normalize; initially filter only by USD
- Ava may not have contact_id at match time — ensure `sync_contact_to_crm()` returns the UUID

---

## Feature 6: Dark Mode

### Task Type
- [x] Frontend only

### State Found
`components/theme-provider.tsx` — stubbed with `theme: "light"` hardcoded, toggle is a no-op.
`app/globals.css:5` — `@custom-variant dark (&:is(.dark *))` already declared! CSS variant is ready.
`next-themes` is already installed (`"next-themes": "^0.4.6"`).

### Technical Solution

1. **Replace custom ThemeProvider with `next-themes`** — it handles localStorage, SSR, and `html.dark` class natively
2. **Add dark CSS token overrides** in `globals.css` under `.dark :root {}` or using `@custom-variant dark`
3. **Add toggle UI** in settings page

**Dark palette (premium slate-950/slate-900):**
```css
.dark {
  --background: #020617;        /* slate-950 */
  --foreground: #f1f5f9;        /* slate-100 */
  --card: #0f172a;              /* slate-900 */
  --card-foreground: #e2e8f0;
  --muted: #1e293b;             /* slate-800 */
  --muted-foreground: #64748b;  /* slate-500 */
  --border: rgba(100,116,139,0.2);
  --primary: #f43f5e;           /* rose-500 — slightly brighter for dark */
  --secondary: #1e293b;
}
```

**Toggle in settings:**
```tsx
import { useTheme } from "next-themes"
const { theme, setTheme } = useTheme()
// Button: toggle between "light" and "dark"
```

### Implementation Steps

1. **Modify `components/theme-provider.tsx`** — use `next-themes` ThemeProvider with `attribute="class"` and `defaultTheme="light"`
2. **Modify `app/globals.css`** — add dark token block
3. **Modify `app/layout.tsx`** — wrap with next-themes ThemeProvider
4. **Modify `app/dashboard/settings/page.tsx`** — convert to client component, add dark mode toggle card

### Key Files

| File | Operation | Description |
|------|-----------|-------------|
| `components/theme-provider.tsx` | Rewrite | Use next-themes |
| `app/globals.css` | Modify | Add `.dark { ... }` token overrides |
| `app/layout.tsx` | Modify | Wrap with ThemeProvider |
| `app/dashboard/settings/page.tsx` | Modify | Add toggle UI (client component) |

### Risks
- Server components that hardcode `color: "#0f172a"` inline won't respond to `.dark` — need to use CSS variables instead
- The sidebar's dark block (slate-950) looks identical in dark mode — may need adjustment
- `next-themes` requires the layout to be a server component — the `ThemeProvider` wrapper handles this cleanly

---

## Execution Order & Dependencies

```
Feature 1 (Sidebar actions)     → standalone, no deps
Feature 2 (Properties CRUD)     → standalone
Feature 3 (WhatsApp)            → depends on contacts page (F2 not required)
Feature 4 (PDF proposals)       → depends on Feature 2 (needs properties client)
Feature 5 (Ava matching)        → standalone Python/SQL, no frontend deps
Feature 6 (Dark mode)           → standalone, apply last
```

## After Each Feature

1. Update `docs/advance-crm-technical-report.html`
2. Run `node docs/gen-pdf.js`
3. Report: estado encontrado · archivos modificados · cambios · validación · riesgos

## SESSION_ID
- CODEX_SESSION: N/A (codeagent-wrapper not available)
- GEMINI_SESSION: N/A (codeagent-wrapper not available)
