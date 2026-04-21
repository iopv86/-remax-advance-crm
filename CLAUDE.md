@AGENTS.md

## Project: Advance Estate CRM

Next.js 16.2.3 + Supabase SSR + Tailwind v4 + TypeScript.
Theme: Obsidian Edge — dark only (`forcedTheme="dark"`). Gold: `#C9963A`. Text: `#e5e2e1`.
**middleware.ts must exist at project root** — required for Supabase SSR session refresh.
Full project context: `C:\Users\ivanp\.claude\projects\c--Users-ivanp-wiki\memory\project_advance_crm.md`

## Workflow Orchestration

- **Plan mode** for ANY non-trivial task (3+ steps or architectural decisions). Stop and replan if complications arise.
- **Delegate** research and exploratory work to subagents to preserve main context.
- **Verify before closing**: never mark a task complete without proving it works — build passes, TypeScript clean, behavior confirmed.
- **Elegance check**: for non-trivial changes, pause and ask "is there a more elegant way?" — avoid over-engineering obvious fixes.
- **Bug reports**: just fix them with evidence from logs/TypeScript. No clarification loops.
- **Self-improvement**: after a correction, document the lesson so it doesn't repeat.

## Core Principles

1. **Simplicity** — minimal code changes, minimal blast radius.
2. **Root cause** — no temporary patches. Find and fix the actual problem.
3. **Minimal impact** — only touch code necessary for the task.

## Key Guards

- Never hardcode light-mode colors (`#1C1917`, `text-stone-*`, `bg-white`) — breaks dark theme.
- `useSearchParams()` in any client component requires `<Suspense>` in its server-component parent.
- RLS policies: always include explicit `WITH CHECK` clause — `null` silently blocks INSERTs.
- `middleware.ts` must exist at root — if missing, Supabase auth crashes all server components.
