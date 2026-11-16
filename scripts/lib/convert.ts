// CSV の行 → 問題データ・教科書データへの変換。
// 見出し（1行目）は日本語でも英語でもよい（COLUMNS の別名を参照）。

import { kanjiNumberToArabic } from '../../src/lib/normalize';
import { LEVELS, type Chapter, type Level, type Question, type Section, type Subject, type Textbook } from '../../src/lib/types';
import { isBlankRow } from './csv';

export interface ConvertIssue {
  level: 'error' | 'warning';
  /** CSV の行番号（1 始まり） */
  line?: number;
  message: string;
}

export interface ConvertResult<T> {
  /** エラーがあれば null */
  value: T | null;
  issues: ConvertIssue[];
}

export const QUESTION_COLUMNS = {
  id: ['id', '問題id'],
  subject: ['subject', '科目'],
  question: ['question', '問題文', '問題'],
  answer: ['answer', '答え', '解答', '正解'],
  reading: ['reading', '読み', 'よみ', '読み方', 'ふりがな'],
  alternatives: ['alternatives', '別解'],
  explanation: ['explanation', '解説'],
  yearStart: ['year_start', 'yearstart', '開始年', '年'],
  yearEnd: ['year_end', 'yearend', '終了年'],
  regions: ['regions', '地域', '地域タグ'],
  themes: ['themes', 'テーマ', 'テーマタグ'],
  level: ['level', 'importance', '重要度'],
  verified: ['verified', '確認済み', '確認済', '確認'],
  memo: ['memo', 'note', 'メモ', '備考'],
} as const;

export const TEXTBOOK_COLUMNS = {
  textbookId: ['textbook_id', 'textbookid', '教科書id'],
  subject: ['subject', '科目'],
  name: ['name', 'textbook_name', '教科書名'],
  publisher: ['publisher', '出版社', '発行者'],
  description: ['description', '説明'],
  source: ['source', '出典'],
  order: ['order', '並び順', '表示順'],
  part: ['part', '部', '編'],
  chapterNo: ['chapter', 'chapter_no', '章番号', '章'],
  chapterLabel: ['chapter_label', '章の表示名', '章表示名'],
  chapterTitle: ['chapter_title', '章見出し', '章タイトル'],
  sectionNo: ['section', 'section_no', '節番号', '節'],
  sectionLabel: ['section_label', '節の表示名', '節表示名'],
  sectionTitle: ['section_title', '節見出し', '節タイトル'],
  pages: ['pages', 'ページ'],
  questionIds: ['question_ids', 'questions', '問題id', '問題'],
} as const;

const REQUIRED_QUESTION_COLUMNS = ['id', 'subject', 'question', 'answer', 'level'] as const;
const REQUIRED_TEXTBOOK_COLUMNS = ['chapterNo', 'chapterTitle', 'sectionNo', 'sectionTitle', 'questionIds'] as const;

const normalizeHeader = (h: string) => h.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '_');

/** 見出し行から「項目名 → 列番号」を作る */
function mapColumns<K extends string>(
  header: readonly string[],
  columns: Record<K, readonly string[]>,
  issues: ConvertIssue[],
): Partial<Record<K, number>> {
  const result: Partial<Record<K, number>> = {};
  const unknown: string[] = [];
  header.forEach((raw, index) => {
    const h = normalizeHeader(raw);
    if (h === '') return;
    const key = (Object.keys(columns) as K[]).find((k) => columns[k].some((alias) => normalizeHeader(alias) === h));
    if (!key) unknown.push(raw.trim());
    else if (result[key] !== undefined) issues.push({ level: 'error', line: 1, message: `見出し「${raw.trim()}」が重複しています` });
    else result[key] = index;
  });
  if (unknown.length > 0) {
    issues.push({ level: 'warning', line: 1, message: `使われない見出しがあります（無視します）: ${unknown.join('、')}` });
  }
  return result;
}

