// ビルド結果（dist/）の確認（npm run check:dist）。ビルドのあとに実行する。
// - すべての HTML に title・meta description・canonical・OGP・フッターの注意書きがあるか
// - サイト内リンク・画像・スクリプトの参照先が dist/ に存在するか（ベースパス込みで確認）
// - sitemap.xml の URL がすべて存在し、noindex のページが入っていないか
// - robots.txt にサイトマップの URL があるか
// - 広告（AdSense）を設定しているなら、全ページにコードがあり ads.txt があるか。設定していないなら、どこにも出ていないか
// ベースパスはビルドと同じ環境変数 BASE_PATH から読む（例: BASE_PATH=/rekishi-ichimon）。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const DISCLAIMER = '教科書会社とは関係のない個人サイトです。教科書名は対応範囲を示すためだけに使用しています';
const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');

const errors: string[] = [];
const warnings: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** "/base/path/?q#h" → dist 内のファイル。ベースパスがなければ null */
function toDistFile(url: string): string | null {
  const path = url.replace(/[?#].*$/, '');
  if (base && path !== base && !path.startsWith(`${base}/`)) return null;
  let rest = decodeURIComponent(path.slice(base.length)) || '/';
  if (rest.endsWith('/')) rest += 'index.html';
  return join(DIST, rest);
}

const meta = (html: string, attr: 'name' | 'property', key: string) =>
  html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1];

if (!existsSync(DIST)) {
  console.error('✖ dist/ がありません。先に npm run build を実行してください。');
  process.exit(1);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const titles = new Map<string, string[]>();
let linkCount = 0;
/** AdSense のコードが入っているページ（ページ → パブリッシャー ID） */
const adsPages = new Map<string, string>();

for (const file of htmlFiles) {
  const where = relative(DIST, file);
  const html = readFileSync(file, 'utf8');
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!title) errors.push(`${where}: <title> がありません`);
  else titles.set(title, [...(titles.get(title) ?? []), where]);
  if (!meta(html, 'name', 'description')) errors.push(`${where}: meta description がありません`);
  for (const key of ['og:title', 'og:description', 'og:url', 'og:image']) {
    if (!meta(html, 'property', key)) errors.push(`${where}: ${key} がありません`);
  }
  if (!/<link rel="canonical" href="[^"]+"/.test(html)) errors.push(`${where}: canonical がありません`);
  if (!html.includes(DISCLAIMER)) errors.push(`${where}: フッターの注意書きがありません`);
  const adsClient = html.match(/adsbygoogle\.js\?client=(ca-pub-\d+)/)?.[1];
  if (adsClient) adsPages.set(where, adsClient);
  else if (html.includes('adsbygoogle')) errors.push(`${where}: 広告ユニットがあるのに、<head> に AdSense のコードがありません`);

  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  if (/\bundefined\b|\bNaN\b|\[object Object\]/.test(text)) errors.push(`${where}: 本文に undefined / NaN などが出ています`);

  for (const [, url] of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    linkCount++;
    const target = toDistFile(url);
    if (!target) errors.push(`${where}: リンク ${url} にベースパス（${base || '/'}）が付いていません`);
    else if (!existsSync(target)) errors.push(`${where}: リンク切れ ${url}`);
  }
}

for (const [title, pages] of titles) {
  if (pages.length > 1) warnings.push(`同じ title のページがあります「${title}」: ${pages.join(', ')}`);
}

// ---- sitemap.xml ----
const sitemapPath = join(DIST, 'sitemap.xml');
let sitemapCount = 0;
if (!existsSync(sitemapPath)) {
  errors.push('sitemap.xml がありません');
} else {
  for (const [, loc] of readFileSync(sitemapPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapCount++;
    const target = toDistFile(new URL(loc).pathname);
    if (!target || !existsSync(target)) {
      errors.push(`sitemap.xml: ${loc} のページがありません`);
      continue;
    }
    if (/<meta name="robots" content="[^"]*noindex/.test(readFileSync(target, 'utf8'))) {
      errors.push(`sitemap.xml: noindex のページが入っています ${loc}`);
    }
  }
}

// ---- robots.txt・404 ----
const robotsPath = join(DIST, 'robots.txt');
if (!existsSync(robotsPath) || !/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m.test(readFileSync(robotsPath, 'utf8'))) {
  errors.push('robots.txt がないか、Sitemap の行がありません');
}
if (!existsSync(join(DIST, '404.html'))) errors.push('404.html がありません');

// ---- 広告（AdSense）----
const adsTxtPath = join(DIST, 'ads.txt');
const adsWanted = (process.env.ADSENSE_CLIENT ?? '').trim() !== '';
if (adsPages.size === 0) {
  if (adsWanted) errors.push('ADSENSE_CLIENT が設定されているのに、AdSense のコードがどのページにもありません');
  if (existsSync(adsTxtPath)) errors.push('広告を設定していないのに ads.txt があります');
} else {
  const clients = new Set(adsPages.values());
  if (clients.size > 1) errors.push(`AdSense の ID がページによって違います: ${[...clients].join(', ')}`);
  if (adsPages.size !== htmlFiles.length) errors.push(`AdSense のコードがないページがあります（${htmlFiles.length - adsPages.size}ページ）`);
  const publisher = [...clients][0].replace(/^ca-/, '');
  if (!existsSync(adsTxtPath) || !readFileSync(adsTxtPath, 'utf8').includes(`google.com, ${publisher}, DIRECT`)) {
    errors.push(`ads.txt がないか、${publisher} の行がありません`);
  }
}

console.log('ビルド結果の確認');
console.log(`  HTML ${htmlFiles.length}ページ・サイト内リンク ${linkCount}件・サイトマップ ${sitemapCount}件（ベースパス: ${base || '/'}）・広告: ${adsPages.size > 0 ? [...new Set(adsPages.values())].join(', ') : 'なし'}`);
for (const w of warnings) console.warn(`  ⚠ ${w}`);
for (const e of errors) console.error(`  ✖ ${e}`);
if (errors.length > 0) {
  console.error(`\n✖ ${errors.length}件の問題があります`);
  process.exit(1);
}
console.log('  ✓ 問題なし');
