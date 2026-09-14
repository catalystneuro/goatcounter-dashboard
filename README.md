# GoatCounter dashboard

A static web app that renders your [GoatCounter](https://www.goatcounter.com) analytics from the browser. There is no backend: you enter your GoatCounter site and a read-only API token, the app keeps both in your browser's localStorage, and every number on the page comes straight from GoatCounter's REST API.

Use it at **https://catalystneuro.github.io/goatcounter-dashboard/** with your own site and token, or host a copy anywhere that serves static files.

## What it shows

One date range scopes the whole page: today, the last 7, 30, or 90 days, the last year, or a custom range. Below the filter row are three headline numbers (visitors, visitors to a goal path of your choice, and countries reached), a daily visitors chart with a crosshair tooltip (hourly for one- or two-day ranges), and panels for top pages, referrers, campaigns, countries, browsers, systems, and screen sizes. Each panel has a table view. Clicking a page shows its referrers; clicking a country, browser, or system shows its regions or versions. Turning on "Compare to previous period" overlays the previous period on the chart and adds deltas to the headline numbers.

The URL carries the site, date range, goal path, and theme, so a link you share opens the same view for anyone who has their own token for that site. The token itself is not part of the shareable URL.

To set up a browser from a link, append the token as `#token=...` (or `?token=...`). The app stores it for that site and removes it from the address bar on load. Settings has a "Copy setup link with token" button that builds one. Anyone who opens such a link can read the site's statistics, so treat it like the token itself.

## Getting a token

In GoatCounter go to Settings, then API, and add a new token with only the "Read statistics" permission. Paste it into the setup screen along with your site code (the part before `.goatcounter.com`, or the full host of a self-hosted instance). The token is sent only to your GoatCounter site, over HTTPS, in the Authorization header.

## Notes on the data

Counts are unique visitors per period, which is how GoatCounter counts. Visitor totals and the chart respect the timezone set in your GoatCounter account. Referrer, country, browser, system, and screen size breakdowns are stored by GoatCounter per UTC day, so they can differ slightly from the visitor totals near day boundaries.

GoatCounter allows four API requests per second per token, and the browser's CORS preflight counts as one of them. The app spaces its requests to stay under that limit, so a full page load takes a few seconds.

## Theming

Two presets ship: a neutral blue and a pine-and-gold preset. Pick one in Settings. Light and dark modes each have their own validated palette; the header button cycles between following the system, light, and dark. To add a preset, add a block to `src/styles/tokens.css` for both light and dark, and run the palette validator from the dataviz guidelines on the series colours against your surfaces.

## Development

```
npm install
npm run dev        # local server at http://localhost:5173
npm test           # unit tests
npm run build      # type-check and build to dist/
```

The production build assumes it is served from `/goatcounter-dashboard/`. Set `VITE_BASE=/` to build for a root deployment. Pushes to `main` deploy to GitHub Pages through the workflow in `.github/workflows/deploy.yml`.

## License

MIT, CatalystNeuro.
