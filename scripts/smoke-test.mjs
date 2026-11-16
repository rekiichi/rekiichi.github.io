// ブラウザでの動作確認（npm run test:e2e）。
// ビルド済みの dist/ を小さなサーバーで配信し、Playwright（Chromium）で全ページの表示と主な操作を確かめる。
//
//   npm run build && npm run test:e2e
//   BASE_PATH=/rekishi-ichimon npm run build && BASE_PATH=/rekishi-ichimon npm run test:e2e
//   SCREENSHOT_DIR=./shots npm run test:e2e   … スマホ幅のスクリーンショットも保存する
//
// Playwright が必要: npm i -D playwright && npx playwright install chromium

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright が見つかりません。npm i -D playwright && npx playwright install chromium を実行してください。');
  process.exit(1);
}

const base = (process.env.BASE_PATH || '/').replace(/\/+$/, '');
const shotDir = process.env.SCREENSHOT_DIR;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

// ---- dist/ を配信する（GitHub Pages と同じく、ディレクトリは index.html、ないときは 404.html） ----
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (base && path !== base && !path.startsWith(`${base}/`)) {
    res.writeHead(404);
    return res.end();
  }
  path = path.slice(base.length) || '/';
  let file = join('dist', path);
  if (path.endsWith('/')) file = join(file, 'index.html');
  else if (existsSync(file) && statSync(file).isDirectory()) {
    res.writeHead(301, { Location: `${req.url}/` });
    return res.end();
  }
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(readFileSync(join('dist', '404.html')));
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = (p) => `${origin}${base}${p}`;

let failures = 0;
let passes = 0;
async function step(name, fn) {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`  ✖ ${name}\n      ${e.message.split('\n')[0]}`);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP' });
const consoleErrors = [];
context.on('page', (p) => {
  p.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(`${p.url()}: ${msg.text()}`));
  p.on('pageerror', (err) => consoleErrors.push(`${p.url()}: ${err.message}`));
});
const page = await context.newPage();
const shot = async (name) => {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: true });
};
const text = (selector) => page.locator(selector).innerText();
const visible = (selector) => page.locator(selector).isVisible();

// 問題文 → 答え（入力モードの確認用）
const qDir = join('dist', 'data', 'q');
const allQuestions = readdirSync(qDir).flatMap((f) => JSON.parse(readFileSync(join(qDir, f), 'utf8')));
const answerOf = (question) => allQuestions.find((q) => q.question === question)?.answer;
const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
// カタカナだけの答えは、ひらがなで入力しても正解になる（漢字の答えは、そのまま入力する）
const typedAnswer = (answer) => (/^[ァ-ヶー・=＝]+$/.test(answer) ? toHiragana(answer) : answer);

// 確認に使う教科書（公開している教科書の ID）。問題数は、ビルドされたデータから数える
const TB = { world: 'shosetsu-sekaishi', japan: 'shosetsu-nihonshi', modern: 'watashitachi-no-rekishi' };
const textbook = (id) => JSON.parse(readFileSync(join('dist', 'data', 'tb', `${id}.json`), 'utf8'));
const countIn = (id, chapterNo, sectionNo) => {
  const chapter = textbook(id).chapters.find((c) => c.no === chapterNo);
  const sections = chapter.sections.filter((sec) => sectionNo === undefined || sec.no === sectionNo);
  return new Set(sections.flatMap((sec) => sec.q.map(([qid]) => qid))).size;
};
// 最初の確認に使う章（世界史の巻頭。1節だけの短い章）
const FIRST = { chapter: 0, label: textbook(TB.world).chapters.find((c) => c.no === 0).label, count: countIn(TB.world, 0) };
const WRONG = Math.floor(FIRST.count / 2);

console.log(`ブラウザでの動作確認（${origin}${base || ''}/）`);

// ---- 1. すべてのページが表示できる ----
const sitemap = readFileSync(join('dist', 'sitemap.xml'), 'utf8');
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => new URL(loc).pathname.slice(base.length) || '/');
const extraPaths = [`/practice/?tb=${TB.world}`, '/my/', '/does-not-exist/'];
await step(`全ページの表示（サイトマップ ${sitemapPaths.length}件＋${extraPaths.length}件）`, async () => {
  for (const p of [...sitemapPaths, ...extraPaths]) {
    const res = await page.goto(url(p));
    const expected = p === '/does-not-exist/' ? 404 : 200;
    assert(res.status() === expected, `${p}: HTTP ${res.status()}`);
    assert(await page.locator('.footer-disclaimer').isVisible(), `${p}: フッターの注意書きが見えません`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, `${p}: 横にはみ出しています（${overflow}px）`);
  }
});

