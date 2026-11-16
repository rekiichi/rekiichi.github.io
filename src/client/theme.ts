// 表示テーマの切り替えボタン（自動 → ライト → ダーク → 自動 …）。
// 描画前の反映は BaseLayout.astro の <head> 内スクリプトが行う。

import { store, type ThemeMode } from './storage';

type Mode = 'auto' | ThemeMode;
const ORDER: Mode[] = ['auto', 'light', 'dark'];
const LABELS: Record<Mode, string> = { auto: '自動', light: 'ライト', dark: 'ダーク' };

function currentMode(): Mode {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'light' || t === 'dark' ? t : 'auto';
}

function applyMode(mode: Mode): void {
  if (mode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
}

function updateButton(button: HTMLElement, mode: Mode): void {
  button.dataset.mode = mode;
  button.setAttribute('aria-label', `表示テーマ：${LABELS[mode]}（押すと切り替え）`);
}

for (const button of document.querySelectorAll<HTMLElement>('[data-theme-toggle]')) {
  updateButton(button, currentMode());
  button.addEventListener('click', () => {
    const next = ORDER[(ORDER.indexOf(currentMode()) + 1) % ORDER.length];
    applyMode(next);
    store.setTheme(next === 'auto' ? null : next);
    updateButton(button, next);
  });
}
