# Roadmap — Intereses del lead + Atribución Meta (Campañas)

Origen: pedido del dueño (2026-06-24) — replicar el flujo de AlterEstate cuando entra un lead:
los datos que vienen de Meta (CAMPAÑAS) y la calificación del cliente por el agente (INTERESES).
Cada sesión está dimensionada para una ventana/chat independiente.

## Decisiones bloqueadas (dueño)
- INTERESES: **canónicos en el contacto**, surface (leer/editar) desde el deal en 1B. No se fork al deal.
- "Rango" = **solo el badge hot/warm/cold actual** (B-17). No se crea lógica de tiers.
- Categorías = **multi-select**; agregar **Amenidades deseadas** (multi).
- Pendientes AlterEstate incluidos: Propietarios, Planes de Pago, Co-comprador/Referidor, Tasas Bancarias USD/DOP.
  Excluidos (backlog): La Terminal, campos SEO, Puntuación de propiedad.

## Ground truth (verificado en código, 2026-06-24)
- Las vistas de detalle (contacto y deal) casi NO muestran intereses (solo Presupuesto, condicional). El editor del contacto sí los tiene.
- Atribución Meta: solo se captura `meta_lead_id` + `meta_campaign_id` (conflado campaign/ad) + `lead_form_answers`. Se DESCARTAN nombres de campaña/conjunto/anuncio/formulario y plataforma (las queries Graph piden solo IDs).
- `contacts.property_type_interest` es el ENUM `property_type` (no text). `contacts.bedrooms` int4 existe huérfano.
- BUG Ava (follow-up): `tools.py:737-738` escribe `move_timeline` (varchar huérfano), pero el gate B-17 lee `timeline` (enum) → leads de Ava no satisfacen la cláusula de timeline del gate. Verificar/arreglar.

---

## Orden: 1A → 1B → 2 → 3 → 4 → 5 → 6

### Sesión 1A — Intereses: esquema + gate  ✅ HECHO (2026-06-24, migración 0015)
Migración `0015_contact_intereses` aplicada a prod (`zlnqsgepzfghlmsfolko`):
- `property_types property_type[]` (multi, backfill desde el escalar); nuevos `operation_type` (buy/sell/rent),
  `condition` (ready/under_construction/any), `desired_amenities text[]` (vocabulario = keys has_* de 0006); `bedrooms` cableado en types.
- Gate `contact_qualification_gate()` array-aware (drop del overload viejo); trigger con **mirror bidireccional** array↔escalar
  (estrategia A-prime: 1A es solo-DB, no rompe el editor escalar ni Ava). Lógica del gate sin cambios (council-locked).
- Smoke test PASS (array, escalar, down-recompute, freeze manual, backfill 5/5, 0 mismatches). `lib/types.ts` + `lib/properties/matching.ts` actualizados (array-aware, no-breaking). tsc 0.
- Código app (types/matcher) es INERTE hasta 1B (el mirror hace que array=[escalar]); se despliega junto con 1B vía all-deploy + QA.

### Sesión 1B — Intereses: visibilidad + edición  ✅ HECHO (2026-06-24, CRM `f40756e` + Ava `2527277`)
- Bloque "Intereses" (read) en detalle de contacto + card "Intereses del cliente" en detalle del deal (surface del contacto vinculado, query ampliada). `lib/intereses-labels.ts` = fuente única de labels/opciones.
- Editor: `MultiSelect` (toggle-pills) para Categorías (`property_types`) y Amenidades (`desired_amenities`); Operación/Condición/Habitaciones nuevos; escribe SOLO el array (el mirror 0015 sincroniza el escalar).
- Quick-edit hot/warm/cold/Sin-calificar desde el badge del detalle del contacto (respeta freeze B-17: temperatura→manual, Sin calificar→auto). Surface en card del pipeline DIFERIDO (conflicto dnd-kit) — backlog.
- Lectores migrados a array-first (contacts list + table via mapa compartido). matching.ts ya era array-aware (1A).
- **FIX Ava timeline (2 bugs):** (1) el dispatch `brain.py` NUNCA reenviaba move_timeline/payment/purpose/bedrooms (→ move_timeline siempre vacío en prod, 0 filas, sin backfill). (2) `tools.py` escribía el escalar huérfano `move_timeline` en vez de `timeline` (enum del gate). Arreglado: dispatch reenvía los 4; `tools.py` mapea free-text→enum (timeline/payment/purpose) con SKIP en no-match (evita 400 que tumbaría todo el PATCH); valida property_type; schema endurecido (enum timeline canónico, quita `office`/`alquilar`). QA: lead estilo-Ava (timeline=immediate+budget+tipo) auto-califica unqualified→cold/qualified vía gate; move_timeline queda muerto → drop en 1C.
- QA prod Playwright PASS (editor round-trip + read block + gate + quick-edit + mirror) + smoke Ava-path en DB. tsc 0, py_compile OK, security 0 CRITICAL/HIGH.

