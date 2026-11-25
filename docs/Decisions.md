# Decisions

## D-019 — Template library: Markdown source, generated TS module

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** T-004b. The library lives in Markdown for review, but `@dextra/core` runs in the browser too and must not read files at runtime.
- **Decision:** `docs/Template-Library.md` stays the source of truth. `gen:templates` parses its YAML blocks, validates them with `TemplateSchema` + `TemplateLibrarySchema`, and writes `library.generated.ts` (`TEMPLATE_IDS` as a const tuple, `TEMPLATE_DATA`). `templates/index.ts` re-validates the data at load and exposes `TemplateIdSchema`, `getTemplate`, `templatesForGoal`, `paramValuesFor` (regional filter). A test compares the generated module with the Markdown. The Phase 7 DB seed reuses `parseTemplateLibrary`.
- **Consequences:** Editing a template = edit the Markdown, run `gen:templates`, commit both. `yaml` is a dev dependency only.

## D-018 — Intake spec schema details

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** T-003 turned the form spec into `IntakeSpecSchema`. A few gaps in the spec needed a call.
- **Decision:**
  - **Security run** = security goal (`attack_surface`, `exposed_pages`) or A4 = `bug_bounty` / `authorized_pentest`. Security goals also require A4 to be one of `bug_bounty`, `authorized_pentest`, `own_org_audit`. Security runs require B1 and F6 `confirmed: true`; the link is required for bug bounty / pentest and optional for own-org audits. Scope mode is coerced to `hard`.
  - **D1 stores categories** (`pdf`, `word`, `spreadsheet`, `presentation`, `text`, `dataset`, `web`), not extensions; `CONTENT_TYPE_EXTENSIONS` maps them to `filetype:` values. The old example used `pptx`.
  - **D5 drops "Page text"** because Google ignores `intext:` (T-001).
  - **Country/language lists** are generated from ICU (`pnpm --filter @dextra/core gen:iso`) with historic/deprecated codes removed and counts asserted (249 / 183).
  - Field names follow the spec JSON (snake_case). Filters carry `{ value, mode }`; `filetypes` became `content`; A5 raw text is `avoid`.
  - Defaults use Zod `.prefault()` so a basic-mode payload parses into a complete spec.
- **Consequences:** The form, API and LLM validation all import `IntakeSpecSchema` from `@dextra/core`. Intake-Form-Spec.md shows the real output shape.

## D-017 — Fetch results in pages of 10

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** The `num=20` probe returned 6 results on Google and 10 on Bing: both ignore larger page sizes.
- **Decision:** Every provider call asks for at most 10 results. F2 (10 / 20 / 50 / 100) means 1 / 2 / 5 / 10 pages per query, and the runner stops paging when a page comes back short. Cost estimates count pages, not queries.
- **Consequences:** F2 default 20 = 2 requests per query; Thorough (~80 queries) at 20 results is about 160 requests. The pre-run summary must show this.

## D-016 — Code re-checks every result (operators are hints)

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** In T-001, Google sometimes dropped `site:` entirely (`site:nasa.gov inurl:artemis` returned wired.com and YouTube), and `intext:` was spell-corrected into "Intex" products. Scope enforced only in the query string is not enough.
- **Decision:** After every SERP call, code checks each result URL against the scope list. Hard scope: off-scope results are discarded. Soft scope: they go to the "Outside scope" group labelled "engine ignored your filter". Where the signal is checkable from the URL or title (`filetype:` → extension or PDF-like path, `inurl:` → term in URL, `intitle:` → term in title), non-matching results are down-ranked, not dropped. Per-template "scope held" rates feed the T-011 hit-rate loop.
- **Consequences:** Extends T-006 (guardrails) and T-010 (scorer). A query whose results are mostly off-scope is flagged in the report.

## D-015 — SERP provider for v1: SerpAPI for Google; Bing off

- **Date:** 2026-11-25
- **Status:** Accepted (revisit when Serper/Brave keys are available)
- **Context:** T-001 operator matrix ([Operator Matrix](./Operator-Matrix.md)), run with a SerpAPI key only. Google via SerpAPI honoured `site:`, `-site:`, `filetype:`, `OR`, `intitle:`, quotes and `-term`. Bing via SerpAPI returned near-identical generic "mars" results for every probe: it ignored `site:`, `filetype:` and quoted phrases.
- **Decision:** v1 runs Google through SerpAPI. Bing is disabled for template queries (adapter kept, engine lists set to `[google]`). Serper and Brave adapters stay but are untested; re-run the spike with their keys before enabling them (T-001b).
- **Consequences:** One engine in v1, so the engine router (D-004) has a single choice until T-001b. Swapping providers stays a config change behind `SerpProvider`.
- **Alternatives considered:** Keep Bing for broader coverage — rejected, its results would bypass scope entirely.

## D-014 — App stack

- **Date:** 2026-11-25
- **Status:** Accepted (items marked 💡 are defaults until confirmed)
- **Context:** T-002; chosen from the personal-preferences skill.
- **Decision:** TypeScript (strict) in a pnpm + Turborepo 💡 monorepo. React + Vite SPA (tool behind login, no SEO), Tailwind + shadcn/ui 💡, React Hook Form + Zod, Zustand for UI state, TanStack Query for server data. Node 24 + Hono 💡 API. PostgreSQL (Neon 💡) + Orchid ORM. Better Auth. Biome, Vitest 5, Lefthook, t3-env, Pino. TypeScript 7 (native compiler).
- **Consequences:** Internal packages export TS source directly (`exports: ./src/index.ts`, `moduleResolution: Bundler`) — no build step between packages. The project must live in a short path on Windows: Biome and Lefthook ship native binaries that fail past the 260-character path limit.
- **Alternatives considered:** Next.js full-stack — no SEO need; a separate API keeps the safety-critical compiler/guardrails in plain Node.

