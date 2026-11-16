import { describe, expect, it } from 'vitest';
import { answerVariants, isCorrectAnswer, kanjiNumberToArabic, normalizeAnswer } from '../src/lib/normalize';

describe('kanjiNumberToArabic', () => {
  it.each([
    ['一', '1'],
    ['十', '10'],
    ['十四', '14'],
    ['二十', '20'],
    ['三十', '30'],
    ['百', '100'],
    ['百二十', '120'],
    ['千九百四十五', '1945'],
    ['一九四五', '1945'],
    ['二〇二六', '2026'],
  ])('%s → %s', (input, expected) => {
    expect(kanjiNumberToArabic(input)).toBe(expected);
  });
});

describe('normalizeAnswer', () => {
  it('全角英数字・記号を半角にし、英字を小文字にする', () => {
    expect(normalizeAnswer('ＡＡ会議')).toBe(normalizeAnswer('aa会議'));
    expect(normalizeAnswer('ＮＡＴＯ')).toBe('nato');
  });

  it('半角カナ・カタカナをひらがなにそろえる', () => {
    expect(normalizeAnswer('ﾙﾀｰ')).toBe('るたー');
    expect(normalizeAnswer('ルター')).toBe('るたー');
  });

  it('中黒・イコール・スペースを取り除く', () => {
    const expected = normalizeAnswer('マルコポーロ');
    for (const s of ['マルコ・ポーロ', 'マルコ＝ポーロ', 'マルコ=ポーロ', 'マルコ ポーロ', 'マルコ　ポーロ', 'ﾏﾙｺ･ﾎﾟｰﾛ', 'マルコ゠ポーロ']) {
      expect(normalizeAnswer(s)).toBe(expected);
    }
  });

  it('かっこ・かぎかっこ・句読点を取り除く', () => {
    expect(normalizeAnswer('『古事記』')).toBe(normalizeAnswer('古事記'));
    expect(normalizeAnswer('「論語」。')).toBe(normalizeAnswer('論語'));
  });

  it('漢数字を算用数字にそろえる', () => {
    expect(normalizeAnswer('第一次世界大戦')).toBe(normalizeAnswer('第1次世界大戦'));
    expect(normalizeAnswer('三十年戦争')).toBe(normalizeAnswer('30年戦争'));
    expect(normalizeAnswer('ルイ十四世')).toBe(normalizeAnswer('ルイ14世'));
    expect(normalizeAnswer('五・一五事件')).toBe(normalizeAnswer('5.15事件'));
  });

  it('ヴ表記をバ行にそろえる', () => {
    expect(normalizeAnswer('ヴェルサイユ条約')).toBe(normalizeAnswer('ベルサイユ条約'));
    expect(normalizeAnswer('ヴァスコ＝ダ＝ガマ')).toBe(normalizeAnswer('バスコダガマ'));
  });

  it('漢字・数字にはさまれた ヶ・ケ・ヵ・カ・箇 をそろえる', () => {
    const sekigahara = normalizeAnswer('関ヶ原の戦い');
    expect(normalizeAnswer('関ケ原の戦い')).toBe(sekigahara);
    const fourteen = normalizeAnswer('十四か条の平和原則');
    for (const s of ['十四カ条の平和原則', '十四ヵ条の平和原則', '十四ヶ条の平和原則', '14か条の平和原則', '十四箇条の平和原則']) {
      expect(normalizeAnswer(s)).toBe(fourteen);
    }
  });

  it('波ダッシュと全角チルダをそろえる', () => {
    expect(normalizeAnswer('A〜B')).toBe(normalizeAnswer('A～B'));
  });
});

describe('answerVariants', () => {
  it('ハイフンは「消した形」と「長音にした形」の2通りを返す', () => {
    expect(answerVariants('ルタ-')).toEqual(['るた', 'るたー']);
  });

  it('ハイフンがなければ1通り', () => {
    expect(answerVariants('ルター')).toEqual(['るたー']);
  });
});

describe('isCorrectAnswer', () => {
  it('答えと同じなら正解', () => {
    expect(isCorrectAnswer('フランス革命', 'フランス革命')).toBe(true);
  });

  it('表記ゆれを許容する', () => {
    expect(isCorrectAnswer('ふらんす革命', 'フランス革命')).toBe(true);
    expect(isCorrectAnswer(' フランス革命 ', 'フランス革命')).toBe(true);
    expect(isCorrectAnswer('ルイ-フィリップ', 'ルイ＝フィリップ')).toBe(true);
    expect(isCorrectAnswer('ルタ－', 'ルター')).toBe(true);
    expect(isCorrectAnswer('アジアアフリカ会議', 'アジア・アフリカ会議')).toBe(true);
    expect(isCorrectAnswer('第1次世界大戦', '第一次世界大戦')).toBe(true);
    expect(isCorrectAnswer('五カ条の誓文', '五箇条の誓文')).toBe(true);
  });

  it('別解も正解にする', () => {
    expect(isCorrectAnswer('元寇', '蒙古襲来', ['元寇', '文永・弘安の役'])).toBe(true);
    expect(isCorrectAnswer('文永弘安の役', '蒙古襲来', ['元寇', '文永・弘安の役'])).toBe(true);
    expect(isCorrectAnswer('ハンムラピ', 'ハンムラビ王', ['ハンムラビ', 'ハンムラピ王', 'ハンムラピ'])).toBe(true);
  });

  it('ちがう答えは不正解', () => {
    expect(isCorrectAnswer('ロシア革命', 'フランス革命')).toBe(false);
    expect(isCorrectAnswer('フランス', 'フランス革命')).toBe(false);
    expect(isCorrectAnswer('第二次世界大戦', '第一次世界大戦')).toBe(false);
    expect(isCorrectAnswer('ルタ', 'ルター')).toBe(false);
  });

  it('漢字の答えのひらがな書きは不正解（読みは許容しない）', () => {
    expect(isCorrectAnswer('たいかのかいしん', '大化の改新', ['大化改新'])).toBe(false);
  });

  it('空や記号だけの入力は不正解', () => {
    expect(isCorrectAnswer('', 'フランス革命')).toBe(false);
    expect(isCorrectAnswer('   ', 'フランス革命')).toBe(false);
    expect(isCorrectAnswer('・', 'フランス革命')).toBe(false);
  });
});
