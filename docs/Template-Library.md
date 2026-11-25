# Dork Template Library

_Status: **v1.1 — content approved, engines verified for Google** (Bing/Brave pending, see [D-015](./Decisions.md#d-015)) · Last updated: 2026-11-25 · Task: T-004 · Decisions: [D-007 – D-013, D-015 – D-017](./Decisions.md)_

The LLM never writes a dork. It picks template `id`s from this file and picks values for each template's **params** from the listed enums. Code fills the **vars** from the intake spec, adds the scope/exclusion/keyword layers, translates operators per engine, and runs the guardrails. The YAML blocks below are the source of truth: `pnpm --filter @dextra/core gen:templates` validates them against `TemplateSchema` and writes `packages/core/src/templates/library.generated.ts`; a test fails if that file is stale. The DB seed (Phase 7) uses the same parser ([D-019](./Decisions.md#d-019)).

**Validation rules** (`packages/core/src/templates/schema.ts`): id has the goal prefix; no positive `site:`, `ext:`, `intext:`/`inbody:` or retired operators in `query`; every `{placeholder}` is a param or var and every param/var is used; `platform` param iff `scope_mode: platform`; param values carry no quotes, braces or newlines; security goals → `sensitivity: security`; security templates are never `none`/`optional` scope; `regional` keys are real param values; ids are unique. Quote YAML values that contain `:` or start with `"`.

---

## 1. How a template becomes a query

```
template.query          filetype:{ext} "{label}"
+ LLM params            ext = [pdf, docx]   label = confidential
+ code vars / layers    scope (site:), exclusions (-site:, -term), D2–D5 keywords
= compiled query        site:target.com (filetype:pdf OR filetype:docx) "confidential" -site:blog.target.com
```

### Who fills what

| Placeholder kind                                       | Filled by | Source                                | Example                                    |
| ------------------------------------------------------ | --------- | ------------------------------------- | ------------------------------------------ |
| **params** (`{ext}`, `{label}`, `{platform}` …)        | LLM       | Enum list in the template             | `ext: pdf`                                 |
| **vars** (`{domain}`, `{name}`, `{keywords}`)          | Code      | Validated intake spec (B1, B4, D2–D4) | `{name}` → `"Target Corp"`                 |
| **layers** (scope, exclusions, where, filetype filter) | Code      | Spec + strictness mode                | `site:target.com`, `-site:blog.target.com` |

Templates contain **only the signal** (plus a var where the signal needs it). Scope `site:` is added by the compiler from `scope_mode`, so one template works for one domain or many (`(site:a.com OR site:b.com)`).

The LLM never fills `{domain}`, `{name}` or `{keywords}`; they always come from the spec ([D-008](./Decisions.md#d-008)). The LLM output therefore contains no free text that reaches a query.

### Vars (code-filled, never LLM)

| Var          | From spec                                     | Escaping                                                 |
| ------------ | --------------------------------------------- | -------------------------------------------------------- |
| `{domain}`   | `scope.domains[i]` (B1), one query per domain | Normalised, regex-validated                              |
| `{name}`     | `scope.names[i]` (B4)                         | Wrapped in quotes, inner `"` and operator chars stripped |
| `{keywords}` | `keywords.all / any / phrases` (D2–D4)        | Compiled into `a b (c OR d) "phrase"`                    |

### Canonical dialect

Queries are written in **Google dialect**. The compiler translates per engine using the [operator matrix](./Operator-Matrix.md). If an operator has no translation, the template is dropped for that engine. Since T-001, every template lists `[google]` only: Bing via SerpAPI ignored `site:`, `filetype:` and quotes, and Serper/Brave are untested ([D-015](./Decisions.md#d-015)).

**Operators allowed in templates (Google, verified 2026-11-25):** `site:`, `-site:`, `filetype:`, `(a OR b)`, `intitle:`, `"phrase"`, `-term`, and `inurl:` (loose, see below). **Not allowed:** `ext:` and `site:*.` (Google drops the scope), `intext:` / `inbody:` (treated as plain words). Use a quoted phrase instead of `intext:`.

**Operators are hints, not guarantees.** Google sometimes relaxes a query and drops `site:` (seen with `inurl:`). Code re-checks every result against scope and, where possible, the template's signal ([D-016](./Decisions.md#d-016)).

### Record fields

| Field         | Type                                                             | Meaning                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | snake_case, unique, prefixed by goal                             | Enum value the LLM returns                                                                                                                                                                              |
| `goal`        | Goal enum (A1)                                                   | Template group                                                                                                                                                                                          |
| `title`       | text                                                             | Shown in pre-run summary                                                                                                                                                                                |
| `query`       | string                                                           | Signal with `{params}` / `{vars}`                                                                                                                                                                       |
| `params`      | map of enum lists                                                | LLM picks 1..`max_pick` values per param                                                                                                                                                                |
| `max_pick`    | int                                                              | Max values the LLM may pick per param (default 3)                                                                                                                                                       |
| `combine`     | `or` \| `split`                                                  | Multiple picked values → one query with `OR`, or one query each. `or` is the default; the compiler auto-splits if the query exceeds the engine's length / OR-term limit ([D-009](./Decisions.md#d-009)) |
| `regional`    | map: value → ISO country codes                                   | Optional. Listed enum values are offered to the LLM only when C1 is one of those countries ([D-011](./Decisions.md#d-011))                                                                              |
| `vars`        | list                                                             | Code-filled vars used in `query`                                                                                                                                                                        |
| `scope_mode`  | `required` \| `optional` \| `subdomains` \| `none` \| `platform` | How the compiler adds `site:` (see below)                                                                                                                                                               |
| `engines`     | list                                                             | Engines that can serve it (verified against the operator matrix)                                                                                                                                        |
| `result_type` | `web` \| `news` \| `scholar`                                     | SERP endpoint                                                                                                                                                                                           |
| `signal`      | text                                                             | What marks a hit (used for scoring + summary)                                                                                                                                                           |
| `priority`    | 1–3                                                              | 1 = run first; budget cap drops 3s first                                                                                                                                                                |
| `sensitivity` | `normal` \| `security`                                           | `security` → only when authorization gate passes (A4/F6) and scope is Hard                                                                                                                              |
| `status`      | `draft` \| `approved` \| `retired`                               | Only `approved` enter the LLM enum                                                                                                                                                                      |

### `scope_mode`

| Value        | Compiler adds                                                       | Use                                  |
| ------------ | ------------------------------------------------------------------- | ------------------------------------ |
| `required`   | `site:{domain}` for each B1 domain; template skipped if B1 empty    | Anything about the target's own site |
| `optional`   | `site:` if B1 given, nothing otherwise                              | Documents, topic research            |
| `subdomains` | `site:{domain} -site:www.{domain}` (`site:*.` is ignored by Google) | Subdomain discovery                  |
| `none`       | nothing; uses `{name}`/`{domain}` as text instead                   | Mentions elsewhere on the web        |
| `platform`   | `site:{platform}` from the template's own enum                      | Mentions on GitHub, Reddit, etc.     |

### Scope rule for `site:` ([D-007](./Decisions.md#d-007))

After compiling, the guardrail parses every `site:` in the query. It is allowed only if it is:

1. a host in the user's scope list (B1, wildcard-aware), **or**
2. a value from the `platform` enum **of the template that produced the query**.

Anything else is rejected. `-site:` exclusions are always allowed. For security goals, platform templates may only search for an in-scope domain or name **as text** (e.g. `site:github.com "target.com"`); they never query other hosts as targets.

### Cross-goal selection ([D-010](./Decisions.md#d-010))

The LLM picks from the primary goal's templates first. It may also pick templates from other goals for up to **30% of the query budget**, each with a one-line reason shown in the pre-run summary. `security` templates are never borrowed into a non-security run.

---

## 2. Index

| #   | id                   | goal                 | priority | sensitivity |
| --- | -------------------- | -------------------- | -------- | ----------- |
| 1   | doc_by_type          | documents            | 1        | normal      |
| 2   | doc_sensitive_label  | documents            | 2        | normal      |
| 3   | doc_report_kind      | documents            | 2        | normal      |
| 4   | doc_data_files       | documents            | 3        | normal      |
| 5   | exp_dir_listing      | exposed_pages        | 1        | security    |
| 6   | exp_config_files     | exposed_pages        | 1        | security    |
| 7   | exp_backup_log_files | exposed_pages        | 2        | security    |
| 8   | exp_error_messages   | exposed_pages        | 2        | security    |
| 9   | exp_debug_pages      | exposed_pages        | 2        | security    |
| 10  | as_subdomains        | attack_surface       | 1        | security    |
| 11  | as_login_portals     | attack_surface       | 1        | security    |
| 12  | as_admin_panels      | attack_surface       | 1        | security    |
| 13  | as_api_docs          | attack_surface       | 2        | security    |
| 14  | as_nonprod_envs      | attack_surface       | 2        | security    |
| 15  | tech_powered_by      | tech_fingerprinting  | 1        | normal      |
| 16  | tech_cms_paths       | tech_fingerprinting  | 1        | normal      |
| 17  | tech_stack_in_jobs   | tech_fingerprinting  | 3        | normal      |
| 18  | tp_code_mentions     | third_party_mentions | 1        | security    |
| 19  | tp_paste_mentions    | third_party_mentions | 2        | security    |
| 20  | tp_public_docs       | third_party_mentions | 1        | normal      |
| 21  | tp_forums            | third_party_mentions | 2        | normal      |
| 22  | tp_social            | third_party_mentions | 3        | normal      |
| 23  | co_key_pages         | company_research     | 1        | normal      |
| 24  | co_registry_profiles | company_research     | 1        | normal      |
| 25  | co_financial_docs    | company_research     | 2        | normal      |
| 26  | mk_pricing_pages     | competitor_research  | 1        | normal      |
| 27  | mk_review_sites      | competitor_research  | 1        | normal      |
| 28  | mk_comparisons       | competitor_research  | 2        | normal      |
| 29  | mk_customer_stories  | competitor_research  | 3        | normal      |
| 30  | nw_name_news         | news_mentions        | 1        | normal      |
| 31  | nw_name_event        | news_mentions        | 1        | normal      |
| 32  | nw_offsite_mentions  | news_mentions        | 2        | normal      |
| 33  | gr_keywords          | general_research     | 1        | normal      |
| 34  | gr_keywords_filetype | general_research     | 2        | normal      |
| 35  | gr_trusted_domains   | general_research     | 2        | normal      |
| 36  | gr_academic          | general_research     | 2        | normal      |

---

## 3. Templates

### Documents (`documents`)

```yaml
id: doc_by_type
goal: documents
title: Documents by file type
query: "filetype:{ext}"
params:
  ext: [pdf, doc, docx, xls, xlsx, ppt, pptx, odt, rtf, txt]
max_pick: 4
combine: or
vars: []
scope_mode: optional
engines: [google]
result_type: web
signal: URL ends in the requested extension
priority: 1
sensitivity: normal
status: approved
example: "site:target.com (filetype:pdf OR filetype:pptx)"
```

```yaml
id: doc_sensitive_label
goal: documents
title: Documents with a distribution label
query: 'filetype:{ext} "{label}"'
params:
  ext: [pdf, doc, docx, xls, xlsx, ppt, pptx]
  label: [confidential, internal use only, not for distribution, draft, proprietary, restricted]
max_pick: 3
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: document text contains the label
priority: 2
sensitivity: normal
status: approved
notes: scope_mode required so this can't become a web-wide hunt for confidential files
example: 'site:target.com filetype:pdf "internal use only"'
```

```yaml
id: doc_report_kind
goal: documents
title: Reports and publications by kind
query: 'filetype:pdf intitle:"{kind}"'
params:
  kind:
    [
      annual report,
      whitepaper,
      case study,
      datasheet,
      brochure,
      policy,
      guidelines,
      presentation,
      manual,
    ]
max_pick: 3
combine: or
vars: []
scope_mode: optional
engines: [google]
result_type: web
signal: PDF whose title names the document kind
priority: 2
sensitivity: normal
status: approved
example: 'site:target.com filetype:pdf intitle:"annual report"'
```

```yaml
id: doc_data_files
goal: documents
title: Datasets and data exports
query: "filetype:{ext}"
params:
  ext: [csv, json, xlsx, xml, tsv]
max_pick: 3
combine: or
vars: []
scope_mode: optional
engines: [google]
result_type: web
signal: structured data file
priority: 3
sensitivity: normal
status: approved
example: "site:data.gov.in filetype:csv"
```

### Exposed pages (`exposed_pages`) — security, authorization required

```yaml
id: exp_dir_listing
goal: exposed_pages
title: Open directory listings
query: 'intitle:"index of" "{hint}"'
params:
  hint: [parent directory, backup, uploads, files, logs, private]
max_pick: 3
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: Apache/Nginx autoindex page
priority: 1
sensitivity: security
status: approved
example: 'site:target.com intitle:"index of" "parent directory"'
```

```yaml
id: exp_config_files
goal: exposed_pages
title: Indexed configuration files
query: "filetype:{ext}"
params:
  ext: [env, ini, conf, cfg, yml, yaml, properties, xml, toml]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: config file served as a public URL
priority: 1
sensitivity: security
status: approved
example: "site:target.com (filetype:env OR filetype:ini)"
```

```yaml
id: exp_backup_log_files
goal: exposed_pages
title: Backups, dumps and logs
query: "filetype:{ext}"
params:
  ext: [log, bak, old, sql, gz, zip, tar, swp]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: backup/log artefact served publicly
priority: 2
sensitivity: security
status: approved
example: "site:target.com (filetype:sql OR filetype:bak)"
```

```yaml
id: exp_error_messages
goal: exposed_pages
title: Pages leaking error messages
query: '"{error}"'
params:
  error:
    - "You have an error in your SQL syntax"
    - "Warning: mysql_"
    - "Fatal error"
    - "Traceback (most recent call last)"
    - "Stack trace"
    - "Exception Details"
max_pick: 2
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: indexed page shows a server error string
priority: 2
sensitivity: security
status: approved
example: 'site:target.com "Fatal error"'
```

```yaml
id: exp_debug_pages
goal: exposed_pages
title: Debug and status pages
query: 'intitle:"{title}"'
params:
  title: [phpinfo(), Whitelabel Error Page, Server Status, Django debug, Test Page for the Apache]
max_pick: 2
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: framework debug / default page indexed
priority: 2
sensitivity: security
status: approved
example: 'site:target.com intitle:"phpinfo()"'
```

### Attack surface (`attack_surface`) — security, authorization required

```yaml
id: as_subdomains
goal: attack_surface
title: Indexed subdomains
query: ""
params: {}
max_pick: 0
combine: split
vars: []
scope_mode: subdomains
engines: [google]
result_type: web
signal: distinct hostnames under the target domain
priority: 1
sensitivity: security
status: approved
notes: runner may iterate, adding -site:<found host> for hosts already seen (budget-limited)
example: "site:target.com -site:www.target.com"
```

```yaml
id: as_login_portals
goal: attack_surface
title: Login and sign-in pages
query: "inurl:{path}"
params:
  path: [login, signin, sign-in, auth, sso, wp-login.php, user/login]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: authentication page
priority: 1
sensitivity: security
status: approved
example: "site:target.com (inurl:login OR inurl:sso)"
```

```yaml
id: as_admin_panels
goal: attack_surface
title: Admin and management panels
query: "inurl:{path}"
params:
  path: [admin, administrator, dashboard, cpanel, manage, console, backend]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: admin UI reachable from the web
priority: 1
sensitivity: security
status: approved
example: "site:target.com (inurl:admin OR inurl:dashboard)"
```

```yaml
id: as_api_docs
goal: attack_surface
title: API documentation and endpoints
query: "inurl:{path}"
params:
  path: [swagger, api-docs, openapi, graphql, redoc, api/v1, api/v2]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: API spec or explorer UI
priority: 2
sensitivity: security
status: approved
example: "site:target.com (inurl:swagger OR inurl:api-docs)"
```

```yaml
id: as_nonprod_envs
goal: attack_surface
title: Dev, test and staging environments
query: "inurl:{env}"
params:
  env: [dev, staging, stage, test, uat, qa, beta, sandbox]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: non-production host or path indexed
priority: 2
sensitivity: security
status: approved
example: "site:target.com (inurl:staging OR inurl:uat)"
```

### Tech fingerprinting (`tech_fingerprinting`)

```yaml
id: tech_powered_by
goal: tech_fingerprinting
title: '"Powered by" footers'
query: '"powered by {tech}"'
params:
  tech: [WordPress, Drupal, Joomla, Shopify, Magento, WooCommerce, Wix, Squarespace, Ghost, HubSpot]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: footer names the platform
priority: 1
sensitivity: normal
status: approved
example: 'site:target.com "powered by WordPress"'
```

```yaml
id: tech_cms_paths
goal: tech_fingerprinting
title: Platform-specific URL paths
query: "inurl:{path}"
params:
  path: [wp-content, wp-includes, sites/default/files, _next, static/js, media/catalog, ghost]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: path unique to a framework or CMS
priority: 1
sensitivity: normal
status: approved
example: "site:target.com inurl:wp-content"
```

```yaml
id: tech_stack_in_jobs
goal: tech_fingerprinting
title: Tech stack from job posts
query: '{name} ("{role}") ("{tech}")'
params:
  role: [software engineer, developer, devops, data engineer, security engineer]
  tech: [AWS, Azure, GCP, Kubernetes, React, Java, Python, Salesforce, SAP]
  platform: [linkedin.com/jobs, naukri.com, indeed.com, glassdoor.com]
regional:
  naukri.com: [in]
max_pick: 3
combine: or
vars: [name]
scope_mode: platform
engines: [google]
result_type: web
signal: job listing by the target naming technologies
priority: 3
sensitivity: normal
status: approved
example: 'site:linkedin.com/jobs "Target Corp" ("devops") ("Kubernetes" OR "AWS")'
```

### Third-party mentions (`third_party_mentions`)

```yaml
id: tp_code_mentions
goal: third_party_mentions
title: Target referenced in public code
query: '"{domain}"'
params:
  platform: [github.com, gitlab.com, bitbucket.org]
max_pick: 3
combine: split
vars: [domain]
scope_mode: platform
engines: [google]
result_type: web
signal: repo/file referencing a target hostname
priority: 1
sensitivity: security
status: approved
example: 'site:github.com "target.com"'
```

```yaml
id: tp_paste_mentions
goal: third_party_mentions
title: Target referenced on paste sites
query: '"{domain}"'
params:
  platform: [pastebin.com, paste.ee, justpaste.it, rentry.co]
max_pick: 4
combine: split
vars: [domain]
scope_mode: platform
engines: [google]
result_type: web
signal: paste mentioning the target domain
priority: 2
sensitivity: security
status: approved
example: 'site:pastebin.com "target.com"'
```

```yaml
id: tp_public_docs
goal: third_party_mentions
title: Publicly shared docs and boards
query: "{name}"
params:
  platform:
    [
      docs.google.com,
      drive.google.com,
      notion.site,
      trello.com,
      scribd.com,
      slideshare.net,
      airtable.com,
    ]
max_pick: 4
combine: split
vars: [name]
scope_mode: platform
engines: [google]
result_type: web
signal: public share on a collaboration platform
priority: 1
sensitivity: normal
status: approved
example: 'site:trello.com "Target Corp"'
```

```yaml
id: tp_forums
goal: third_party_mentions
title: Forum and Q&A discussions
query: "{name}"
params:
  platform: [reddit.com, stackoverflow.com, quora.com, news.ycombinator.com]
max_pick: 3
combine: split
vars: [name]
scope_mode: platform
engines: [google]
result_type: web
signal: discussion thread naming the target
priority: 2
sensitivity: normal
status: approved
example: 'site:reddit.com "Target Corp"'
```

```yaml
id: tp_social
goal: third_party_mentions
title: Social media mentions
query: "{name}"
params:
  platform: [linkedin.com, x.com, facebook.com, instagram.com, youtube.com]
max_pick: 3
combine: split
vars: [name]
scope_mode: platform
engines: [google]
result_type: web
signal: post or page naming the target
priority: 3
sensitivity: normal
status: approved
example: 'site:linkedin.com "Target Corp"'
```

### Company / org research (`company_research`)

```yaml
id: co_key_pages
goal: company_research
title: Key company pages
query: "inurl:{page}"
params:
  page: [about, team, leadership, careers, contact, investors, press, locations]
max_pick: 4
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: official company information page
priority: 1
sensitivity: normal
status: approved
example: "site:target.com (inurl:about OR inurl:leadership)"
```

```yaml
id: co_registry_profiles
goal: company_research
title: Company profiles on registries and databases
query: "{name}"
params:
  platform:
    [
      linkedin.com/company,
      crunchbase.com,
      opencorporates.com,
      zaubacorp.com,
      tofler.in,
      glassdoor.com,
    ]
regional:
  zaubacorp.com: [in]
  tofler.in: [in]
max_pick: 4
combine: split
vars: [name]
scope_mode: platform
engines: [google]
result_type: web
signal: company profile page
priority: 1
sensitivity: normal
status: approved
example: 'site:crunchbase.com "Target Corp"'
```

```yaml
id: co_financial_docs
goal: company_research
title: Financial and regulatory filings
query: '{name} filetype:pdf "{doc}"'
params:
  doc: [annual report, balance sheet, prospectus, investor presentation, DRHP, 10-K]
regional:
  DRHP: [in]
  10-K: [us]
max_pick: 3
combine: or
vars: [name]
scope_mode: optional
engines: [google]
result_type: web
signal: filing or investor document
priority: 2
sensitivity: normal
status: approved
example: '"Target Corp" filetype:pdf "annual report"'
```

### Competitor / market research (`competitor_research`)

```yaml
id: mk_pricing_pages
goal: competitor_research
title: Pricing and plan pages
query: "inurl:{page}"
params:
  page: [pricing, plans, compare, buy, subscribe]
max_pick: 3
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: pricing or plan comparison page
priority: 1
sensitivity: normal
status: approved
example: "site:competitor.com (inurl:pricing OR inurl:plans)"
```

```yaml
id: mk_review_sites
goal: competitor_research
title: Reviews on review platforms
query: "{name}"
params:
  platform: [g2.com, capterra.com, trustpilot.com, producthunt.com, gartner.com/reviews]
max_pick: 3
combine: split
vars: [name]
scope_mode: platform
engines: [google]
result_type: web
signal: product review page
priority: 1
sensitivity: normal
status: approved
example: 'site:g2.com "CompetitorX"'
```

```yaml
id: mk_comparisons
goal: competitor_research
title: Comparisons and alternatives
query: '{name} "{term}"'
params:
  term: [alternatives, vs, competitors, comparison, review]
max_pick: 3
combine: or
vars: [name]
scope_mode: none
engines: [google]
result_type: web
signal: article comparing the product with others
priority: 2
sensitivity: normal
status: approved
example: '"CompetitorX" ("alternatives" OR "vs")'
```

```yaml
id: mk_customer_stories
goal: competitor_research
title: Customer stories and case studies
query: "inurl:{path}"
params:
  path: [customers, case-studies, case-study, testimonials, success-stories]
max_pick: 3
combine: or
vars: []
scope_mode: required
engines: [google]
result_type: web
signal: named-customer page on the competitor site
priority: 3
sensitivity: normal
status: approved
example: "site:competitor.com inurl:case-studies"
```

### News and mentions (`news_mentions`)

```yaml
id: nw_name_news
goal: news_mentions
title: News coverage of a name
query: "{name}"
params: {}
max_pick: 0
combine: split
vars: [name]
scope_mode: none
engines: [google]
result_type: news
signal: news article naming the target
priority: 1
sensitivity: normal
status: approved
example: '"Target Corp"  (News endpoint, tbs=qdr:m)'
```

```yaml
id: nw_name_event
goal: news_mentions
title: News about a specific kind of event
query: '{name} "{event}"'
params:
  event:
    [acquisition, funding, partnership, launch, lawsuit, layoffs, data breach, appointed, earnings]
max_pick: 3
combine: or
vars: [name]
scope_mode: none
engines: [google]
result_type: news
signal: article about the event type
priority: 1
sensitivity: normal
status: approved
example: '"Target Corp" ("acquisition" OR "funding")'
```

```yaml
id: nw_offsite_mentions
goal: news_mentions
title: Mentions outside the target's own site
query: "{name} -site:{domain}"
params: {}
max_pick: 0
combine: split
vars: [name, domain]
scope_mode: none
engines: [google]
result_type: web
signal: page on another site naming the target
priority: 2
sensitivity: normal
status: approved
example: '"Target Corp" -site:target.com'
```

### General topic research (`general_research`)

```yaml
id: gr_keywords
goal: general_research
title: Keyword search
query: "{keywords}"
params: {}
max_pick: 0
combine: split
vars: [keywords]
scope_mode: optional
engines: [google]
result_type: web
signal: page matching the keyword layers
priority: 1
sensitivity: normal
status: approved
notes: requires D2 or D4 (or the LLM follow-up question) — skipped if keywords are empty
example: 'solar subsidy "rooftop" (Gujarat OR Ahmedabad)'
```

```yaml
id: gr_keywords_filetype
goal: general_research
title: Keyword search in documents
query: "{keywords} filetype:{ext}"
params:
  ext: [pdf, ppt, pptx, doc, docx, xls, xlsx]
max_pick: 3
combine: or
vars: [keywords]
scope_mode: optional
engines: [google]
result_type: web
signal: document matching the keywords
priority: 2
sensitivity: normal
status: approved
example: "rooftop solar subsidy filetype:pdf"
```

```yaml
id: gr_trusted_domains
goal: general_research
title: Keyword search on official / institutional sites
query: "{keywords}"
params:
  platform: [gov, gov.in, nic.in, edu, ac.in, org, int]
regional:
  gov: [us]
  gov.in: [in]
  nic.in: [in]
  ac.in: [in]
max_pick: 3
combine: or
vars: [keywords]
scope_mode: platform
engines: [google]
result_type: web
signal: result from a government, academic or institutional TLD
priority: 2
sensitivity: normal
status: approved
example: "rooftop solar subsidy (site:gov.in OR site:nic.in)"
```

```yaml
id: gr_academic
goal: general_research
title: Academic papers and preprints
query: "{keywords}"
params:
  platform: [arxiv.org, researchgate.net, ssrn.com, semanticscholar.org, ncbi.nlm.nih.gov]
max_pick: 3
combine: or
vars: [keywords]
scope_mode: platform
engines: [google]
result_type: web
signal: paper or preprint page
priority: 2
sensitivity: normal
status: approved
notes: also run against the Scholar endpoint when E2 includes scholar
example: "rooftop solar adoption (site:arxiv.org OR site:ssrn.com)"
```

---

## 4. Decisions applied (2026-11-25)

All seven review questions were settled by accepting the proposals. Full records in [Decisions.md](./Decisions.md).

| #   | Question                                       | Decision                                                                                                      | Record |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | `site:` scope rule vs platform templates       | Allowed if in user scope **or** from the producing template's `platform` enum; everything else rejected       | D-007  |
| 2   | Who fills `{name}` / `{domain}` / `{keywords}` | Always code, from the spec; LLM only picks enum params                                                        | D-008  |
| 3   | `combine` default                              | `or`; compiler auto-splits past engine limits                                                                 | D-009  |
| 4   | Cross-goal templates                           | Allowed up to 30% of budget, with a reason; never borrows `security` templates                                | D-010  |
| 5   | Country-specific sources                       | Optional `regional` map per enum value; hidden unless C1 matches                                              | D-011  |
| 6   | Security set                                   | All 12 `security` templates stay gated (10 exposed/attack-surface + `tp_code_mentions` + `tp_paste_mentions`) | D-012  |
| 7   | Additions                                      | None for v1; people/employee search stays out (privacy). New templates go through the D-002 review flow       | D-013  |
