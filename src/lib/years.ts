// 年代の表示と時代区分の判定。

import type { Period } from './types';

/** -221 → "前221"、1600 → "1600" */
function yearText(year: number): string {
  return year < 0 ? `前${-year}` : String(year);
}

/** これより前の年は「約◯万年前」と表示する（人類の進化など） */
const ANCIENT_YEAR = -10000;

/** -7000000 → "約700万年前"、-15000 → "約1.5万年前" */
function ancientText(year: number): string {
  const man = Math.round(-year / 1000) / 10;
  return `約${man}万年前`;
}

/** 年代の表示（"前221年"、"1840〜1842年"、おおよそなら "前3000年ごろ"、1万年以上前は "約20万年前"）。年代がなければ空文字 */
export function formatYears(yearStart?: number, yearEnd?: number, approx = false): string {
  if (yearStart == null) return '';
  if (yearStart <= ANCIENT_YEAR) return ancientText(yearStart);
  const suffix = approx ? '年ごろ' : '年';
  if (yearEnd == null || yearEnd === yearStart) return `${yearText(yearStart)}${suffix}`;
  return `${yearText(yearStart)}〜${yearText(yearEnd)}${suffix}`;
}

/** 開始年が時代区分に含まれるか */
export function inPeriod(yearStart: number | undefined, period: Period): boolean {
  if (yearStart == null) return false;
  if (period.start != null && yearStart < period.start) return false;
  if (period.end != null && yearStart > period.end) return false;
  return true;
}

/** 開始年が含まれる最初の時代区分 */
export function findPeriod(yearStart: number | undefined, periods: readonly Period[]): Period | undefined {
  return periods.find((p) => inPeriod(yearStart, p));
}

/** 時代区分の年の範囲（"1401〜1500年"、"〜前2001年"、"2001年〜"） */
export function formatPeriodRange(period: Period): string {
  const { start, end } = period;
  if (start == null && end == null) return '';
  if (start == null) return `〜${yearText(end!)}年`;
  if (end == null) return `${yearText(start)}年〜`;
  return `${yearText(start)}〜${yearText(end)}年`;
}
