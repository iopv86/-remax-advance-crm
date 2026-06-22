# B14 — Verificación

**Fecha:** 2026-06-22
**Deploys:** CRM `38d5dee` (Vercel) · Ava `6c05a605` (Railway remax-advance-ava, status SUCCESS)

## Listo cuando — resultados

| # | Criterio | Resultado | Evidencia |
|---|----------|-----------|-----------|
| 1 | Lead Forms → contacto + agente (RPC) + deal nuevo_sin_contactar | CÓDIGO DEPLOYED (gated OFF) | webhook refactor desplegado; flag META_LEAD_WEBHOOK_ENABLED OFF (verificación funcional requiere activar) |
| 2 | Ava HOT → deal nuevo_sin_contactar con agent_id asignado | CÓDIGO LIVE | tools.py sync_contact_to_crm + _create_deal_for_contact; Railway SUCCESS |
| 3 | Ava COLD → solo contacto (sin deal/agente) | CÓDIGO LIVE | rama COLD intacta |
| 4 | Kanban muestra nuevo_sin_contactar primero | PASS | QA navegador: columna "SIN CONTACTAR" primera en /dashboard/pipeline |
| 5 | Reportes/KPI excluyen nuevo_sin_contactar | PASS | migración 0012 (3 vistas) + queries reports/dashboard/agents; vistas compilan |
| 6 | Tablero "Leads Entrantes" por agente | PASS | QA navegador: nav item + página carga (H1, contador, empty state) |
| 7 | Build TS limpio + webhook nunca agent_id null | PASS | tsc 0 errores; fix NOT NULL en los 3 paths |

## QA en producción (navegador, admin)
- Login: PASS
- Leads Entrantes (nav + página): PASS
- Columna SIN CONTACTAR en kanban: PASS
- Build nuevo confirmado live (no caché).

## Pendiente de verificación funcional (no bloqueante)
- **Lead Forms end-to-end:** requiere activar META_LEAD_WEBHOOK_ENABLED=true + registrar webhook en Meta. Hoy gated OFF a propósito.
- **Ava score→deal:** requiere conversación WhatsApp real que dispare registrar_lead con score HOT/WARM. Código desplegado y servicio healthy; verificación con el próximo lead real.

## Fuera de alcance (fase 2)
SLA timer, reasignación automática, auto-decay a closed_lost, avance de etapa anclado a evidencia.
