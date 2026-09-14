# GoatCounter dashboard: project brief

Goal: a standalone, open-source web app that renders anyone's GoatCounter analytics
beautifully, using only GoatCounter's REST API from the browser. No backend. The user
enters their GoatCounter site (for example `neurodata-ai`) and an API token; the app
stores both in localStorage and fetches everything client-side. Publish it as a static
site (GitHub Pages) so anyone can use it at one URL with their own token.

First user: Ben Dichter, site `neurodata-ai.goatcounter.com`, tracking neurodata-ai.org.
Create the token at GoatCounter Settings, API, "New token" with the "Read statistics"
permission only.

## What the API offers (verified September 13, 2026)

- Base URL: `https://<site>.goatcounter.com/api/v0/`, header `Authorization: Bearer <token>`.
- CORS is open (`Access-Control-Allow-Origin: *`, Authorization header allowed), so the
  browser can call it directly from any origin.
- OpenAPI 2.0 spec at `https://<site>.goatcounter.com/api.json`.
- Endpoints, all with `start` and `end` query params (dates or hour-rounded timestamps):
  - `GET stats/total` -> `{ total, total_events, total_utc, stats: [{ day, daily, hourly[24] }] }`
  - `GET stats/hits?limit=&group=day` -> `{ hits: [{ path, path_id, title, count, max, event, stats: [{ day, daily, hourly }] }], total, more }`
  - `GET stats/hits/{path_id}` -> referrers for one path: `{ refs: [{ name, count, ref_scheme }], more }`
  - `GET stats/{page}` where page is one of `toprefs`, `campaigns`, `locations`, `languages`, `browsers`, `systems`, `sizes` -> `{ stats: [{ id, name, count, ref_scheme? }], more }`
  - `GET stats/{page}/{id}` -> detail for one entry (for example browser versions, or regions within a country)
  - `GET me`, `GET sites`, `GET paths`, `POST export` also exist.
- Counts are unique visitors per period, not raw pageviews (GoatCounter's model).

## Product

- Screens: setup (site + token), overview. Overview has one filter row at the top
  (date presets: today, 7, 30, 90 days, year, custom) that scopes everything below.
- Overview content: KPI row (visitors, visitors to a chosen "goal" path such as /apply/,
  countries reached), a daily visitors chart with crosshair tooltip, then panels for
  top pages, referrers, campaigns (UTM), countries, browsers, systems, screen sizes,
  each as a horizontal bar list with a table twin. Clicking a page shows its referrers.
- Compare mode: previous period overlaid or as deltas on the KPIs.
- Shareable: the URL encodes site and date range (never the token).
- Works on a phone.

## Design

- Follow the Claude Code `dataviz` skill: pick the form first, thin marks, 2px lines,
  24px max bars with 4px rounded data ends, hairline solid gridlines, one hue for a
  single series, direct labels used sparingly, a legend only for two or more series,
  hover tooltips on everything, a table view for every chart, dark mode as its own
  validated palette, run `validate_palette.js` on any categorical palette.
- Typeface: one system sans throughout, including the hero number.
- Brand-neutral by default with a small theme file (accent hue, surfaces) so a user
  can match their own site. Ben's site palette, if you want a preset: pine #14563f,
  gold #d9a441 / #946409 for text, paper #f7f8f6, ink #16211d.

## Stack suggestion

Vite + vanilla TypeScript (or Svelte) with hand-written SVG charts; no chart library
needed. Deploy with GitHub Actions to GitHub Pages. MIT license. Repository under the
catalystneuro organization.
