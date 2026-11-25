# Progress

## 2026-11-25

- Designed the project in a claude.ai chat and moved it to Claude Code.
- Chose a SERP API over rotating proxies (D-001) and template selection over free-form dorks (D-002).
- Wrote the intake form spec: 33 fields, 8 basic, Hard/Soft/Open strictness (D-003, D-006).
- Decided hybrid engine selection (D-004) and dropdowns with canonical codes + one Zod schema (D-005).
- Wrote and approved the dork template library v1.0 (36 templates, 9 goals) in `Template-Library.md` (T-004).
- Decided scope rule for platform hosts (D-007), code-filled vars (D-008), OR-combine with auto-split (D-009), 30% cross-goal budget (D-010), regional enum values (D-011), 12 security templates (D-012), no new categories for v1 (D-013).
- Phase 1 bootstrap on branch `chore/bootstrap`: pnpm + Turbo monorepo, strict TS 7, Biome, Vitest 5, Lefthook, GitHub Actions CI; `@dextra/core` (goal enum) and `@dextra/env` (typed env). Lint, typecheck and 7 tests pass. Stack recorded as D-014 (T-002 done).
- Moved the project to `Desktop\dextra`: the earlier session folder's path broke the Biome and Lefthook binaries (Windows 260-character path limit).
- Next: SERP provider spike (T-001) with the operator matrix, then the intake spec Zod schema (T-003).
