// サイトの基本設定。公開URL（ドメイン・ベースパス）は astro.config.mjs の環境変数で決める。
//
// お問い合わせフォーム・広告（AdSense）・運営者名などは、GitHub の「リポジトリ変数」でも設定できる
// （src/lib/public-settings.ts。変数があればそちらが優先）。ここに直接書いてもよい。

interface SiteConfig {
  /** サイト名。ヘッダー・タイトル・OGP に使う（変えたら OGP 画像も作り直す。README 参照） */
  name: string;
  /** キャッチコピー */
  tagline: string;
  /** トップページなどの meta description */
  description: string;
  /** 運営者情報ページに表示する名前（ハンドルネーム可）。リポジトリ変数 OPERATOR_NAME でも設定できる */
  operatorName: string;
  /** サイトを開設した時期（運営者情報に表示） */
  launchedOn: string;
  /** プライバシーポリシーの制定日・改定日 */
  policyDate: string;
  /** お問い合わせ用 Google フォームの URL。空なら「準備中」と表示。リポジトリ変数 CONTACT_FORM_URL でも設定できる */
  contactFormUrl: string;
  /**
   * 問題の誤り報告用 URL（任意）。Google フォームの「事前入力した URL」を貼り、
   * 問題IDを入れる欄の値を {id} にする。空ならお問い合わせページへのリンクになる。
   * リポジトリ変数 REPORT_FORM_URL でも設定できる
   */
  reportFormUrl: string;
  /** AdSense のパブリッシャー ID（ca-pub-…）。空なら広告のコードを出さない。リポジトリ変数 ADSENSE_CLIENT でも設定できる */
  adsenseClient: string;
  /** AdSense の広告ユニット ID（data-ad-slot の数字）。リポジトリ変数 ADSENSE_SLOT でも設定できる */
  adsenseSlot: string;
  /** Google Search Console の確認用の文字列（任意）。リポジトリ変数 GOOGLE_SITE_VERIFICATION でも設定できる */
  googleSiteVerification: string;
  /**
   * 開発用サンプル（ID が sample- で始まる問題・教科書）をサイトに含めるか。
   * 公開するサイトでは false。開発中にサンプルを見たいときは INCLUDE_SAMPLE_DATA=true を付けて起動する。
   */
  includeSampleData: boolean;
  /** OGP 画像（public/ からのパス、1200×630） */
  ogImage: string;
  /** 著作権表示の年 */
  copyrightYear: number;
}

export const siteConfig: SiteConfig = {
  name: 'れきいち',
  tagline: 'テスト範囲で解ける歴史一問一答',
  description:
    '教科書とテスト範囲（章・節）を選ぶだけで、その範囲だけの一問一答を作れる高校生向けの無料学習サイト。歴史総合・世界史探究・日本史探究に対応。苦手な問題の復習や、受験向けの縦割り・横割り復習もできます。',
  operatorName: 'れきいち管理人',
  launchedOn: '2026年11月',
  policyDate: '2026年11月14日',
  contactFormUrl: '',
  reportFormUrl: '',
  adsenseClient: '',
  adsenseSlot: '',
  googleSiteVerification: '',
  includeSampleData: false,
  ogImage: '/og-image.png',
  copyrightYear: 2026,
};

/** localStorage のキーの頭につける文字列（サイト名を変えても学習記録が消えないよう固定） */
export const STORAGE_PREFIX = 'rekishi-ichimon:';
