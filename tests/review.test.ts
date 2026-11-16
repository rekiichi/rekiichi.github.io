import { describe, expect, it } from 'vitest';
import { groupByPeriod, groupVertical, type ReviewQuestion } from '../src/lib/review';
import type { Period, Tag } from '../src/lib/types';

const tags: Tag[] = [
  { slug: 'china', name: '中国' },
  { slug: 'europe', name: 'ヨーロッパ' },
  { slug: 'japan', name: '日本' },
];
const periods: Period[] = [
  { slug: 'old', name: '古代', end: 0 },
  { slug: 'c19', name: '19世紀', start: 1801, end: 1900 },
];
const q = (id: string, yearStart: number | undefined, regions: string[]): ReviewQuestion => ({ id, yearStart, regions, themes: [] });

const questions = [
  q('opium', 1840, ['中国', 'ヨーロッパ']),
  q('shi', -221, ['中国']),
  q('perry', 1853, ['日本']),
  q('nap', 1804, ['ヨーロッパ']),
  q('noyear', undefined, ['中国']),
  q('notag', 1850, []),
];

describe('groupVertical（縦割り）', () => {
  it('タグごとに年代順。複数タグの問題はそれぞれに入る。年代なしは最後', () => {
    const groups = groupVertical(questions, tags, 'region');
    expect(groups.map((g) => [g.tag.slug, g.questions.map((x) => x.id)])).toEqual([
      ['china', ['shi', 'opium', 'noyear']],
      ['europe', ['nap', 'opium']],
      ['japan', ['perry']],
    ]);
  });

  it('テーマ軸でもまとめられる', () => {
    const groups = groupVertical([{ id: 'x', yearStart: 1, regions: [], themes: ['政治'] }], [{ slug: 'p', name: '政治' }], 'theme');
    expect(groups[0].questions.map((x) => x.id)).toEqual(['x']);
  });
});

describe('groupByPeriod（横割り）', () => {
  it('開始年で時代に振り分け、時代の中は先頭のタグごと（タグ順）→年代順', () => {
    const [old, c19] = groupByPeriod(questions, periods, tags, 'region');
    expect(old.questions.map((x) => x.id)).toEqual(['shi']);
    expect(c19.subgroups.map((g) => [g.tag?.slug ?? null, g.questions.map((x) => x.id)])).toEqual([
      ['china', ['opium']],
      ['europe', ['nap']],
      ['japan', ['perry']],
      [null, ['notag']],
    ]);
    expect(c19.questions.map((x) => x.id)).toEqual(['opium', 'nap', 'perry', 'notag']);
  });

  it('開始年のない問題・どの時代にも入らない問題は含めない', () => {
    const groups = groupByPeriod([q('gap', 1000, ['中国']), q('noyear', undefined, ['中国'])], periods, tags, 'region');
    expect(groups.flatMap((g) => g.questions)).toEqual([]);
  });
});
