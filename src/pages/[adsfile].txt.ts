// ads.txt（AdSense の ID が設定されているときだけ作る。設定がなければファイルを出さない）
import type { APIRoute } from 'astro';
import { publicSettings } from '../lib/public-settings';

export function getStaticPaths() {
  return publicSettings.adsenseClient ? [{ params: { adsfile: 'ads' } }] : [];
}

export const GET: APIRoute = () => {
  const publisher = publicSettings.adsenseClient.replace(/^ca-/, '');
  return new Response(`google.com, ${publisher}, DIRECT, f08c47fec0942fa0\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
