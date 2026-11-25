# Tasks

_Last updated: 2026-11-25_

## 🟡 In progress

_None_

## 🔜 Up next

- [ ] T-017 Playwright end-to-end tests against the real API (after T-014): basic happy path, security goal blocked without authorization
- [ ] T-018 Split the web bundle (core selector prompt and catalogue are not needed in the browser)
- [ ] T-005b Live selector run with an `ANTHROPIC_API_KEY` (`pnpm --filter @dextra/selector try`); compare LLM picks with rule picks on a few specs
- [ ] T-001b Re-run the operator matrix with Serper and Brave keys; decide whether to enable them (D-015)

## 🧊 Backlog

- [ ] T-008 Cached SERP API locations list for the city dropdown — UI done (city combobox reads `/api/locations`); sync script to fill `serp_location` still to do
- [ ] T-012 Decide fixed ~20% outside-scope budget vs only-on-shortfall (open in D-003) — measurement in place (`template-report`, D-025); decide once there are 20+ outside-scope ratings

## ⛔ Blocked

_None_

## ✅ Done (recent)

- [x] Simpler form (D-026): keywords required, description optional, 15 fields removed from the UI, report shows 7 rows + scroll with CSV/JSON/PDF downloads (2026-11-25)
- [x] T-011 Feedback loop: result ratings, template counters, learned ordering nudges, selector track record, review report (D-025) (2026-11-25)
- [x] T-014 Local Postgres 18: `dextra` + `dextra_test` created, migrated, seeded; all 11 API tests pass; full stack checked in the browser with 2 real SerpAPI searches (2026-11-25)
- [x] T-007 Web app: intake form (basic + advanced + security), pre-run summary, progress, report with groups and exports, demo mode (D-024) (2026-11-25)
- [x] T-016 Rule-based picks follow the request: opt-in templates need a matching word, mentioned param values win (2026-11-25)
- [x] T-015 Live end-to-end check with SerpAPI: 3 searches, 28 results, all in scope, no fallback needed (2026-11-25)
- [x] T-009 Runner with paging, Soft fallback and F4 outside batches (D-023) (2026-11-25)
- [x] T-010 Dedupe, scoring, main / outside / unverified groups, CSV/JSON exports, results API (D-023) (2026-11-25)
- [x] Phase 7 code: `@dextra/db` (tables, hand-written migration, template seed), `apps/api` (Hono, Better Auth, plans/runs/confirm/locations, audit log, rate limit, Pino), CI Postgres service (D-022) (2026-11-25) — not yet run against a local database (T-014)
- [x] T-005 Template selector: Claude structured output + rule-based fallback, engine router, exclusion proposals (D-021) (2026-11-25)
- [x] T-006 Query compiler (`buildPlan`) + query guard + result guard; selection validation; budget, cross-goal cap, Soft fallback / F4 outside batches (D-020) (2026-11-25)
- [x] T-004b `TemplateSchema` + library rules, Markdown → generated module, `TemplateIdSchema`; DB seed moves to Phase 7 (D-019) (2026-11-25)
- [x] T-003 Intake spec Zod schema `IntakeSpecSchema` + validators + generated ISO lists, 49 tests (D-018) (2026-11-25)
- [x] T-001 SERP provider spike: adapters + operator matrix; SerpAPI/Google for v1, Bing off, results re-checked in code, pages of 10 (D-015 – D-017) (2026-11-25)
- [x] T-002 App stack chosen (D-014) (2026-11-25)
- [x] Phase 1 bootstrap: monorepo, strict TS, Biome, Vitest, Turbo, Lefthook, CI, `@dextra/core`, `@dextra/env` (2026-11-25)
- [x] T-004 Template library v1.0: 36 templates, 9 goals, decisions D-007–D-013 (2026-11-25) — engine lists to verify in T-001
- [x] Intake form spec, strictness model, engine selection, type-safety rules (2026-11-25, in chat)
