import { describe, expect, it } from 'vitest';
import { binFor, binThresholds } from '../src/ui/choropleth';

describe('choropleth bins', () => {
  it('uses each distinct value as a bin when there are few', () => {
    const t = binThresholds([4, 1, 1, 0]);
    expect(t).toEqual([1, 4]);
    expect(binFor(0, t)).toBe(0);
    expect(binFor(1, t)).toBe(3);
    expect(binFor(4, t)).toBe(5);
  });

  it('uses quantiles when there are many values and keeps the max darkest', () => {
    const values = Array.from({ length: 40 }, (_, i) => (i + 1) * 3);
    const t = binThresholds(values);
    expect(t.length).toBe(5);
    expect(binFor(3, t)).toBe(1);
    expect(binFor(120, t)).toBe(5);
    expect(binFor(0, t)).toBe(0);
  });
});
