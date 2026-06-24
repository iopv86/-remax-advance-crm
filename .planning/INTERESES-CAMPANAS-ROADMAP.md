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

### Sesión 1B — Intereses: visibilidad + edición  (siguiente)
- Bloque "Intereses" completo en detalle de contacto + surface en detalle del deal (lee/escribe el contacto vinculado).
- Editor: multi-select de Categorías (`property_types`), Amenidades (`desired_amenities`), Operación, Condición, Habitaciones.
- Quick-edit desde la card/detalle para que el agente "depure" al contactar y cambie hot/warm/cold ahí mismo.
- Deploy all-deploy + QA. (Aquí también retirar/migrar lectores al array; `property_type_interest` se elimina en 1C.)

### Sesión 2 — Campañas: atribución Meta al entrar el lead
- Expandir queries Graph (follow-up `/{ad_id}?fields=name,adset{name},campaign{name}` + platform + nombre de formulario).
- Migración: `meta_campaign_name`, `meta_adset_id`, `meta_adset_name`, `meta_ad_name`, `meta_form_name`, `meta_platform`; corregir conflación de `meta_campaign_id`.
- Panel "Campañas" en detalle de contacto/lead (y deal). Sin backfill histórico (0/150 con data) — solo hacia adelante.

### Sesión 3 — Propietarios (con teléfono) en propiedades
### Sesión 4 — Deal: Co-comprador / Referidor
### Sesión 5 — Deal: Planes de Pago (el más grande)
### Sesión 6 — Tasas Bancarias USD/DOP (dashboard; fuente compartida con Finance/TASAREAL)

## Follow-ups / deuda
- BUG Ava move_timeline→timeline (afecta auto-calificación de leads de Ava). Candidato a fold en 1B o ticket aparte.
- 1C cleanup: retirar `property_type_interest` escalar una vez todos los lectores usen `property_types`.