const cell = (row: readonly string[], index: number | undefined): string =>
  index === undefined ? '' : (row[index] ?? '').trim();

/** 区切り文字で分けて空を除く */
const splitList = (value: string, separator: RegExp): string[] =>
  value
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s !== '');

const ALT_SEPARATOR = /[|｜]/;
const TAG_SEPARATOR = /[|｜、,，/／]/;
const ID_LIST_SEPARATOR = /[\s|｜、,，]+/;
/** 問題IDのまとめ書き（"w-0102-*" → w-0102- で始まる問題すべて） */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*\*$/;
const APPROX_YEAR = /^(約|c\.|ca\.)|(ごろ|頃|ころ|万年前)$/i;

/** "前3000ごろ" "約1500年" のように、おおよその年として書かれているか */
export function isApproxYear(value: string): boolean {
  return APPROX_YEAR.test(value.normalize('NFKC').trim().replace(/\s+/g, ''));
}

/** "前221" "紀元前221年" "-221" "1789年" "1800ごろ" "約700万年前" → 数値。空なら undefined、読めなければ null */
export function parseYear(value: string): number | undefined | null {
  let s = value.normalize('NFKC').trim().replace(/\s+/g, '');
  if (s === '') return undefined;
  s = s.replace(/^(約|c\.|ca\.)/i, '').replace(/(年)?(ごろ|頃|ころ)?$/, '');
  // 人類の進化など（"700万年前" "1.5万年前"）。現在からの年数をそのまま負の年として扱う
  let m = s.match(/^(\d{1,4}(?:\.\d)?)万年前$/);
  if (m) return -Math.round(Number(m[1]) * 10000);
  m = s.match(/^(?:紀元前|前|bc|b\.c\.)(\d{1,8})$/i);
  if (m) return -Number(m[1]);
  m = s.match(/^(-?)(\d{1,8})$/);
  if (m) return Number(m[2]) * (m[1] ? -1 : 1);
  return null;
}

const LEVEL_ALIASES: Record<string, Level> = {
  基本: 'basic',
  basic: 'basic',
  '1': 'basic',
  標準: 'standard',
  standard: 'standard',
  '2': 'standard',
  発展: 'advanced',
  advanced: 'advanced',
  '3': 'advanced',
};

export function parseLevel(value: string): Level | null {
  const s = value.normalize('NFKC').trim().toLowerCase();
  if ((LEVELS as readonly string[]).includes(s)) return s as Level;
  return LEVEL_ALIASES[s] ?? null;
}

const TRUE_VALUES = ['true', '1', 'yes', 'y', 'ok', '○', '◯', '〇', '✓', '✔', '済', '確認済', '確認済み', 'はい'];
const FALSE_VALUES = ['', 'false', '0', 'no', 'n', '×', '✕', '✗', '未', '未確認', 'いいえ'];

/** 確認済みフラグ。空欄は false（未確認）。読めない値は null */
export function parseVerified(value: string): boolean | null {
  const s = value.normalize('NFKC').trim().toLowerCase();
  if (TRUE_VALUES.includes(s)) return true;
  if (FALSE_VALUES.includes(s)) return false;
  return null;
}

/** 科目名・短い名前・ID のどれでも科目IDにする */
export function resolveSubjectId(value: string, subjects: readonly Subject[]): string | null {
  const s = value.normalize('NFKC').trim();
  const found = subjects.find((sub) => sub.id === s || sub.name === s || sub.shortName === s);
  return found ? found.id : null;
}

