// One filter row above the dashboard: date presets, custom range, compare toggle.

import { PRESETS, matchPreset, presetRange, rangeLabel, toISODate, type DateRange, type PresetKey } from '../dates';
import { h } from './dom';

export interface FilterValue {
  range: DateRange;
  preset: PresetKey;
  compare: boolean;
}

export class FilterRow {
  readonly el: HTMLElement;
  private value: FilterValue;
  private readonly chips = new Map<PresetKey, HTMLButtonElement>();
  private readonly custom: HTMLElement;
  private readonly startInput: HTMLInputElement;
  private readonly endInput: HTMLInputElement;
  private readonly label: HTMLElement;
  private readonly compareInput: HTMLInputElement;

  constructor(initial: FilterValue, private readonly onChange: (v: FilterValue) => void) {
    this.value = initial;
    const today = toISODate(new Date());
    const chips = h('div', { class: 'chips', role: 'group', aria: { label: 'Date range' } });
    for (const p of PRESETS) {
      const b = h('button', { class: 'chip', type: 'button', aria: { pressed: 'false' }, onClick: () => this.pick(p.key) }, p.label);
      this.chips.set(p.key, b);
      chips.appendChild(b);
    }
    this.startInput = h('input', { type: 'date', max: today, aria: { label: 'Start date' }, onChange: () => this.applyCustom() });
    this.endInput = h('input', { type: 'date', max: today, aria: { label: 'End date' }, onChange: () => this.applyCustom() });
    this.custom = h('div', { class: 'custom-range' }, this.startInput, h('span', { class: 'range-label' }, 'to'), this.endInput);
    this.label = h('span', { class: 'range-label' });
    this.compareInput = h('input', { type: 'checkbox', onChange: () => this.setCompare(this.compareInput.checked) });
    const compare = h('label', { class: 'switch' }, this.compareInput, h('span', {}, 'Compare to previous period'));
    this.el = h('div', { class: 'filters' }, chips, this.custom, h('span', { class: 'spacer' }), this.label, compare);
    this.sync();
  }

  get(): FilterValue {
    return this.value;
  }

  set(v: FilterValue): void {
    this.value = v;
    this.sync();
  }

  private pick(key: PresetKey): void {
    if (key === 'custom') {
      this.value = { ...this.value, preset: 'custom' };
      this.sync();
      this.startInput.focus();
      return;
    }
    this.value = { ...this.value, preset: key, range: presetRange(key) };
    this.sync();
    this.onChange(this.value);
  }

  private applyCustom(): void {
    const s = this.startInput.value;
    const e = this.endInput.value;
    if (!s || !e) return;
    const range = s <= e ? { start: s, end: e } : { start: e, end: s };
    this.value = { ...this.value, range, preset: matchPreset(range) === 'custom' ? 'custom' : matchPreset(range) };
    this.sync();
    this.onChange(this.value);
  }

  private setCompare(on: boolean): void {
    this.value = { ...this.value, compare: on };
    this.onChange(this.value);
  }

  private sync(): void {
    for (const [k, b] of this.chips) b.setAttribute('aria-pressed', String(k === this.value.preset));
    this.custom.hidden = this.value.preset !== 'custom';
    this.startInput.value = this.value.range.start;
    this.endInput.value = this.value.range.end;
    this.label.textContent = rangeLabel(this.value.range);
    this.compareInput.checked = this.value.compare;
  }
}
