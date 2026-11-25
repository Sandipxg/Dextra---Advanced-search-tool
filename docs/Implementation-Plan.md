# Dextra (Dork Search Tool) — Implementation Plan

_Created 2026-11-25 · Source: `dork-search-tool.zip` (CLAUDE.md + /docs) · Target repo: `Sandipxg/Dextra---Advanced-search-tool` (currently empty)_

This plan turns the design in `/docs` (Aim, Architecture, Intake Form Spec, Decisions D-001…D-006, Tasks T-001…T-012) into ordered build phases. Every phase ends with code **and** the matching `/docs` updates in the same commit (CLAUDE.md rule).

---

## 0. Stack (resolves T-002)

Chosen from the personal-preferences skill. 💡 = suggested default, confirm once.

| Layer    | Choice                                                                                             | Why here                                                              |
| -------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Language | TypeScript, `strict: true`                                                                         | Confirmed preference                                                  |
| Repo     | pnpm workspaces + Turborepo 💡                                                                     | Share the one Zod schema between form, API and LLM validation (D-005) |
| Frontend | React + Vite SPA                                                                                   | Tool behind login, no SEO → Vite per decision guide                   |
| UI       | Tailwind + shadcn/ui, React Hook Form + `@hookform/resolvers/zod` 💡                               | Form-heavy app; dropdowns/combobox/multi-select out of the box        |
| State    | Zustand (form mode, UI), TanStack Query (runs, results)                                            | Confirmed / suggested split                                           |
| Backend  | Node LTS + Hono 💡, REST + typed client (Hono RPC)                                                 | TS-first, light                                                       |
| DB       | PostgreSQL (Neon 💡) + Orchid ORM                                                                  | Orchid is confirmed → Postgres                                        |
| Auth     | Better Auth                                                                                        | Needed for audit log on authorized security runs (F6)                 |
| Jobs     | Run queries inline for v1; BullMQ + Redis only if runs exceed request time (Thorough ≈ 80 queries) | Avoid infra until needed                                              |
| LLM      | Claude via Anthropic SDK, tool use with enum-typed input schema                                    | Template selection (D-002)                                            |
| Tooling  | Biome, Vitest, MSW (mock SERP + LLM), Playwright, t3-env, Pino                                     | Suggested defaults                                                    |

### Folder layout

```
apps/
  web/            React + Vite form, pre-run summary, report
  api/            Hono: /spec/validate, /plan, /run, /runs/:id, auth
packages/
  core/           PURE logic, no I/O — fully unit-tested
    schema/       intake spec Zod schema + enums (countries, languages, goals…)
    templates/    template library (data) + template record schema
    selector/     LLM prompt + output schema, engine router
    guardrails/   scope, operator, budget, authorization checks
    compiler/     template + params + spec → concrete query strings + API params
    scorer/       dedupe, scoring, main vs "Outside scope" split
  serp/           provider interface + adapters (Serper, SerpAPI, Brave)
  db/             Orchid ORM tables + migrations
docs/             existing docs from the zip (kept current every commit)
```

Keeping all decision logic in `packages/core` (no network, no DB) is the main design choice: the guardrails and compiler are the safety boundary, so they must be trivially testable.

---

## Phase 1 — Bootstrap (½ day)

> ✅ Done 2026-11-25 on `chore/bootstrap`. The stack decision is D-014 (D-007 to D-013 went to the template library).

