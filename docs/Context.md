# Context

## Product context

- **Owner:** Sandip
- **Domain:** search, OSINT, authorized security recon
- **Constraints:** all search through a SERP API (no proxies, no direct scraping); security use requires authorization

## Key terms

- **Dork:** a search query built with operators (`site:`, `filetype:`, `intitle:`, `inurl:`, `intext:`, quotes, `-`, `OR`).
- **Template:** a parameterised dork in the library, e.g. `site:{domain} ext:{ext}`, with its goal, supported engines, hit pattern and priority.
- **Intake spec:** the validated JSON the form produces; the only input the template selector sees.
- **Strictness:** per-filter mode. Hard = always applied; Soft = applied first, widened if too few results; Open = only re-ranks.
- **Outside scope group:** results found beyond the user's filters, shown separately and labelled with the reason.
- **Basic / advanced mode:** 8 fields shown by default; the rest hidden behind Settings → Advanced search options.

## Dork building layers

1. **Scope** — `site:target.com`
2. **Signal** — the one thing that marks a hit (`filetype:pdf`, `intitle:"index of"`)
3. **Exclusion** — junk seen in early runs (`-site:www.target.com -inurl:blog`)
4. **Precision** — exact phrases, `OR` variants

## Engine operator notes

- Google-backed APIs: `site:`, `filetype:`/`ext:`, `intitle:`, `inurl:`, `intext:`, quotes, `-`, `OR`. `cache:`, `related:`, `+` and `~` no longer work.
- Bing handles some operators differently (`filetype:`, has `ip:`, `contains:`).
- Microsoft retired the native Bing Search API (Aug 2025); "Bing" in E1 is reached through SerpAPI (`engine=bing`).
- Provider parameter support (encoded in `@dextra/serp`; anything a provider can't apply is returned in `ignored`, never dropped silently):
  - **Serper** — Google only: `gl`, `hl`, `location`, `tbs` (`qdr:*`, `cdr`), `num`, `page`; endpoints `/search`, `/news`, `/scholar`.
  - **SerpAPI** — Google: `gl`, `hl`, `location`, `tbs`, `num`, `start`, news via `tbm=nws`; Scholar: `hl`, years only (`as_ylo`/`as_yhi`), `num` ≤ 20; Bing: `cc`, `count`, `first` (no language/location/time mapping in v1).
  - **Brave** — `country`, `search_lang`, `count` ≤ 20, `offset` ≤ 9, `freshness` (`pd/pw/pm/py` or `YYYY-MM-DDtoYYYY-MM-DD`); no city-level location.
- `num` > 10 is ignored by both Google and Bing (probe returned 6 and 10): fetch in pages of 10 (D-017).

## Operator matrix — reviewed 2026-11-25

Not yet probed: `filetype:` with image, video and audio extensions (`doc_media_files`, D-027). Check it the next time the matrix runs.

Run with a SerpAPI key only, probe domain `nasa.gov`, one query per operator. Raw verdicts are in [Operator Matrix](./Operator-Matrix.md); this table corrects them after reading the returned URLs.

| Operator              | Google (SerpAPI) | Bing (SerpAPI) | Notes                                                                |
| --------------------- | ---------------- | -------------- | -------------------------------------------------------------------- |
| `site:`               | ✅               | ❌             | Bing returned wikipedia.org, mars.com                                |
| `-site:`              | ✅               | ✅             |                                                                      |
| `site:*.`             | ❌ drops scope   | ❌             | Use `site:d -site:www.d`                                             |
| `filetype:`           | ✅               | ❌             | Raw 6/9: the misses were PDFs served without `.pdf`                  |
| `ext:`                | ❌ drops scope   | ❌             | Use `filetype:`                                                      |
| `(a OR b)`            | ✅               | ❌             | Bing returned the unfiltered query                                   |
| `intitle:`            | ✅               | n/a            | Bing "supported" only because the term was common                    |
| `inurl:`              | ⚠️ loose         | n/a            | Once dropped `site:` entirely; once kept scope with 6/10 URL matches |
| `intext:` / `inbody:` | ❌               | ❌             | Google read `intext` as a word ("Intex" pool covers)                 |
| `"phrase"`            | ✅               | ❌             | Bing matched only "sample"                                           |
| `-term`               | ✅               | n/a            |                                                                      |

Confidence: one probe domain, one query per cell. Re-run with Serper/Brave keys (T-001b) and spot-check a second domain before relying on edge cases.

- Brave supports fewer operators.
- Test each operator once per engine before relying on it in templates.
