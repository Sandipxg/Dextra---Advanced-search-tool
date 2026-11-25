# Decisions

## D-028 — Media searches use Google's Videos and Images tabs

- **Date:** 2026-11-25
- **Status:** Accepted (refines D-027)
- **Context:** User report: Documents + keywords "shiddat, movie" + Video returned one unrelated PDF. The run showed two causes: (1) `doc_report_kind` hard-codes `filetype:pdf` and was still picked, because only templates with an `ext` param were filtered by content type; (2) the only video query asked for raw `filetype:mp4 OR …` files, which Google barely indexes (0 results). With no Soft filter to drop, no fallback ran.
- **Decision:**
  - **New result types `videos` and `images`** (SerpAPI: `tbm=vid` / `engine=google_images`; Serper: `/videos` / `/images`). Images come 100 per page, so the adapter slices out the requested page of 10.
  - **Library v1.3 (41 templates):** `doc_video_results` (Videos tab), `doc_image_results` (Images tab), `doc_audio_sites` (Spotify, SoundCloud, Apple Music/Podcasts, JioSaavn, Gaana, Audiomack, Internet Archive; Google has no audio tab). They run for **any goal** when their type is ticked or the request mentions media words (video, movie, trailer…; image, photo, logo…; song, music, podcast…).
  - **`doc_media_files`** (raw files) now runs only when the request asks for files by extension or "download".
  - **Content fit:** the rule selector skips templates whose query hard-codes a `filetype:` outside the ticked types, and filters `ext` params for every goal (not just documents). Media types never become a compiler `filetype:` layer.
  - **Redirect links:** Google Videos returns some results as `google.com/goto?url=<opaque>`. The link works, but the real site is only in `displayed_link`, so it is stored as the result's `source` and the report shows "www.youtube.com (via Google)".
- **Consequences:** The reported search now plans 1 query (2 paid requests) and returned 20 relevant videos. Redirect links can't be deduplicated against direct links or checked against a domain scope (their host is google.com). The LLM selector path doesn't apply the content-fit check yet (no API key to test it; T-005b).

## D-027 — More platforms, "Select all", media content types

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** User asked for more "Also search on these platforms" options with a "Select all" checkbox, and for image, video and audio content types.
- **Decision:**
  - **Platforms (E3):** 25 options in 5 groups (Social, Communities and blogs, Code, Docs and files, Business and reviews). Added TikTok, Pinterest, Quora, Hacker News, Medium, Substack, DEV, Bitbucket and Trustpilot alongside the existing ones. A "Select all" checkbox (partly-ticked state when only some are picked) sits above the groups, with a note that each platform adds searches and the total shows on the review page.
  - **Templates (library v1.2, 38 templates):** `tp_forums` covers Reddit, Stack Overflow, Quora, Hacker News, Medium, Substack and DEV; `tp_social` adds TikTok and Pinterest; `tp_public_docs` and these two now allow up to 7 sites so "Select all" isn't cut short. New `tp_code_hosting` searches `"{name}"` on GitHub, GitLab and Bitbucket in normal runs (`tp_code_mentions` stays security-only). New `doc_media_files` (`filetype:` jpg/png/gif/webp/svg, mp4/webm/mov/avi/mkv, mp3/wav/m4a/ogg/flac).
  - **Content types (D1):** Images, Video, Audio. `doc_media_files` is opt-in: the rule selector picks it when one of these is ticked or the request mentions media words (image, photo, video, podcast…). A PDF-only request does not pick it.
- **Consequences:** "Select all" at standard depth planned 28 queries (56 paid searches) for one keyword, so it is costly; the budget cap and the review page still apply. `filetype:` for media extensions has not been checked in the operator matrix yet (Context).

## D-026 — Simpler form: keywords first, fewer options

