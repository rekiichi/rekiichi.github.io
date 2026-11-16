// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from './integrations/sitemap.mjs';

// 公開URLはビルド時の環境変数で切り替える（GitHub Pages 以外のホスティングでも同じ設定で動かすため）。
// - SITE_URL:  例) https://username.github.io  /  https://example.com
// - BASE_PATH: 例) /rekishi-ichimon （リポジトリ名のパスで公開する場合）。独自ドメインなら空か "/"
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  integrations: [sitemap()],
  devToolbar: {
    enabled: false,
  },
});