## D-013 — No new template categories for v1

- **Date:** 2026-11-25
- **Status:** Accepted
- **Decision:** v1 ships the 36 templates in [Template Library](./Template-Library.md). People/employee search is excluded on privacy grounds. New templates (job postings, cloud buckets, product listings, etc.) enter only through the D-002 review flow.

## D-012 — Security template set

- **Date:** 2026-11-25
- **Status:** Accepted
- **Decision:** 12 templates are `sensitivity: security`: the 5 exposed-pages, 5 attack-surface, `tp_code_mentions` and `tp_paste_mentions`. They run only when the authorization gate passes (A4/F6) and domain scope is Hard.

## D-011 — Country-specific enum values

- **Date:** 2026-11-25
- **Status:** Accepted
- **Decision:** A template may carry a `regional` map (enum value → ISO country codes). Those values are offered to the LLM only when C1 matches (e.g. `zaubacorp.com`, `tofler.in`, `naukri.com`, `gov.in`, `DRHP` for `in`; `10-K`, `gov` for `us`).
- **Consequences:** Enum given to the LLM is built per request from the spec, not static.

## D-010 — Limited cross-goal template selection

- **Date:** 2026-11-25
- **Status:** Accepted
- **Decision:** The LLM selects from the primary goal's templates first and may borrow other goals' templates for up to 30% of the query budget, each with a reason shown in the pre-run summary. `security` templates are never borrowed into a non-security run.

## D-009 — `combine: or` by default with auto-split

- **Date:** 2026-11-25
- **Status:** Accepted
- **Decision:** When the LLM picks several values for a param, they are joined with `OR` in one query. The compiler splits into separate queries when the result exceeds the engine's query-length or OR-term limit (limits recorded in the T-001 operator matrix).
- **Alternatives considered:** Always split — more precise but multiplies cost.

## D-008 — Code fills all free-text vars

- **Date:** 2026-11-25
- **Status:** Accepted
- **Decision:** `{domain}`, `{name}` and `{keywords}` are filled by code from the validated spec, with escaping. The LLM output contains only template IDs, enum params and reasons — no free text reaches a query from the LLM.

## D-007 — Scope rule allows template platform hosts

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** The original rule ("reject any `site:` not in the user's scope list") would block every platform template (`site:github.com`, `site:reddit.com`).
- **Decision:** After compiling, a `site:` is allowed only if it is in the user's scope list (wildcard-aware) **or** a value from the `platform` enum of the template that produced the query. Everything else is rejected; `-site:` exclusions are always allowed. In security runs, platform templates may only search for an in-scope domain/name as text.
- **Consequences:** CLAUDE.md scope rule updated. The guardrail needs to know which template produced each query.

## D-006 — Basic and advanced form modes

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** The full form has 33 fields, too many for most users.
- **Decision:** Show 8 fields by default (goal, description, target domains, country, time range, content type, depth, "show results outside my filters"). The other 25 are hidden behind Settings → Advanced search options and run with defaults. Authorization fields appear automatically for security goals.
- **Consequences:** Basic users get the same engine with defaults; per-field strictness toggles are advanced only.

## D-005 — Dropdowns with canonical codes; one Zod schema

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Typed values (countries, cities) get misspelled and break API parameters.
- **Decision:** Every field with a known value set is a dropdown storing a canonical code (ISO 3166-1 alpha-2, ISO 639-1, SERP API location IDs, own enums). Free text only for open-ended content, each with a validator. One Zod schema validates form, backend and LLM output.
- **Alternatives considered:** Free text plus fuzzy matching — still error-prone.

## D-004 — Hybrid engine selection

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Users rarely know which engine supports which operator; LLM-only choice is inconsistent.
- **Decision:** Code picks engines from template support and goal rules (Google default). The LLM may add one engine with a reason but can't remove any. Users can override in advanced mode. The pre-run summary shows engines and why.
- **Alternatives considered:** User picks — lower accuracy. LLM picks — inconsistent.

## D-003 — Hard / Soft / Open filter strictness

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Users want filters as preferences but still want relevant results outside them.
- **Decision:** Each filter has a mode. Soft is the default: filtered first, widened if below the minimum. A global switch adds ~20% budget for an "Outside scope" group. Security goals force domain scope to Hard; related assets are listed as unverified, not queried further.
- **Open question:** fixed ~20% budget vs only when filtered results fall short.

## D-002 — LLM selects from a template library, never writes dorks freely

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Free-form dorks break operators, drift out of scope and vary between runs.
- **Decision:** The LLM picks template IDs (enum) and fills enum parameters. New variants are proposed from feedback data and reviewed before entering the library.

## D-001 — SERP API instead of rotating proxies

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Rotating proxies against Google still hit CAPTCHAs (fingerprinting), datacenter IPs get blocked, residential pools are costly and sometimes unethical, and it breaks Google's terms.
- **Decision:** Use a SERP API (Serper, SerpAPI, Brave Search API or Tavily); it handles blocking and returns JSON.
- **Consequences:** Per-query cost; provider choice still open.
