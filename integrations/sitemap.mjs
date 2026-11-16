// sitemap.xml を作る小さなインテグレーション。
// ビルドされた HTML を見て、<meta name="robots" content="noindex"> のページ（出題画面など）は載せない。
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function sitemap() {
  /** @type {import('astro').AstroConfig} */
  let config;
  return {
    name: 'local-sitemap',
    hooks: {
      'astro:config:done': ({ config: c }) => {
        config = c;
      },
      'astro:build:done': async ({ dir, pages, logger }) => {
        const outDir = fileURLToPath(dir);
        const base = config.base.replace(/\/+$/, '');
        const site = config.site ?? 'http://localhost:4321';
        const urls = [];
        for (const { pathname } of pages) {
          if (/^404\/?$/.test(pathname)) continue;
          let html;
          try {
            html = await readFile(join(outDir, pathname, 'index.html'), 'utf8');
          } catch {
            continue; // HTML ではない出力（JSON など）
          }
          if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)) continue;
          const path = `/${pathname}`.replace(/\/+$/, '/') || '/';
          urls.push(new URL(`${base}${path}`, site).href);
        }
        urls.sort();
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`),
          '</urlset>',
          '',
        ].join('\n');
        await writeFile(join(outDir, 'sitemap.xml'), xml);
        logger.info(`sitemap.xml に ${urls.length} ページを書き出しました`);
      },
    },
  };
}
