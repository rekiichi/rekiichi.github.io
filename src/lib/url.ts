// サイト内の URL。ベースパス（GitHub Pages のリポジトリ名など）を付ける処理をここに集める。
// ページ側は withBase(paths.xxx()) の形で使う。クライアント側は <html data-base> の値を渡す。

export type ReviewType = 'region' | 'theme' | 'period';

export const paths = {
  home: () => '/',
  subject: (subjectId: string) => `/${subjectId}/`,
  textbook: (subjectId: string, textbookId: string) => `/${subjectId}/${textbookId}/`,
  chapter: (subjectId: string, textbookId: string, chapterNo: number) =>
    `/${subjectId}/${textbookId}/chapter-${chapterNo}/`,
  review: (subjectId: string) => `/${subjectId}/review/`,
  reviewGroup: (subjectId: string, type: ReviewType, slug: string) => `/${subjectId}/review/${type}/${slug}/`,
  quick: (subjectId: string) => `/${subjectId}/chokuzen/`,
  practice: (query = '') => `/practice/${query ? `?${query}` : ''}`,
  my: () => '/my/',
  guide: () => '/guide/',
  articles: () => '/articles/',
  article: (slug: string) => `/articles/${slug}/`,
  privacy: () => '/privacy/',
  contact: () => '/contact/',
  about: () => '/about/',
  textbookData: (textbookId: string) => `/data/tb/${textbookId}.json`,
  reviewData: (subjectId: string) => `/data/rv/${subjectId}.json`,
  questionChunk: (index: number) => `/data/q/${index}.json`,
};

/** 教科書IDに使えない名前（科目ページの下にある他のページと重なるため） */
export const RESERVED_TEXTBOOK_IDS = ['review', 'chokuzen'];

/** base（"/" や "/rekishi-ichimon/"）と、"/" で始まるサイト内パスをつなぐ */
export function joinBase(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/** 絶対 URL（canonical・OGP・サイトマップ用） */
export function absoluteUrl(site: string, base: string, path: string): string {
  return new URL(joinBase(base, path), site).href;
}
