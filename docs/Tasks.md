# Tasks

_Last updated: 2026-11-25_

## 🟡 In progress

_None_

## 🔜 Up next

- [ ] T-001b Re-run the operator matrix with Serper and Brave keys; decide whether to enable them (D-015)
- [ ] T-005 Template selector: LLM tool call with enum template IDs + Zod-validated output
- [ ] T-006 Guardrails: scope check, per-engine operator check, budget cap, authorization gate — plus result re-check against scope/signal (D-016)

## 🧊 Backlog

- [ ] T-007 Intake form UI: basic mode (8 fields) + advanced toggle
- [ ] T-008 Cached SERP API locations list for the city dropdown
- [ ] T-009 Runner with Soft-fallback batches and "Outside scope" group
- [ ] T-010 Dedupe and scoring; pre-run summary with cost estimate — cost counts pages of 10 (D-017)
- [ ] T-011 Feedback loop: useful-hit rate per template and engine
- [ ] T-012 Decide fixed ~20% outside-scope budget vs only-on-shortfall (open in D-003)

## ⛔ Blocked

_None_

## ✅ Done (recent)

- [x] T-004b `TemplateSchema` + library rules, Markdown → generated module, `TemplateIdSchema`; DB seed moves to Phase 7 (D-019) (2026-11-25)
- [x] T-003 Intake spec Zod schema `IntakeSpecSchema` + validators + generated ISO lists, 49 tests (D-018) (2026-11-25)
- [x] T-001 SERP provider spike: adapters + operator matrix; SerpAPI/Google for v1, Bing off, results re-checked in code, pages of 10 (D-015 – D-017) (2026-11-25)
- [x] T-002 App stack chosen (D-014) (2026-11-25)
- [x] Phase 1 bootstrap: monorepo, strict TS, Biome, Vitest, Turbo, Lefthook, CI, `@dextra/core`, `@dextra/env` (2026-11-25)
- [x] T-004 Template library v1.0: 36 templates, 9 goals, decisions D-007–D-013 (2026-11-25) — engine lists to verify in T-001
- [x] Intake form spec, strictness model, engine selection, type-safety rules (2026-11-25, in chat)
