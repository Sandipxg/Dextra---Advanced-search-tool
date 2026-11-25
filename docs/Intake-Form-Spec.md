# Intake Form Spec

_Last updated: 2026-11-25 · Source: [Search Intake Form Spec](https://claude.ai/artifact/GY7yufbxFhqpUavnoQbVUw) (claude.ai doc)_

## Overview

The form collects 33 fields in 6 sections and turns them into one validated JSON spec. The LLM never writes dorks freely: it reads the spec, picks template IDs from the library, and fills their parameters. Code then checks scope and engine support before any query is sent.

Every filter carries a strictness setting, so a user can say "prefer India, but show me global results too" without a second form. Required fields are marked **(req)**; everything else has a sensible default so a quick user can skip it.

## Basic and advanced fields

The default form shows 8 fields; the other 25 stay hidden until the user turns on **Settings → Advanced search options**. Hidden fields still run with their defaults, so a basic user gets the same engine as an advanced one.

| Shown by default                        | Why it's basic                                            |
| --------------------------------------- | --------------------------------------------------------- |
| A1 What are you trying to find?         | Picks the template group                                  |
| A2 Describe it                          | Gives the LLM keywords and context                        |
| B1 Target domains                       | Biggest accuracy gain; required for security goals        |
| C1 Country                              | Common ask, maps to one API parameter                     |
| C4 Time range                           | Common ask, maps to one API parameter                     |
| D1 Content type                         | Strongest signal for document goals                       |
| F1 Depth                                | Controls cost and run time                                |
| F4 Also show results outside my filters | One switch covers the Soft/Open behaviour for all filters |

Conditional fields appear only when needed: A4 and F6 appear when the description or A1 points to security work, and C5 appears when C4 = Custom.

In basic mode every filter uses its default strictness. The per-field Hard/Soft/Open toggles are advanced only; F4 is the basic user's single control for "prefer my filters but show more".

## Type safety

Every field with a known set of values is a dropdown that stores a canonical code, never the label the user sees. Free text is allowed only where the content is open-ended, and each of those fields gets its own validator.

| Field                               | Input                               | Stored value                                    | Source of options                 |
| ----------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------- |
| A1 Goal, A4 Use case                | Dropdown                            | Enum key (`documents`, `bug_bounty`)            | Our own enum                      |
| C1 Country                          | Searchable dropdown                 | ISO 3166-1 alpha-2 (`in`)                       | Country list shipped with the app |
| C2 City or region                   | Searchable dropdown, filtered by C1 | Canonical location name or ID from the SERP API | SERP API locations list, cached   |
| C3 Language                         | Multi-select                        | ISO 639-1 (`en`, `gu`)                          | Languages the SERP API accepts    |
| C4 Time range                       | Dropdown                            | `qdr:d` … `qdr:y`, `custom`                     | Our own enum                      |
| C5 Custom dates                     | Date picker                         | ISO date (`2026-01-31`)                         | none                              |
| D1 Content type, D5 Where           | Multi-select / dropdown             | Enum (`pdf`, `intitle`)                         | Our own enum                      |
| E1–E3, E5 Engines, types, platforms | Multi-select / dropdown             | Enum (`google`, `github`)                       | Our own enum                      |
| F1, F2, F5 Depth, per query, output | Dropdown                            | Enum or fixed number                            | Our own enum                      |

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

| ID  | Question                         | Input         | Options / default                                                                                               | Strictness default | Becomes                           |
| --- | -------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------- |
| D1  | What kind of content?            | Multi-select  | Any (default) · Web pages · PDF · Word · Spreadsheets · Presentations · Text/config files · Datasets (CSV/JSON) | Soft               | `ext:` / `filetype:` with `OR`    |
| D2  | Words that must appear           | Tag input     | none                                                                                                            | Hard               | Bare terms (AND)                  |
| D3  | Words where any one is enough    | Tag input     | LLM suggests synonyms for approval                                                                              | Open               | `(a OR b OR c)`                   |
| D4  | Exact phrases                    | Tag input     | none                                                                                                            | Hard               | `"phrase"`                        |
| D5  | Where should those words appear? | Single select | Anywhere (default) · Page title · URL · Page text                                                               | Soft               | `intitle:` / `inurl:` / `intext:` |

Exclusions come from A5: the LLM turns that free text into `-term` and `-site:` lists and shows them back to the user for confirmation before the run.

## Section E: Sources and engines

This decides where queries go and which outside platforms get their own templates.

| ID  | Question                         | Input         | Options / default                                                                                               | Strictness default | Used for                                 |
| --- | -------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------- |
| E1  | Search engines                   | Multi-select  | Auto (default) · Google · Bing · Brave                                                                          | n/a                | Engine routing, operator check           |
| E2  | Result types                     | Multi-select  | Web (default) · News · Scholar                                                                                  | n/a                | API endpoint per query                   |
| E3  | Outside platforms to also search | Multi-select  | GitHub · GitLab · Stack Overflow · LinkedIn · Reddit · X · Public Notion/Trello/Google Docs · SlideShare/Scribd | Soft               | Mention templates with `site:{platform}` |
| E4  | Platforms or sites to never show | List          | none                                                                                                            | Hard               | Global `-site:` list                     |
| E5  | Source preference                | Single select | No preference (default) · Official sites first · Community/forums first                                         | Open               | Re-ranking only                          |

If E1 includes Bing or Brave, the operator check from the template library runs per engine and drops templates that engine can't handle.

## Section F: Depth, output and authorization

The last section sets the query budget, the fallback behaviour and the output.

| ID  | Question                                     | Input                              | Options / default                                              | Used for                                 |
| --- | -------------------------------------------- | ---------------------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| F1  | How deep should we search?                   | Single select                      | Quick (~10 queries) · Standard (~30, default) · Thorough (~80) | Query budget, template count             |
| F2  | Results to fetch per query                   | Single select                      | 10 · 20 (default) · 50 · 100                                   | API `num`, cost estimate                 |
| F3  | Minimum useful results before widening       | Number                             | 15                                                             | Trigger for Soft fallback                |
| F4  | Also show related results outside my filters | Switch                             | Off (default)                                                  | Extra ~20% budget, "Outside scope" group |
| F5  | Output format                                | Multi-select                       | Ranked list (default) · Grouped by goal · CSV · JSON           | Report builder                           |
| F6  | Authorization                                | Checkbox + program/engagement link | Shown and required when A4 is Bug bounty or Authorized pentest | Run gate, audit log                      |
| F7  | Anything else the tool should know?          | Text                               | none                                                           | LLM context                              |

Before running, the form shows a summary: chosen templates, estimated query count and API cost, and which filters are Hard, Soft or Open. The user confirms or edits from there.

## Engine selection

Hybrid: code picks the engines from rules, the LLM may add one with a stated reason, and the user can override in advanced settings. Users rarely know which engine supports which operator, so asking them by default lowers accuracy.

1. **Rules (code):** every template lists the engines it supports. Google runs by default; any template Google can't serve moves to the next engine that can.
2. **Goal defaults (code):** News and mentions adds the News endpoint; academic research adds Scholar; broad goals like third-party mentions add Bing for wider coverage.
3. **LLM suggestion:** given the spec, the LLM may propose one extra engine with a one-line reason, such as "Bing adds coverage for older indexed PDFs". It can't remove the rule-based engines.
4. **User override (advanced):** E1 set to anything other than Auto replaces steps 1–3; templates those engines can't serve are dropped and listed in the summary.

The pre-run summary always shows which engines were picked and why, so the choice is visible even in basic mode. Per-engine useful-hit rates from past runs feed back into step 2 over time.

## Validation rules and output spec

Validation runs in code before the LLM sees anything.

- A1 and A2 are always required.
- B1 and F6 are required when A4 is Bug bounty or Authorized pentest; B5 is then locked to Hard.
- Every B1 entry must be a valid domain or `*.domain` wildcard; B3 and E4 can't overlap B1.
- C5 must have from ≤ to, and only appears when C4 = Custom.
- If both D2 and D4 are empty and A1 is General topic research, the LLM asks one follow-up question for keywords.
- Estimated queries above the F1 budget → the lowest-priority templates are dropped and listed in the summary.

The form outputs one spec, which is all the template selector receives:

```json
{
  "goal": "documents",
  "description": "Public PDFs and decks from target.com",
  "use_case": "own_org_audit",
  "scope": {
    "domains": ["target.com"],
    "subdomains": "include",
    "exclude_domains": ["blog.target.com"],
    "names": ["Target Corp"],
    "mode": "hard"
  },
  "filters": {
    "country": { "value": "in", "mode": "soft" },
    "language": { "value": ["en"], "mode": "soft" },
    "time": { "value": "qdr:y", "mode": "soft" },
    "filetypes": { "value": ["pdf", "pptx"], "mode": "hard" }
  },
  "keywords": { "all": [], "any": [], "phrases": [], "where": "anywhere", "exclude": ["careers"] },
  "sources": { "engines": ["google"], "types": ["web"], "platforms": [], "never": [] },
  "depth": { "level": "standard", "per_query": 20, "min_results": 15 },
  "show_outside_scope": false,
  "output": ["ranked"],
  "authorization": null
}
```
