// マイ範囲・学習履歴・設定（localStorage に保存する中身）。保存・読み込みは src/client/storage.ts。
// localStorage の中身は壊れていることがあるので、読むときは必ず sanitize する。

export interface MyRange {
  id: string;
  name: string;
  /** 出題画面のクエリ文字列（先頭の ? なし） */
  query: string;
  subject: string;
  textbookId?: string;
  createdAt: number;
}

export interface HistoryEntry {
  /** 解き終えた時刻（ミリ秒） */
  t: number;
  title: string;
  query: string;
  total: number;
  correct: number;
  /** 「まちがえた問題だけもう一度」の記録 */
  retry?: boolean;
}

export type AnswerMode = 'self' | 'input';

export interface Settings {
  /** 自己採点（答えを見る → ○×）か、入力して判定か */
  answerMode: AnswerMode;
}

export const DEFAULT_SETTINGS: Settings = { answerMode: 'self' };
export const MAX_RANGES = 50;
export const MAX_HISTORY = 20;
export const MAX_NAME_LENGTH = 60;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function sanitizeRanges(value: unknown): MyRange[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObj)
    .filter((r) => typeof r.id === 'string' && typeof r.name === 'string' && typeof r.query === 'string' && typeof r.subject === 'string')
    .map((r) => ({
      id: r.id as string,
      name: (r.name as string).slice(0, MAX_NAME_LENGTH),
      query: r.query as string,
      subject: r.subject as string,
      ...(typeof r.textbookId === 'string' ? { textbookId: r.textbookId } : {}),
      createdAt: Number.isFinite(r.createdAt) ? (r.createdAt as number) : 0,
    }))
    .slice(0, MAX_RANGES);
}

export function sanitizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObj)
    .filter((h) => typeof h.title === 'string' && typeof h.query === 'string')
    .map((h) => ({
      t: Number(h.t) || 0,
      title: h.title as string,
      query: h.query as string,
      total: Math.max(0, Number(h.total) || 0),
      correct: Math.max(0, Number(h.correct) || 0),
      ...(h.retry === true ? { retry: true } : {}),
    }))
    .slice(0, MAX_HISTORY);
}

export function sanitizeSettings(value: unknown): Settings {
  if (!isObj(value)) return { ...DEFAULT_SETTINGS };
  return { answerMode: value.answerMode === 'input' ? 'input' : 'self' };
}

/** マイ範囲を追加する（同じ条件のものがあれば名前を上書きして先頭へ）。新しい配列を返す */
export function addRange(list: readonly MyRange[], range: MyRange): MyRange[] {
  const rest = list.filter((r) => r.query !== range.query && r.id !== range.id);
  return [{ ...range, name: range.name.slice(0, MAX_NAME_LENGTH) }, ...rest].slice(0, MAX_RANGES);
}

export function addHistoryEntry(list: readonly HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...list].slice(0, MAX_HISTORY);
}
