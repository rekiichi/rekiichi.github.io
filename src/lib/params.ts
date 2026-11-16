// 出題画面（/practice/）の URL パラメータ。範囲を URL で共有できるようにするための書式。
//
//   tb=教科書ID & r=範囲            … 教科書の範囲から出題（r の書式は range.ts）
//   sub=科目ID [& rg|th|pd=スラッグ] … 科目全体・地域別・テーマ別・時代別から出題（受験復習モード）
//   n=出題数（省略で全問）
//   order=textbook|year|random
//   lv=basic,standard,advanced（省略で全重要度）
//   weak=1  … 苦手な問題だけ
//   quick=1 … テスト直前モード

import { LEVELS, type Level } from './types';
import { ORDERS, type Order } from './select';

export type FilterType = 'region' | 'theme' | 'period';

export type PracticeSource =
  | { kind: 'textbook'; textbookId: string; range: string }
  | { kind: 'subject'; subjectId: string; filter?: { type: FilterType; slug: string } };

export interface PracticeParams {
  source: PracticeSource;
  levels: Level[];
  count: number;
  order?: Order;
  weakOnly: boolean;
  quick: boolean;
}

export type ParseResult = { ok: true; params: PracticeParams } | { ok: false; error: string };

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RANGE_PATTERN = /^[0-9.,-]{0,200}$/;
const FILTER_KEYS: Record<FilterType, string> = { region: 'rg', theme: 'th', period: 'pd' };
export const MAX_COUNT = 500;

export function parsePracticeParams(input: string | URLSearchParams): ParseResult {
  const q = typeof input === 'string' ? new URLSearchParams(input) : input;

  let source: PracticeSource;
  const tb = q.get('tb');
  const sub = q.get('sub');
  if (tb) {
    if (!ID_PATTERN.test(tb)) return { ok: false, error: '教科書の指定が正しくありません。' };
    const range = (q.get('r') ?? '').replace(/\s/g, '');
    if (!RANGE_PATTERN.test(range)) return { ok: false, error: '範囲の指定が正しくありません。' };
    source = { kind: 'textbook', textbookId: tb, range };
  } else if (sub) {
    if (!ID_PATTERN.test(sub)) return { ok: false, error: '科目の指定が正しくありません。' };
    source = { kind: 'subject', subjectId: sub };
    for (const [type, key] of Object.entries(FILTER_KEYS) as [FilterType, string][]) {
      const slug = q.get(key);
      if (!slug) continue;
      if (!ID_PATTERN.test(slug)) return { ok: false, error: '絞り込みの指定が正しくありません。' };
      source.filter = { type, slug };
      break;
    }
  } else {
    return { ok: false, error: '出題する範囲が指定されていません。' };
  }

  const levels = (q.get('lv') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is Level => (LEVELS as readonly string[]).includes(s));

  const n = Number.parseInt(q.get('n') ?? '', 10);
  const count = Number.isFinite(n) && n > 0 ? Math.min(n, MAX_COUNT) : 0;

  const orderParam = q.get('order');
  const order = (ORDERS as readonly string[]).includes(orderParam ?? '') ? (orderParam as Order) : undefined;

  return {
    ok: true,
    params: {
      source,
      levels: [...new Set(levels)],
      count,
      order,
      weakOnly: q.get('weak') === '1',
      quick: q.get('quick') === '1',
    },
  };
}

/** パラメータをクエリ文字列（先頭の ? なし）にする */
export function buildPracticeQuery(params: PracticeParams): string {
  const q = new URLSearchParams();
  const s = params.source;
  if (s.kind === 'textbook') {
    q.set('tb', s.textbookId);
    if (s.range) q.set('r', s.range);
  } else {
    q.set('sub', s.subjectId);
    if (s.filter) q.set(FILTER_KEYS[s.filter.type], s.filter.slug);
  }
  if (params.count > 0) q.set('n', String(params.count));
  if (params.order) q.set('order', params.order);
  const levels = LEVELS.filter((l) => params.levels.includes(l));
  if (levels.length > 0 && levels.length < LEVELS.length) q.set('lv', levels.join(','));
  if (params.weakOnly) q.set('weak', '1');
  if (params.quick) q.set('quick', '1');
  // 範囲の「,」「.」は読みやすさのためエスケープしない
  return q.toString().replace(/%2C/gi, ',');
}

/** 既定の出題順（教科書は教科書順、受験復習は年代順） */
export function defaultOrder(source: PracticeSource): Order {
  return source.kind === 'textbook' ? 'textbook' : 'year';
}

/** 既定値を補って出題画面のクエリ文字列を作る */
export function practiceQuery(source: PracticeSource, options: Partial<Omit<PracticeParams, 'source'>> = {}): string {
  return buildPracticeQuery({ source, levels: [], count: 0, weakOnly: false, quick: false, ...options });
}

/** テスト直前モードの設定（基本だけ・ランダム） */
export const QUICK_OPTIONS: Partial<Omit<PracticeParams, 'source'>> = {
  levels: ['basic'],
  order: 'random',
  quick: true,
};
