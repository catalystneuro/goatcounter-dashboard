import { clear, h } from './dom';

export interface TooltipRow {
  label: string;
  value: string;
  /** series slot for the line key; omit for no key */
  key?: 1 | 2;
}

let el: HTMLDivElement | null = null;

function ensure(): HTMLDivElement {
  if (!el) {
    el = h('div', { class: 'tooltip', role: 'status', aria: { live: 'polite' } });
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

export function showTooltip(x: number, y: number, title: string | null, rows: TooltipRow[]): void {
  const t = ensure();
  clear(t);
  if (title) t.appendChild(h('div', { class: 'tt-title' }, title));
  for (const r of rows) {
    t.appendChild(
      h(
        'div',
        { class: 'tt-row' },
        h('span', { class: 'tt-label' }, r.key ? h('span', { class: `tt-key s${r.key}` }) : null, r.label),
        h('span', { class: 'tt-value' }, r.value),
      ),
    );
  }
  t.hidden = false;
  positionTooltip(x, y);
}

export function positionTooltip(x: number, y: number): void {
  const t = ensure();
  if (t.hidden) return;
  const pad = 14;
  const w = t.offsetWidth;
  const hgt = t.offsetHeight;
  let left = x + pad;
  let top = y + pad;
  if (left + w > window.innerWidth - 8) left = x - pad - w;
  if (top + hgt > window.innerHeight - 8) top = y - pad - hgt;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

export function hideTooltip(): void {
  if (el) el.hidden = true;
}
