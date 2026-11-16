import { describe, expect, it } from 'vitest';
import { validateData, type DataSet, type Issue } from '../scripts/lib/validate';

const subjects = [
  {
    id: 'sekaishi-tankyu',
    name: '世界史探究',
    shortName: '世界史',
    description: '説明',
    verticalAxis: 'region',
    periods: [
      { slug: 'old', name: '古代', end: 0 },
      { slug: 'new', name: '近代', start: 1, end: 2000 },
    ],
  },
];
const taxonomy = {
  regions: [
    { slug: 'china', name: '中国' },
    { slug: 'europe', name: 'ヨーロッパ' },
  ],
  themes: [{ slug: 'politics', name: '政治' }],
};
const question = (over: Record<string, unknown> = {}) => ({
  id: 'w-1',
  subject: 'sekaishi-tankyu',
  question: '前221年に中国を統一した秦の王は？',
  answer: '始皇帝',
  alternatives: [],
  explanation: '解説',
  yearStart: -221,
  regions: ['中国'],
  themes: ['政治'],
  level: 'basic',
  verified: true,
  ...over,
});
const textbook = (over: Record<string, unknown> = {}) => ({
  id: 'tb-1',
  subject: 'sekaishi-tankyu',
  name: '教科書',
  chapters: [{ no: 1, title: '古代', sections: [{ no: 1, title: '中国', questionIds: ['w-1'] }] }],
  ...over,
});

function run(parts: { questions?: unknown[][]; textbooks?: unknown[]; subjects?: unknown; taxonomy?: unknown } = {}): Issue[] {
  const ds: DataSet = {
    subjects: { file: 'subjects.json', data: parts.subjects ?? subjects },
    taxonomy: { file: 'taxonomy.json', data: parts.taxonomy ?? taxonomy },
    questionFiles: (parts.questions ?? [[question()]]).map((list, i) => ({ file: `q${i}.json`, data: { questions: list } })),
    textbooks: (parts.textbooks ?? [textbook()]).map((data, i) => ({ file: `tb${i}.json`, data })),
  };
  return validateData(ds);
}
const errors = (issues: Issue[]) => issues.filter((i) => i.level === 'error').map((i) => i.message);
const warnings = (issues: Issue[]) => issues.filter((i) => i.level === 'warning').map((i) => i.message);

