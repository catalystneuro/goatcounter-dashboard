import { storage, type ColorScheme, type ThemeName } from './state';

export function applyScheme(scheme: ColorScheme): void {
  const root = document.documentElement;
  if (scheme === 'system') delete root.dataset.theme;
  else root.dataset.theme = scheme;
  storage.setScheme(scheme);
}

export function applyPreset(theme: ThemeName): void {
  const root = document.documentElement;
  if (theme === 'neutral') delete root.dataset.preset;
  else root.dataset.preset = theme;
  storage.setTheme(theme);
}

export function nextScheme(s: ColorScheme): ColorScheme {
  return s === 'system' ? 'light' : s === 'light' ? 'dark' : 'system';
}

export function schemeLabel(s: ColorScheme): string {
  return s === 'system' ? 'Theme: system' : s === 'light' ? 'Theme: light' : 'Theme: dark';
}