// ---- 2. 教科書ページで範囲を選んで出題（自己採点） ----
await step('教科書ページ：章にチェック → 問題数の表示 → 出題開始', async () => {
  await page.goto(url(`/sekaishi-tankyu/${TB.world}/`));
  await shot('textbook');
  assert(await page.locator('#btn-start').isDisabled(), '範囲を選ぶ前から開始できます');
  await page.locator(`.chk-chapter[data-chapter="${FIRST.chapter}"]`).check();
  assert((await text('#summary-range')).includes(FIRST.label), `範囲の表示: ${await text('#summary-range')}`);
  assert((await text('#summary-count')).includes(`該当 ${FIRST.count}問`), `問題数の表示: ${await text('#summary-count')}`);
  await page.locator('label.chip', { has: page.locator('input[name="n"][value="0"]') }).click();
  await page.locator('#btn-start').click();
  await page.waitForURL(new RegExp(`/practice/\\?tb=${TB.world}&r=${FIRST.chapter}`));
  await page.locator('#practice-main').waitFor();
  assert((await text('#p-count')) === `1 / ${FIRST.count}`, `進捗: ${await text('#p-count')}`);
});

await step('出題画面：答えを見る → ○× → 結果 → まちがえた問題だけもう一度', async () => {
  for (let i = 0; i < FIRST.count; i++) {
    await page.locator('#btn-reveal').click();
    assert(await visible('#answer-area'), '答えが表示されません');
    if (i === 0) await shot('practice-revealed');
    await page.locator(i % 2 === 0 ? '#btn-right' : '#btn-wrong').click();
  }
  await page.locator('#practice-summary').waitFor();
  await shot('practice-summary');
  const correct = String(FIRST.count - WRONG);
  assert((await text('#s-correct')) === correct && (await text('#s-total')) === String(FIRST.count), `結果: ${await text('#s-correct')}/${await text('#s-total')}`);
  assert((await page.locator('#s-wrong-list li').count()) === WRONG, `まちがえた問題の一覧が${WRONG}問ではありません`);
  await page.locator('#btn-retry-wrong').click();
  assert((await text('#p-count')) === `1 / ${WRONG}`, `もう一度の進捗: ${await text('#p-count')}`);
});

await step('入力モード：表記ゆれを許容して判定・「正解にする」', async () => {
  await page.locator('#mode-switch [data-mode="input"]').click();
  assert(await visible('#answer-input'), '入力欄が出ません');
  for (let i = 0; i < WRONG; i++) {
    if (i === 1) {
      // 2問目は、まちがえてから「正解にする」
      await page.locator('#answer-input').fill('まったくちがう答え');
      await page.locator('#answer-input').press('Enter');
      assert((await text('#judge')).includes('不正解'), `判定: ${await text('#judge')}`);
      await page.locator('#btn-override').click();
      assert((await text('#judge')).includes('正解にしました'), '「正解にする」が効きません');
    } else {
      const answer = answerOf(await text('#q-text'));
      assert(answer, '答えが見つかりません');
      await page.locator('#answer-input').fill(` ${typedAnswer(answer)} `);
      await page.locator('#answer-input').press('Enter');
      const judge = await text('#judge');
      assert(judge.includes('正解') && !judge.includes('不正解'), `判定: ${judge}（入力: ${typedAnswer(answer)}）`);
    }
    await page.locator('#btn-next').click();
  }
  await page.locator('#practice-summary').waitFor();
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('rekishi-ichimon:stats') || '{}'));
  assert(Object.keys(stats).length === FIRST.count, `記録された問題数: ${Object.keys(stats).length}`);
  // 設定を自己採点に戻す
  await page.evaluate(() => localStorage.setItem('rekishi-ichimon:settings', JSON.stringify({ answerMode: 'self' })));
});

await step('教科書ページ：前回の範囲を復元・苦手だけ・第◯章〜第◯章・マイ範囲に保存', async () => {
  await page.goto(url(`/sekaishi-tankyu/${TB.world}/`));
  assert((await text('#summary-range')).includes(FIRST.label), '前回の範囲が復元されません');
  await page.locator('input[name="weak"]').check();
  assert((await text('#summary-count')).includes('該当 0問') || (await text('#summary-count')).includes('苦手な問題はありません'), `苦手だけ: ${await text('#summary-count')}`);
  await page.locator('input[name="weak"]').uncheck();
  await page.locator('#tab-span').click();
  await page.locator('#span-from').selectOption('1');
  await page.locator('#span-to').selectOption('2');
  assert((await text('#summary-range')).includes('第1章〜第2章'), `範囲: ${await text('#summary-range')}`);
  await page.locator('#btn-save').click();
  await page.locator('dialog #dialog-input').fill('テスト用の範囲');
  await page.locator('dialog button[value="ok"]').click();
  await page.locator('#my-ranges-section').waitFor();
  assert((await text('#my-ranges')).includes('テスト用の範囲'), 'マイ範囲に表示されません');
  const quickHref = await page.locator('#btn-quick').getAttribute('href');
  assert(quickHref.includes('quick=1') && quickHref.includes('lv=basic'), `直前モードのリンク: ${quickHref}`);
});