describe('validateData', () => {
  it('正しいデータならエラーも警告もない', () => {
    expect(run()).toEqual([]);
  });

  it('問題IDの重複（ファイルをまたいでも）', () => {
    const issues = run({ questions: [[question()], [question()]] });
    expect(errors(issues)).toEqual(['ID が重複しています（q0.json にもあります）']);
  });

  it('存在しない問題IDの参照', () => {
    const tb = textbook({ chapters: [{ no: 1, title: 'a', sections: [{ no: 1, title: 'b', questionIds: ['w-1', 'nope'] }] }] });
    expect(errors(run({ textbooks: [tb] }))).toEqual(['第1章 第1節: 問題ID「nope」は問題データにありません']);
  });

  it('必須項目の抜け', () => {
    const issues = run({ questions: [[question({ question: '', answer: ' ', level: undefined, verified: 'yes', subject: 'kokugo' })]] });
    const e = errors(issues);
    expect(e).toContain('問題文が空です');
    expect(e).toContain('答えが空です');
    expect(e.some((m) => m.startsWith('重要度は'))).toBe(true);
    expect(e.some((m) => m.startsWith('verified'))).toBe(true);
    expect(e.some((m) => m.startsWith('科目「kokugo」'))).toBe(true);
  });

  it('ID の書式・空の ID', () => {
    expect(errors(run({ questions: [[question({ id: 'w 1' })]], textbooks: [] }))[0]).toContain('ID は半角英数字');
    expect(errors(run({ questions: [[question({ id: '' })]], textbooks: [] }))[0]).toContain('ID が空です');
  });

  it('タグ・年代の誤り', () => {
    const e = errors(run({ questions: [[question({ regions: ['火星'], yearStart: 1800, yearEnd: 1700 })]] }));
    expect(e).toContain('地域タグ「火星」は data/taxonomy.json にありません');
    expect(e).toContain('終了年が開始年より前です');
    expect(errors(run({ questions: [[question({ yearStart: undefined, yearEnd: 1700 })]] }))).toContain('終了年だけがあります（開始年を書きます）');
    expect(errors(run({ questions: [[question({ yearStart: 1789.5 })]] }))).toContain('開始年は整数です（紀元前は負の数）');
  });

  it('読み・おおよその年代', () => {
    expect(run({ questions: [[question({ reading: 'しこうてい', yearApprox: true })]] })).toEqual([]);
    expect(warnings(run({ questions: [[question({ reading: '始皇帝' })]] }))[0]).toContain('かな以外の文字');
    expect(errors(run({ questions: [[question({ reading: '' })]] }))).toContain('reading（読み）は文字列です');
    expect(errors(run({ questions: [[question({ yearApprox: 'yes' })]] }))).toContain('yearApprox（年代がおおよそか）は true か false です');
    expect(errors(run({ questions: [[question({ yearStart: undefined, yearApprox: true })]] }))).toContain('yearApprox だけがあります（開始年を書きます）');
  });

  it('未確認の問題を参照していれば警告（公開されない）', () => {
    const issues = run({ questions: [[question({ verified: false })]] });
    expect(errors(issues)).toEqual([]);
    expect(warnings(issues)).toEqual(['第1章 第1節: 問題「w-1」は未確認のため公開されません', '公開される問題がない節が1個あります（「準備中」と表示します）: 第1章 第1節']);
  });

  it('教科書の章・節の番号の重複・順番', () => {
    const tb = textbook({
      chapters: [
        { no: 2, title: 'a', sections: [{ no: 1, title: 'x', questionIds: ['w-1'] }] },
        { no: 1, title: 'b', sections: [{ no: 1, title: 'x', questionIds: [] }, { no: 1, title: 'y', questionIds: [] }] },
        { no: 1, title: 'c', sections: [] },
      ],
    });
    const e = errors(run({ textbooks: [tb] }));
    expect(e).toContain('第1章: 章は番号の小さい順に並べます');
    expect(e).toContain('第1章 第1節が重複しています');
    expect(e).toContain('第1章が重複しています');
  });

  it('教科書IDの重複・予約語・書式', () => {
    expect(errors(run({ textbooks: [textbook(), textbook()] }))).toContain('教科書IDが重複しています（tb0.json にもあります）');
    expect(errors(run({ textbooks: [textbook({ id: 'review' })] }))).toContain('教科書IDに「review」は使えません（ページのURLと重なります）');
    expect(errors(run({ textbooks: [textbook({ id: 'Bad_ID' })] }))[0]).toContain('教科書ID は半角英小文字');
  });

  it('同じ節に同じ問題が2回あればエラー、別の節なら警告', () => {
    const dupSame = textbook({ chapters: [{ no: 1, title: 'a', sections: [{ no: 1, title: 'x', questionIds: ['w-1', 'w-1'] }] }] });
    expect(errors(run({ textbooks: [dupSame] }))).toEqual(['第1章 第1節: 問題ID「w-1」が同じ節に2回あります']);
    const dupOther = textbook({
      chapters: [{ no: 1, title: 'a', sections: [{ no: 1, title: 'x', questionIds: ['w-1'] }, { no: 2, title: 'y', questionIds: ['w-1'] }] }],
    });
    expect(warnings(run({ textbooks: [dupOther] }))).toContain('問題ID「w-1」が 第1章 第1節 と 第1章 第2節 の両方にあります');
  });

  it('受験復習モードに出ない問題・教科書にない問題・問題文に答えを含む問題は警告', () => {
    const w = warnings(run({ questions: [[question({ yearStart: undefined, regions: [], question: '始皇帝とは？' })]], textbooks: [] }));
    expect(w).toContain('開始年がないため、受験復習モードの「横割り」に出ません');
    expect(w).toContain('地域タグがないため、受験復習モードの「縦割り」に出ません');
    expect(w).toContain('問題文に答えがそのまま含まれています');
    expect(w.some((m) => m.startsWith('どの教科書にも載っていない確認済みの問題が1問'))).toBe(true);
  });

  it('時代区分の重なり・科目の誤り', () => {
    const bad = [{ ...subjects[0], verticalAxis: 'era', periods: [{ slug: 'a', name: 'A', end: 100 }, { slug: 'b', name: 'B', start: 50 }] }];
    const e = errors(run({ subjects: bad }));
    expect(e).toContain('verticalAxis は "region"（地域）か "theme"（テーマ）です');
    expect(e).toContain('時代区分「B」が前の区分と重なっています（古い順に、重ならないように並べます）');
  });

  it('JSON の形が違えばエラー', () => {
    expect(errors(run({ subjects: {} }))).toContain('科目の配列が必要です');
    const ds: DataSet = {
      subjects: { file: 's', data: subjects },
      taxonomy: { file: 't', data: taxonomy },
      questionFiles: [{ file: 'q', data: [question()] }],
      textbooks: [],
    };
    expect(errors(validateData(ds))).toEqual(['{ "questions": [...] } の形が必要です']);
  });
});
