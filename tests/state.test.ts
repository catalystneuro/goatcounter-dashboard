import { describe, expect, it } from 'vitest';
import { normalizeSite, searchFromState, siteDisplayName, stateFromSearch } from '../src/state';

const today = new Date(2026, 8, 13);

describe('state', () => {
  it('normalizes site input', () => {
    expect(normalizeSite('neurodata-ai')).toBe('neurodata-ai.goatcounter.com');
    expect(normalizeSite(' Neurodata-AI.goatcounter.com/ ')).toBe('neurodata-ai.goatcounter.com');
    expect(normalizeSite('https://stats.example.com/api')).toBe('stats.example.com');
    expect(siteDisplayName('neurodata-ai.goatcounter.com')).toBe('neurodata-ai');
    expect(siteDisplayName('stats.example.com')).toBe('stats.example.com');
  });

  it('round-trips presets and custom ranges without a token', () => {
    const s = stateFromSearch('?site=neurodata-ai&range=7d&compare=1', today);
    expect(s.site).toBe('neurodata-ai.goatcounter.com');
    expect(s.preset).toBe('7d');
    expect(s.range).toEqual({ start: '2026-09-07', end: '2026-09-13' });
    expect(s.compare).toBe(true);
    expect(searchFromState(s)).toBe('?site=neurodata-ai&range=7d&compare=1');

    const c = stateFromSearch('?site=x&start=2026-08-01&end=2026-08-31&goal=/signup/&theme=pine', today);
    expect(c.preset).toBe('custom');
    expect(c.goal).toBe('/signup/');
    expect(c.theme).toBe('pine');
    expect(searchFromState(c)).toBe('?site=x&start=2026-08-01&end=2026-08-31&goal=%2Fsignup%2F&theme=pine');
    expect(searchFromState(c)).not.toContain('token');
  });

  it('falls back to 30 days on bad input', () => {
    const s = stateFromSearch('?start=2026-13-01&end=nope&range=bogus', today);
    expect(s.preset).toBe('30d');
    expect(s.goal).toBe('/apply/');
    const rev = stateFromSearch('?start=2026-09-10&end=2026-09-01', today);
    expect(rev.preset).toBe('30d');
  });
});
