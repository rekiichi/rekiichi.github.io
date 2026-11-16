// 受験復習モードのまとめ方。
// - 縦割り: 地域（日本史はテーマ）のタグごとにまとめ、年代順に並べる。複数のタグがある問題はそれぞれに入る。
// - 横割り: 開始年で時代区分に振り分け、区分の中は地域（日本史はテーマ）ごとにまとめる。
//   区分の中のまとめ先は、問題の先頭のタグ（＝主な地域・テーマ）で決める。

import { compareIds } from './natural-sort';
import { compareByYear } from './select';
import type { Period, Tag, VerticalAxis } from './types';
import { findPeriod } from './years';

export interface ReviewQuestion {
  id: string;
  yearStart?: number;
  yearEnd?: number;
  regions: readonly string[];
  themes: readonly string[];
}

export interface VerticalGroup<T> {
  tag: Tag;
  questions: T[];
}

export interface PeriodSubgroup<T> {
  /** null は軸のタグがない問題（「その他」） */
  tag: Tag | null;
  questions: T[];
}

export interface PeriodGroup<T> {
  period: Period;
  subgroups: PeriodSubgroup<T>[];
  /** 出題順（まとめ先の順 → 年代順） */
  questions: T[];
}

export const AXIS_LABELS: Record<VerticalAxis, string> = {
  region: '地域別',
  theme: 'テーマ別',
};

export function tagsOf(q: ReviewQuestion, axis: VerticalAxis): readonly string[] {
  return axis === 'region' ? q.regions : q.themes;
}

/** 年代順（同じなら ID 順） */
export function compareChronological(a: ReviewQuestion, b: ReviewQuestion): number {
  return compareByYear(a, b) || compareIds(a.id, b.id);
}

export function sortChronological<T extends ReviewQuestion>(questions: readonly T[]): T[] {
  return questions.slice().sort(compareChronological);
}

/** 縦割り。タグの並び順どおりに、問題のあるグループもないグループも返す */
export function groupVertical<T extends ReviewQuestion>(
  questions: readonly T[],
  tags: readonly Tag[],
  axis: VerticalAxis,
): VerticalGroup<T>[] {
  return tags.map((tag) => ({
    tag,
    questions: sortChronological(questions.filter((q) => tagsOf(q, axis).includes(tag.name))),
  }));
}

/** 横割り。開始年のない問題はどの区分にも入らない */
export function groupByPeriod<T extends ReviewQuestion>(
  questions: readonly T[],
  periods: readonly Period[],
  tags: readonly Tag[],
  axis: VerticalAxis,
): PeriodGroup<T>[] {
  const known = new Set(tags.map((t) => t.name));
  return periods.map((period) => {
    const inPeriod = questions.filter((q) => findPeriod(q.yearStart, periods)?.slug === period.slug);
    const primary = (q: T) => tagsOf(q, axis).find((name) => known.has(name));
    const subgroups: PeriodSubgroup<T>[] = tags
      .map((tag) => ({ tag, questions: sortChronological(inPeriod.filter((q) => primary(q) === tag.name)) }))
      .filter((g) => g.questions.length > 0);
    const others = sortChronological(inPeriod.filter((q) => primary(q) === undefined));
    if (others.length > 0) subgroups.push({ tag: null, questions: others });
    return { period, subgroups, questions: subgroups.flatMap((g) => g.questions) };
  });
}