/** 問題CSVの行を問題データにする */
export function convertQuestionRows(
  rows: readonly string[][],
  lines: readonly number[],
  ctx: { subjects: readonly Subject[] },
): ConvertResult<Question[]> {
  const issues: ConvertIssue[] = [];
  if (rows.length === 0) return { value: [], issues };
  const col = mapColumns(rows[0], QUESTION_COLUMNS, issues);
  const missing = REQUIRED_QUESTION_COLUMNS.filter((k) => col[k] === undefined);
  if (missing.length > 0) {
    const names = missing.map((k) => QUESTION_COLUMNS[k].find((a) => /[^\x00-\x7f]/.test(a)) ?? k);
    issues.push({ level: 'error', line: 1, message: `必須の見出しがありません: ${names.join('、')}` });
    return { value: null, issues };
  }

  const questions: Question[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = lines[i];
    if (isBlankRow(row)) continue;
    const err = (message: string) => issues.push({ level: 'error', line, message });
    const warn = (message: string) => issues.push({ level: 'warning', line, message });

    const id = cell(row, col.id).normalize('NFKC');
    const subjectRaw = cell(row, col.subject);
    const subject = resolveSubjectId(subjectRaw, ctx.subjects);
    if (subjectRaw === '') err('科目が空です');
    else if (!subject) err(`科目「${subjectRaw}」は data/subjects.json にありません`);

    const yearStartRaw = cell(row, col.yearStart);
    const yearEndRaw = cell(row, col.yearEnd);
    const yearStart = parseYear(yearStartRaw);
    const yearEnd = parseYear(yearEndRaw);
    if (yearStart === null) err(`開始年「${yearStartRaw}」を年として読めません（例: 1789、前221）`);
    if (yearEnd === null) err(`終了年「${yearEndRaw}」を年として読めません（例: 1799、前202）`);

    const levelRaw = cell(row, col.level);
    const level = parseLevel(levelRaw);
    if (levelRaw === '') err('重要度が空です（基本・標準・発展のどれか）');
    else if (!level) err(`重要度「${levelRaw}」は使えません（基本・標準・発展のどれか）`);

    const verifiedRaw = cell(row, col.verified);
    let verified = parseVerified(verifiedRaw);
    if (verified === null) {
      warn(`確認済み「${verifiedRaw}」を読めないため、未確認（false）として扱います`);
      verified = false;
    }

    const memo = cell(row, col.memo);
    const reading = cell(row, col.reading);
    const yearApprox = typeof yearStart === 'number' && (isApproxYear(yearStartRaw) || isApproxYear(yearEndRaw));
    questions.push({
      id,
      subject: subject ?? subjectRaw,
      question: cell(row, col.question),
      answer: cell(row, col.answer),
      ...(reading ? { reading } : {}),
      alternatives: splitList(cell(row, col.alternatives), ALT_SEPARATOR),
      explanation: cell(row, col.explanation),
      ...(typeof yearStart === 'number' ? { yearStart } : {}),
      ...(typeof yearEnd === 'number' ? { yearEnd } : {}),
      ...(yearApprox ? { yearApprox } : {}),
      regions: splitList(cell(row, col.regions).normalize('NFKC'), TAG_SEPARATOR),
      themes: splitList(cell(row, col.themes).normalize('NFKC'), TAG_SEPARATOR),
      level: level ?? 'basic',
      verified,
      ...(memo ? { memo } : {}),
    });
  }
  const hasError = issues.some((i) => i.level === 'error');
  return { value: hasError ? null : questions, issues };
}

