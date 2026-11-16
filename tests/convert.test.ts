import { describe, expect, it } from 'vitest';
import { convertQuestionRows, convertTextbookRows, isApproxYear, parseLevel, parseUnitNumber, parseVerified, parseYear } from '../scripts/lib/convert';
import { parseCsv } from '../scripts/lib/csv';
import type { Subject } from '../src/lib/types';

const subjects: Subject[] = [
  { id: 'sekaishi-tankyu', name: '世界史探究', shortName: '世界史', description: '', verticalAxis: 'region', periods: [] },
];

const questions = (csv: string) => {
  const { rows, lines } = parseCsv(csv);
  return convertQuestionRows(rows, lines, { subjects });
};
const textbook = (csv: string, questionIds?: string[]) => {
  const { rows, lines } = parseCsv(csv);
  return convertTextbookRows(rows, lines, { subjects, fileStem: 'file-stem', questionIds });
};

describe('値の読み取り', () => {
  it('parseYear', () => {
    expect(parseYear('1789')).toBe(1789);
    expect(parseYear('1789年')).toBe(1789);
    expect(parseYear('前221')).toBe(-221);
    expect(parseYear('紀元前221年')).toBe(-221);
    expect(parseYear('-221')).toBe(-221);
    expect(parseYear('１８００ごろ')).toBe(1800);
    expect(parseYear('')).toBeUndefined();
    expect(parseYear('江戸時代')).toBeNull();
  });

  it('isApproxYear（「ごろ」「約」が付いた年）', () => {
    expect(isApproxYear('前3000ごろ')).toBe(true);
    expect(isApproxYear('1500年頃')).toBe(true);
    expect(isApproxYear('約1500')).toBe(true);
    expect(isApproxYear('1500')).toBe(false);
    expect(isApproxYear('')).toBe(false);
    expect(parseYear('前3000年ごろ')).toBe(-3000);
    expect(parseYear('約700万年前')).toBe(-7000000);
    expect(parseYear('1.5万年前')).toBe(-15000);
    expect(isApproxYear('約700万年前')).toBe(true);
    expect(isApproxYear('20万年前')).toBe(true);
  });

  it('parseLevel', () => {
    expect(parseLevel('基本')).toBe('basic');
    expect(parseLevel('標準')).toBe('standard');
    expect(parseLevel('発展')).toBe('advanced');
    expect(parseLevel('advanced')).toBe('advanced');
    expect(parseLevel('2')).toBe('standard');
    expect(parseLevel('基礎')).toBeNull();
  });

  it('parseVerified（空欄は未確認）', () => {
    expect(parseVerified('TRUE')).toBe(true);
    expect(parseVerified('○')).toBe(true);
    expect(parseVerified('済')).toBe(true);
    expect(parseVerified('')).toBe(false);
    expect(parseVerified('FALSE')).toBe(false);
    expect(parseVerified('たぶん')).toBeNull();
  });

  it('parseUnitNumber', () => {
    expect(parseUnitNumber('3')).toBe(3);
    expect(parseUnitNumber('第3章')).toBe(3);
    expect(parseUnitNumber('第三章')).toBe(3);
    expect(parseUnitNumber('第12節')).toBe(12);
    expect(parseUnitNumber('序章')).toBe(0);
    expect(parseUnitNumber('三の一')).toBeNull();
  });
});

describe('convertQuestionRows', () => {
  const header = 'ID,科目,問題文,答え,別解,解説,開始年,終了年,地域,テーマ,重要度,確認済み,メモ';

  it('日本語の見出しの CSV を問題データにする', () => {
    const r = questions(`${header}\nw-1,世界史探究,問題,答え,別解1|別解2,解説,前221,前210,中国|西アジア,政治、文化,基本,TRUE,メモ\n`);
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.value).toEqual([
      {
        id: 'w-1',
        subject: 'sekaishi-tankyu',
        question: '問題',
        answer: '答え',
        alternatives: ['別解1', '別解2'],
        explanation: '解説',
        yearStart: -221,
        yearEnd: -210,
        regions: ['中国', '西アジア'],
        themes: ['政治', '文化'],
        level: 'basic',
        verified: true,
        memo: 'メモ',
      },
    ]);
  });

  it('英語の見出しでもよく、空行は飛ばす', () => {
    const r = questions('id,subject,question,answer,level\n\nw-2,sekaishi-tankyu,Q,A,standard\n,,,,\n');
    expect(r.value).toHaveLength(1);
    expect(r.value?.[0]).toMatchObject({ id: 'w-2', level: 'standard', verified: false, alternatives: [], regions: [] });
  });

  it('必須の見出しがなければエラー', () => {
    const r = questions('ID,問題文\nx,y\n');
    expect(r.value).toBeNull();
    expect(r.issues[0].message).toContain('必須の見出しがありません');
  });

  it('行番号つきでエラーを返す（不明な科目・読めない年・使えない重要度）', () => {
    const r = questions(`${header}\nw-3,国語,問題,答え,,,江戸,,,,基礎,TRUE,\n`);
    expect(r.value).toBeNull();
    const messages = r.issues.filter((i) => i.level === 'error').map((i) => `${i.line}:${i.message}`);
    expect(messages.some((m) => m.startsWith('2:科目「国語」'))).toBe(true);
    expect(messages.some((m) => m.startsWith('2:開始年「江戸」'))).toBe(true);
    expect(messages.some((m) => m.startsWith('2:重要度「基礎」'))).toBe(true);
  });

  it('読めない確認済みの値は警告して未確認にする', () => {
    const r = questions(`${header}\nw-4,世界史探究,問題,答え,,,,,,,基本,たぶん,\n`);
    expect(r.value?.[0].verified).toBe(false);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('確認済み'))).toBe(true);
  });

  it('読みと、おおよその年代', () => {
    const r = questions('ID,科目,問題文,答え,読み,開始年,終了年,重要度\nw-6,世界史探究,Q,冒頓単于,ぼくとつぜんう,前209ごろ,,標準\nw-7,世界史探究,Q,A,,1300,1600ごろ,標準\nw-8,世界史探究,Q,A,,1789,,標準\n');
    expect(r.issues).toEqual([]);
    expect(r.value?.[0]).toMatchObject({ reading: 'ぼくとつぜんう', yearStart: -209, yearApprox: true });
    expect(r.value?.[1]).toMatchObject({ yearStart: 1300, yearEnd: 1600, yearApprox: true });
    expect(r.value?.[2]).not.toHaveProperty('yearApprox');
    expect(r.value?.[2]).not.toHaveProperty('reading');
  });

  it('知らない見出しは警告して無視する', () => {
    const r = questions('ID,科目,問題文,答え,重要度,難易度\nw-5,世界史,Q,A,基本,3\n');
    expect(r.value).toHaveLength(1);
    expect(r.issues.some((i) => i.level === 'warning' && i.message.includes('難易度'))).toBe(true);
  });
});

