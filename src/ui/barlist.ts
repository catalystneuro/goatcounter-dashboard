// Horizontal bar list panel with a table twin and optional click-to-drill rows.

import type { Stat } from '../api';
import { formatInt, formatShare } from '../format';
import { clear, h } from './dom';
import { hideTooltip, positionTooltip, showTooltip } from './tooltip';

export interface BarItem {
  id: string;
  name: string;
  count: number;
  /** Secondary text shown muted after the name (page title). */
  title?: string;
  /** External link for the label. */
  href?: string;
}

export interface BarListOptions {
  title: string;
  /** Word for the row unit in the table header, e.g. "Page". */
  nameHeader: string;
  /** Empty-state message. */
  emptyText: string;
  /** Fetch a nested list for a row; when present rows are clickable. */
  drill?: (item: BarItem, signal: AbortSignal) => Promise<BarItem[]>;
  drillEmptyText?: string;
}

export interface BarListData {
  items: BarItem[];
  /** Denominator for shares (site total for the range). */
  total: number;
  /** True when the API reported more entries than shown. */
  more: boolean;
}

export function statsToItems(stats: Stat[]): BarItem[] {
  return stats.map((s) => ({
    id: s.id ?? s.name,
    name: s.name || '(unknown)',
    count: s.count,
    href: s.ref_scheme === 'h' && looksLikeHost(s.name) ? `https://${s.name}` : undefined,
  }));
}

function looksLikeHost(name: string): boolean {
  return /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(name) && !name.includes(' ');
}

export class BarList {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private data: BarListData | null = null;
  private showTable = false;
  private drillControllers = new Map<string, AbortController>();

  constructor(private readonly opts: BarListOptions) {
    this.body = h('div', { class: 'data' });
    this.tableWrap = h('div', { class: 'table-wrap data' });
    this.tableWrap.hidden = true;
    this.toggle = h('button', { class: 'btn small ghost', type: 'button', aria: { pressed: 'false' }, onClick: () => this.setTable(!this.showTable) }, 'Table');
    this.el = h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, opts.title), this.toggle), this.body, this.tableWrap);
  }

  setTable(on: boolean): void {
    this.showTable = on;
    this.toggle.setAttribute('aria-pressed', String(on));
    this.body.hidden = on;
    this.tableWrap.hidden = !on;
  }

  update(data: BarListData | null): void {
    this.data = data;
    for (const c of this.drillControllers.values()) c.abort();
    this.drillControllers.clear();
    this.render();
    this.renderTable();
  }

  setError(message: string): void {
    this.data = null;
    clear(this.body);
    clear(this.tableWrap);
    this.body.appendChild(h('div', { class: 'error' }, message));
  }

  private render(): void {
    clear(this.body);
    const d = this.data;
    if (!d || d.items.length === 0) {
      this.body.appendChild(h('div', { class: 'empty' }, this.opts.emptyText));
      return;
    }
    const max = Math.max(1, ...d.items.map((i) => i.count));
    this.body.appendChild(this.renderBars(d.items, max, d.total, !!this.opts.drill));
    if (d.more) this.body.appendChild(h('div', { class: 'more-note' }, 'Showing the top entries.'));
  }

  private renderBars(items: BarItem[], max: number, total: number, drillable: boolean): HTMLElement {
    const ul = h('ul', { class: 'bars' });
    for (const item of items) {
      const li = h('li', {});
      const share = formatShare(item.count, total);
      const pct = Math.max(0, Math.min(100, (item.count / max) * 100));
      const labelChildren: (HTMLElement | string)[] = [];
      if (drillable) labelChildren.push(h('span', { class: 'caret', aria: { hidden: 'true' } }, '▶'));
      if (item.href) {
        labelChildren.push(
          h('a', { href: item.href, target: '_blank', rel: 'noopener noreferrer', title: item.name, onClick: (e) => e.stopPropagation() }, item.name),
        );
      } else labelChildren.push(h('span', { title: item.title ? `${item.name} ${item.title}` : item.name }, item.name));
      if (item.title) labelChildren.push(h('span', { class: 'title', title: item.title }, item.title));

      const row = h(
        drillable ? 'button' : 'div',
        {
          class: `bar-row${drillable ? ' clickable' : ''}`,
          type: drillable ? 'button' : undefined,
          aria: drillable ? { expanded: 'false' } : undefined,
        },
        h('span', { class: 'bar-label' }, ...labelChildren),
        h('span', { class: 'bar-track', aria: { hidden: 'true' } }, h('span', { class: 'bar-fill', style: `width:${pct.toFixed(2)}%` })),
        h('span', { class: 'bar-value' }, formatInt(item.count), h('span', { class: 'share' }, share)),
      );
      const tip = (e: Event) => {
        const pe = e as PointerEvent;
        showTooltip(pe.clientX, pe.clientY, item.title ? `${item.name} ${item.title}` : item.name, [
          { label: 'Visitors', value: formatInt(item.count) },
          { label: 'Share', value: share },
        ]);
      };
      row.addEventListener('pointerenter', tip);
      row.addEventListener('pointermove', (e) => positionTooltip((e as PointerEvent).clientX, (e as PointerEvent).clientY));
      row.addEventListener('pointerleave', hideTooltip);
      row.addEventListener('focus', () => {
        const r = row.getBoundingClientRect();
        showTooltip(r.left + 40, r.top + r.height, item.name, [
          { label: 'Visitors', value: formatInt(item.count) },
          { label: 'Share', value: share },
        ]);
      });
      row.addEventListener('blur', hideTooltip);
      li.appendChild(row);

      if (drillable && this.opts.drill) {
        const drill = this.opts.drill;
        let sub: HTMLElement | null = null;
        row.addEventListener('click', () => {
          hideTooltip();
          if (sub) {
            sub.remove();
            sub = null;
            row.setAttribute('aria-expanded', 'false');
            this.drillControllers.get(item.id)?.abort();
            return;
          }
          row.setAttribute('aria-expanded', 'true');
          sub = h('div', { class: 'bar-sub' }, h('div', { class: 'empty' }, 'Loading…'));
          li.appendChild(sub);
          const ctrl = new AbortController();
          this.drillControllers.set(item.id, ctrl);
          const target = sub;
          drill(item, ctrl.signal)
            .then((children) => {
              if (ctrl.signal.aborted) return;
              clear(target);
              if (children.length === 0) {
                target.appendChild(h('div', { class: 'empty' }, this.opts.drillEmptyText ?? 'Nothing to show.'));
                return;
              }
              const subMax = Math.max(1, ...children.map((c) => c.count));
              target.appendChild(this.renderBars(children, subMax, item.count, false));
            })
            .catch((err: unknown) => {
              if (ctrl.signal.aborted) return;
              clear(target);
              target.appendChild(h('div', { class: 'error' }, err instanceof Error ? err.message : 'Could not load details.'));
            });
        });
      }
      ul.appendChild(li);
    }
    return ul;
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
          d.items.map((i) =>
            h(
              'tr',
              {},
              h('td', {}, i.href ? h('a', { href: i.href, target: '_blank', rel: 'noopener noreferrer' }, i.name) : i.name, i.title ? ` ${i.title}` : ''),
              h('td', { class: 'num' }, formatInt(i.count)),
              h('td', { class: 'num' }, formatShare(i.count, d.total)),
            ),
          ),
        ),
      ),
    );
  }
}
