// robots.txt（サイトマップの URL は公開先の設定から作る）
import type { APIRoute } from 'astro';
import { absoluteUrl, joinBase } from '../lib/url';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL;
  const sitemap = absoluteUrl(site?.href ?? 'http://localhost:4321/', base, '/sitemap.xml');
  const body = ['User-agent: *', 'Allow: /', `Disallow: ${joinBase(base, '/data/')}`, '', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
