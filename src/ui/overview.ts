// The overview screen: header, filter row, KPI tiles, time series, bar panels.
// One range scopes everything; all fetches run in parallel and abort on change.

import { ApiError, GoatCounterClient, type DayStat, type HitList, type Stat, type StatsPage } from '../api';
import { eachDay, hourIn, hourLabel, isHourly, previousPeriod, rangeLabel, shortDate, todayIn, weekdayShort, type DateRange } from '../dates';
import { siteDisplayName, storage, type ColorScheme, type ViewState } from '../state';
import { applyScheme, nextScheme, schemeLabel } from '../theme';
import { BarList, statsToItems, type BarItem } from './barlist';
import { Choropleth, US_STATES_MAP, WORLD_MAP } from './choropleth';
import { clear, h } from './dom';
import { FilterRow } from './filters';
import { KpiRow } from './kpi';
import { TimeSeriesChart, type Series } from './timeseries';

export interface OverviewOptions {
  client: GoatCounterClient;
  state: ViewState;
  onStateChange: (s: ViewState) => void;
  onOpenSettings: () => void;
  onAuthError: () => void;
}

const SIZE_LABELS: Record<string, string> = {
  phone: 'Phone',
  largephone: 'Large phone or small tablet',
  tablet: 'Tablet or small laptop',
  desktop: 'Desktop',
  desktophd: 'Desktop, larger than HD',
  unknown: '(unknown)',
};

export class Overview {
  readonly el: HTMLElement;
  private state: ViewState;
  private controller: AbortController | null = null;
  private readonly filters: FilterRow;
  private readonly kpis: KpiRow;
  private readonly chart: TimeSeriesChart;
  private readonly map: Choropleth;
  private readonly usMap: Choropleth;
  private readonly panels: Record<string, BarList>;
  private readonly banner: HTMLElement;
  private readonly schemeBtn: HTMLButtonElement;
  private readonly content: HTMLElement;

  constructor(private readonly opts: OverviewOptions) {
    this.state = opts.state;
    const site = opts.state.site;
    const display = siteDisplayName(site);

    this.schemeBtn = h('button', { class: 'btn small ghost', type: 'button', onClick: () => this.cycleScheme() }, schemeLabel(storage.getScheme()));
    const header = h(
      'header',
      { class: 'header' },
      h(
        'div',
        {},
        h('p', { class: 'brand' }, 'GoatCounter dashboard'),
        h('h1', {}, h('a', { href: `https://${site}`, target: '_blank', rel: 'noopener noreferrer', title: 'Open in GoatCounter' }, display)),
      ),
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn small ghost', type: 'button', onClick: () => this.copyLink() }, 'Copy link'),
        this.schemeBtn,
        h('button', { class: 'btn small', type: 'button', onClick: () => opts.onOpenSettings() }, 'Settings'),
      ),
    );

    this.filters = new FilterRow({ range: opts.state.range, preset: opts.state.preset, compare: opts.state.compare }, (v) => {
      this.state = { ...this.state, range: v.range, preset: v.preset, compare: v.compare };
      this.opts.onStateChange(this.state);
      this.load();
    });

    this.kpis = new KpiRow([
      { key: 'visitors', label: 'Visitors', hero: true },
      { key: 'goal', label: `Visitors to ${opts.state.goal}` },
      { key: 'countries', label: 'Countries reached' },
    ]);
    this.kpis.setVisible('goal', !!opts.state.goal);

    this.chart = new TimeSeriesChart('Visitors');
    this.map = new Choropleth({
      title: 'Visitors by country',
      map: WORLD_MAP,
      nameHeader: 'Country',
      emptyText: 'No location data in this range.',
      ariaLabel: 'World map of visitors by country',
    });
    this.usMap = new Choropleth({
      title: 'Visitors by US state',
      map: US_STATES_MAP,
      nameHeader: 'State',
      emptyText: 'No visitors from the United States in this range.',
      ariaLabel: 'Map of the United States showing visitors by state',
    });