- Init repo from the zip contents (`CLAUDE.md`, `/docs`), add `.gitignore`, `.env.example`.
- pnpm workspace, Turborepo, shared `tsconfig.base.json` (strict), Biome, Vitest, Lefthook.
- t3-env schemas: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`, `SERPAPI_API_KEY`, `BRAVE_API_KEY`, `BETTER_AUTH_SECRET`.
- GitHub Actions: lint, typecheck, test.
- Docs: Architecture.md stack table filled; D-007 "Stack" added; T-002 done.

## Phase 2 — SERP provider spike (T-001, 1 day)

> ✅ Done 2026-11-25 on `feat/t-001-serp-providers`: SerpAPI/Google for v1, Bing off, results re-checked in code, pages of 10 (D-015 – D-017). Serper/Brave re-test is T-001b.

Goal: pick the default provider with evidence, not guesses.

- Define `SerpProvider` interface: `search({ q, engine, type, gl, hl, location, tbs, num, page }) → { results: SerpResult[], costUnits }`.
- Write adapters for **Serper** (Google), **SerpAPI** (Google + Bing engine), **Brave Search API**.
  - Note: Microsoft retired the native Bing Search API in Aug 2025, so "Bing" in E1 must come through a SERP vendor (e.g. SerpAPI `engine=bing`). Record this in Context.md.
- Spike script (`scripts/operator-matrix.ts`): run each operator (`site:`, `-site:`, `filetype:`, `ext:`, `intitle:`, `inurl:`, `intext:`, quotes, `OR`, `-term`) × each engine on a fixed test domain; record supported / ignored / error into `packages/core/templates/operator-matrix.json`.
- Check `gl`, `hl`, `location`, `tbs` (`qdr:*` and `cdr`), `num` per provider; note per-query price.
- Output: D-008 "SERP provider" (expected outcome: Serper as Google default for price; SerpAPI for Bing/Scholar/News and locations list; Brave optional), updated Context.md operator notes.

## Phase 3 — Intake spec schema (T-003, 1–2 days)

In `packages/core/schema`:

- Enums: `Goal` (9 values from A1), `UseCase` (A4), `Subdomains`, `Strictness` (`hard|soft|open`), `TimeRange` (`any|qdr:d|qdr:w|qdr:m|qdr:y|custom`), `ContentType` (D1), `Where` (D5), `Engine`, `ResultType`, `Platform` (E3), `Depth`, `PerQuery` (10/20/50/100), `OutputFormat`.
- Data lists shipped with the app: ISO 3166-1 alpha-2 countries, ISO 639-1 languages (filtered to what the provider accepts).
- Field validators: domain / `*.domain` regex + normaliser (strip scheme, path, trailing slash, lowercase, punycode), URL validator, length caps (A2 ≤ 300).
- `IntakeSpecSchema` matching the JSON in Intake-Form-Spec.md, with defaults for all 25 advanced fields so basic mode produces a full spec.
- Cross-field rules via `superRefine`:
  - A4 ∈ {bug_bounty, authorized_pentest} → B1 required, F6 required, `scope.mode` forced `hard`.
  - Security goal (A1 = attack surface / exposed pages / tech fingerprinting) → also forces hard scope.
  - B3 and E4 must not overlap B1.
  - C5 required iff C4 = custom, and from ≤ to.
- Export `IntakeSpec` type; `toBasicDefaults()`.
- Tests: table-driven valid/invalid specs, normaliser cases (`https://Target.com/path/` → `target.com`).

## Phase 4 — Template library (T-004, 1–2 days)

> ✅ Content done: `docs/Template-Library.md` v1.0 (36 templates, decisions D-007–D-013). Remaining work: `TemplateSchema` in Zod, YAML seed script (T-004b), engine lists re-checked against the T-001 matrix.

- `TemplateSchema`: `id`, `goal`, `query` (with `{placeholders}`), `params` (each an enum list), `engines`, `signal`, `priority`, `requiresScope: boolean`.
- ~20 starter templates covering every A1 goal, e.g.
  - documents: `docs_by_ext`, `docs_confidential_phrase`, `presentations`
  - exposed pages: `dir_listing` (`intitle:"index of"`), `login_pages`, `config_files_ext` (env, ini, log, bak), `error_pages`
  - attack surface: `subdomains_enum` (`site:*.{domain} -site:www.{domain}`), `admin_paths_inurl`, `api_docs` (swagger/openapi)
  - third-party: `mentions_on_platform` (`site:{platform} "{name}"`), `paste_mentions`, `public_docs_platforms` (Notion/Trello/Google Docs)
  - tech fingerprinting: `powered_by_intext`, `framework_paths`
  - company/competitor/news/general: `org_pages`, `press_releases`, `pricing_pages`, `topic_keywords`, `topic_filetype`
