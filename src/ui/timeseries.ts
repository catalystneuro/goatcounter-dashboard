// Hand-written SVG line chart: one accent series, optional comparison series,
// area wash, hairline gridlines, crosshair tooltip, keyboard navigation, table twin.

import { formatInt, niceTicks } from '../format';
import { clear, h, svg } from './dom';
import { hideTooltip, showTooltip, type TooltipRow } from './tooltip';

export interface SeriesPoint {
  /** Axis label for this x position (date or hour). */
  label: string;
  /** Short label for the axis (may be empty to skip). */
  tick: string;
  value: number;
}

export interface Series {
  name: string;
  points: SeriesPoint[];
}

export interface TimeSeriesData {
  /** Series 1, always present. */
  current: Series;
  /** Series 2, aligned by index with series 1. */
  previous?: Series | null;
  /** Unit label for tooltips and the table, e.g. "visitors". */
  unit: string;
}

const H = 240;
const M = { top: 14, right: 20, bottom: 26, left: 8 };

export class TimeSeriesChart {
  readonly el: HTMLElement;
  private readonly chartWrap: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private data: TimeSeriesData | null = null;
  private width = 600;
  private showTable = false;
  private focusIndex = -1;
  private ro: ResizeObserver | null = null;

  constructor(title: string) {
    this.chartWrap = h('div', { class: 'chart data' });
    this.tableWrap = h('div', { class: 'table-wrap data' });
    this.tableWrap.hidden = true;
    this.legend = h('div', { class: 'legend' });
    this.legend.hidden = true;
    this.toggle = h('button', { class: 'btn small ghost', type: 'button', aria: { pressed: 'false' }, onClick: () => this.setTable(!this.showTable) }, 'Table');
    this.el = h(
      'section',
      { class: 'card chart-card' },
      h('div', { class: 'card-head' }, h('h2', {}, title, h('span', { class: 'sub' })), this.toggle),
      this.legend,
      this.chartWrap,
      this.tableWrap,
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0 && Math.abs(w - this.width) > 1) {
          this.width = w;
          this.draw();
        }
      });
      this.ro.observe(this.chartWrap);
    }
  }

  setSubtitle(text: string): void {
    const s = this.el.querySelector('.card-head .sub');
    if (s) s.textContent = text;
  }

  setTable(on: boolean): void {
    this.showTable = on;
    this.toggle.setAttribute('aria-pressed', String(on));
    this.chartWrap.hidden = on;
    this.tableWrap.hidden = !on;
    this.legend.hidden = on || !this.data?.previous;
  }

  update(data: TimeSeriesData | null): void {
    this.data = data;
    this.focusIndex = -1;
    this.draw();
    this.drawTable();
    this.drawLegend();
  }

  setError(message: string): void {
    this.data = null;
    clear(this.chartWrap);
    clear(this.tableWrap);
    this.legend.hidden = true;
    this.chartWrap.appendChild(h('div', { class: 'error' }, message));
  }

  private drawLegend(): void {
    clear(this.legend);
    const d = this.data;
    if (!d || !d.previous) {
      this.legend.hidden = true;
      return;
    }
    this.legend.hidden = this.showTable;
    this.legend.append(
      h('span', {}, h('span', { class: 'key s1' }), d.current.name),
      h('span', {}, h('span', { class: 'key s2' }), d.previous.name),
    );
  }

  private drawTable(): void {
    clear(this.tableWrap);
    const d = this.data;
    if (!d) return;
    const hasPrev = !!d.previous;
    const rows = d.current.points.map((p, i) => {
      const prev = d.previous?.points[i];
      return h(
        'tr',
        {},
        h('td', {}, p.label),
        h('td', { class: 'num' }, formatInt(p.value)),
        hasPrev ? h('td', {}, prev?.label ?? '') : null,
        hasPrev ? h('td', { class: 'num' }, prev ? formatInt(prev.value) : '') : null,
      );
    });
    this.tableWrap.appendChild(
      h(
        'table',
        { class: 'data-table' },
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', {}, 'Date'),
            h('th', { class: 'num' }, capitalize(d.unit)),
            hasPrev ? h('th', {}, 'Previous date') : null,
            hasPrev ? h('th', { class: 'num' }, `Previous ${d.unit}`) : null,
          ),
        ),
        h('tbody', {}, rows),
      ),
    );
  }

  private draw(): void {
    clear(this.chartWrap);
    const d = this.data;
    if (!d) {
      this.chartWrap.appendChild(h('div', { class: 'empty' }, 'No data for this range.'));
      return;
    }
    const pts = d.current.points;
    const prev = d.previous?.points ?? null;
    const n = pts.length;
    if (n === 0) {
      this.chartWrap.appendChild(h('div', { class: 'empty' }, 'No data for this range.'));
      return;
    }
    const W = Math.max(280, this.width);
    const maxVal = Math.max(1, ...pts.map((p) => p.value), ...(prev ? prev.map((p) => p.value) : []));
    const ticks = niceTicks(maxVal, 4);
    const yMax = ticks[ticks.length - 1] ?? maxVal;
    const labelW = Math.max(...ticks.map((t) => formatInt(t).length)) * 7 + 10;
    const left = M.left + labelW;
    const plotW = W - left - M.right;
    const plotH = H - M.top - M.bottom;
    const x = (i: number) => (n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);
    const y = (v: number) => M.top + plotH - (v / yMax) * plotH;

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', tabindex: 0 });
    root.setAttribute('aria-label', `${d.current.name}: ${d.unit} over ${n} points, max ${formatInt(maxVal)}`);

    // gridlines and y ticks
    for (const t of ticks) {
      const yy = Math.round(y(t)) + 0.5;
      root.appendChild(svg(t === 0 ? 'line' : 'line', { class: t === 0 ? 'baseline' : 'grid-line', x1: left, x2: left + plotW, y1: yy, y2: yy }));
      root.appendChild(svg('text', { class: 'tick', x: left - 6, y: yy + 3.5, 'text-anchor': 'end' }, formatInt(t)));
    }
    // x ticks: about 6, always first and last
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))));
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      if (i % every !== 0 && !isLast) continue;
      if (isLast && n > 1 && (n - 1) % every !== 0 && (n - 1) % every < every / 2) continue;
      const p = pts[i];
      if (!p || !p.tick) continue;
      const anchor = i === 0 ? 'start' : isLast ? 'end' : 'middle';
      root.appendChild(svg('text', { class: 'tick', x: x(i), y: H - 8, 'text-anchor': anchor }, p.tick));
    }

    // area wash and lines
    const pathOf = (arr: SeriesPoint[]) => arr.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    if (n > 1) {
      const area = `${pathOf(pts)} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
      root.appendChild(svg('path', { class: 'area', d: area }));
    }
    if (prev && prev.length > 1) root.appendChild(svg('path', { class: 'line s2', d: pathOf(prev.slice(0, n)) }));
    if (n > 1) root.appendChild(svg('path', { class: 'line s1', d: pathOf(pts) }));

    // end marker + selective direct label on the last point of the current series
    const lastP = pts[n - 1];
    if (lastP) {
      root.appendChild(svg('circle', { class: 'marker s1', cx: x(n - 1), cy: y(lastP.value), r: 4 }));
      const labelX = x(n - 1);
      const labelY = y(lastP.value) - 9;
      root.appendChild(svg('text', { class: 'end-label', x: labelX, y: Math.max(M.top + 4, labelY), 'text-anchor': 'end' }, formatInt(lastP.value)));
    }

    // hover layer
    const cross = svg('g', { style: 'display:none' });
    const crossLine = svg('line', { class: 'crosshair', y1: M.top, y2: M.top + plotH });
    const dot1 = svg('circle', { class: 'marker s1', r: 4 });
    const dot2 = svg('circle', { class: 'marker s2', r: 4 });
    cross.append(crossLine, dot1, dot2);
    root.appendChild(cross);
    const hit = svg('rect', { class: 'hit', x: left - 10, y: 0, width: plotW + 20, height: H });
    root.appendChild(hit);

    const show = (i: number, clientX?: number, clientY?: number) => {
      const p = pts[i];
      if (!p) return;
      const xx = x(i);
      cross.style.display = '';
      crossLine.setAttribute('x1', String(xx));
      crossLine.setAttribute('x2', String(xx));
      dot1.setAttribute('cx', String(xx));
      dot1.setAttribute('cy', String(y(p.value)));
      const pp = prev?.[i];
      if (pp) {
        dot2.style.display = '';
        dot2.setAttribute('cx', String(xx));
        dot2.setAttribute('cy', String(y(pp.value)));
      } else dot2.style.display = 'none';
      const rows: TooltipRow[] = [{ label: prev ? p.label : d.unit, value: formatInt(p.value), key: prev ? 1 : undefined }];
      if (pp) rows.push({ label: pp.label, value: formatInt(pp.value), key: 2 });
      const rect = root.getBoundingClientRect();
      const cx = clientX ?? rect.left + (xx / W) * rect.width;
      const cy = clientY ?? rect.top + (y(p.value) / H) * rect.height;
      showTooltip(cx, cy, prev ? null : p.label, rows);
    };
    const hide = () => {
      cross.style.display = 'none';
      hideTooltip();
    };
    const indexFromClientX = (clientX: number) => {
      const rect = root.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      const rel = n === 1 ? 0 : (px - left) / plotW;
      return Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    };
    hit.addEventListener('pointermove', (e) => show(indexFromClientX(e.clientX), e.clientX, e.clientY));
    hit.addEventListener('pointerdown', (e) => show(indexFromClientX(e.clientX), e.clientX, e.clientY));
    hit.addEventListener('pointerleave', hide);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        if (e.key === 'Home') this.focusIndex = 0;
        else if (e.key === 'End') this.focusIndex = n - 1;
        else if (this.focusIndex < 0) this.focusIndex = n - 1;
        else this.focusIndex = Math.max(0, Math.min(n - 1, this.focusIndex + (e.key === 'ArrowRight' ? 1 : -1)));
        show(this.focusIndex);
      } else if (e.key === 'Escape') {
        this.focusIndex = -1;
        hide();
      }
    });
    root.addEventListener('blur', hide);

    this.chartWrap.appendChild(root);
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
