# AGENTS.md — Agent Working Rules

## Communication
- **Always respond in English** in chat, explanations, and commit messages.
- Thai appears only inside user-facing strings (printed-document labels, UI text)
  and code where the app itself is customer-facing.

## Project
- Invoice management system for small Thai businesses.
  React (Vite) + TypeScript + Tailwind frontend · Supabase backend · Vercel hosting ·
  client-side PDF generation (jsPDF / HTML capture).
- Full specification: `invoice-system-master-prompt.md` (read before working on
  templates, fonts, pagination, or settings).
- Design system: `DESIGN-SYSTEM.md` (read before touching any UI). Tokens live in
  `src/design/tokens.ts`; Tailwind imports them. Never hardcode px sizes or hex
  colours — use a token.
- Session handoffs: `work_session/` (latest file = most recent state).

## Workspace & tooling
- Test workspace: `testcompany@gmail.com` (service key in `.env.local`).
- Mock data: `npm run seed:mock` (interactive generator), `npm run seed:mock:clean`
  (removes `[MOCK]`-tagged data only). All generated deals/docs are tagged `[MOCK]`.
- Print-layout regression: `npm run test:print-layout` /
  `npm run test:print-layout:update` (needs Chrome; see scripts/print-layout-regression.mjs).
- Pagination checks: `npx tsx tests/print-layout/pagination.many.check.ts`.
- Lint: `npm run lint` (ESLint + design-system check) / `npm run lint:design`
  (tokens, neutrals, shadows, type roles). `npm run format` runs Prettier.
- UI snapshots: `npm run test:ui-snapshots` /
  `npm run test:ui-snapshots:update` (Playwright, reuses the e2e auth session).

## Conventions worth knowing
- Classic V2 font sizes flow through CSS vars (`--classic-font-scale`,
  `--classic-fs-*`) — never hardcode pt sizes in the classic V2 template.
- Doc numbers come from `doc_number_sequences` — reserve/bump before inserting
  documents, never invent numbers.
- Supabase migrations in `sql/` are applied manually (Supabase SQL editor or
  Management API) — say so in the session record when one is pending.
