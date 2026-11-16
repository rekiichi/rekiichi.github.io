import { describe, expect, it } from 'vitest';
import { addHistoryEntry, addRange, MAX_HISTORY, MAX_RANGES, sanitizeHistory, sanitizeRanges, sanitizeSettings, type MyRange } from '../src/lib/records';
import { applyResult, formatPercent, isWeak, sanitizeStats, summarize, weakIdSet, type StatsMap } from '../src/lib/stats';

describe('学習記録（stats）', () => {
  it('結果を記録し、最後にまちがえた問題を苦手にする', () => {
    const stats: StatsMap = {};
    applyResult(stats, 'a', false, 'sekaishi-tankyu', 100);
    applyResult(stats, 'b', true, 'sekaishi-tankyu', 200);
    expect(stats.a).toEqual({ c: 0, w: 1, t: 100, r: 0, s: 'sekaishi-tankyu' });
    expect(isWeak(stats.a)).toBe(true);
    expect(isWeak(stats.b)).toBe(false);
    expect(isWeak(undefined)).toBe(false);
    // 正解すると苦手から外れる
    applyResult(stats, 'a', true, 'sekaishi-tankyu', 300);
    expect(stats.a).toMatchObject({ c: 1, w: 1, r: 1 });
    expect(weakIdSet(stats).size).toBe(0);
  });

  it('範囲の学習状況をまとめる', () => {
    const stats: StatsMap = {
      a: { c: 2, w: 1, t: 1, r: 1, s: 'x' },
      b: { c: 0, w: 2, t: 1, r: 0, s: 'x' },
      z: { c: 1, w: 0, t: 1, r: 1, s: 'y' },
    };
    expect(summarize(stats, ['a', 'b', 'c'])).toEqual({ total: 3, answered: 2, mastered: 1, weak: 1, accuracy: 2 / 5 });
    expect(summarize(stats, undefined, (e) => e.s === 'y')).toEqual({ total: 1, answered: 1, mastered: 1, weak: 0, accuracy: 1 });
    expect(summarize({}, ['a']).accuracy).toBeNull();
  });

  it('壊れた記録は取り除く', () => {
    expect(sanitizeStats({ a: { c: 1, w: 0, t: 5, r: 1 }, b: 'x', c: { c: -1, w: 0, t: 0 }, d: { c: 'NaN', w: 0, t: 0 } })).toEqual({
      a: { c: 1, w: 0, t: 5, r: 1 },
    });
    expect(sanitizeStats(null)).toEqual({});
    expect(sanitizeStats([1, 2])).toEqual({});
  });

  it('formatPercent', () => {
    expect(formatPercent(0.873)).toBe('87%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('マイ範囲・履歴・設定', () => {
  const range = (id: string, query: string): MyRange => ({ id, name: id, query, subject: 's', createdAt: 0 });

  it('同じ条件の範囲は上書きして先頭へ。上限を超えたら古いものから消す', () => {
    let list = addRange([], range('1', 'tb=a&r=1'));
    list = addRange(list, range('2', 'tb=a&r=2'));
    list = addRange(list, { ...range('3', 'tb=a&r=1'), name: '新しい名前' });
    expect(list.map((r) => [r.id, r.name])).toEqual([
      ['3', '新しい名前'],
      ['2', '2'],
    ]);
    for (let i = 0; i < MAX_RANGES + 5; i++) list = addRange(list, range(`x${i}`, `q${i}`));
    expect(list).toHaveLength(MAX_RANGES);
  });

  it('履歴は新しい順・上限あり', () => {
    let list = addHistoryEntry([], { t: 1, title: 'a', query: 'q', total: 10, correct: 5 });
    for (let i = 0; i < MAX_HISTORY + 3; i++) list = addHistoryEntry(list, { t: i, title: `t${i}`, query: 'q', total: 1, correct: 1 });
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0].title).toBe(`t${MAX_HISTORY + 2}`);
  });

  it('壊れた値を取り除く', () => {
    expect(sanitizeRanges([{ id: 'a', name: 'n', query: 'q', subject: 's', createdAt: 1 }, { id: 1 }, null, 'x'])).toHaveLength(1);
    expect(sanitizeRanges('x')).toEqual([]);
    expect(sanitizeHistory([{ t: 1, title: 'a', query: 'q', total: -3, correct: 'x' }])).toEqual([{ t: 1, title: 'a', query: 'q', total: 0, correct: 0 }]);
    expect(sanitizeHistory([{ t: 1, title: 'a', query: 'q', total: 1, correct: 1, retry: true }])[0].retry).toBe(true);
    expect(sanitizeHistory([{ t: 1, title: 'a', query: 'q', total: 1, correct: 1, retry: 'yes' }])[0]).not.toHaveProperty('retry');
    expect(sanitizeSettings({ answerMode: 'input' })).toEqual({ answerMode: 'input' });
    expect(sanitizeSettings({ answerMode: 'evil' })).toEqual({ answerMode: 'self' });
    expect(sanitizeSettings(undefined)).toEqual({ answerMode: 'self' });
  });
});
