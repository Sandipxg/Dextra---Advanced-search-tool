# Decisions

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