await step('共有URLを直接開く・不正なURL', async () => {
  await page.goto(url(`/practice/?tb=${TB.japan}&r=2-3&n=3&order=random`));
  await page.locator('#practice-main').waitFor();
  assert((await text('#p-count')) === '1 / 3', `進捗: ${await text('#p-count')}`);
  assert((await text('#p-range')).includes('第2章〜第3章'), `範囲: ${await text('#p-range')}`);
  await page.goto(url('/practice/?tb=nope'));
  await page.locator('#practice-error').waitFor();
  await page.goto(url('/practice/?sub=sekaishi-tankyu&weak=1&lv=advanced'));
  await page.locator('#practice-error').waitFor();
});

await step('受験復習モード・テスト直前モード（キーボード操作）', async () => {
  await page.goto(url('/sekaishi-tankyu/review/region/west-asia/'));
  await page.locator('a.btn-primary', { hasText: '年代順に練習する' }).click();
  await page.locator('#practice-main').waitFor();
  assert((await text('#p-range')).includes('縦割り：西アジア'), `範囲: ${await text('#p-range')}`);
  await page.goto(url('/nihonshi-tankyu/chokuzen/'));
  await page.locator('.row-link').first().click();
  await page.locator('#practice-main').waitFor();
  assert((await text('#p-chips')).includes('テスト直前モード'), 'テスト直前モードになっていません');
  assert(!(await visible('#mode-switch')), '直前モードで答え方の切り替えが出ています');
  await page.locator('#qcard').click({ position: { x: 20, y: 20 } });
  assert(await visible('#grade-bar'), 'カードのタップで答えが出ません');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(' ');
  assert(await visible('#grade-bar'), 'スペースキーで答えが出ません');
});

await step('章ページの赤シート・答えをすべて表示', async () => {
  await page.goto(url(`/nihonshi-tankyu/${TB.japan}/chapter-1/`));
  const sheet = page.locator('.sheet').first();
  assert((await sheet.getAttribute('aria-pressed')) === 'false', '最初から答えが見えています');
  await sheet.click();
  assert((await sheet.getAttribute('aria-pressed')) === 'true', 'タップで答えが出ません');
  await shot('chapter');
  await page.locator('[data-sheet-toggle]').click();
  assert((await page.locator('.sheet[aria-pressed="false"]').count()) === 0, 'すべて表示が効きません');
});

await step('マイページ・トップの「続きから」', async () => {
  await page.goto(url('/my/'));
  assert((await text('#ranges-list')).includes('テスト用の範囲'), 'マイ範囲が出ません');
  assert((await text('#stats-list')).includes('解いた問題'), '学習記録が出ません');
  assert((await page.locator('#history-list li').count()) >= 2, '最近の学習が出ません');
  await page.goto(url('/'));
  assert(await visible('#continue'), '「続きから」が出ません');
  await shot('home');
});

await step('表示テーマの切り替え（自動 → ライト → ダーク → 自動）', async () => {
  const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.locator('[data-theme-toggle]').click();
  assert((await theme()) === 'light', 'ライトになりません');
  await page.locator('[data-theme-toggle]').click();
  assert((await theme()) === 'dark', 'ダークになりません');
  await page.reload();
  assert((await theme()) === 'dark', '再読み込みでテーマが戻ります');
  await shot('home-dark');
  await page.goto(url(`/sekaishi-tankyu/${TB.world}/chapter-2/`));
  await shot('chapter-dark');
  await page.locator('[data-theme-toggle]').click();
  assert((await theme()) === null, '自動に戻りません');
});

await step('localStorage が使えない環境でも動く', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url(`/practice/?tb=${TB.modern}&r=1.1&n=0`));
  await p.locator('#practice-main').waitFor();
  await p.locator('#btn-reveal').click();
  await p.locator('#btn-right').click();
  assert((await p.locator('#p-count').innerText()) === `2 / ${countIn(TB.modern, 1, 1)}`, '次の問題に進みません');
  await p.goto(url('/my/'));
  assert(await p.locator('#storage-warning').isVisible(), '保存できない旨の表示が出ません');
  assert(errors.length === 0, `エラー: ${errors.join(' / ')}`);
  await ctx.close();
});

await step('コンソールにエラーが出ていない', async () => {
  const unexpected = consoleErrors.filter((e) => !e.includes('404') && !e.includes('does-not-exist'));
  assert(unexpected.length === 0, unexpected.slice(0, 3).join(' / '));
});

await browser.close();
server.close();
console.log(failures === 0 ? `  ✓ すべて成功（${passes}項目）` : `\n✖ ${failures}項目が失敗しました`);
process.exit(failures === 0 ? 0 : 1);
