import { computeDelta, formatCompact, formatDelta, formatInt } from '../format';
import { clear, h } from './dom';

export interface KpiValue {
  current: number;
  previous?: number | null;
}

export interface KpiSpec {
  key: string;
  label: string;
  hero?: boolean;
  sub?: string;
}

/** A row of stat tiles. update() re-renders values in place, keeping the frame. */
export class KpiRow {
  readonly el: HTMLElement;
  private tiles = new Map<string, { root: HTMLElement; value: HTMLElement; delta: HTMLElement; sub: HTMLElement }>();

  constructor(specs: KpiSpec[]) {
    this.el = h('div', { class: 'kpis' });
    for (const s of specs) {
      const value = h('div', { class: 'value', title: '' }, '–');
      const delta = h('div', { class: 'delta' });
      const sub = h('div', { class: 'sub' }, s.sub ?? '');
      const root = h('div', { class: `card tile data${s.hero ? ' hero' : ''}` }, h('div', { class: 'label' }, s.label), value, delta, sub);
      this.el.appendChild(root);
      this.tiles.set(s.key, { root, value, delta, sub });
    }
  }

  setLabel(key: string, label: string): void {
    const t = this.tiles.get(key);
    if (!t) return;
    const l = t.root.querySelector('.label');
    if (l) l.textContent = label;
  }

  setVisible(key: string, visible: boolean): void {
    const t = this.tiles.get(key);
    if (t) t.root.hidden = !visible;
  }

  update(key: string, v: KpiValue | null, compareLabel?: string): void {
    const t = this.tiles.get(key);
    if (!t) return;
    clear(t.delta);
    if (!v) {
      t.value.textContent = '–';
      t.value.title = '';
      return;
    }
    t.value.textContent = formatCompact(v.current);
    t.value.title = formatInt(v.current);
    if (v.previous !== undefined && v.previous !== null) {
      const d = computeDelta(v.current, v.previous);
      t.delta.className = `delta ${d.direction}`;
      const arrow = d.direction === 'up' ? '↑' : d.direction === 'down' ? '↓' : '→';
      t.delta.append(
        h('span', { class: 'sign', aria: { label: `${d.direction} ${formatDelta(d)}` } }, `${arrow} ${formatDelta(d)}`),
        h('span', {}, `vs ${formatInt(v.previous)} ${compareLabel ?? 'previous period'}`),
      );
    } else {
      t.delta.className = 'delta';
    }
  }

  setError(key: string, message: string): void {
    const t = this.tiles.get(key);
    if (!t) return;
    t.value.textContent = '–';
    clear(t.delta);
    t.delta.className = 'delta';
    t.delta.appendChild(h('span', { class: 'error', style: 'padding:0' }, message));
  }
}