    const drillStat = (page: StatsPage) => async (item: BarItem, signal: AbortSignal) => {
      const res = await this.opts.client.statDetail(page, item.id, this.state.range, { limit: 15 }, signal);
      return statsToItems(res.stats);
    };
    this.panels = {
      pages: new BarList({
        title: 'Top pages',
        nameHeader: 'Page',
        emptyText: 'No pageviews in this range.',
        drillEmptyText: 'No referrers recorded for this page.',
        drill: async (item, signal) => {
          const res = await this.opts.client.pathRefs(this.state.range, Number(item.id), { limit: 15 }, signal);
          return refsToItems(res.refs);
        },
      }),
      toprefs: new BarList({ title: 'Referrers', nameHeader: 'Referrer', emptyText: 'No referrers in this range.' }),
      campaigns: new BarList({ title: 'Campaigns', nameHeader: 'Campaign', emptyText: 'No UTM campaigns in this range.' }),
      locations: new BarList({ title: 'Countries', nameHeader: 'Country', emptyText: 'No location data in this range.', drill: drillStat('locations'), drillEmptyText: 'No regions recorded.' }),
      browsers: new BarList({ title: 'Browsers', nameHeader: 'Browser', emptyText: 'No browser data in this range.', drill: drillStat('browsers'), drillEmptyText: 'No versions recorded.' }),
      systems: new BarList({ title: 'Systems', nameHeader: 'System', emptyText: 'No system data in this range.', drill: drillStat('systems'), drillEmptyText: 'No versions recorded.' }),
      sizes: new BarList({ title: 'Screen sizes', nameHeader: 'Size', emptyText: 'No screen size data in this range.' }),
    };

    this.banner = h('div', { class: 'banner' });
    this.banner.hidden = true;

