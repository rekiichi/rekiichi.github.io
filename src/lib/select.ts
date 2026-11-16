// 出題セットの作成（重要度・苦手での絞り込み、出題数、出題順）。

import type { Level } from './types';

export const ORDERS = ['textbook', 'year', 'random'] as const;
export type Order = (typeof ORDERS)[number];

export const ORDER_LABELS: Record<Order, string> = {
  textbook: '教科書順',
  year: '年代順',
  random: 'ランダム',
};

export interface SelectableQuestion {
  id: string;
  level: Level;
  yearStart?: number;
  yearEnd?: number;
}

export interface BuildOptions {
  /** 空なら全重要度 */
  levels?: readonly Level[];
  weakOnly?: boolean;
  weakIds?: ReadonlySet<string>;
  order: Order;
  /** 0 または未指定なら全問 */
  count?: number;
  /** テスト用に差し替えられる乱数（0以上1未満） */
  random?: () => number;
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface YearRange {
  yearStart?: number;
  yearEnd?: number;
}

/** 年代順の比較。年代のない問題は最後に回す */
export function compareByYear(a: YearRange, b: YearRange): number {
  const ay = a.yearStart ?? Number.POSITIVE_INFINITY;
  const by = b.yearStart ?? Number.POSITIVE_INFINITY;
  if (ay !== by) return ay - by;
  const ae = a.yearEnd ?? ay;
  const be = b.yearEnd ?? by;
  if (ae !== be) return ae - be;
  return 0;
}

/**
 * 教科書順（または年代順）に並んだ問題から出題セットを作る。
 * 出題数が全体より少ないときは、範囲全体から無作為に選んでから指定の順に並べる
 * （「教科書順」で先頭の章ばかりにならないようにするため）。
 */
export function buildQuestionSet<T extends SelectableQuestion>(ordered: readonly T[], options: BuildOptions): T[] {
  const random = options.random ?? Math.random;
  const levels = options.levels && options.levels.length > 0 ? new Set(options.levels) : null;

  let pool = ordered.filter((q) => (levels ? levels.has(q.level) : true));
  if (options.weakOnly) {
    const weak = options.weakIds ?? new Set<string>();
    pool = pool.filter((q) => weak.has(q.id));
  }

  const count = options.count && options.count > 0 ? Math.floor(options.count) : 0;
  if (count > 0 && count < pool.length) {
    const indexes = shuffle(
      pool.map((_, i) => i),
      random,
    )
      .slice(0, count)
      .sort((a, b) => a - b);
    pool = indexes.map((i) => pool[i]);
  }

  switch (options.order) {
    case 'random':
      return shuffle(pool, random);
    case 'year':
      // Array.prototype.sort は安定ソートなので、同じ年代は元の順を保つ
      return pool.slice().sort(compareByYear);
    case 'textbook':
    default:
      return pool;
  }
}
