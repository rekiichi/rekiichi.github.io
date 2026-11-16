import { describe, expect, it } from 'vitest';
import {
  chapterLabel,
  collectQuestionIds,
  describeRange,
  parseRange,
  resolveRange,
  sectionLabel,
  serializeRange,
  toRangeTextbook,
  type RangeTextbook,
} from '../src/lib/range';
import type { ClientTextbook } from '../src/lib/types';

// 第0章（序章）〜第4章。第3章第2節は問題なし（準備中）、第4章は全節が問題なし
const tb: RangeTextbook = {
  chapters: [
    { no: 0, title: '序章', sections: [{ no: 1, title: 'a', questionIds: ['q0'] }] },
    {
      no: 1,
      title: '一',
      sections: [
        { no: 1, title: 'a', questionIds: ['q1', 'q2'] },
        { no: 2, title: 'b', questionIds: ['q3'] },
      ],
    },
    {
      no: 2,
      title: '二',
      sections: [
        { no: 1, title: 'a', questionIds: ['q4'] },
        { no: 2, title: 'b', questionIds: ['q5', 'q2'] },
      ],
    },
    {
      no: 3,
      title: '三',
      sections: [
        { no: 1, title: 'a', questionIds: ['q6'] },
        { no: 2, title: 'b', questionIds: [] },
      ],
    },
    { no: 4, title: '四', sections: [{ no: 1, title: 'a', questionIds: [] }] },
  ],
};

describe('parseRange', () => {
  it('章・章の範囲・節を読む', () => {
    expect(parseRange('1-3,4.2,5')).toEqual([
      { kind: 'chapters', from: 1, to: 3 },
      { kind: 'section', chapter: 4, section: 2 },
      { kind: 'chapters', from: 5, to: 5 },
    ]);
  });

  it('逆向きの範囲は入れ替える', () => {
    expect(parseRange('3-1')).toEqual([{ kind: 'chapters', from: 1, to: 3 }]);
  });

  it('書式に合わないトークンは無視する', () => {
    expect(parseRange('a,1..2,-3,2.x, 2 ')).toEqual([{ kind: 'chapters', from: 2, to: 2 }]);
    expect(parseRange('')).toEqual([]);
    expect(parseRange(null)).toEqual([]);
  });
});

describe('resolveRange', () => {
  it('空なら全範囲', () => {
    expect(resolveRange(tb, '')).toEqual(['0.1', '1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1']);
  });

  it('章の範囲と節を教科書順に、重複なく並べる', () => {
    expect(resolveRange(tb, '2.2,1,1.1')).toEqual(['1.1', '1.2', '2.2']);
  });

  it('「第◯章〜第◯章」は間の章をすべて含む', () => {
    expect(resolveRange(tb, '1-2')).toEqual(['1.1', '1.2', '2.1', '2.2']);
  });

  it('序章（0）も扱える', () => {
    expect(resolveRange(tb, '0')).toEqual(['0.1']);
  });

  it('存在しない章・節は無視する', () => {
    expect(resolveRange(tb, '9,1.9')).toEqual([]);
  });
});

describe('collectQuestionIds', () => {
  it('教科書順・重複なしで問題IDを集める', () => {
    expect(collectQuestionIds(tb, ['2.2', '1.1'])).toEqual(['q1', 'q2', 'q5']);
  });
});

