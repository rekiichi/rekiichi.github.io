// 学習記録（localStorage に保存する中身）の計算。保存・読み込みは src/client/storage.ts。

export interface StatEntry {
  /** 正解した回数 */
  c: number;
  /** 間違えた回数 */
  w: number;
  /** 最後に解いた時刻（ミリ秒） */
  t: number;
  /** 最後の結果（1: 正解、0: 不正解） */
  r: 0 | 1;
  /** 科目ID（科目ごとの集計用） */
  s?: string;
}

export type StatsMap = Record<string, StatEntry>;

/** 結果を記録する（stats を書き換えて返す） */
export function applyResult(stats: StatsMap, id: string, correct: boolean, subject: string | undefined, now: number): StatsMap {
  const prev = stats[id];
  const entry: StatEntry = prev ? { ...prev } : { c: 0, w: 0, t: 0, r: 0 };
  if (correct) entry.c += 1;
  else entry.w += 1;
  entry.t = now;
  entry.r = correct ? 1 : 0;
  if (subject) entry.s = subject;
  stats[id] = entry;
  return stats;
}

/** 苦手 = 最後に間違えた問題（正解すると苦手から外れる） */
export function isWeak(entry: StatEntry | undefined): boolean {
  return entry !== undefined && entry.r === 0;
}

export function weakIdSet(stats: StatsMap): Set<string> {
  return new Set(Object.keys(stats).filter((id) => isWeak(stats[id])));
}

export interface StatsSummary {
  /** 対象の問題数 */
  total: number;
  /** 1回以上解いた問題数 */
  answered: number;
  /** 最後の結果が正解の問題数 */
  mastered: number;
  /** 最後の結果が不正解の問題数（苦手） */
  weak: number;
  /** 全回答に対する正解の割合（0〜1。未回答なら null） */
  accuracy: number | null;
}

/** ids（省略時は記録のある全問題）の学習状況をまとめる */
export function summarize(stats: StatsMap, ids?: Iterable<string>, filter?: (entry: StatEntry) => boolean): StatsSummary {
  const list = ids ? [...new Set(ids)] : Object.keys(stats);
  let answered = 0;
  let mastered = 0;
  let weak = 0;
  let correct = 0;
  let attempts = 0;
  let total = 0;
  for (const id of list) {
    const e = stats[id];
    if (filter && (!e || !filter(e))) continue;
    total += 1;
    if (!e) continue;
    answered += 1;
    if (e.r === 1) mastered += 1;
    else weak += 1;
    correct += e.c;
    attempts += e.c + e.w;
  }
  return { total, answered, mastered, weak, accuracy: attempts > 0 ? correct / attempts : null };
}

/** 0.873 → "87%" */
export function formatPercent(ratio: number | null): string {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`;
}

/** 壊れた値を取り除いて StatsMap として使える形にする（localStorage の中身は信用しない） */
export function sanitizeStats(value: unknown): StatsMap {
  const out: StatsMap = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const c = Number(e.c);
    const w = Number(e.w);
    const t = Number(e.t);
    if (![c, w, t].every((n) => Number.isFinite(n) && n >= 0)) continue;
    out[id] = { c, w, t, r: e.r === 1 ? 1 : 0, ...(typeof e.s === 'string' ? { s: e.s } : {}) };
  }
  return out;
}
