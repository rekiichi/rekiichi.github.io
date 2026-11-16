// OGP 画像（public/og-image.png, 1200×630）と apple-touch-icon（public/apple-touch-icon.png, 180×180）を作る。
// サイト名は src/site.config.ts から読む。サイト名を変えたら作り直す。
//
//   npx tsx scripts/og-image/generate.ts
//   npx tsx scripts/og-image/generate.ts --font-css=/path/to/noto-sans-jp/800.css   … フォントを指定する場合
//
// Playwright（Chromium）が必要: npm i -D playwright && npx playwright install chromium
// （日本語フォントは OS のもの（ヒラギノ角ゴ・Noto Sans JP など）を使う）

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { siteConfig } from '../../src/site.config';

const require = createRequire(import.meta.url);
const fontArg = process.argv.find((a) => a.startsWith('--font-css='));
const fontLink = fontArg ? `<link rel="stylesheet" href="${pathToFileURL(fontArg.slice('--font-css='.length)).href}">` : '';

const mark = (size: number) => `
<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="28" height="28" rx="7" fill="#1f5fbf"/>
  <rect x="8" y="9" width="16" height="3" rx="1.5" fill="#fff"/>
  <rect x="8" y="15" width="11" height="3" rx="1.5" fill="#fff"/>
  <rect x="8" y="21" width="14" height="4" rx="1" fill="#e8453c"/>
</svg>`;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ogHtml = `<!doctype html><html lang="ja"><head><meta charset="utf-8">${fontLink}
<style>
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px; box-sizing: border-box; padding: 72px 88px;
    display: flex; flex-direction: column; justify-content: space-between;
    background: #f7f5f0; color: #1d2126;
    font-family: 'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'IPAGothic', sans-serif;
  }
  .top { display: flex; align-items: center; gap: 40px; }
  .name { font-size: 112px; font-weight: 800; letter-spacing: 0.06em; line-height: 1; }
  .tagline { font-size: 56px; font-weight: 800; line-height: 1.35; margin: 0; }
  .tagline em { font-style: normal; color: #e8453c; }
  .chips { display: flex; gap: 18px; }
  .chip { font-size: 32px; font-weight: 700; padding: 10px 28px; border-radius: 999px; border: 4px solid; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 18px; background: linear-gradient(90deg, #1f5fbf 0 70%, #e8453c 70%); }
</style></head><body>
  <div class="top">${mark(150)}<div class="name">${escape(siteConfig.name)}</div></div>
  <p class="tagline">教科書と<em>テスト範囲</em>を選ぶだけ。<br>その範囲の歴史一問一答がすぐ解ける</p>
  <div class="chips">
    <span class="chip" style="color:#2e7d5b">歴史総合</span>
    <span class="chip" style="color:#2457a6">世界史探究</span>
    <span class="chip" style="color:#b5452f">日本史探究</span>
  </div>
  <div class="bar"></div>
</body></html>`;

const iconHtml = `<!doctype html><html><head><style>html,body{margin:0;background:#fff}body{width:180px;height:180px;display:grid;place-items:center}</style></head>
<body>${mark(168)}</body></html>`;

async function main(): Promise<void> {
  // Playwright はこのプロジェクトの依存に入れていないので、型は最小限にする
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromium: any;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('Playwright が見つかりません。npm i -D playwright && npx playwright install chromium を実行してください。');
    process.exit(1);
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(ogHtml, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(join('public', 'og-image.png'), await page.screenshot({ type: 'png' }));
    await page.setViewportSize({ width: 180, height: 180 });
    await page.setContent(iconHtml);
    writeFileSync(join('public', 'apple-touch-icon.png'), await page.screenshot({ type: 'png' }));
    console.log('public/og-image.png と public/apple-touch-icon.png を作りました');
  } finally {
    await browser.close();
  }
}

void main();
