// 入力モードの正誤判定。表記ゆれを吸収してから比較する。
//
// 吸収するもの:
// - 全角・半角（英数字・記号・半角カナ）… NFKC 正規化
// - 英字の大文字・小文字
// - ひらがな・カタカナ
// - 中黒（・）、イコール（＝）、スペースの有無
// - かっこ・かぎかっこ・句読点（「」『』（）、。など）
// - ハイフン類（- ‐ − など）… 区切りとして消した形と、長音「ー」として読んだ形の両方で比べる
// - 漢数字と算用数字（第一次／第1次、三十年戦争／30年戦争）
// - ヴ表記（ヴェルサイユ／ベルサイユ）
// - 漢字・数字にはさまれた「ヶ・ケ・ヵ・カ・箇」（関ヶ原／関ケ原、十四ヵ条／14か条／十四箇条）
//
// 吸収しないもの（必要なら問題データの「別解」に書く）:
// - 漢字の異体字（澤／沢 など）、ローマ数字
// - 「大化改新／大化の改新」のような語の有無、送りがなの違い
// - 漢字で書く答えのひらがな書き（定期テストでは漢字で書けることが大切なため）

const KATAKANA = /[ァ-ヶヽヾ]/g;
const VU = [
  [/ゔぁ/g, 'ば'],
  [/ゔぃ/g, 'び'],
  [/ゔぇ/g, 'べ'],
  [/ゔぉ/g, 'ぼ'],
  [/ゔ/g, 'ぶ'],
] as const;
/** 区切り・かっこ・句読点（NFKC 後の文字で書く。全角のかっこ等は半角になっている） */
const REMOVABLE = /[\s・·•‧∙⋅=゠、。,.!?:;'"`´‘’“”「」『』【】〔〕〘〙〖〗[\]()〈〉《》<>{}]/gu;
const WAVES = /[〜~]/g;
const DASHES = /[-‐‑‒–—―−]/g;
/** 漢字（または数字）にはさまれた か・け・ヵ・ヶ・箇（「関ヶ原」「十四ヵ条」「五箇条」など） */
const KA_BETWEEN_KANJI = /([\p{Script=Han}0-9])[かけゕゖ箇](?=\p{Script=Han})/gu;

const KANJI_DIGITS: Record<string, number> = {
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const KANJI_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const KANJI_NUMBER_RUN = /[〇一二三四五六七八九十百千]+/g;

/** 漢数字の並びを算用数字にする（"十四" → "14"、"千九百四十五" → "1945"、"一九四五" → "1945"） */
export function kanjiNumberToArabic(run: string): string {
  const chars = [...run];
  if (!chars.some((ch) => ch in KANJI_UNITS)) {
    return chars.map((ch) => String(KANJI_DIGITS[ch] ?? ch)).join('');
  }
  let total = 0;
  let current = 0;
  for (const ch of chars) {
    const unit = KANJI_UNITS[ch];
    if (unit) {
      total += (current || 1) * unit;
      current = 0;
    } else {
      current = current * 10 + (KANJI_DIGITS[ch] ?? 0);
    }
  }
  return String(total + current);
}

function normalizeBase(input: string): string {
  let s = input.normalize('NFKC').toLowerCase();
  s = s.replace(KATAKANA, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  for (const [pattern, replacement] of VU) s = s.replace(pattern, replacement);
  s = s.replace(REMOVABLE, '');
  s = s.replace(WAVES, '~');
  s = s.replace(KANJI_NUMBER_RUN, kanjiNumberToArabic);
  s = s.replace(KA_BETWEEN_KANJI, '$1か');
  s = s.replace(/ゕ/g, 'か').replace(/ゖ/g, 'け');
  return s;
}

/**
 * 比較用の形をすべて返す。ハイフン類は「区切りとして消した形」と「長音ーとみなした形」の2通り。
 * （「ルイ-フィリップ」は前者で、「ルタ-」は後者で「ルター」と一致する）
 */
export function answerVariants(input: string): string[] {
  const base = normalizeBase(input);
  const removed = base.replace(DASHES, '');
  const asChoon = base.replace(DASHES, 'ー');
  return removed === asChoon ? [removed] : [removed, asChoon];
}

/** 比較用の代表形（ハイフン類は消した形） */
export function normalizeAnswer(input: string): string {
  return answerVariants(input)[0];
}

/** 入力が答えまたは別解のどれかと一致すれば true */
export function isCorrectAnswer(input: string, answer: string, alternatives: readonly string[] = []): boolean {
  const inputForms = answerVariants(input).filter((s) => s !== '');
  if (inputForms.length === 0) return false;
  return [answer, ...alternatives].some((candidate) => {
    const forms = answerVariants(candidate);
    return inputForms.some((s) => forms.includes(s));
  });
}