- Template IDs exported as a `z.enum` built from the library, so the LLM schema is derived, never hand-copied.
- `engines` field filled from the Phase 2 operator matrix (a template only lists engines that pass all its operators).
- Tests: every template compiles for every allowed param; no placeholder left unfilled.

## Phase 5 — Query compiler + guardrails (T-006, 2 days)

This is the safety boundary; build it **before** the LLM.

- **Compiler** (`compile(spec, selection) → PlannedQuery[]`): fills placeholders, then appends layers from Context.md in order — scope (`site:`), signal, exclusion (A5/B3/E4 → `-site:`, `-term`; B2 → `-site:www.`), precision (D2 terms, D3 `(a OR b)`, D4 quotes, D5 `intitle:`/`inurl:`/`intext:`). Maps C1–C5 to API params (`gl`, `location`, `hl`, `tbs=qdr:*|cdr:1,cd_min,cd_max`), F2 to `num`.
- **Strictness expansion:** Soft filters produce a primary batch + a widened fallback batch (marked `fallbackFor: "location"` etc.); Open filters are dropped from queries and passed to the scorer; F4 adds the ~20% outside-scope batch.
- **Guardrails** (each returns typed rejections, never throws silently):
  1. Scope check: parse every `site:` in the final string; reject if host ∉ scope list (wildcard-aware). Runs on the compiled string, not the template, so injected params can't bypass it.
  2. Operator check: every operator used must be `supported` for the target engine in the matrix; else re-route to next engine or drop.
  3. Budget cap: quick 10 / standard 30 / thorough 80 (+20% if F4); drop lowest `priority` first and list dropped ones.
  4. Authorization gate: security use cases need F6 confirmed + engagement link; otherwise the plan is refused.
  5. Param sanitiser: free-text values (names, keywords) are quoted/escaped; operator characters inside them are neutralised.
- Tests: adversarial cases (`names: ['x" site:evil.com']`, out-of-scope wildcard, Brave + unsupported operator, budget overflow).

## Phase 6 — Template selector + engine router (T-005, 2 days)

- **Engine router (code first, D-004):** Google default → per-template fallback to next capable engine → goal defaults (news → News endpoint, academic → Scholar, third-party mentions → +Bing) → accept at most one LLM-suggested engine with a reason → E1 override replaces all in advanced mode.
- **LLM call:** one tool `select_templates` whose input schema is generated from Zod (`zod-to-json-schema`): `{ selections: [{ templateId: enum, params: {...enum}, reason }], extraEngine?: {engine, reason}, exclusions: { terms[], sites[] }, followUpQuestion?: string }`.
  - Prompt gets only the validated spec + the template catalogue (id, goal, signal, params). No free-form query field exists in the schema.
  - Validate with Zod; on failure retry once with the error, then fail the plan visibly.
  - `followUpQuestion` used for the "general topic with no keywords" rule.
  - A5 exclusions come back for user confirmation in the summary, not applied blindly.
- Deterministic fallback selector (rules only) when the LLM is unavailable — also makes tests and CI LLM-free.
- Tests with MSW-mocked LLM responses, including invented template IDs and bad params (must be rejected).

## Phase 7 — API + persistence (2 days)

