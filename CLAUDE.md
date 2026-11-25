# Dork Search Tool

A search tool that turns a short intake form into accurate search results. The user fills a form (goal, target domains, country, time range, content type, depth). An LLM reads the validated spec, picks dork templates from a fixed library and fills their parameters. Code checks scope and engine support, then runs the queries through a SERP API and returns ranked, deduplicated results.

Design so far was done in a claude.ai chat on 2026-11-25. Everything decided there is in `/docs`. Read it before writing code.

## Start of every session

1. Read `docs/README.md`, `docs/Aim.md`, `docs/Tasks.md` and the latest entries of `docs/Progress.md`.
2. Read `docs/Intake-Form-Spec.md` before touching the form, the spec schema or template selection, and `docs/Template-Library.md` before touching templates, the compiler or the selector.
3. Read `docs/Decisions.md` before changing anything already decided there.

## Rules

- **Docs are part of every change.** Update the affected files in `/docs` before ending any response that changed code, decisions, scope or progress. Never "at the end".
- **The LLM never writes dorks freely.** It selects template IDs from the library and fills enum parameters. Its output is validated against the Zod schema; anything invalid is rejected before a query runs.
- **Type safety.** Any field with a known set of values is a dropdown storing a canonical code (ISO country, ISO language, SERP API location ID, our own enums). Free text only for description, keywords, domains, names, URLs and notes, each with its own validator.
- **One Zod schema** defines the intake spec; the form, the backend and the LLM output all validate against it.
- **Scope is enforced in code, not in the prompt.** Reject any query whose `site:` is neither in the user's scope list nor in the `platform` enum of the template that produced it (D-007). Security goals force domain scope to Hard and require the authorization field.
- **No proxy rotation or scraping Google directly.** All search goes through a SERP API.
- Stack: see D-014. Check the personal-preferences skill before adding libraries.
- Commands: `pnpm install`, `pnpm check` (lint + typecheck + test), `pnpm format`, `pnpm db:setup` (Better Auth tables + migrations + template seed), `pnpm --filter @dextra/api dev`, `pnpm --filter @dextra/web dev` (proxies `/api` to :3000) or `pnpm --filter @dextra/web dev:mock` (no API needed). Run `pnpm check` before every commit.
- Database migrations are hand-written (`pnpm --filter @dextra/db db new <name>`). Never run `db g`: it would drop Better Auth's tables.
- Internal packages export TS source (`./src/index.ts`); no default exports (Biome rule).
- After editing `docs/Template-Library.md`, run `pnpm --filter @dextra/core gen:templates` and commit both files; a test fails if they drift.
- Commit code and its docs together. Conventional Commits with task IDs. Never push.