- **Date:** 2026-11-25
- **Status:** Accepted (supersedes parts of D-006 and D-018)
- **Context:** User feedback: the form was confusing and hard to use.
- **Decision:**
  - **Keywords drive the search.** The basic form is Goal, **Keywords** (required except for security goals), an optional Description, Target domains, Country, Time range, Content types, Depth and "Also show results outside my filters".
  - The required-keyword rule lives in `IntakeFormSchema` (web form and `POST /api/plans` / `spec/validate`), reported together with other errors. `IntakeSpecSchema` stays permissive for specs built in code. The description is optional everywhere.
  - **Advanced options** ("More options") keep only: domains to exclude, city or region, where keywords appear, extra platforms, results per search, minimum results before widening, and the Hard/Soft/Open toggles.
  - **Removed from the UI** (still accepted by the API with defaults): perfect result + examples, "what you don't want", subdomain mode, names, results you already have, result languages, "any of" words, exact phrases, engine choice, result types, sites to never show, source preference, output formats, notes. "What is this for?" only appears for security goals.
  - **Names fall back to keywords:** templates that search for a name (news, mentions, reviews, job posts) use the keywords when no names are given, and then skip the keyword layer so terms aren't repeated.
  - **Report:** results always show directly; exactly 7 rows are visible and the rest scroll inside the list; "Download all results" offers CSV, JSON and **PDF** below the list. The PDF is built in the browser (jsPDF, loaded on demand) and covers every group. Characters outside Latin-1 print as `?` (jsPDF's built-in fonts). "Group by goal" is gone.
  - The plan review step stays (cost and exclusions before anything runs).
- **Consequences:** Intake-Form-Spec.md lists the fields shown; the schema keeps every field so saved runs and API clients keep working.

## D-025 — Feedback loop

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Phase 10 (T-011, T-012). Learn which templates work without letting data rewrite the library (D-002).
- **Decision:**
  - **Ratings:** the run owner rates any result useful / not useful (click again to clear). The rating and the `useful` / `not_useful` counters of every template that found the result change in one transaction; changing a rating undoes the old one.
  - **Evidence:** per template (summed over engines, per goal): Laplace-smoothed useful rate `(useful + 1) / (ratings + 2)` and the share of results in scope. Ratings count from 5, scope rates from 20 results.
  - **Use in planning:** `priorityBoosts` nudges the order in which the budget keeps queries: +0.5 for well-rated (≥ 70%), −0.5 for poorly rated (≤ 30%), −0.5 when the engine keeps returning off-scope results (< 50%); range −1 … +0.5. Library priorities never change. The plan's notes say which templates moved. The Claude selector also gets a short track record for the goal in its user message.
  - **Human review:** `pnpm --filter @dextra/api template-report [--write]` prints per-template evidence and suggestions (retire/rework, promote, tighten scope, too narrow). Changes to `Template-Library.md` stay manual.
  - **T-012:** the report compares how often outside-scope vs main results are rated useful. With 20+ outside-scope ratings: keep the fixed ~20% batch if outside results are at least half as useful as main ones, otherwise switch to shortfall-only. Until then the fixed batch stays.
  - Engine routing is unchanged (only Google is enabled); stats are already kept per engine for when more are.
- **Consequences:** Feedback only exists for signed-in owners of a run; one person's ratings shape their own and others' orderings for the same goal (single-tenant for now).

## D-024 — Web app

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Phase 9 (T-007). Form, pre-run summary, progress and report for signed-in users.
- **Decision:**
  - **Stack:** React 19 + Vite 8 SPA, React Router 8, TanStack Query (server data), Zustand (UI settings only: the advanced-options switch, kept in `localStorage`), React Hook Form with `zodResolver(IntakeSpecSchema)` — the same schema as the API (D-005). Tailwind 4 with light/dark design tokens. Small hand-written UI components (button, field, combobox, tag input, segmented, chips) instead of the shadcn CLI, which needs interactive setup.
  - **API access:** same origin. Vite proxies `/api` to the API in dev, so Better Auth cookies work without CORS.
  - **Form:** basic mode shows the 8 fields; the use-case field and the Authorization card appear automatically for security goals / use cases; the header switch shows the 25 advanced fields with per-filter Hard/Soft/Open toggles. Domain fields drop a leading `www.` (a pasted URL almost always means the whole site); the API itself still accepts `www.` domains. Server-side field errors map back onto the form by path.
  - **Summary page:** searches now / possible extra / query budget, how templates were picked, strictness, every planned query (outside and fallback batches separately), dropped and blocked templates, and the suggested exclusions as checkboxes. Nothing runs before "Confirm and run".
  - **Run page:** polls every 2 s while searching; the report shows Results / Outside scope / Unverified with reason labels, optional "group by goal", and CSV/JSON export links. Result links are rendered only for http(s) URLs, with `rel="noopener noreferrer nofollow"`.
  - **Demo mode** (`pnpm --filter @dextra/web dev:mock`): MSW handlers stand in for the API using the real core pipeline (rule-based picks, `buildPlan`, `runPlan`, `scoreResults`) with fake search results. Where the browser refuses a service worker (the desktop app's browser pane does), `fetch` is routed through the same handlers. The same handlers back the component tests.
  - **Tests:** Vitest + Testing Library + MSW (jsdom). Playwright end-to-end tests wait for a running API with a database (T-014, T-017).
- **Consequences:** The production bundle is over 500 kB because the whole core package (including the selector prompt) is imported; split it later (T-018).

## D-023 — Runner, scoring and report

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** Phase 8 (T-009, T-010).
- **Decision:**
  - **Runner** (`runPlan`, pure, search function injected): primary + outside batches first, max 4 requests in parallel; then the Soft fallback batch only if primary queries returned fewer _in-scope_ results than F3 (results the engine returned off-scope don't count). Pages of 10, stopping at the first short page. A failing query is recorded and skipped; a run fails only if every executed query failed.
  - **Dedupe key:** URL without scheme, `www.`, default port, fragment, tracking params (`utm_*`, `gclid`, `fbclid`, ...) or trailing slash; params sorted.
  - **Groups:** `main` = in scope from a primary query (or a widened query whose only widened filter was scope and the host is in scope anyway); `outside` = found only by widened queries, labelled with what was widened, or off-scope results on Soft runs labelled "The search engine ignored your domain filter"; `unverified` = off-scope results on security runs (listed, never searched further). Hard runs drop off-scope results. B3/E4 hosts and B6 known URLs are removed. A result found in several groups keeps the best one.
  - **Score:** 10 per distinct query that found it + 10/position per hit + signal (+5 match, -5 miss, D-016) + bonuses: D3 terms in title/snippet (+2 each, max 6), Open content type (+3), Open scope host (+4), E5 official (+4 for scope or gov/edu hosts) or community (+4 for forum hosts).
  - **Storage:** only deduped, scored results (`result` table) and run stats; raw SERP responses are not kept. Per-template counts go to `template_stat`.
  - **Execution:** confirming a run (202) starts it in the background in the API process; the client polls `GET /api/runs/:id`. Failures store a generic message; details go to the logs only.
  - **Exports:** `GET /api/runs/:id/results?group=` (paged) and `/export?format=csv|json`. CSV cells starting with `= + - @` get a leading `'` (CSV injection), since titles and snippets come from arbitrary pages.
- **Consequences:** A job queue (BullMQ) replaces the in-process background task when the API runs on more than one instance.

## D-022 — API and persistence layout

- **Date:** 2026-11-25
- **Status:** Accepted (verified against Postgres 18 on 2026-11-25)
- **Context:** Phase 7. Store runs, audit authorizations, serve the form and summary.
- **Decision:**
  - **Tables** (`@dextra/db`, Orchid ORM, snake_case): `run` (spec, selections, plan, notes, proposed exclusions, status `planned → confirmed → running → done/failed/cancelled`), `authorization` (insert-only audit row per confirmed security run: user, use case, domains, link, first `X-Forwarded-For` IP), `template` (seeded from the library, D-019), `template_stat` (T-011), `serp_location` (T-008). Results tables come with the runner (Phase 8).
  - **Migrations are hand-written** (rake-db). `db g` would drop tables it doesn't know, including Better Auth's.
  - The table factory must use `nodePostgresSchemaConfig` (node-postgres driver); otherwise json columns holding arrays are not JSON-encoded.
  - **Auth:** Better Auth on the same database with its own migrations (`migrate:auth`), email/password, GitHub only when both GitHub env vars are set, built-in rate limiting for auth routes.
  - **API** (`apps/api`, Hono): `POST /api/spec/validate` (public), `POST /api/plans` (validate → select → route engines → `buildPlan` → store `planned` run), `POST /api/runs/:id/confirm` (optional accepted exclusions → re-plan; security runs write the audit row; status `confirmed`), `GET /api/runs`, `GET /api/runs/:id`, `GET /api/locations?country=&q=`. Other users' runs return 404. Plans are limited to 30 per user per hour (in-memory; move to Redis with multiple instances).
  - Logs carry method, path, status and duration only — no bodies, cookies or headers.
  - `ANTHROPIC_API_KEY` is optional in the env schema (rule-based picks without it).
  - **Tests:** API tests run against a separate `DATABASE_TEST_URL`, which a Vitest global setup migrates and seeds; they are skipped when it isn't set. CI runs them against a Postgres 18 service.
- **Consequences:** Run execution (`confirmed → running → done`) is Phase 8.

## D-021 — Template selector: Claude with a deterministic fallback

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** T-005. The selector must only pick enum ids/values (D-002) and a run must not depend on the LLM being available.
- **Decision:**
  - `@dextra/selector` calls **Claude Opus 5.5** (`claude-opus-5-5`, overridable) with **structured outputs** (`messages.parse` + `zodOutputFormat(SelectorOutputSchema)`), **effort `low`** (picking from enums is a simple task) and `max_tokens` 16000.
  - Prompt: a static system prompt with the rules and the whole approved catalogue (one JSON line per template), marked for prompt caching; the validated spec plus run facts (budget, security run, country, keywords missing) go in the user message. The spec is labelled as user data.
  - Output schema avoids free-form records (params are name/values pairs) and only allows template ids from the library. Every pick is re-checked with `validateSelection` (invalid ones dropped with a note), then again by `buildPlan`.
  - **Fallback:** on a refusal, an API error (auth, rate limit, connection, other status), no API key, or no valid picks, the **rule-based selector** runs instead (goal templates by priority; opt-in templates such as `doc_sensitive_label`, `doc_data_files` and `tech_stack_in_jobs` only when the request mentions a matching word; param values the request mentions preferred over the first values; ext from the content filter, platforms from E3 — T-016). Unusable output (no parse, `max_tokens`) is retried once first. Programming errors still throw. Chosen over the API's server-side model fallback because security-recon specs can trip safety classifiers, and the rule selector gives a predictable result at no cost.
  - **Exclusions** from A5 come back as proposals only; `applyExclusions` merges them after the user confirms (invalid or target domains skipped).
  - **Engine router** (`routeEngines`): advanced override replaces everything; otherwise Google plus notes; an LLM engine suggestion is recorded but only used if that engine is enabled (none are yet, D-015).
- **Consequences:** The LLM path is tested with a fake client only; a live run needs `ANTHROPIC_API_KEY` (T-005b).

## D-020 — Query compiler rules

- **Date:** 2026-11-25
- **Status:** Accepted
- **Context:** T-006 (`buildPlan` in `packages/core/src/compiler`). The spec left some compile-time behaviour open.
- **Decision:**
  - **Layer order:** scope → template signal → D1 content → D2/D4 keywords (D5 placement) → exclusions (`-site:` for B3 + E4, `-term` for confirmed A5).
  - **Scope vs B5:** `required` and `subdomains` templates are always scoped to B1, whatever B5 says; B5 Soft/Open only affects `optional` templates. Widening a login-page template to the whole web would be wrong.
  - **B2 "main domain only"** can't be expressed reliably in Google, so it is enforced by the result check only. "Subdomains only" adds `-site:www.d`. `*.d` compiles to `site:d` (Google ignores `site:*.`).
  - **D3 (any of)** goes into the query only for `{keywords}` templates; elsewhere it is Open (re-rank).
  - **D1** adds a `filetype:` group only for documents / general / company / competitor templates that don't already have `filetype:`.
  - **C3** sends only the first language (`hl` takes one value).
  - **Soft filters:** each primary query gets one widened twin with _all_ its Soft filters removed. With F4 on, the first ~20% of the budget's widened twins run as the "outside" batch; the rest are fallbacks that run only if primary results < F3. (Fixed 20% for now; T-012 still open.)
  - **Fan-out caps:** ≤ 10 queries per template, ≤ 3 names/domains per var, ≤ 5 domains per `site:` OR group. Budget keeps priority 1 first, then selection order; cross-goal queries ≤ 30% of budget.
  - **User text** (names, keywords, exclusions) is cleaned and quoted whenever it could act as an operator. Vars are inserted as compiled fragments; spaced param values outside quotes are quoted.
  - **Query guard** (`checkQuery`) runs on every final string: only `site:`, `filetype:`, `intitle:`, `inurl:`; positive `site:` must be in B1 (subdomains allowed, lookalikes rejected) or the producing template's picked platforms; balanced quotes; no leftover placeholders; ≤ 32 words. **Result guard** (`checkResult`) re-checks scope, never-show hosts and the URL/title signal (D-016).
- **Consequences:** A plan reports dropped templates (with reasons), rejected queries (with violations), request counts in pages, and the strictness table for the pre-run summary.

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
