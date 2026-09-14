import { describe, expect, it } from 'vitest';
import { addDays, eachDay, isHourly, matchPreset, parseISODate, presetRange, previousPeriod, rangeLabel, rangeLength, shortDate } from '../src/dates';

const today = new Date(2026, 8, 13); // Sep 13, 2026 (local)

describe('dates', () => {
  it('parses valid ISO dates and rejects rollover', () => {
    expect(parseISODate('2026-09-13')?.getDate()).toBe(13);
    expect(parseISODate('2026-02-31')).toBeNull();
    expect(parseISODate('nope')).toBeNull();
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('resolves presets against today', () => {
    expect(presetRange('today', today)).toEqual({ start: '2026-09-13', end: '2026-09-13' });
    expect(presetRange('7d', today)).toEqual({ start: '2026-09-07', end: '2026-09-13' });
    expect(presetRange('30d', today)).toEqual({ start: '2026-08-15', end: '2026-09-13' });
    expect(presetRange('90d', today)).toEqual({ start: '2026-06-16', end: '2026-09-13' });
    expect(presetRange('year', today)).toEqual({ start: '2025-09-14', end: '2026-09-13' });
    expect(rangeLength(presetRange('year', today))).toBe(365);
  });

  it('computes the previous period of equal length', () => {
    expect(previousPeriod({ start: '2026-08-15', end: '2026-09-13' })).toEqual({ start: '2026-07-16', end: '2026-08-14' });
    expect(previousPeriod({ start: '2026-09-13', end: '2026-09-13' })).toEqual({ start: '2026-09-12', end: '2026-09-12' });
  });

  it('matches ranges back to presets', () => {
    expect(matchPreset({ start: '2026-08-15', end: '2026-09-13' }, today)).toBe('30d');
    expect(matchPreset({ start: '2026-08-01', end: '2026-09-13' }, today)).toBe('custom');
  });

  it('iterates days and picks hourly for short ranges', () => {
    expect(eachDay({ start: '2026-09-11', end: '2026-09-13' })).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
    expect(isHourly({ start: '2026-09-12', end: '2026-09-13' })).toBe(true);
    expect(isHourly({ start: '2026-09-10', end: '2026-09-13' })).toBe(false);
  });

  it('formats labels', () => {
    expect(shortDate('2026-09-13')).toBe('Sep 13');
    expect(shortDate('2025-09-13', 2026)).toBe('Sep 13, 2025');
    expect(rangeLabel({ start: '2026-08-15', end: '2026-09-13' })).toBe('Aug 15 to Sep 13, 2026');
    expect(rangeLabel({ start: '2025-12-20', end: '2026-01-05' })).toBe('Dec 20, 2025 to Jan 5, 2026');
  });
});

import { apiRange, hourIn, parseGoatCounterTimezone, todayIn, zonedMidnightUTC } from '../src/dates';

describe('timezones', () => {
  it('parses GoatCounter timezone strings', () => {
    expect(parseGoatCounterTimezone('US.America/New_York')).toBe('America/New_York');
    expect(parseGoatCounterTimezone('Europe/Amsterdam')).toBe('Europe/Amsterdam');
    expect(parseGoatCounterTimezone('XX.Not/AZone')).toBe('UTC');
    expect(parseGoatCounterTimezone('')).toBe('UTC');
  });

  it('finds local midnight as a UTC instant, including across DST', () => {
    expect(zonedMidnightUTC('2026-09-13', 'America/New_York').toISOString()).toBe('2026-09-13T04:00:00.000Z');
    expect(zonedMidnightUTC('2026-01-13', 'America/New_York').toISOString()).toBe('2026-01-13T05:00:00.000Z');
    expect(zonedMidnightUTC('2026-09-13', 'UTC').toISOString()).toBe('2026-09-13T00:00:00.000Z');
    expect(zonedMidnightUTC('2026-09-13', 'Asia/Kolkata').toISOString()).toBe('2026-09-12T18:30:00.000Z');
  });

  it('builds inclusive hour bounds for the API', () => {
    expect(apiRange({ start: '2026-09-12', end: '2026-09-13' }, 'America/New_York')).toEqual({ start: '2026-09-12T04:00:00Z', end: '2026-09-14T03:00:00Z' });
    expect(apiRange({ start: '2026-09-13', end: '2026-09-13' }, 'UTC')).toEqual({ start: '2026-09-13T00:00:00Z', end: '2026-09-13T23:00:00Z' });
  });

  it('reports today and the hour in a zone', () => {
    const now = new Date('2026-09-14T01:40:00Z');
    expect(todayIn('America/New_York', now)).toBe('2026-09-13');
    expect(todayIn('UTC', now)).toBe('2026-09-14');
    expect(hourIn('America/New_York', now)).toBe(21);
  });
});
