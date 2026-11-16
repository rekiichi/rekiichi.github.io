// 公開するときに環境変数で入れられる設定。
// GitHub では「リポジトリ変数」（Settings → Secrets and variables → Actions → Variables）に書くと、
// .github/workflows/deploy.yml がビルドに渡す。コードを書きかえずに、お問い合わせフォームや広告の ID を設定できる。
// 環境変数がなければ src/site.config.ts の値を使う。
//
// ビルドのときだけ読む（.astro から使う）。ブラウザ側のコード（src/client/）からは import しない。

import { siteConfig } from '../site.config';

/** 設定の書きまちがい（ビルドを止めて、どの設定が悪いかを伝える） */
export class SettingError extends Error {}

/** "ca-pub-1234567890123456"（"pub-…" でもよい）→ "ca-pub-…"。空なら空文字 */
export function parseAdsenseClient(value: string): string {
  const s = value.trim();
  if (s === '') return '';
  const m = s.match(/^(?:ca-)?pub-(\d{10,20})$/);
  if (!m) throw new SettingError(`ADSENSE_CLIENT「${s}」の形が正しくありません（例: ca-pub-1234567890123456）`);
  return `ca-pub-${m[1]}`;
}

/** 広告ユニットの ID（data-ad-slot の数字）。空なら空文字 */
export function parseAdSlot(value: string): string {
  const s = value.trim();
  if (s === '') return '';
  if (!/^\d{6,20}$/.test(s)) throw new SettingError(`ADSENSE_SLOT「${s}」の形が正しくありません（広告ユニットの data-ad-slot の数字だけを入れます）`);
  return s;
}

/** https:// で始まる URL。空なら空文字 */
export function parseHttpsUrl(name: string, value: string): string {
  const s = value.trim();
  if (s === '') return '';
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new SettingError(`${name}「${s}」を URL として読めません`);
  }
  if (url.protocol !== 'https:') throw new SettingError(`${name} は https:// で始まる URL にします`);
  return s;
}

/** Search Console の確認用の文字列（<meta name="google-site-verification"> の content の値）。空なら空文字 */
export function parseVerificationToken(value: string): string {
  const s = value.trim();
  if (s === '') return '';
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(s)) {
    throw new SettingError(`GOOGLE_SITE_VERIFICATION「${s}」の形が正しくありません（content="…" の中の文字だけを入れます）`);
  }
  return s;
}

export interface PublicSettings {
  /** お問い合わせ用 Google フォームの URL（空ならお問い合わせページに「準備中」と出る） */
  contactFormUrl: string;
  /** 問題の誤り報告用の URL（{id} が問題IDに置きかわる）。空ならお問い合わせページへ */
  reportFormUrl: string;
  /** AdSense のパブリッシャー ID（ca-pub-…）。空なら広告のコードを出さない */
  adsenseClient: string;
  /** AdSense の広告ユニット ID。空なら広告枠は HTML コメントのまま（AdSense のコードは <head> にだけ入る） */
  adsenseSlot: string;
  googleSiteVerification: string;
  operatorName: string;
}

export function readPublicSettings(env: Record<string, string | undefined>): PublicSettings {
  const get = (name: string, fallback: string) => (env[name] ?? '').trim() || fallback;
  return {
    contactFormUrl: parseHttpsUrl('CONTACT_FORM_URL', get('CONTACT_FORM_URL', siteConfig.contactFormUrl)),
    reportFormUrl: parseHttpsUrl('REPORT_FORM_URL', get('REPORT_FORM_URL', siteConfig.reportFormUrl)),
    adsenseClient: parseAdsenseClient(get('ADSENSE_CLIENT', siteConfig.adsenseClient)),
    adsenseSlot: parseAdSlot(get('ADSENSE_SLOT', siteConfig.adsenseSlot)),
    googleSiteVerification: parseVerificationToken(get('GOOGLE_SITE_VERIFICATION', siteConfig.googleSiteVerification)),
    operatorName: get('OPERATOR_NAME', siteConfig.operatorName),
  };
}

export const publicSettings: PublicSettings = readPublicSettings(process.env);