    this.content = h(
      'div',
      {},
      this.kpis.el,
      this.chart.el,
      h('div', { class: 'grid-2' }, this.map.el, this.usMap.el),
      h(
        'div',
        { class: 'grid-2' },
        this.panels['pages']!.el,
        this.panels['toprefs']!.el,
        this.panels['campaigns']!.el,
        this.panels['locations']!.el,
        this.panels['browsers']!.el,
        this.panels['systems']!.el,
        this.panels['sizes']!.el,
      ),
      h(
        'p',
        { class: 'footnote' },
        'Counts are unique visitors, as GoatCounter defines them. Referrer, country, browser, system, and screen size breakdowns are stored per UTC day, so they can differ slightly from the visitor totals near day boundaries.',
      ),
    );
    this.el = h('div', {}, header, this.filters.el, this.banner, this.content);
  }

  /** Called by main after mount. */
  start(): void {
    this.load();
  }

  destroy(): void {
    this.controller?.abort();
  }

  private cycleScheme(): void {
    const next: ColorScheme = nextScheme(storage.getScheme());
    applyScheme(next);
    this.schemeBtn.textContent = schemeLabel(next);
  }

  private async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(location.href);
      this.flash('Link copied. It carries the site and date range, not your token.');
    } catch {
      this.flash('Could not copy automatically. Copy the address bar URL instead.');
    }
  }

  private flash(text: string): void {
    clear(this.banner);
    this.banner.hidden = false;
    this.banner.className = 'banner';
    this.banner.style.borderColor = 'var(--border-strong)';
    this.banner.style.background = 'var(--surface)';
    this.banner.appendChild(h('span', {}, text));
    window.setTimeout(() => {
      this.banner.hidden = true;
    }, 3500);
  }

  private showError(message: string, auth: boolean): void {
    clear(this.banner);
    this.banner.hidden = false;
    this.banner.className = 'banner';
    this.banner.style.borderColor = '';
    this.banner.style.background = '';
    this.banner.append(
      h('span', {}, message),
      auth ? h('button', { class: 'btn small', type: 'button', onClick: () => this.opts.onAuthError() }, 'Update token') : h('button', { class: 'btn small', type: 'button', onClick: () => this.load() }, 'Retry'),
    );
  }

  private load(): void {
    this.controller?.abort();
    const ctrl = new AbortController();
    this.controller = ctrl;
    const signal = ctrl.signal;
    const client = this.opts.client;
    const range = this.state.range;
    const compare = this.state.compare;
    const prevRange = compare ? previousPeriod(range) : null;
    const goal = this.state.goal;
    const tz = client.timezone;

    this.banner.hidden = true;
    this.content.classList.add('is-loading');
    this.chart.setSubtitle(rangeLabel(range));
    this.kpis.setLabel('goal', `Visitors to ${goal}`);
    this.kpis.setVisible('goal', !!goal);

    const guard = <T>(p: Promise<T>, onOk: (v: T) => void, onErr: (e: unknown) => void) =>
      p.then(
        (v) => {
          if (!signal.aborted) onOk(v);
        },
        (e: unknown) => {
          if (signal.aborted || (e as Error).name === 'AbortError') return;
          onErr(e);
          if (e instanceof ApiError && e.isAuth) this.showError(e.message, true);
        },
      );
    const msg = (e: unknown) => (e instanceof Error ? e.message : 'Request failed.');

    // Totals and the daily chart, with the previous period when comparing.
    const totalP = client.total(range, {}, signal);
    const prevTotalP = prevRange ? client.total(prevRange, {}, signal) : Promise.resolve(null);
    const jobs: Promise<unknown>[] = [];

    jobs.push(
      guard(
        Promise.all([totalP, prevTotalP]),
        ([cur, prev]) => {
          this.kpis.update('visitors', { current: cur.total, previous: prev ? prev.total : null });
          const current = buildSeries('This period', range, cur.stats, tz);
          const previous = prev && prevRange ? buildSeries('Previous period', prevRange, prev.stats, tz, current.points.length) : null;
          this.chart.update({ current, previous, unit: 'visitors' });
        },
        (e) => {
          this.kpis.setError('visitors', msg(e));
          this.chart.setError(msg(e));
        },
      ),
    );

    if (goal) {
      const goalP = client.total(range, { includePaths: [goal] }, signal);
      const prevGoalP = prevRange ? client.total(prevRange, { includePaths: [goal] }, signal) : Promise.resolve(null);
      jobs.push(
        guard(
          Promise.all([goalP, prevGoalP]),
          ([cur, prev]) => this.kpis.update('goal', { current: cur.total, previous: prev ? prev.total : null }),
          (e) => this.kpis.setError('goal', msg(e)),
        ),
      );
    }

    // Countries reached: count every location entry with visitors.
    const locsP = client.allStats('locations', range, signal);
    const prevLocsP = prevRange ? client.allStats('locations', prevRange, signal) : Promise.resolve(null);
    jobs.push(
      guard(
        Promise.all([locsP, prevLocsP]),
        ([cur, prev]) => this.kpis.update('countries', { current: countCountries(cur), previous: prev ? countCountries(prev) : null }),
        (e) => this.kpis.setError('countries', msg(e)),
      ),
    );

    // Panels. Shares use the site total for the range.
    const siteTotal = totalP.then((t) => t.total).catch(() => 0);
    jobs.push(
      guard(
        Promise.all([client.hits(range, { limit: 20 }, signal), siteTotal]),
        ([res, total]) => this.panels['pages']!.update({ items: hitsToItems(res.hits), total: Math.max(total, res.total), more: res.more }),
        (e) => this.panels['pages']!.setError(msg(e)),
      ),
    );
    const pageFor: Record<string, StatsPage> = { toprefs: 'toprefs', campaigns: 'campaigns', browsers: 'browsers', systems: 'systems', sizes: 'sizes' };
    for (const [key, page] of Object.entries(pageFor)) {
      jobs.push(
        guard(
          Promise.all([client.stats(page, range, { limit: 20 }, signal), siteTotal]),
          ([res, total]) => this.panels[key]!.update({ items: statsForPanel(page, res.stats), total, more: res.more }),
          (e) => this.panels[key]!.setError(msg(e)),
        ),
      );
    }
    jobs.push(
      guard(
        Promise.all([locsP, siteTotal]),
        ([all, total]) => {
          const nonzero = all.filter((s) => s.count > 0);
          const shown = nonzero.slice(0, 20);
          this.panels['locations']!.update({ items: statsToItems(shown), total, more: nonzero.length > shown.length });
          this.map.update({ items: statsToItems(nonzero.filter((s) => s.id && !s.name.startsWith('('))), total });
          // US states: one more request, only when the US appears at all.
          const us = nonzero.find((s) => s.id === 'US');
          if (!us) {
            this.usMap.update({ items: [], total });
            return;
          }
          jobs.push(
            guard(
              client.statDetail('locations', 'US', range, { limit: 100 }, signal),
              (res) => this.usMap.update({ items: statsToItems(res.stats.filter((s) => s.count > 0)), total: us.count }),
              (e) => this.usMap.setError(msg(e)),
            ),
          );
        },
        (e) => {
          this.panels['locations']!.setError(msg(e));
          this.map.setError(msg(e));
          this.usMap.setError(msg(e));
        },
      ),
    );

    Promise.allSettled(jobs).then(() => {
      if (!signal.aborted) this.content.classList.remove('is-loading');
    });
  }
}

