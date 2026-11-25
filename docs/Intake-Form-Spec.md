# Intake Form Spec

_Last updated: 2026-11-25 · Source: [Search Intake Form Spec](https://claude.ai/artifact/GY7yufbxFhqpUavnoQbVUw) (claude.ai doc)_

## Overview

The form collects 33 fields in 6 sections and turns them into one validated JSON spec. The LLM never writes dorks freely: it reads the spec, picks template IDs from the library, and fills their parameters. Code then checks scope and engine support before any query is sent.

Every filter carries a strictness setting, so a user can say "prefer India, but show me global results too" without a second form. Required fields are marked **(req)**; everything else has a sensible default so a quick user can skip it.

## Basic and advanced fields

_Simplified on 2026-11-25 ([D-026](./Decisions.md#d-026)). The schema still accepts every field below; the form shows only these._

| Shown by default                        | Notes                                                              |
| --------------------------------------- | ------------------------------------------------------------------ |
| A1 What are you trying to find?         | Picks the template group                                           |
| **D2 Keywords**                         | Required except for security goals; every result must contain them |
| A2 Description (optional)               | Extra context for picking templates                                |
| B1 Target domains                       | Required for security goals                                        |
| C1 Country                              |                                                                    |
| C4 Time range                           |                                                                    |
| D1 Content type                         |                                                                    |
| F1 Depth                                | Controls cost                                                      |
| F4 Also show results outside my filters |                                                                    |

| Advanced ("More options")          |                        |
| ---------------------------------- | ---------------------- |
| B3 Domains to exclude              |                        |
| C2 City or region                  | Needs C1               |
| D5 Where keywords appear           | Anywhere · title · URL |
| E3 Also search on platforms        |                        |
| F2 Results per search              | Pages of 10            |
| F3 Minimum results before widening |                        |
| Hard / Soft / Open toggles         | B5, C1, C2, C4, D1, E3 |

Not shown any more: A3, A4 (except for security goals), A5, B2, B4 (keywords stand in for names), B6, C3, D3, D4, E1, E2, E4, E5, F5 (results always show in the report, with CSV / JSON / PDF downloads), F7.

Conditional fields appear only when needed: A4 and F6 appear when the description or A1 points to security work, and C5 appears when C4 = Custom.

In basic mode every filter uses its default strictness. The per-field Hard/Soft/Open toggles are advanced only; F4 is the basic user's single control for "prefer my filters but show more".

## Type safety

Every field with a known set of values is a dropdown that stores a canonical code, never the label the user sees. Free text is allowed only where the content is open-ended, and each of those fields gets its own validator.

| Field                               | Input                               | Stored value                                                                                | Source of options                 |
| ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- |
| A1 Goal, A4 Use case                | Dropdown                            | Enum key (`documents`, `bug_bounty`)                                                        | Our own enum                      |
| C1 Country                          | Searchable dropdown                 | ISO 3166-1 alpha-2 (`in`)                                                                   | Country list shipped with the app |
| C2 City or region                   | Searchable dropdown, filtered by C1 | Canonical location name or ID from the SERP API                                             | SERP API locations list, cached   |
| C3 Language                         | Multi-select                        | ISO 639-1 (`en`, `gu`)                                                                      | Languages the SERP API accepts    |
| C4 Time range                       | Dropdown                            | `qdr:d` … `qdr:y`, `custom`                                                                 | Our own enum                      |
| C5 Custom dates                     | Date picker                         | ISO date (`2026-01-31`)                                                                     | none                              |
| D1 Content type, D5 Where           | Multi-select / dropdown             | Enum (`pdf`, `presentation`, `title`) — categories, expanded to `filetype:` by the compiler | Our own enum                      |
| E1–E3, E5 Engines, types, platforms | Multi-select / dropdown             | Enum (`google`, `github`)                                                                   | Our own enum                      |
| F1, F2, F5 Depth, per query, output | Dropdown                            | Enum or fixed number                                                                        | Our own enum                      |

Free text stays only for A2/A3 (description), A5 and D2–D4 (keywords), B1/B3/E4 (domains), B4 (names), B6 (URLs) and F7 (notes). Domains and URLs are normalised and checked against a domain regex; keywords get a "did you mean" spelling hint but are never auto-corrected.

One Zod schema defines the spec, and both the form and the backend validate against it. The LLM's output is validated too: template IDs and their parameters are enums from the library, so a misspelled or invented template is rejected before any query runs.

## Strictness model

Each filter (location, language, time, file type, domain, source) gets one of three modes, shown as a small toggle next to the field.

| Mode           | What the tool does                                                                              | Report label                    |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- |
| Hard           | Filter is baked into every query; nothing outside it is returned                                | none                            |
| Soft (default) | Filtered queries run first; if they return fewer than the minimum, extra unfiltered queries run | "Outside your filter: <reason>" |
| Open           | Filter only re-ranks results; nothing is excluded                                               | match score shown               |

A global switch, **"Also show related results outside my filters"**, sets every Soft field to also run a small extra batch (about 20% of the query budget) even when filtered results are plentiful. Those results go in a separate "Outside scope" group, never mixed into the main list.

One exception: when the goal is security recon, target domains are always Hard. Related assets found (lookalike domains, third-party hosts) are listed as "unverified, not in scope" for the user to check, and no deeper queries are run on them.

## Section A: Goal and intent

These answers decide which template group the LLM picks from, so they come first.

| ID  | Question                                      | Input                       | Options / default                                                                                                                                                                              | Used for                            |
| --- | --------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A1  | What are you trying to find? **(req)**        | Single select               | Attack surface · Documents/files · Exposed pages · Third-party mentions · Tech fingerprinting · Company/org research · Competitor/market research · News and mentions · General topic research | Template group                      |
| A2  | Describe it in one or two sentences **(req)** | Text, 300 chars             | none                                                                                                                                                                                           | LLM context, keyword extraction     |
| A3  | What would a perfect result look like?        | Text + up to 3 example URLs | none                                                                                                                                                                                           | Hit pattern, ranking                |
| A4  | What is this for?                             | Single select               | Bug bounty · Authorized pentest · Own org audit · Academic research · Journalism · Business research · Personal                                                                                | Guardrails, report tone             |
| A5  | Anything you definitely don't want?           | Text                        | none                                                                                                                                                                                           | Exclusion terms (`-word`, `-site:`) |

A4 matters because security use cases switch on the stricter rules in Section F.

## Section B: Target and scope

Scope is the single biggest driver of accuracy: `site:` alone removes most noise.

| ID  | Question                                | Input                    | Options / default                                                 | Used for                          |
| --- | --------------------------------------- | ------------------------ | ----------------------------------------------------------------- | --------------------------------- |
| B1  | Target domains                          | List (one per line)      | Required when A1 is a security goal; optional otherwise           | `site:{domain}`                   |
| B2  | Include subdomains?                     | Single select            | Yes (default) · No, main domain only · Subdomains only            | `-site:www.` patterns             |
| B3  | Domains to exclude                      | List                     | none                                                              | `-site:`                          |
| B4  | Names, brands or products to search for | List                     | Auto-suggested from B1                                            | Mention templates, quoted phrases |
| B5  | Domain strictness                       | Toggle                   | Hard · Soft · Open (default Soft; forced Hard for security goals) | Strictness model                  |
| B6  | Results you already have                | Paste URLs or upload CSV | none                                                              | Dedupe, "new only" mode           |

B1 accepts wildcards like `*.target.com`. The form normalises entries (strips `https://`, trailing slashes, paths) before validation.

## Section C: Location, language and time

These map straight onto SERP API parameters, not onto the dork itself, so they change which results Google ranks rather than which pages match.

| ID  | Question               | Input                               | Options / default                                                           | Strictness default | API parameter         |
| --- | ---------------------- | ----------------------------------- | --------------------------------------------------------------------------- | ------------------ | --------------------- |
| C1  | Country to search from | Searchable dropdown                 | Any (default) · country list                                                | Soft               | `gl`                  |
| C2  | City or region         | Searchable dropdown, filtered by C1 | none                                                                        | Soft               | `location`            |
| C3  | Result language(s)     | Multi-select                        | Any (default) · English · Hindi · Gujarati · others                         | Soft               | `hl`, `lr`            |
| C4  | Time range             | Single select                       | Any time (default) · Past day · Past week · Past month · Past year · Custom | Soft               | `tbs` (`qdr:d/w/m/y`) |
| C5  | Custom date range      | Date from / to                      | Shown only when C4 = Custom                                                 | Hard               | `tbs` (`cdr`)         |

With Soft location, the tool runs the main batch with `gl`/`location` set, then a smaller batch with them unset. Results that only appear in the global batch are labelled "Outside your location".

## Section D: Content type and keywords

This section fills the "signal" layer of each dork: the part that marks a result as a hit.

| ID  | Question                         | Input         | Options / default                                                                                                                                                                                                                                            | Strictness default | Becomes                        |
| --- | -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------ |
| D1  | What kind of content?            | Multi-select  | Any (default) · Web pages · PDF · Word · Spreadsheets · Presentations · Text/config files · Datasets (CSV/JSON) · Images · Video · Audio (D-027; served by web searches on video, image and audio sites plus a plain keyword search, not `filetype:`, D-028) | Soft               | `ext:` / `filetype:` with `OR` |
| D2  | Words that must appear           | Tag input     | none                                                                                                                                                                                                                                                         | Hard               | Bare terms (AND)               |
| D3  | Words where any one is enough    | Tag input     | LLM suggests synonyms for approval                                                                                                                                                                                                                           | Open               | `(a OR b OR c)`                |
| D4  | Exact phrases                    | Tag input     | none                                                                                                                                                                                                                                                         | Hard               | `"phrase"`                     |
| D5  | Where should those words appear? | Single select | Anywhere (default) · Page title · URL (no "Page text": Google ignores `intext:`, D-018)                                                                                                                                                                      | Soft               | `intitle:` / `inurl:`          |

Exclusions come from A5: the LLM turns that free text into `-term` and `-site:` lists and shows them back to the user for confirmation before the run.

## Section E: Sources and engines

This decides where queries go and which outside platforms get their own templates.

| ID  | Question                         | Input         | Options / default                                                                                                                                                                                                                                                                                                                                                                                                               | Strictness default | Used for                                 |
| --- | -------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------- |
| E1  | Search engines                   | Multi-select  | Auto (default) · Google · Bing · Brave                                                                                                                                                                                                                                                                                                                                                                                          | n/a                | Engine routing, operator check           |
| E2  | Result types                     | Multi-select  | Web (default) · News · Scholar                                                                                                                                                                                                                                                                                                                                                                                                  | n/a                | API endpoint per query                   |
| E3  | Outside platforms to also search | Multi-select  | 25 platforms in 5 groups with "Select all" (D-027): Social (LinkedIn, X, Facebook, Instagram, YouTube, TikTok, Pinterest) · Communities and blogs (Reddit, Stack Overflow, Quora, Hacker News, Medium, Substack, DEV) · Code (GitHub, GitLab, Bitbucket) · Docs and files (public Google Docs/Notion/Trello/Airtable, SlideShare/Scribd) · Business and reviews (Crunchbase, Glassdoor, G2, Capterra, Trustpilot, Product Hunt) | Soft               | Mention templates with `site:{platform}` |
| E4  | Platforms or sites to never show | List          | none                                                                                                                                                                                                                                                                                                                                                                                                                            | Hard               | Global `-site:` list                     |
| E5  | Source preference                | Single select | No preference (default) · Official sites first · Community/forums first                                                                                                                                                                                                                                                                                                                                                         | Open               | Re-ranking only                          |

If E1 includes Bing or Brave, the operator check from the template library runs per engine and drops templates that engine can't handle.

## Section F: Depth, output and authorization

The last section sets the query budget, the fallback behaviour and the output.

| ID  | Question                                     | Input                              | Options / default                                              | Used for                                                           |
| --- | -------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| F1  | How deep should we search?                   | Single select                      | Quick (~10 queries) · Standard (~30, default) · Thorough (~80) | Query budget, template count                                       |
| F2  | Results to fetch per query                   | Single select                      | 10 · 20 (default) · 50 · 100                                   | Pages of 10 results ([D-017](./Decisions.md#d-017)), cost estimate |
| F3  | Minimum useful results before widening       | Number                             | 15                                                             | Trigger for Soft fallback                                          |
| F4  | Also show related results outside my filters | Switch                             | Off (default)                                                  | Extra ~20% budget, "Outside scope" group                           |
| F5  | Output format                                | Multi-select                       | Ranked list (default) · Grouped by goal · CSV · JSON           | Report builder                                                     |
| F6  | Authorization                                | Checkbox + program/engagement link | Shown and required when A4 is Bug bounty or Authorized pentest | Run gate, audit log                                                |
| F7  | Anything else the tool should know?          | Text                               | none                                                           | LLM context                                                        |

Before running, the form shows a summary: chosen templates, estimated query count and API cost, and which filters are Hard, Soft or Open. The user confirms or edits from there.

## Engine selection

Hybrid: code picks the engines from rules, the LLM may add one with a stated reason, and the user can override in advanced settings. Users rarely know which engine supports which operator, so asking them by default lowers accuracy.

1. **Rules (code):** every template lists the engines it supports. Google runs by default; any template Google can't serve moves to the next engine that can.
2. **Goal defaults (code):** News and mentions adds the News endpoint; academic research adds Scholar; broad goals like third-party mentions add Bing for wider coverage.
3. **LLM suggestion:** given the spec, the LLM may propose one extra engine with a one-line reason, such as "Bing adds coverage for older indexed PDFs". It can't remove the rule-based engines.
4. **User override (advanced):** E1 set to anything other than Auto replaces steps 1–3; templates those engines can't serve are dropped and listed in the summary.

The pre-run summary always shows which engines were picked and why, so the choice is visible even in basic mode. Per-engine useful-hit rates from past runs feed back into step 2 over time.

## Validation rules and output spec

Validation runs in code before the LLM sees anything. The schema is `IntakeSpecSchema` in `packages/core/src/schema/intake-spec.ts` ([D-018](./Decisions.md#d-018)).

- A1 and A2 are always required; A2 is at most 300 characters.
- A **security run** is a security goal (Attack surface, Exposed pages) **or** A4 = Bug bounty / Authorized pentest.
  - A security goal needs A4 = Bug bounty, Authorized pentest or Own org audit.
  - A security run needs B1 and F6 (`confirmed: true`); Bug bounty and Authorized pentest also need the program/engagement link.
  - B5 is forced to Hard (the schema coerces it; the form shows it locked).
- Every B1/B3/E4 entry is normalised (scheme, path, port, case, trailing dot stripped; IDN → punycode) and must be a valid domain or `*.domain`. B3 and E4 can't repeat a B1 entry.
- C1 is an ISO 3166-1 code, C3 ISO 639-1 codes (lists generated from ICU: 249 and 183 codes). C2 needs C1.
- C5 is required when C4 = Custom and not allowed otherwise; dates are real ISO dates with from ≤ to.
- E1 may only list enabled engines (`google` in v1, D-015); `auto` lets the router choose.
- URLs (A3, B6, F6) must be http(s).
- Lists are de-duplicated case-insensitively; free text rejects control characters.
- If both D2 and D4 are empty and A1 is General topic research, the LLM asks one follow-up question for keywords (`needsKeywordFollowUp`).
- Estimated queries above the F1 budget → the lowest-priority templates are dropped and listed in the summary (planner, not schema).

The form outputs one spec, which is all the template selector receives. Basic mode sends only A1, A2 and the other six basic fields; every other field gets its default:

```json
{
  "goal": "documents",
  "description": "Public PDFs and decks from target.com",
  "perfect_result": { "text": "", "example_urls": [] },
  "use_case": "own_org_audit",
  "avoid": "careers pages",
  "scope": {
    "domains": ["target.com"],
    "subdomains": "include",
    "exclude_domains": ["blog.target.com"],
    "names": ["Target Corp"],
    "mode": "soft",
    "known_urls": []
  },
  "filters": {
    "country": { "value": "in", "mode": "soft" },
    "location": { "value": null, "mode": "soft" },
    "language": { "value": ["en"], "mode": "soft" },
    "time": { "value": "qdr:y", "custom": null, "mode": "soft" },
    "content": { "value": ["pdf", "presentation"], "mode": "hard" }
  },
  "keywords": { "all": [], "any": [], "phrases": [], "where": "anywhere", "exclude": ["careers"] },
  "sources": {
    "engines": "auto",
    "types": ["web"],
    "platforms": { "value": [], "mode": "soft" },
    "never": [],
    "preference": "none"
  },
  "depth": { "level": "standard", "per_query": 20, "min_results": 15 },
  "show_outside_scope": false,
  "output": ["ranked"],
  "authorization": null,
  "notes": ""
}
```