describe('convertTextbookRows', () => {
  const header = '教科書ID,科目,教科書名,出版社,説明,並び順,部,章番号,章見出し,節番号,節見出し,ページ,問題ID';

  it('1行1節の書き方', () => {
    const r = textbook(
      `${header}\nt-1,世界史探究,教科書,出版社,説明,1,第1部,1,古代,1,オリエント,p.10〜20,a b|c\n,,,,,,,1,,2,ギリシア,,d\n,,,,,,,2,中世,1,西欧,,e、f\n`,
    );
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.value).toEqual({
      id: 't-1',
      subject: 'sekaishi-tankyu',
      name: '教科書',
      publisher: '出版社',
      description: '説明',
      order: 1,
      chapters: [
        {
          no: 1,
          title: '古代',
          part: '第1部',
          sections: [
            { no: 1, title: 'オリエント', pages: 'p.10〜20', questionIds: ['a', 'b', 'c'] },
            { no: 2, title: 'ギリシア', questionIds: ['d'] },
          ],
        },
        { no: 2, title: '中世', sections: [{ no: 1, title: '西欧', questionIds: ['e', 'f'] }] },
      ],
    });
  });

  it('出典を読み取る（最初の行だけ）', () => {
    const r = textbook('教科書ID,科目,教科書名,出典,章番号,章見出し,節番号,節見出し,問題ID\nt,世界史探究,教,〇〇社の公開資料,1,古代,1,a,x\n,,,,1,,2,b,y\n');
    expect(r.value?.source).toBe('〇〇社の公開資料');
  });

  it('問題IDのまとめ書き（w-0102-* → その文字で始まる問題すべて）', () => {
    const csv = '科目,教科書名,章番号,章見出し,節番号,節見出し,問題ID\n世界史探究,教,1,古代,1,a,w-0101-*\n,,1,,2,b,w-0102-* x-1\n,,1,,3,c,w-0103-*\n';
    const ids = ['w-0101-01', 'w-0101-02', 'w-0102-01', 'w-0110-01', 'x-1'];
    const r = textbook(csv, ids);
    expect(r.value?.chapters[0].sections.map((s) => s.questionIds)).toEqual([['w-0101-01', 'w-0101-02'], ['w-0102-01', 'x-1'], []]);
    expect(r.issues).toEqual([{ level: 'warning', line: 4, message: '問題ID「w-0103-*」に当てはまる問題がありません' }]);
    // 問題データなしではエラー・* の位置がおかしければエラー
    expect(textbook(csv).value).toBeNull();
    expect(textbook('科目,教科書名,章番号,章見出し,節番号,節見出し,問題ID\n世界史探究,教,1,古代,1,a,w-*-01\n', ids).value).toBeNull();
  });

  it('1行1問の書き方（章・節が空の行は前の行と同じ）。教科書IDを省くとファイル名', () => {
    const r = textbook(`${header}\n,世界史探究,教科書,,,,,第1章,古代,第1節,オリエント,,a\n,,,,,,,,,,,,b\n,,,,,,,,,2,ギリシア,,c\n,,,,,,,,,,,,d\n`);
    expect(r.value?.id).toBe('file-stem');
    expect(r.value?.chapters[0].sections.map((s) => s.questionIds)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('エラー：最初の行に章番号がない・見出しの食い違い・離れた行の同じ章・科目なし', () => {
    expect(textbook(`${header}\nt,世界史探究,教,,,,,,古代,1,a,,x\n`).value).toBeNull();
    const conflict = textbook(`${header}\nt,世界史探究,教,,,,,1,古代,1,a,,x\n,,,,,,,1,中世,2,b,,y\n`);
    expect(conflict.issues.some((i) => i.message.includes('章見出しが同じ章・節の前の行と違います'))).toBe(true);
    const split = textbook(`${header}\nt,世界史探究,教,,,,,1,古代,1,a,,x\n,,,,,,,2,中世,1,b,,y\n,,,,,,,1,,2,c,,z\n`);
    expect(split.issues.some((i) => i.message.includes('離れた行に分かれています'))).toBe(true);
    const noSubject = textbook(`${header}\nt,,教,,,,,1,古代,1,a,,x\n`);
    expect(noSubject.issues.some((i) => i.message.includes('科目がありません'))).toBe(true);
  });
});
