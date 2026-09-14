// Setup and settings screen: site, token, goal path, theme preset.
// The token is validated with GET /me and stored only in localStorage.

import { ApiError, GoatCounterClient } from '../api';
import { DEFAULT_GOAL, normalizeSite, setupLink, siteDisplayName, storage, type ThemeName, type ViewState } from '../state';
import { clear, h } from './dom';

export interface SetupResult {
  site: string;
  goal: string;
  theme: ThemeName;
}

export interface SetupOptions {
  site?: string;
  goal?: string;
  theme: ThemeName;
  /** True when editing an existing configuration. */
  editing: boolean;
  /** Current view, used to build a setup link that opens the same range. */
  viewState: ViewState;
  onDone: (r: SetupResult) => void;
  onCancel?: () => void;
  onForget?: (site: string) => void;
}

export function renderSetup(root: HTMLElement, opts: SetupOptions): void {
  clear(root);
  const existingToken = opts.site ? storage.getToken(opts.site) : null;

  const siteInput = h('input', {
    type: 'text',
    name: 'site',
    value: opts.site ? siteDisplayName(opts.site) : '',
    placeholder: 'neurodata-ai',
    autocomplete: 'off',
    spellcheck: 'false',
    required: true,
  });
  const tokenInput = h('input', {
    type: 'password',
    name: 'token',
    value: existingToken ?? '',
    placeholder: existingToken ? '' : 'Paste your API token',
    autocomplete: 'off',
    spellcheck: 'false',
    required: true,
  });
  const goalInput = h('input', { type: 'text', name: 'goal', value: opts.goal ?? DEFAULT_GOAL, placeholder: '/apply/', autocomplete: 'off', spellcheck: 'false' });
  const themeSelect = h('select', { name: 'theme' }, h('option', { value: 'neutral' }, 'Neutral (blue)'), h('option', { value: 'pine' }, 'Pine and gold'));
  themeSelect.value = opts.theme;
  const error = h('div', { class: 'error', role: 'alert' });
  error.hidden = true;
  const submit = h('button', { class: 'btn primary', type: 'submit' }, opts.editing ? 'Save' : 'Open dashboard');
  const copyNote = h('span', { class: 'hint' });

  const form = h(
    'form',
    {
      class: 'setup',
      onSubmit: async (e) => {
        e.preventDefault();
        error.hidden = true;
        const site = normalizeSite(siteInput.value);
        const token = tokenInput.value.trim();
        if (!site || !token) {
          error.textContent = 'Both the site and the token are required.';
          error.hidden = false;
          return;
        }
        submit.disabled = true;
        submit.textContent = 'Checking…';
        try {
          const client = new GoatCounterClient({ host: site, token });
          await client.me();
          storage.setToken(site, token);
          const goal = goalInput.value.trim() ? (goalInput.value.trim().startsWith('/') ? goalInput.value.trim() : `/${goalInput.value.trim()}`) : '';
          storage.setGoal(site, goal);
          const theme = themeSelect.value === 'pine' ? 'pine' : 'neutral';
          opts.onDone({ site, goal, theme });
        } catch (err) {
          error.textContent = err instanceof ApiError ? err.message : 'Something went wrong. Check the site name and try again.';
          error.hidden = false;
          submit.disabled = false;
          submit.textContent = opts.editing ? 'Save' : 'Open dashboard';
        }
      },
    },
    h('h1', {}, opts.editing ? 'Settings' : 'GoatCounter dashboard'),
    h('p', { class: 'lead' }, opts.editing ? 'Change the site, token, goal path, or theme.' : 'A cleaner view of your GoatCounter analytics. Everything runs in your browser.'),
    h(
      'label',
      { class: 'field' },
      h('span', {}, 'Site'),
      siteInput,
      h('div', { class: 'hint' }, 'The code before .goatcounter.com, or the full host of a self-hosted instance.'),
    ),
    h(
      'label',
      { class: 'field' },
      h('span', {}, 'API token'),
      tokenInput,
      h(
        'div',
        { class: 'hint' },
        'Create one in GoatCounter under Settings, API, "Add new API token", with only the "Read statistics" permission.',
      ),
    ),
    h('div', { class: 'field-row' },
      h('label', { class: 'field' }, h('span', {}, 'Goal path'), goalInput, h('div', { class: 'hint' }, 'A page whose visitors you want to track as a headline number. Leave empty to hide it.')),
      h('label', { class: 'field' }, h('span', {}, 'Theme'), themeSelect, h('div', { class: 'hint' }, 'Colour preset for charts and chrome.')),
    ),
    error,
    h(
      'div',
      { class: 'form-actions' },
      submit,
      opts.onCancel ? h('button', { class: 'btn', type: 'button', onClick: () => opts.onCancel?.() }, 'Cancel') : null,
      opts.editing && opts.site && opts.onForget
        ? h('button', { class: 'btn ghost', type: 'button', onClick: () => opts.onForget?.(opts.site as string) }, 'Forget this site')
        : null,
    ),
    opts.editing && opts.site && existingToken
      ? h(
          'div',
          { class: 'form-actions' },
          h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              onClick: async () => {
                const site = opts.site as string;
                const link = setupLink(`${location.origin}${location.pathname}`, { ...opts.viewState, site }, storage.getToken(site) ?? '');
                try {
                  await navigator.clipboard.writeText(link);
                  copyNote.textContent = 'Copied. Anyone who opens that link can read these statistics, so share it with care.';
                } catch {
                  copyNote.textContent = link;
                }
              },
            },
            'Copy setup link with token',
          ),
          copyNote,
        )
      : null,
    h(
      'p',
      { class: 'privacy' },
      'The token is stored in this browser’s localStorage and sent only to your GoatCounter site. It is never part of the page URL, so links you share carry the site and date range but not the token.',
    ),
  );
  root.appendChild(form);

  const known = storage.sites().filter((s) => s !== opts.site);
  if (!opts.editing && known.length > 0) {
    const list = h('ul', {});
    for (const s of known) {
      list.appendChild(
        h('li', {}, h('button', { class: 'btn small', type: 'button', onClick: () => opts.onDone({ site: s, goal: storage.getGoal(s) ?? DEFAULT_GOAL, theme: opts.theme }) }, siteDisplayName(s))),
      );
    }
    form.appendChild(h('div', { class: 'known-sites' }, h('span', { class: 'hint' }, 'Sites already set up in this browser'), list));
  }
  (opts.site && existingToken ? goalInput : opts.site ? tokenInput : siteInput).focus();
}