/** "3" "第3章" "第三章" "序章" → 3 / 0。読めなければ null */
export function parseUnitNumber(value: string): number | null {
  const s = value.normalize('NFKC').trim().replace(/\s+/g, '');
  if (s === '序' || s === '序章') return 0;
  const m = s.match(/^第?([0-9〇一二三四五六七八九十百]+)(章|節|部|編)?$/);
  if (!m) return null;
  const n = Number(/^\d+$/.test(m[1]) ? m[1] : kanjiNumberToArabic(m[1]));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * 教科書CSVの行を教科書データにする。1ファイル = 1冊。
 * - 教科書ID・科目・教科書名・出典などは最初の行だけ書けばよい（教科書IDを省くとファイル名になる）
 * - 章番号・節番号が空の行は、前の行と同じ章・節として扱う（1行に1問ずつ書く書き方もできる）
 * - 問題IDは1つのセルに空白・「|」・「、」区切りで複数書いてよい
 * - 問題IDの最後を * にすると、その文字で始まる問題すべてになる（"w-0102-*"。ctx.questionIds が必要）
 */
export function convertTextbookRows(
  rows: readonly string[][],
  lines: readonly number[],
  ctx: { subjects: readonly Subject[]; fileStem: string; /** すべての問題ID（ID 順）。まとめ書きの展開に使う */ questionIds?: readonly string[] },
): ConvertResult<Textbook> {
  const issues: ConvertIssue[] = [];
  if (rows.length < 2) {
    issues.push({ level: 'error', message: '見出し行と、1行以上のデータが必要です' });
    return { value: null, issues };
  }
  const col = mapColumns(rows[0], TEXTBOOK_COLUMNS, issues);
  const missing = REQUIRED_TEXTBOOK_COLUMNS.filter((k) => col[k] === undefined);
  if (missing.length > 0) {
    const names = missing.map((k) => TEXTBOOK_COLUMNS[k].find((a) => /[^\x00-\x7f]/.test(a)) ?? k);
    issues.push({ level: 'error', line: 1, message: `必須の見出しがありません: ${names.join('、')}` });
    return { value: null, issues };
  }

  const meta: Record<'textbookId' | 'subject' | 'name' | 'publisher' | 'description' | 'source' | 'order', string> = {
    textbookId: '',
    subject: '',
    name: '',
    publisher: '',
    description: '',
    source: '',
    order: '',
  };
  const metaLabels = { textbookId: '教科書ID', subject: '科目', name: '教科書名', publisher: '出版社', description: '説明', source: '出典', order: '並び順' };

  const chapters: Chapter[] = [];
  let chapter: Chapter | undefined;
  let section: Section | undefined;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const line = lines[i];
    if (isBlankRow(row)) continue;
    const err = (message: string) => issues.push({ level: 'error', line, message });

    for (const key of Object.keys(meta) as (keyof typeof meta)[]) {
      const v = cell(row, col[key]);
      if (v === '') continue;
      if (meta[key] === '') meta[key] = v;
      else if (meta[key] !== v) err(`${metaLabels[key]}が前の行と違います（1つのCSVには1冊分だけ書きます）`);
    }

    const chapterRaw = cell(row, col.chapterNo);
    if (chapterRaw !== '') {
      const no = parseUnitNumber(chapterRaw);
      if (no === null) {
        err(`章番号「${chapterRaw}」を数として読めません`);
        continue;
      }
      if (chapter?.no !== no) {
        if (chapters.some((c) => c.no === no)) {
          err(`第${no}章が離れた行に分かれています（同じ章の行は続けて書きます）`);
          continue;
        }
        chapter = { no, title: '', sections: [] };
        chapters.push(chapter);
        section = undefined;
      }
    } else if (!chapter) {
      err('最初のデータ行には章番号が必要です');
      continue;
    }
    const ch = chapter!;

    const setOnce = (target: { [k: string]: unknown }, key: string, value: string, label: string) => {
      if (value === '') return;
      if (target[key] === undefined || target[key] === '') target[key] = value;
      else if (target[key] !== value) err(`${label}が同じ章・節の前の行と違います（「${String(target[key])}」と「${value}」）`);
    };
    setOnce(ch as unknown as Record<string, unknown>, 'title', cell(row, col.chapterTitle), '章見出し');
    setOnce(ch as unknown as Record<string, unknown>, 'label', cell(row, col.chapterLabel), '章の表示名');
    setOnce(ch as unknown as Record<string, unknown>, 'part', cell(row, col.part), '部');

    const sectionRaw = cell(row, col.sectionNo);
    if (sectionRaw !== '') {
      const no = parseUnitNumber(sectionRaw);
      if (no === null) {
        err(`節番号「${sectionRaw}」を数として読めません`);
        continue;
      }
      if (section?.no !== no || !ch.sections.includes(section)) {
        if (ch.sections.some((s) => s.no === no)) {
          err(`第${ch.no}章 第${no}節が離れた行に分かれています（同じ節の行は続けて書きます）`);
          continue;
        }
        section = { no, title: '', questionIds: [] };
        ch.sections.push(section);
      }
    } else if (!section || !ch.sections.includes(section)) {
      err('節番号がありません（章が変わった最初の行には節番号が必要です）');
      continue;
    }
    const sec = section!;
    setOnce(sec as unknown as Record<string, unknown>, 'title', cell(row, col.sectionTitle), '節見出し');
    setOnce(sec as unknown as Record<string, unknown>, 'label', cell(row, col.sectionLabel), '節の表示名');
    setOnce(sec as unknown as Record<string, unknown>, 'pages', cell(row, col.pages), 'ページ');
    for (const token of splitList(cell(row, col.questionIds).normalize('NFKC'), ID_LIST_SEPARATOR)) {
      if (!token.includes('*')) {
        sec.questionIds.push(token);
        continue;
      }
      if (!ID_PATTERN.test(token)) {
        err(`問題ID「${token}」: * は最後に1つだけ書けます（例: w-0102-*）`);
        continue;
      }
      if (!ctx.questionIds) {
        err(`問題ID「${token}」: まとめ書き（*）は、問題データと一緒に変換するときだけ使えます（npm run data）`);
        continue;
      }
      const prefix = token.slice(0, -1);
      const matched = ctx.questionIds.filter((id) => id.startsWith(prefix) && !sec.questionIds.includes(id));
      if (matched.length === 0) issues.push({ level: 'warning', line, message: `問題ID「${token}」に当てはまる問題がありません` });
      sec.questionIds.push(...matched);
    }
  }

  for (const ch of chapters) {
    if (!ch.title) issues.push({ level: 'error', message: `第${ch.no}章の章見出しがありません` });
    for (const s of ch.sections) {
      if (!s.title) issues.push({ level: 'error', message: `第${ch.no}章 第${s.no}節の節見出しがありません` });
    }
  }

  const subject = resolveSubjectId(meta.subject, ctx.subjects);
  if (meta.subject === '') issues.push({ level: 'error', message: '科目がありません（最初のデータ行に書きます）' });
  else if (!subject) issues.push({ level: 'error', message: `科目「${meta.subject}」は data/subjects.json にありません` });
  if (meta.name === '') issues.push({ level: 'error', message: '教科書名がありません（最初のデータ行に書きます）' });
  let order: number | undefined;
  if (meta.order !== '') {
    order = Number(meta.order.normalize('NFKC'));
    if (!Number.isFinite(order)) issues.push({ level: 'error', message: `並び順「${meta.order}」は数ではありません` });
  }

  if (issues.some((i) => i.level === 'error')) return { value: null, issues };

  const textbook: Textbook = {
    id: (meta.textbookId || ctx.fileStem).normalize('NFKC'),
    subject: subject!,
    name: meta.name,
    ...(meta.publisher ? { publisher: meta.publisher } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.source ? { source: meta.source } : {}),
    ...(order !== undefined ? { order } : {}),
    chapters: chapters.map((ch) => ({
      no: ch.no,
      ...(ch.label ? { label: ch.label } : {}),
      title: ch.title,
      ...(ch.part ? { part: ch.part } : {}),
      sections: ch.sections.map((s) => ({
        no: s.no,
        ...(s.label ? { label: s.label } : {}),
        title: s.title,
        ...(s.pages ? { pages: s.pages } : {}),
        questionIds: s.questionIds,
      })),
    })),
  };
  return { value: textbook, issues };
}
