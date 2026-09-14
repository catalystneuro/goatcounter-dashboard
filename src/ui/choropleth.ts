// Choropleth: visitors per region on a sequential one-hue ramp with a scale
// legend, per-region hover tooltip, keyboard focus, and a table twin. The map
// dataset is prebuilt SVG paths (see scripts/build-maps.mjs); items match a
// region by its key (ISO code) or, failing that, by name.

import worldJson from '../data/world.json';
import usStatesJson from '../data/us-states.json';
import { formatInt, formatShare } from '../format';
import type { BarItem } from './barlist';
import { clear, h, svg } from './dom';
import { hideTooltip, positionTooltip, showTooltip } from './tooltip';

export interface MapData {
  viewBox: string;
  regions: Record<string, { name: string; d: string }>;
}
export const WORLD_MAP = worldJson as MapData;
export const US_STATES_MAP = usStatesJson as MapData;
const BINS = 5;

export interface ChoroplethOptions {
  title: string;
  map: MapData;
  /** Header for the name column in the table view. */
  nameHeader: string;
  emptyText: string;
  /** Accessible description of the map. */
  ariaLabel: string;
}

export interface ChoroplethData {
  items: BarItem[];
  total: number;
}

/** Bin thresholds: the lower bound of each bin, ascending. Quantiles of the nonzero values. */
export function binThresholds(values: number[], bins = BINS): number[] {
  const v = Array.from(new Set(values.filter((x) => x > 0))).sort((a, b) => a - b);
  if (v.length === 0) return [];
  if (v.length <= bins) return v;
  const out: number[] = [];
  for (let i = 0; i < bins; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i / bins) * v.length))]!;
    if (out[out.length - 1] !== q) out.push(q);
  }
  return out;
}

export function binFor(value: number, thresholds: number[]): number {
  if (value <= 0 || thresholds.length === 0) return 0;
  let b = 0;
  for (let i = 0; i < thresholds.length; i++) if (value >= thresholds[i]!) b = i + 1;
  // Spread a short threshold list across the top of the ramp so the max is always darkest.
  return Math.round((b / thresholds.length) * BINS) || 1;
}

export class Choropleth {
  readonly el: HTMLElement;
  private readonly mapWrap: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private data: ChoroplethData | null = null;
  private showTable = false;
  private readonly byName = new Map<string, string>();

  constructor(private readonly opts: ChoroplethOptions) {
    for (const [key, r] of Object.entries(opts.map.regions)) this.byName.set(r.name.toLowerCase(), key);
    this.mapWrap = h('div', { class: 'choro data' });
    this.legend = h('div', { class: 'choro-legend data' });
    this.tableWrap = h('div', { class: 'table-wrap data' });
    this.tableWrap.hidden = true;
    this.toggle = h('button', { class: 'btn small ghost', type: 'button', aria: { pressed: 'false' }, onClick: () => this.setTable(!this.showTable) }, 'Table');
    this.el = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, opts.title), this.toggle), this.legend, this.mapWrap, this.tableWrap);
  }

  setTable(on: boolean): void {
    this.showTable = on;
    this.toggle.setAttribute('aria-pressed', String(on));
    this.mapWrap.hidden = on;
    this.legend.hidden = on;
    this.tableWrap.hidden = !on;
  }

  update(data: ChoroplethData | null): void {
    this.data = data;
    this.render();
    this.renderTable();
  }

  setError(message: string): void {
    this.data = null;
    clear(this.mapWrap);
    clear(this.legend);
    clear(this.tableWrap);
    this.mapWrap.appendChild(h('div', { class: 'error' }, message));
  }

  private render(): void {
    clear(this.mapWrap);
    clear(this.legend);
    const d = this.data;
    const byKey = new Map<string, BarItem>();
    if (d) {
      for (const it of d.items) {
        const key = this.opts.map.regions[it.id.toUpperCase()] ? it.id.toUpperCase() : this.byName.get(it.name.toLowerCase());
        if (key) byKey.set(key, it);
      }
    }
    const thresholds = binThresholds(d ? d.items.map((i) => i.count) : []);
    const total = d?.total ?? 0;

    const root = svg('svg', { viewBox: this.opts.map.viewBox, role: 'img' });
    root.setAttribute('aria-label', this.opts.ariaLabel);
    const binMax = new Map<number, number>();
    const binMin = new Map<number, number>();
    for (const [iso, c] of Object.entries(this.opts.map.regions)) {
      const item = byKey.get(iso);
      const count = item?.count ?? 0;
      const bin = binFor(count, thresholds);
      if (count > 0) {
        binMax.set(bin, Math.max(binMax.get(bin) ?? 0, count));
        binMin.set(bin, Math.min(binMin.get(bin) ?? Infinity, count));
      }
      const path = svg('path', { class: `country${bin ? ` b${bin}` : ''}`, d: c.d, 'data-key': iso });
      if (count > 0) path.setAttribute('tabindex', '0');
      const name = item?.name ?? c.name;
      const rows = count > 0 ? [{ label: 'Visitors', value: formatInt(count) }, { label: 'Share', value: formatShare(count, total) }] : [{ label: 'Visitors', value: '0' }];
      path.addEventListener('pointerenter', (e) => showTooltip(e.clientX, e.clientY, name, rows));
      path.addEventListener('pointermove', (e) => positionTooltip(e.clientX, e.clientY));
      path.addEventListener('pointerleave', hideTooltip);
      path.addEventListener('focus', () => {
        const r = path.getBoundingClientRect();
        showTooltip(r.left + r.width / 2, r.top + r.height / 2, name, rows);
      });
      path.addEventListener('blur', hideTooltip);
      root.appendChild(path);
    }
    this.mapWrap.appendChild(root);

    // Scale legend: one swatch per bin actually used, labelled with its value range.
    this.legend.appendChild(h('span', {}, h('span', { class: 'sw' }), 'No visitors'));
    for (let b = 1; b <= BINS; b++) {
      const lo = binMin.get(b);
      const hi = binMax.get(b);
      if (lo === undefined || hi === undefined) continue;
      const label = lo === hi ? formatInt(lo) : `${formatInt(lo)}–${formatInt(hi)}`;
      this.legend.appendChild(h('span', {}, h('span', { class: `sw b${b}` }), label));
    }
    if (!d || d.items.length === 0) this.mapWrap.appendChild(h('div', { class: 'empty' }, this.opts.emptyText));
  }

  private renderTable(): void {
    clear(this.tableWrap);
    const d = this.data;
    if (!d || d.items.length === 0) return;
    this.tableWrap.appendChild(
      h(
        'table',
        { class: 'data-table' },
        h('thead', {}, h('tr', {}, h('th', {}, this.opts.nameHeader), h('th', { class: 'num' }, 'Visitors'), h('th', { class: 'num' }, 'Share'))),
        h(
          'tbody',
          {},
          d.items.map((i) => h('tr', {}, h('td', {}, i.name), h('td', { class: 'num' }, formatInt(i.count)), h('td', { class: 'num' }, formatShare(i.count, d.total)))),
        ),
      ),
    );
  }
}
