import { describe, expect, it } from 'vitest';
import { compareIds, findChunk } from '../src/lib/natural-sort';
import { absoluteUrl, joinBase, paths } from '../src/lib/url';
import { findPeriod, formatPeriodRange, formatYears } from '../src/lib/years';

describe('compareIds / findChunk', () => {
  it('数字の部分は数として比べる', () => {
    const ids = ['w-10', 'w-2', 'j-1', 'w-1', 'sample-w-01', 'w-02'];
    expect(ids.sort(compareIds)).toEqual(['j-1', 'sample-w-01', 'w-1', 'w-02', 'w-2', 'w-10']);
  });

  it('分割ファイルを二分探索で探す', () => {
    const chunks: [string, string][] = [
      ['a-1', 'a-300'],
      ['a-301', 'b-5'],
      ['c-1', 'c-9'],
    ];
    expect(findChunk(chunks, 'a-1')).toBe(0);
    expect(findChunk(chunks, 'a-77')).toBe(0);
    expect(findChunk(chunks, 'a-1000')).toBe(1);
    expect(findChunk(chunks, 'b-2')).toBe(1);
    expect(findChunk(chunks, 'c-9')).toBe(2);
    expect(findChunk(chunks, 'b-9')).toBe(-1);
    expect(findChunk(chunks, 'z')).toBe(-1);
    expect(findChunk([], 'a')).toBe(-1);
  });
});

describe('url', () => {
  it('ベースパスをつなぐ', () => {
    expect(joinBase('/', '/sekaishi-tankyu/')).toBe('/sekaishi-tankyu/');
    expect(joinBase('/rekishi-ichimon', '/sekaishi-tankyu/')).toBe('/rekishi-ichimon/sekaishi-tankyu/');
    expect(joinBase('/rekishi-ichimon/', '/')).toBe('/rekishi-ichimon/');
    expect(joinBase('', 'x/')).toBe('/x/');
  });

  it('絶対 URL', () => {
    expect(absoluteUrl('https://example.github.io', '/rekishi-ichimon/', '/practice/')).toBe('https://example.github.io/rekishi-ichimon/practice/');
    expect(absoluteUrl('https://example.com/', '/', '/')).toBe('https://example.com/');
  });

  it('ページのパス', () => {
    expect(paths.chapter('sekaishi-tankyu', 'tb', 3)).toBe('/sekaishi-tankyu/tb/chapter-3/');
    expect(paths.reviewGroup('nihonshi-tankyu', 'theme', 'politics')).toBe('/nihonshi-tankyu/review/theme/politics/');
    expect(paths.practice('tb=x')).toBe('/practice/?tb=x');
    expect(paths.practice()).toBe('/practice/');
  });
});

describe('years', () => {
  it('年代の表示', () => {
    expect(formatYears(-221)).toBe('前221年');
    expect(formatYears(1840, 1842)).toBe('1840〜1842年');
    expect(formatYears(-221, -210)).toBe('前221〜前210年');
    expect(formatYears(1868, 1868)).toBe('1868年');
    expect(formatYears(-3000, undefined, true)).toBe('前3000年ごろ');
    expect(formatYears(1300, 1600, true)).toBe('1300〜1600年ごろ');
    expect(formatYears(undefined, undefined, true)).toBe('');
    expect(formatYears(-7000000, undefined, true)).toBe('約700万年前');
    expect(formatYears(-15000)).toBe('約1.5万年前');
    expect(formatYears(-9000, undefined, true)).toBe('前9000年ごろ');
    expect(formatYears(undefined)).toBe('');
  });

  it('時代区分', () => {
    const periods = [
      { slug: 'a', name: 'A', end: -1 },
      { slug: 'b', name: 'B', start: 1, end: 1000 },
      { slug: 'c', name: 'C', start: 1001 },
    ];
    expect(findPeriod(-500, periods)?.slug).toBe('a');
    expect(findPeriod(1000, periods)?.slug).toBe('b');
    expect(findPeriod(2026, periods)?.slug).toBe('c');
    expect(findPeriod(undefined, periods)).toBeUndefined();
    expect(formatPeriodRange(periods[0])).toBe('〜前1年');
    expect(formatPeriodRange(periods[1])).toBe('1〜1000年');
    expect(formatPeriodRange(periods[2])).toBe('1001年〜');
  });
});
