# Operator Matrix

_Generated 2026-11-25T05:14:25.334Z by `pnpm --filter @dextra/serp spike --yes` · probe domain `nasa.gov` · do not edit by hand_

Verdict = share of returned results that obey the operator: supported ≥ 80%, partial 40–80%, ignored < 40%. `intext:` is checked against short snippets, so it under-counts.

| Operator             | Syntax      | google (via serpapi) | bing (via serpapi) |
| -------------------- | ----------- | -------------------- | ------------------ |
| site:                | `site:`     | supported (8/8)      | partial (4/10)     |
| site:*. (subdomains) | `site:*.`   | ignored (1/7)        | ignored (3/10)     |
| -site:               | `-site:`    | supported (7/7)      | supported (8/10)   |
| filetype:            | `filetype:` | partial (6/9)        | ignored (0/10)     |
| ext:                 | `ext:`      | ignored (2/10)       | ignored (0/10)     |
| OR (filetypes)       | `(a OR b)`  | supported (8/9)      | ignored (0/10)     |
| intitle:             | `intitle:`  | supported (8/8)      | supported (10/10)  |
| inurl:               | `inurl:`    | partial (7/10)       | supported (10/10)  |
| intext:              | `intext:`   | ignored (0/10)       | ignored (0/7)      |
| intext:              | `inbody:`   | no_results (0/0)     | ignored (0/10)     |
| "phrase"             | `"…"`       | partial (6/8)        | ignored (0/10)     |
| -term                | `-term`     | supported (8/8)      | supported (10/10)  |
| OR (terms)           | `(a OR b)`  | supported (7/7)      | supported (10/10)  |
| num=20 (param)       | `num`       | ignored (6/6)        | ignored (10/10)    |
