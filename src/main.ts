import './styles/app.css';
import { GoatCounterClient } from './api';
import { parseGoatCounterTimezone, presetRange, parseISODate, todayIn } from './dates';
import { DEFAULT_GOAL, searchFromState, stateFromSearch, storage, type ViewState } from './state';
import { applyPreset, applyScheme } from './theme';
import { clear, h } from './ui/dom';
import { Overview } from './ui/overview';
import { renderSetup } from './ui/setup';

const root = document.getElementById('app') as HTMLElement;
let overview: Overview | null = null;

const TZ_KEY = 'gcd.tz';
function getTz(site: string): string | null {
  try {
    const all = JSON.parse(localStorage.getItem(TZ_KEY) ?? '{}') as Record<string, string>;
    return all[site] ?? null;
  } catch {
    return null;
  }
}
function setTz(site: string, tz: string): void {
  try {
    const all = JSON.parse(localStorage.getItem(TZ_KEY) ?? '{}') as Record<string, string>;
    all[site] = tz;
    localStorage.setItem(TZ_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

function writeUrl(s: ViewState): void {
  const search = searchFromState(s);
  const url = `${location.pathname}${search}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== url) history.replaceState(null, '', url);
}

function boot(): void {
  applyScheme(storage.getScheme());
  let state = stateFromSearch(location.search);
  if (!state.site) {
    const last = storage.lastSite();
    if (last) state = { ...state, site: last };
  }
  // Theme: URL wins, then the stored preference.
  const q = new URLSearchParams(location.search);
  if (!q.get('theme')) {
    const stored = storage.getTheme();
    if (stored) state = { ...state, theme: stored };
  }
  applyPreset(state.theme);
  // Goal: URL wins, then the per-site stored value.
  if (!q.get('goal') && state.site) {
    const g = storage.getGoal(state.site);
    if (g !== null) state = { ...state, goal: g };
  }

  const token = state.site ? storage.getToken(state.site) : null;
  if (!state.site || !token) {
    showSetup(state, false);
    return;
  }
  void showOverview(state, token);
}

function showSetup(state: ViewState, editing: boolean): void {
  overview?.destroy();
  overview = null;
  renderSetup(root, {
    site: state.site || undefined,
    goal: state.goal,
    theme: state.theme,
    editing,
    onDone: ({ site, goal, theme }) => {
      applyPreset(theme);
      const next: ViewState = { ...state, site, goal, theme };
      const token = storage.getToken(site);
      if (!token) {
        showSetup(next, false);
        return;
      }
      void showOverview(next, token);
    },
    onCancel: editing
      ? () => {
          const token = storage.getToken(state.site);
          if (token) void showOverview(state, token);
        }
      : undefined,
    onForget: (site) => {
      storage.removeToken(site);
      showSetup({ ...state, site: '' }, false);
    },
  });
}

async function showOverview(state: ViewState, token: string): Promise<void> {
  overview?.destroy();
  overview = null;
  clear(root);
  root.appendChild(h('div', { class: 'empty' }, 'Loading…'));

  let tz = getTz(state.site);
  const client = new GoatCounterClient({ host: state.site, token, timezone: tz ?? 'UTC' });
  if (!tz) {
    try {
      const me = await client.me();
      tz = parseGoatCounterTimezone(me.user.settings?.timezone);
      setTz(state.site, tz);
      client.timezone = tz;
    } catch {
      tz = 'UTC';
    }
  }

  // Re-resolve presets against "today" in the site's timezone.
  if (state.preset !== 'custom') {
    const today = parseISODate(todayIn(tz)) ?? new Date();
    state = { ...state, range: presetRange(state.preset, today) };
  }
  writeUrl(state);

  const view = new Overview({
    client,
    state,
    onStateChange: (s) => {
      state = s;
      writeUrl(s);
    },
    onOpenSettings: () => showSetup({ ...state, goal: state.goal || DEFAULT_GOAL }, true),
    onAuthError: () => showSetup(state, true),
  });
  overview = view;
  clear(root);
  root.appendChild(view.el);
  view.start();
}

boot();
