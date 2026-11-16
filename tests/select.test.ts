import { describe, expect, it } from 'vitest';
import { buildQuestionSet, compareByYear, shuffle, type SelectableQuestion } from '../src/lib/select';

/** テスト用の決まった乱数（mulberry32） */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const qs: SelectableQuestion[] = [
  { id: 'a', level: 'basic', yearStart: 1789 },
  { id: 'b', level: 'standard', yearStart: -221 },
  { id: 'c', level: 'advanced' },
  { id: 'd', level: 'basic', yearStart: 1517 },
  { id: 'e', level: 'standard', yearStart: 1517, yearEnd: 1520 },
  { id: 'f', level: 'basic', yearStart: 1517, yearEnd: 1518 },
];
const ids = (list: SelectableQuestion[]) => list.map((q) => q.id);

describe('buildQuestionSet', () => {
  it('教科書順・全問ならそのまま', () => {
    expect(ids(buildQuestionSet(qs, { order: 'textbook' }))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('重要度で絞り込む', () => {
    expect(ids(buildQuestionSet(qs, { order: 'textbook', levels: ['basic'] }))).toEqual(['a', 'd', 'f']);
    expect(ids(buildQuestionSet(qs, { order: 'textbook', levels: ['standard', 'advanced'] }))).toEqual(['b', 'c', 'e']);
  });

  it('苦手だけに絞り込む', () => {
    expect(ids(buildQuestionSet(qs, { order: 'textbook', weakOnly: true, weakIds: new Set(['c', 'e']) }))).toEqual(['c', 'e']);
    expect(buildQuestionSet(qs, { order: 'textbook', weakOnly: true })).toEqual([]);
  });

  it('出題数を指定すると、範囲全体から選んで教科書順に並べる', () => {
    const picked = ids(buildQuestionSet(qs, { order: 'textbook', count: 3, random: seeded(1) }));
    expect(picked).toHaveLength(3);
    const order = ids(qs);
    expect([...picked].sort((x, y) => order.indexOf(x) - order.indexOf(y))).toEqual(picked);
  });

  it('出題数が問題数以上なら全問', () => {
    expect(buildQuestionSet(qs, { order: 'textbook', count: 100 })).toHaveLength(6);
    expect(buildQuestionSet(qs, { order: 'textbook', count: 0 })).toHaveLength(6);
  });

  it('ランダムは同じ問題の並べ替え（乱数を固定すると再現できる）', () => {
    const a = ids(buildQuestionSet(qs, { order: 'random', random: seeded(42) }));
    const b = ids(buildQuestionSet(qs, { order: 'random', random: seeded(42) }));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('年代順は開始年→終了年の順。年代のない問題は最後', () => {
    expect(ids(buildQuestionSet(qs, { order: 'year' }))).toEqual(['b', 'd', 'f', 'e', 'a', 'c']);
  });
});

describe('shuffle', () => {
  it('元の配列を変えない', () => {
    const list = [1, 2, 3, 4];
    shuffle(list, seeded(3));
    expect(list).toEqual([1, 2, 3, 4]);
  });
});

describe('compareByYear', () => {
  it('年代のないものは後ろ', () => {
    expect(compareByYear({ yearStart: 1 }, {})).toBeLessThan(0);
    expect(compareByYear({}, { yearStart: 1 })).toBeGreaterThan(0);
  });
});
