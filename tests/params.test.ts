import { describe, expect, it } from 'vitest';
import { buildPracticeQuery, defaultOrder, parsePracticeParams, practiceQuery, QUICK_OPTIONS } from '../src/lib/params';

describe('parsePracticeParams', () => {
  it('教科書の範囲を読む', () => {
    const r = parsePracticeParams('?tb=sample-x&r=1-3,4.2&n=20&order=random&lv=basic,standard&weak=1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params).toEqual({
      source: { kind: 'textbook', textbookId: 'sample-x', range: '1-3,4.2' },
      levels: ['basic', 'standard'],
      count: 20,
      order: 'random',
      weakOnly: true,
      quick: false,
    });
  });

  it('受験復習モード（科目＋地域・テーマ・時代）を読む', () => {
    const r = parsePracticeParams('sub=sekaishi-tankyu&pd=c15&quick=1');
    expect(r.ok && r.params.source).toEqual({ kind: 'subject', subjectId: 'sekaishi-tankyu', filter: { type: 'period', slug: 'c15' } });
    expect(r.ok && r.params.quick).toBe(true);
  });

  it('不正な値ははじく・無視する', () => {
    expect(parsePracticeParams('').ok).toBe(false);
    expect(parsePracticeParams('tb=<script>').ok).toBe(false);
    expect(parsePracticeParams('tb=x&r=1;alert(1)').ok).toBe(false);
    const r = parsePracticeParams('tb=x&n=-5&order=foo&lv=basic,xxx');
    expect(r.ok && r.params.count).toBe(0);
    expect(r.ok && r.params.order).toBeUndefined();
    expect(r.ok && r.params.levels).toEqual(['basic']);
  });

  it('出題数は上限で止める', () => {
    const r = parsePracticeParams('tb=x&n=99999');
    expect(r.ok && r.params.count).toBe(500);
  });
});

describe('buildPracticeQuery', () => {
  it('読みやすい短いクエリにする（範囲のカンマはそのまま）', () => {
    const q = buildPracticeQuery({
      source: { kind: 'textbook', textbookId: 'sample-x', range: '1-3,4.2' },
      levels: ['basic', 'standard'],
      count: 20,
      order: 'random',
      weakOnly: false,
      quick: false,
    });
    expect(q).toBe('tb=sample-x&r=1-3,4.2&n=20&order=random&lv=basic,standard');
  });

  it('全重要度・全問・全範囲なら省略する', () => {
    expect(practiceQuery({ kind: 'textbook', textbookId: 'x', range: '' }, { levels: ['basic', 'standard', 'advanced'] })).toBe('tb=x');
  });

  it('parse → build で元に戻る', () => {
    const query = 'sub=nihonshi-tankyu&th=politics&n=10&order=year&lv=advanced&weak=1&quick=1';
    const r = parsePracticeParams(query);
    expect(r.ok && buildPracticeQuery(r.params)).toBe(query);
  });

  it('テスト直前モードの設定', () => {
    expect(practiceQuery({ kind: 'subject', subjectId: 's' }, QUICK_OPTIONS)).toBe('sub=s&order=random&lv=basic&quick=1');
  });
});

describe('defaultOrder', () => {
  it('教科書は教科書順、受験復習は年代順', () => {
    expect(defaultOrder({ kind: 'textbook', textbookId: 'x', range: '' })).toBe('textbook');
    expect(defaultOrder({ kind: 'subject', subjectId: 'x' })).toBe('year');
  });
});
