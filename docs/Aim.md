# Aim

## Problem

Good search dorks need operator knowledge most people don't have, and free-form LLM-written dorks are inconsistent and break often. Scraping Google directly gets blocked.

## Goal

A user fills a short form and gets accurate, scoped, deduplicated search results, without knowing any search operators.

## Target users

- Security researchers doing authorized recon (bug bounty, pentest, own org audit)
- Researchers, journalists and business users who need precise web searches

## Scope

### In scope (v1)

- [ ] Intake form: 8 basic fields, advanced fields behind a setting (see [Intake Form Spec](./Intake-Form-Spec.md))
- [ ] Zod schema for the intake spec
- [ ] Dork template library (~20 templates to start)
- [ ] LLM template selection with validated output
- [ ] Scope and operator checks in code
- [ ] SERP API integration with location, language and time parameters
- [ ] Hard / Soft / Open filter strictness with an "Outside scope" result group
- [ ] Dedupe and ranking; pre-run summary with query count and cost estimate
### Out of scope (for now)

- Rotating proxies or direct Google scraping — replaced by a SERP API
- Active scanning of found assets

## Definition of Done

- [ ] A basic-mode user can submit the form and get ranked results
- [ ] Every LLM output is validated; invalid templates never reach the API
- [ ] Out-of-scope `site:` queries are rejected in code
- [ ] Docs are up to date
