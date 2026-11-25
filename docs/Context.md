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
- Whether Google still honours `num` > 10 is checked by the `num=20` probe in the operator matrix.
- Brave supports fewer operators.
- Test each operator once per engine before relying on it in templates.
