import { describe, expect, it } from 'vitest';
import { computeDelta, formatCompact, formatDelta, formatInt, formatShare, niceTicks } from '../src/format';

describe('format', () => {
  it('formats integers and compact figures', () => {
    expect(formatInt(1284)).toBe('1,284');
    expect(formatCompact(987)).toBe('987');
    expect(formatCompact(1284)).toBe('1.3K');
    expect(formatCompact(12_900)).toBe('13K');
    expect(formatCompact(4_200_000)).toBe('4.2M');
    expect(formatCompact(1000)).toBe('1K');
  });

  it('formats shares', () => {
    expect(formatShare(50, 200)).toBe('25%');
    expect(formatShare(5, 200)).toBe('2.5%');
    expect(formatShare(1, 2000)).toBe('<0.1%');
    expect(formatShare(0, 0)).toBe('0%');
  });

  it('computes and formats deltas', () => {
    expect(formatDelta(computeDelta(120, 100))).toBe('+20%');
    expect(formatDelta(computeDelta(97, 100))).toBe('-3%');
    expect(formatDelta(computeDelta(100, 100))).toBe('0%');
    expect(formatDelta(computeDelta(5, 0))).toBe('new');
    expect(computeDelta(5, 0).direction).toBe('up');
  });

  it('produces clean ticks', () => {
    expect(niceTicks(87)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(1234)[niceTicks(1234).length - 1]).toBeGreaterThanOrEqual(1234);
  });
});