function hitsToItems(hits: HitList[]): BarItem[] {
  return hits.map((hit) => ({
    id: String(hit.path_id),
    name: hit.path,
    title: hit.title && hit.title !== hit.path ? hit.title : undefined,
    count: hit.count,
  }));
}

function refsToItems(refs: Stat[]): BarItem[] {
  return statsToItems(refs).map((i) => (i.name === '(unknown)' ? { ...i, name: '(no referrer)' } : i));
}

function statsForPanel(page: StatsPage, stats: Stat[]): BarItem[] {
  let items = statsToItems(stats);
  if (page === 'toprefs') items = items.map((i) => (i.name === '(unknown)' ? { ...i, name: '(no referrer)' } : i));
  if (page === 'sizes') {
    items = items.filter((i) => i.count > 0).map((i) => ({ ...i, name: SIZE_LABELS[i.id] ?? i.id }));
  }
  return items.filter((i) => i.count > 0);
}

function countCountries(stats: Stat[]): number {
  return stats.filter((s) => s.count > 0 && s.id && !s.name.startsWith('(')).length;
}

/** Build the chart series for a range from the API day list, filling gaps with zeros. */
function buildSeries(name: string, range: DateRange, stats: DayStat[], tz: string, alignTo?: number): Series {
  const byDay = new Map(stats.map((s) => [s.day, s]));
  const days = eachDay(range);
  const year = new Date().getFullYear();
  const today = todayIn(tz);
  if (isHourly(range)) {
    const points: Series['points'] = [];
    for (const day of days) {
      const s = byDay.get(day);
      const lastHour = day === today ? hourIn(tz) : day > today ? -1 : 23;
      for (let hr = 0; hr <= lastHour; hr++) {
        points.push({
          label: `${shortDate(day, year)}, ${hourLabel(hr)}`,
          tick: hr % 6 === 0 ? (days.length > 1 && hr === 0 ? shortDate(day) : hourLabel(hr)) : '',
          value: s?.hourly[hr] ?? 0,
        });
      }
    }
    return { name, points: alignTo !== undefined ? points.slice(0, alignTo) : points };
  }
  const points = days
    .filter((day) => day <= today)
    .map((day) => ({
      label: `${weekdayShort(day)} ${shortDate(day, year)}`,
      tick: shortDate(day),
      value: byDay.get(day)?.daily ?? 0,
    }));
  return { name, points: alignTo !== undefined ? points.slice(0, alignTo) : points };
}
