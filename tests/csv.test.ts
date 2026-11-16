import { describe, expect, it } from 'vitest';
import { decodeCsvBytes, isBlankRow, parseCsv, toCsvCell } from '../scripts/lib/csv';

describe('parseCsv', () => {
  it('ふつうの行', () => {
    expect(parseCsv('a,b,c\n1,2,3\n').rows).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('ダブルクォート・セル内のカンマ・改行・エスケープ', () => {
    const { rows, lines } = parseCsv('id,text\n1,"a,b"\n2,"改行\nあり"\n3,"「""引用""」"\n');
    expect(rows).toEqual([
      ['id', 'text'],
      ['1', 'a,b'],
      ['2', '改行\nあり'],
      ['3', '「"引用"」'],
    ]);
    // 行番号は元のファイルの行（セル内の改行も数える）
    expect(lines).toEqual([1, 2, 3, 5]);
  });

  it('CRLF・BOM・最後の改行なし', () => {
    expect(parseCsv('﻿a,b\r\n1,2').rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('空のセル', () => {
    expect(parseCsv('a,,c\n,,\n').rows).toEqual([
      ['a', '', 'c'],
      ['', '', ''],
    ]);
  });
});

describe('decodeCsvBytes', () => {
  it('UTF-8（BOM付き）', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('問題,答え')]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: '問題,答え', encoding: 'utf-8' });
  });

  it('Shift_JIS（Excel の CSV）', () => {
    // 「問題」の Shift_JIS
    const bytes = new Uint8Array([0x96, 0xe2, 0x91, 0xe8]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: '問題', encoding: 'shift_jis' });
  });
});

describe('helpers', () => {
  it('isBlankRow', () => {
    expect(isBlankRow(['', ' ', ''])).toBe(true);
    expect(isBlankRow(['', 'x'])).toBe(false);
  });

  it('toCsvCell', () => {
    expect(toCsvCell('abc')).toBe('abc');
    expect(toCsvCell('a,b')).toBe('"a,b"');
    expect(toCsvCell('a"b')).toBe('"a""b"');
  });
});
