# Tasks

_Last updated: 2026-11-25_

## 🟡 In progress

- [ ] T-001 SERP provider spike — adapters for Serper, SerpAPI (Google + Bing) and Brave done in `@dextra/serp`; operator-matrix script ready. **Blocked on a SERP API key** for the live run (`pnpm --filter @dextra/serp spike --yes`).

## 🔜 Up next

- [ ] T-003 Write the intake spec Zod schema from [Intake Form Spec](./Intake-Form-Spec.md)
- [ ] T-004b Seed script: parse YAML blocks in Template-Library.md into the `templates` table + Zod `TemplateSchema`
- [ ] T-005 Template selector: LLM tool call with enum template IDs + Zod-validated output
- [ ] T-006 Guardrails: scope check, per-engine operator check, budget cap, authorization gate

## 🧊 Backlog

- [ ] T-007 Intake form UI: basic mode (8 fields) + advanced toggle
- [ ] T-008 Cached SERP API locations list for the city dropdown
- [ ] T-009 Runner with Soft-fallback batches and "Outside scope" group
- [ ] T-010 Dedupe and scoring; pre-run summary with cost estimate
- [ ] T-011 Feedback loop: useful-hit rate per template and engine
- [ ] T-012 Decide fixed ~20% outside-scope budget vs only-on-shortfall (open in D-003)

## ⛔ Blocked

_None_

## ✅ Done (recent)

- [x] T-002 App stack chosen (D-014) (2026-11-25)
- [x] Phase 1 bootstrap: monorepo, strict TS, Biome, Vitest, Turbo, Lefthook, CI, `@dextra/core`, `@dextra/env` (2026-11-25)
- [x] T-004 Template library v1.0: 36 templates, 9 goals, decisions D-007–D-013 (2026-11-25) — engine lists to verify in T-001
- [x] Intake form spec, strictness model, engine selection, type-safety rules (2026-11-25, in chat)