- Better Auth (email/password + GitHub OAuth) in `apps/api`.
- Orchid ORM tables: `users` (Better Auth), `runs` (spec JSON, status, user, created), `planned_queries`, `serp_results` (raw), `results` (deduped URL, score, group, reasons), `authorizations` (engagement link, confirmed_at, user — audit log), `template_stats` (for T-011), `serp_locations` cache (T-008).
- Endpoints:
  - `POST /spec/validate` → Zod errors per field
  - `POST /plan` → selector + compiler + guardrails → pre-run summary (templates, engines + why, query count, cost estimate, Hard/Soft/Open table, dropped items)
  - `POST /runs` (plan id, user confirmed) → execute
  - `GET /runs/:id` → status + report; `GET /runs/:id/export?format=csv|json`
  - `GET /locations?country=in` → cached SERP locations
- Rate-limit per user; never log API keys; Pino structured logs.

## Phase 8 — Runner, scorer, report (T-009, T-010, 2 days)

- Runner: concurrency-limited (p-limit), retries with backoff, per-run cost accumulator, stops at budget. Runs primary batch → checks F3 minimum → runs Soft fallback batches only if short → runs F4 batch if on.
- Scorer: URL normalisation (scheme, `www.`, trailing slash, tracking params) → dedupe → score = number of distinct queries/templates that surfaced it + rank position + Open-filter matches + E5 source preference. B6 "already have" URLs removed or flagged "new only".
- Grouping: main list vs "Outside scope" with reason labels ("Outside your location", "Outside your time range"); security runs list related assets as "unverified, not in scope" and never query them.
- Outputs: ranked list, grouped by goal, CSV, JSON (F5).

## Phase 9 — Frontend (T-007, T-008, 3 days)

- Basic mode: the 8 fields (A1, A2, B1, C1, C4, D1, F1, F4) with conditional A4/F6 (security) and C5 (custom dates).
- Settings → Advanced: remaining sections A–F, per-filter Hard/Soft/Open toggles, engine override.
- Searchable dropdowns (shadcn Combobox) storing codes; city dropdown fed by `/locations` filtered by country; tag inputs for D2–D4; domain list with live normalisation.
- Same `IntakeSpecSchema` as the RHF resolver → identical errors client and server.
- Pre-run summary screen with confirm/edit; run progress; report view with both groups and export buttons.
- Playwright: basic-mode happy path; security goal without authorization is blocked.

## Phase 10 — Feedback loop (T-011, T-012, later)

- "Useful / not useful" per result → `template_stats` hit rate per template × engine × goal.
- Feed hit rates into engine router goal defaults and template priority.
- Propose new template variants from data for human review (never auto-added, D-002).
- Measure outside-scope usefulness to settle T-012 (fixed 20% vs only-on-shortfall).

---

## Milestones

| Milestone             | Phases          | Proves                                             |
| --------------------- | --------------- | -------------------------------------------------- |
| M1 Core works offline | 1, 3, 4, 5      | Spec → compiled, guarded queries, all unit-tested  |
| M2 End-to-end CLI     | 2, 6, 8 (no UI) | `pnpm dextra run spec.json` returns ranked results |
| M3 v1 app             | 7, 9            | Aim.md Definition of Done                          |
| M4 Learning           | 10              | Hit-rate feedback                                  |

A CLI at M2 gives real result quality data before any UI work.

## Definition of Done mapping (Aim.md)

- Basic user submits form, gets ranked results → Phases 8, 9
- Every LLM output validated, invalid templates never reach the API → Phase 6 + compiler only accepts library IDs
- Out-of-scope `site:` rejected in code → Phase 5 guardrail #1, tested adversarially
- Docs current → each phase's commit updates Tasks/Progress/Decisions

## Open decisions to settle as you go

1. SERP provider default (Phase 2 → D-008).
2. Confirm 💡 stack items (pnpm/Turborepo, Hono, Neon, shadcn).
3. Claude model tier for selection (fast/cheap model is likely enough since output is enum-constrained).
4. T-012 outside-scope budget policy.
5. Whether v1 needs accounts at all, or only for security runs (audit log).