### Sesión 2 — Campañas: atribución Meta al entrar el lead  ✅ HECHO (2026-06-24, CRM `97e9f65` prod `8jx3feny6`)
- **Migración 0016** (aplicada a prod): +6 columnas `meta_campaign_name`, `meta_adset_id`, `meta_adset_name`, `meta_ad_name`, `meta_form_name`, `meta_platform`. Ground-truth corregido vs el roadmap: `meta_ad_id` YA existía (text) — la conflación era 100% código (ambos paths escribían `campaign_id ?? ad_id` en `meta_campaign_id` y dejaban `meta_ad_id` null). Sin cambios al gate/trigger (no son inputs de calificación). Sin backfill (0/150).
- **Graph enriquecido** (`lib/meta-leads.ts` `fetchCampaignAttribution`): lead node ahora pide `form_id,platform`; follow-up `/{ad_id}?fields=name,adset{id,name},campaign{id,name}` para nombres. Token con `ads_read` verificado → nombres SÍ pueblan. Degradación: header Authorization (no token en query), `AbortController` 4s, cualquier fallo → nombres null sin tumbar el intake. `attributionColumns()` mapea a las 8 columnas. De-conflación en insert + backfill first-touch (solo si `meta_campaign_id` y `meta_ad_id` ambos null) en poller y webhook.
- **Poller** lista nombres de formulario (`leadgen_forms?fields=id,status,name`); `paging.next` restringido a graph.facebook.com. **Webhook** (gated off) espejado por consistencia.
- **Read** `components/contacts/campaign-attribution.tsx` (variant contact|deal) + `lib/campaign-labels.ts` (platformLabel fb/ig→Facebook/Instagram). Montado en detalle de contacto y deal. Muestra name (fallback a id), id como subline mono, chip de plataforma. Render null si no hay atribución (los 150 viejos no muestran nada).
- **Review:** security 0 CRITICAL (2 MEDIUM token-in-URL + paging.next + 1 LOW timeout → arreglados; XSS/SSRF/RLS confirmados safe). Code-review: lógica de-conflación/backfill/read correcta. Deuda registrada: el webhook duplica `isValidPhone`/`notifyAgent`(con emoji)/`GRAPH_VERSION` (pre-S2, path gated off) → refactor a `processLead()` pendiente.
- **QA prod (Playwright) PASS:** bloque "Campañas" renderiza en detalle de contacto Y deal con datos reales (campaña "Palmas de SPM - USA/ES/RD", conjunto, anuncio "N2 - Palmas de SPM", plataforma Instagram, formulario). Enrichment Graph verificado live (shape + nombres reales). tsc 0, build 0. **Pendiente menor:** inyectar un lead NUEVO real vía Lead Ads Testing Tool (UI-only) por el poller no se ejecutó end-to-end; cada componente (enrichment live, mapeo determinista, render) verificado por separado.

### Sesión 3 — Propietarios (con teléfono) en propiedades
### Sesión 4 — Deal: Co-comprador / Referidor
### Sesión 5 — Deal: Planes de Pago (el más grande)
### Sesión 6 — Tasas Bancarias USD/DOP (dashboard; fuente compartida con Finance/TASAREAL)

## Follow-ups / deuda
- ✅ BUG Ava move_timeline→timeline RESUELTO en 1B (más un 2º bug: el dispatch nunca reenviaba los params).
- 1C cleanup: `drop column move_timeline` (muerto, 0 filas) + retirar `property_type_interest` escalar una vez el CSV export (`app/api/contacts/export`) use el array; resto de lectores ya usan `property_types`.
- Backlog: quick-edit de clasificación en la card del pipeline (diferido por conflicto dnd-kit).
- Deuda S2: el webhook (`app/api/meta/lead-webhook/route.ts`, gated off por `META_LEAD_WEBHOOK_ENABLED!='true'`) duplica `isValidPhone`/`assignRrAgent`/`notifyAgent`(con emoji)/`GRAPH_VERSION` en vez de llamar a `processLead()`. Refactor a `processLead(db, lead, null)` con el fallback `change.value.ad_id` antes de la llamada → elimina drift y limpia el emoji. No bloqueante (path apagado; poller es el live).