describe('serializeRange', () => {
  it('全範囲は空文字', () => {
    expect(serializeRange(tb, resolveRange(tb, ''))).toBe('');
  });

  it('問題のある節がすべて選ばれていれば全範囲（準備中の節は数えない）', () => {
    expect(serializeRange(tb, ['0.1', '1.1', '1.2', '2.1', '2.2', '3.1'])).toBe('');
  });

  it('そろった章は章番号に、連続する章は範囲にまとめる', () => {
    expect(serializeRange(tb, ['1.1', '1.2', '2.1', '2.2'])).toBe('1-2');
    expect(serializeRange(tb, ['0.1', '1.1', '1.2', '3.1'])).toBe('0-1,3');
  });

  it('一部の節だけの章は節で書く', () => {
    expect(serializeRange(tb, ['1.1', '2.1', '2.2'])).toBe('1.1,2');
  });

  it('準備中の節だけの章（第3章第2節）はそろっているとみなす', () => {
    expect(serializeRange(tb, ['2.1', '2.2', '3.1'])).toBe('2-3');
  });

  it('serialize → resolve で同じ範囲に戻る', () => {
    const picked = ['0.1', '1.2', '2.1', '2.2', '3.1'];
    expect(resolveRange(tb, serializeRange(tb, picked)).filter((k) => k !== '3.2')).toEqual(picked);
  });
});

describe('describeRange', () => {
  it('日本語で説明する', () => {
    expect(describeRange(tb, ['1.1', '1.2', '2.1', '2.2'])).toBe('第1章〜第2章');
    expect(describeRange(tb, ['1.1', '2.1', '2.2'])).toBe('第1章 第1節、第2章');
    expect(describeRange(tb, ['0.1'])).toBe('序章');
    expect(describeRange(tb, [])).toBe('範囲なし');
    expect(describeRange(tb, resolveRange(tb, ''))).toBe('全範囲');
  });
});

describe('describeRange（節の表示名が数字だけのとき）', () => {
  it('「第1部の1・2」のように書く', () => {
    const themes: RangeTextbook = {
      chapters: [
        {
          no: 1,
          label: '第1部',
          title: '近代化',
          sections: [
            { no: 1, label: '1', title: 'a', questionIds: ['x'] },
            { no: 2, label: '2', title: 'b', questionIds: ['y'] },
            { no: 3, label: '3', title: 'c', questionIds: ['z'] },
          ],
        },
        { no: 2, label: '第2部', title: '大衆化', sections: [{ no: 1, label: '1', title: 'd', questionIds: ['w'] }] },
      ],
    };
    expect(describeRange(themes, ['1.1', '1.2'])).toBe('第1部の1・2');
    expect(describeRange(themes, ['1.1', '1.2', '1.3'])).toBe('第1部');
  });

  it('同じ表示名の節がある章では見出しも添える', () => {
    const front: RangeTextbook = {
      chapters: [
        {
          no: 0,
          label: '巻頭',
          sections: [
            { no: 1, label: '①', title: 'a', questionIds: ['x'] },
            { no: 2, label: '②', title: 'b', questionIds: ['y'] },
            { no: 3, label: '②', title: 'c', questionIds: ['z'] },
          ],
        },
        { no: 1, sections: [{ no: 1, questionIds: ['w'] }] },
      ],
    };
    expect(describeRange(front, ['0.3'])).toBe('巻頭 ② c');
    expect(describeRange(front, ['0.1', '0.2'])).toBe('巻頭 ① a・② b');
    expect(describeRange(front, ['0.1', '0.2', '0.3'])).toBe('巻頭');
  });
});

describe('labels', () => {
  it('章・節の表示名', () => {
    expect(chapterLabel({ no: 3 })).toBe('第3章');
    expect(chapterLabel({ no: 0 })).toBe('序章');
    expect(chapterLabel({ no: 9, label: '終章' })).toBe('終章');
    expect(sectionLabel({ no: 2 })).toBe('第2節');
    expect(sectionLabel({ no: 2, label: '2' })).toBe('2');
  });
});

describe('toRangeTextbook', () => {
  it('出題画面用の教科書データを範囲計算用の形にする', () => {
    const client: ClientTextbook = {
      id: 't',
      subject: 's',
      name: 'T',
      chapters: [{ no: 1, title: 'c', sections: [{ no: 1, title: 's', q: [['a', 'basic'], ['b', 'advanced']] }] }],
    };
    expect(collectQuestionIds(toRangeTextbook(client), ['1.1'])).toEqual(['a', 'b']);
  });
});
