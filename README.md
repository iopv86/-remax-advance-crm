# RE/MAX Advance CRM

CRM inmobiliario con IA para RE/MAX Advance (República Dominicana).

## Deploy en Vercel (1 clic)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/import?repository-url=https://github.com/iopv86/-remax-advance-crm&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&envDescription=Variables%20de%20Supabase&project-name=remax-advance-crm&repo-name=remax-advance-crm)

Al hacer clic, Vercel te pedirá 3 variables de entorno:

| Variable | Valor |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zlnqsgepzfghlmsfolko.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_WlqFc63Tpa8O_qAq4ey9ow_n-nvTOFR` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(tu service role key)* |

## Stack

- **Next.js 15** App Router + TypeScript
- **Supabase** (auth + PostgreSQL)
- **Tailwind CSS** + shadcn/ui
- **n8n Cloud** (automatización WhatsApp + IA)
- **OpenAI GPT-4o-mini** (Ava, asistente de calificación)

## Páginas

| Ruta | Descripción |
|------|-------------|
| `/login` | Autenticación |
| `/dashboard` | KPIs y resumen operativo |
| `/dashboard/contacts` | Leads con filtros y clasificación |
| `/dashboard/pipeline` | Kanban por etapa de venta |
| `/dashboard/properties` | Catálogo de propiedades |
| `/dashboard/tasks` | Gestión de tareas |
| `/dashboard/conversations` | Conversaciones WhatsApp |
| `/dashboard/settings` | Perfil e integraciones |
