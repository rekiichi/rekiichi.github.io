// データの検証。読み込んだ JSON をそのまま（型を信用せずに）調べる。
// エラーが1件でもあればビルドを止める。警告は表示だけ。

import { normalizeAnswer } from '../../src/lib/normalize';
import { LEVELS } from '../../src/lib/types';
import { RESERVED_TEXTBOOK_IDS } from '../../src/lib/url';

export interface Issue {
  level: 'error' | 'warning';
  /** プロジェクトからの相対パス */
  file?: string;
  /** 問題ID・教科書IDなど */
  id?: string;
  message: string;
}

export interface DataFile {
  file: string;
  data: unknown;
}

export interface DataSet {
  subjects: DataFile;
  taxonomy: DataFile;
  questionFiles: DataFile[];
  textbooks: DataFile[];
}

/** ページの URL と重なるため科目IDに使えない名前 */
export const RESERVED_SUBJECT_IDS = ['practice', 'my', 'guide', 'articles', 'privacy', 'contact', 'about', 'data'];

const QUESTION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** 「短い解説」の目安（超えたら警告） */
export const EXPLANATION_MAX = 120;
const TAG_SEPARATORS = /[|｜、,，/／]/;
/** 読みに使える文字（かな・長音・中黒・イコール・空白） */
const READING = /^[\u3041-\u3096\u30A1-\u30FAー・=＝\s]+$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

interface QuestionInfo {
  file: string;
  subject: string;
  verified: boolean;
}

export function validateData(ds: DataSet): Issue[] {
  const issues: Issue[] = [];
  const error = (file: string | undefined, id: string | undefined, message: string) =>
    issues.push({ level: 'error', file, id, message });
  const warn = (file: string | undefined, id: string | undefined, message: string) =>
    issues.push({ level: 'warning', file, id, message });

  // ---- 科目 ----
  const subjectAxis = new Map<string, 'region' | 'theme'>();
  const subjectPeriods = new Map<string, [number, number][]>();
  {
    const { file, data } = ds.subjects;
    if (!Array.isArray(data) || data.length === 0) {
      error(file, undefined, '科目の配列が必要です');
    } else {
      data.forEach((s, i) => {
        const where = `${i + 1}番目の科目`;
        if (!isObj(s)) return error(file, undefined, `${where}がオブジェクトではありません`);
        const id = s.id;
        if (!isStr(id) || !SLUG.test(id)) return error(file, String(id), `${where}: id は半角英小文字・数字・ハイフンで書きます`);
        if (subjectAxis.has(id)) error(file, id, '科目IDが重複しています');
        if (RESERVED_SUBJECT_IDS.includes(id)) error(file, id, `科目IDに「${id}」は使えません（ページのURLと重なります）`);
        for (const key of ['name', 'shortName', 'description'] as const) {
          if (!isNonEmptyStr(s[key])) error(file, id, `${key} が空です`);
        }
        if (s.verticalAxis !== 'region' && s.verticalAxis !== 'theme') {
          error(file, id, 'verticalAxis は "region"（地域）か "theme"（テーマ）です');
        } else {
          subjectAxis.set(id, s.verticalAxis);
        }
        if (!Array.isArray(s.periods)) return error(file, id, 'periods（横割りの時代区分）の配列が必要です');
        const slugs = new Set<string>();
        let prevEnd: number | null = null;
        const ranges: [number, number][] = [];
        s.periods.forEach((p: unknown, j: number) => {
          if (!isObj(p)) return error(file, id, `periods の${j + 1}番目がオブジェクトではありません`);
          if (!isStr(p.slug) || !SLUG.test(p.slug)) error(file, id, `periods の${j + 1}番目: slug は半角英小文字・数字・ハイフンで書きます`);
          else if (slugs.has(p.slug)) error(file, id, `時代区分の slug「${p.slug}」が重複しています`);
          else slugs.add(p.slug);
          if (!isNonEmptyStr(p.name)) error(file, id, `periods の${j + 1}番目: name が空です`);
          if (p.start !== undefined && !isInt(p.start)) error(file, id, `時代区分「${String(p.name)}」の start は整数です`);
          if (p.end !== undefined && !isInt(p.end)) error(file, id, `時代区分「${String(p.name)}」の end は整数です`);
          if (isInt(p.start) && isInt(p.end) && p.start > p.end) error(file, id, `時代区分「${String(p.name)}」は start ≦ end にします`);
          // 前の区分の終わり（上限なしは +∞）より後に始まっていること
          const start = isInt(p.start) ? p.start : Number.NEGATIVE_INFINITY;
          if (j > 0 && (prevEnd === null || start <= prevEnd)) {
            error(file, id, `時代区分「${String(p.name)}」が前の区分と重なっています（古い順に、重ならないように並べます）`);
          }
          const end = isInt(p.end) ? p.end : Number.POSITIVE_INFINITY;
          prevEnd = end === Number.POSITIVE_INFINITY ? null : end;
          ranges.push([start, end]);
        });
        subjectPeriods.set(id, ranges);
      });
    }
  }

  // ---- タグ ----
  const tagNames: Record<'regions' | 'themes', Set<string>> = { regions: new Set(), themes: new Set() };
  {
    const { file, data } = ds.taxonomy;
    if (!isObj(data)) {
      error(file, undefined, 'regions と themes を持つオブジェクトが必要です');
    } else {
      for (const kind of ['regions', 'themes'] as const) {
        const list = data[kind];
        if (!Array.isArray(list)) {
          error(file, undefined, `${kind} の配列が必要です`);
          continue;
        }
        const slugs = new Set<string>();
        list.forEach((t: unknown, i: number) => {
          if (!isObj(t) || !isNonEmptyStr(t.name) || !isStr(t.slug)) {
            return error(file, undefined, `${kind} の${i + 1}番目には slug と name が必要です`);
          }
          if (!SLUG.test(t.slug)) error(file, t.name, `slug「${t.slug}」は半角英小文字・数字・ハイフンで書きます`);
          if (slugs.has(t.slug)) error(file, t.name, `slug「${t.slug}」が重複しています`);
          if (tagNames[kind].has(t.name)) error(file, t.name, 'タグ名が重複しています');
          if (TAG_SEPARATORS.test(t.name)) error(file, t.name, 'タグ名に区切り文字（| 、 , /）は使えません');
          if (t.note !== undefined && !isNonEmptyStr(t.note)) error(file, t.name, 'note（補足）は文字列です');
          slugs.add(t.slug);
          tagNames[kind].add(t.name);
        });
      }
    }
  }

  // ---- 問題 ----
  const questions = new Map<string, QuestionInfo>();
  const seenText = new Map<string, string>();
  for (const { file, data } of ds.questionFiles) {
    const list = isObj(data) ? data.questions : undefined;
    if (!Array.isArray(list)) {
      error(file, undefined, '{ "questions": [...] } の形が必要です');
      continue;
    }
    list.forEach((q: unknown, i: number) => {
      if (!isObj(q)) return error(file, undefined, `${i + 1}番目の問題がオブジェクトではありません`);
      const id = q.id;
      if (!isStr(id) || id === '') return error(file, undefined, `${i + 1}番目の問題: ID が空です`);
      if (!QUESTION_ID.test(id)) error(file, id, 'ID は半角英数字・ハイフン・アンダースコアで書きます（64文字まで）');
      const dup = questions.get(id);
      if (dup) error(file, id, `ID が重複しています（${dup.file} にもあります）`);

      const subject = q.subject;
      if (!isStr(subject) || !subjectAxis.has(subject)) error(file, id, `科目「${String(subject)}」は data/subjects.json にありません`);
      if (!isNonEmptyStr(q.question)) error(file, id, '問題文が空です');
      if (!isNonEmptyStr(q.answer)) error(file, id, '答えが空です');
      if (!isStrArray(q.alternatives)) error(file, id, 'alternatives（別解）は文字列の配列です');
      if (q.reading !== undefined) {
        if (!isNonEmptyStr(q.reading)) error(file, id, 'reading（読み）は文字列です');
        else if (!READING.test(q.reading)) warn(file, id, `読み「${q.reading}」にかな以外の文字があります（ひらがなで書きます）`);
      }
      if (!isStr(q.explanation)) error(file, id, 'explanation（解説）は文字列です');
      else if ([...q.explanation].length > EXPLANATION_MAX) {
        warn(file, id, `解説が長めです（${[...q.explanation].length}字。目安は${EXPLANATION_MAX}字以内）`);
      }
      if (!(LEVELS as readonly unknown[]).includes(q.level)) error(file, id, '重要度は basic・standard・advanced（基本・標準・発展）のどれかです');
      if (typeof q.verified !== 'boolean') error(file, id, 'verified（確認済み）は true か false です');

      if (q.yearStart !== undefined && !isInt(q.yearStart)) error(file, id, '開始年は整数です（紀元前は負の数）');
      if (q.yearEnd !== undefined && !isInt(q.yearEnd)) error(file, id, '終了年は整数です（紀元前は負の数）');
      if (q.yearEnd !== undefined && q.yearStart === undefined) error(file, id, '終了年だけがあります（開始年を書きます）');
      if (isInt(q.yearStart) && isInt(q.yearEnd) && q.yearEnd < q.yearStart) error(file, id, '終了年が開始年より前です');
      if (q.yearApprox !== undefined && typeof q.yearApprox !== 'boolean') error(file, id, 'yearApprox（年代がおおよそか）は true か false です');
      if (q.yearApprox === true && q.yearStart === undefined) error(file, id, 'yearApprox だけがあります（開始年を書きます）');

      for (const kind of ['regions', 'themes'] as const) {
        const tags = q[kind];
        if (!isStrArray(tags)) {
          error(file, id, `${kind === 'regions' ? '地域' : 'テーマ'}は文字列の配列です`);
          continue;
        }
        for (const t of tags) {
          if (!tagNames[kind].has(t)) error(file, id, `${kind === 'regions' ? '地域' : 'テーマ'}タグ「${t}」は data/taxonomy.json にありません`);
        }
      }

      const verified = q.verified === true;
      if (verified && isStr(subject) && subjectAxis.has(subject)) {
        if (q.yearStart === undefined) warn(file, id, '開始年がないため、受験復習モードの「横割り」に出ません');
        else if (isInt(q.yearStart) && !(subjectPeriods.get(subject) ?? []).some(([a, b]) => a <= (q.yearStart as number) && (q.yearStart as number) <= b)) {
          warn(file, id, `開始年 ${q.yearStart} がどの時代区分にも入らないため、「横割り」に出ません`);
        }
        const axis = subjectAxis.get(subject)!;
        const axisTags = axis === 'region' ? q.regions : q.themes;
        if (isStrArray(axisTags) && axisTags.length === 0) {
          warn(file, id, `${axis === 'region' ? '地域' : 'テーマ'}タグがないため、受験復習モードの「縦割り」に出ません`);
        }
      }
      if (verified && isNonEmptyStr(q.question) && isNonEmptyStr(q.answer) && [...q.answer].length >= 2 && q.question.includes(q.answer)) {
        warn(file, id, '問題文に答えがそのまま含まれています');
      }
      if (isNonEmptyStr(q.question) && isStr(subject)) {
        const key = `${subject}\u0000${normalizeAnswer(q.question)}`;
        const other = seenText.get(key);
        if (other) warn(file, id, `問題文が「${other}」と同じです（重複していませんか）`);
        else seenText.set(key, id);
      }

      if (!dup) questions.set(id, { file, subject: isStr(subject) ? subject : '', verified });
    });
  }

  // ---- 教科書 ----
  const textbookIds = new Map<string, string>();
  const referenced = new Set<string>();
  for (const { file, data: tb } of ds.textbooks) {
    if (!isObj(tb)) {
      error(file, undefined, '教科書のオブジェクトが必要です');
      continue;
    }
    const id = tb.id;
    if (!isStr(id) || !SLUG.test(id)) {
      error(file, String(id), '教科書ID は半角英小文字・数字・ハイフンで書きます（URL に使います）');
    } else {
      const dup = textbookIds.get(id);
      if (dup) error(file, id, `教科書IDが重複しています（${dup} にもあります）`);
      textbookIds.set(id, file);
      if (RESERVED_TEXTBOOK_IDS.includes(id)) error(file, id, `教科書IDに「${id}」は使えません（ページのURLと重なります）`);
    }
    const tbId = isStr(id) ? id : undefined;
    const subject = tb.subject;
    if (!isStr(subject) || !subjectAxis.has(subject)) error(file, tbId, `科目「${String(subject)}」は data/subjects.json にありません`);
    if (!isNonEmptyStr(tb.name)) error(file, tbId, '教科書名（name）が空です');
    if (tb.order !== undefined && typeof tb.order !== 'number') error(file, tbId, 'order（並び順）は数です');
    if (tb.source !== undefined && !isNonEmptyStr(tb.source)) error(file, tbId, 'source（出典）は文字列です');
    if (!Array.isArray(tb.chapters)) {
      error(file, tbId, 'chapters（章）の配列が必要です');
      continue;
    }
    if (tb.chapters.length === 0) warn(file, tbId, '章がありません');

    const inTextbook = new Map<string, string>();
    const emptySections: string[] = [];
    let prevChapter = -1;
    const chapterNos = new Set<number>();
    tb.chapters.forEach((ch: unknown, ci: number) => {
      if (!isObj(ch)) return error(file, tbId, `${ci + 1}番目の章がオブジェクトではありません`);
      if (!isInt(ch.no) || ch.no < 0) return error(file, tbId, `${ci + 1}番目の章: 章番号（no）は0以上の整数です`);
      const chName = `第${ch.no}章`;
      if (chapterNos.has(ch.no)) error(file, tbId, `${chName}が重複しています`);
      else if (ch.no < prevChapter) error(file, tbId, `${chName}: 章は番号の小さい順に並べます`);
      chapterNos.add(ch.no);
      prevChapter = Math.max(prevChapter, ch.no);
      if (!isNonEmptyStr(ch.title)) error(file, tbId, `${chName}の見出し（title）が空です`);
      if (ch.label !== undefined && !isNonEmptyStr(ch.label)) error(file, tbId, `${chName}の label は文字列です`);
      if (ch.part !== undefined && !isNonEmptyStr(ch.part)) error(file, tbId, `${chName}の part は文字列です`);
      if (!Array.isArray(ch.sections)) return error(file, tbId, `${chName}の sections（節）の配列が必要です`);
      if (ch.sections.length === 0) warn(file, tbId, `${chName}に節がありません`);

      let prevSection = -1;
      const sectionNos = new Set<number>();
      ch.sections.forEach((s: unknown, si: number) => {
        if (!isObj(s)) return error(file, tbId, `${chName}の${si + 1}番目の節がオブジェクトではありません`);
        if (!isInt(s.no) || s.no < 0) return error(file, tbId, `${chName}の${si + 1}番目の節: 節番号（no）は0以上の整数です`);
        const where = `${chName} 第${s.no}節`;
        if (sectionNos.has(s.no)) error(file, tbId, `${where}が重複しています`);
        else if (s.no < prevSection) error(file, tbId, `${where}: 節は番号の小さい順に並べます`);
        sectionNos.add(s.no);
        prevSection = Math.max(prevSection, s.no);
        if (!isNonEmptyStr(s.title)) error(file, tbId, `${where}の見出し（title）が空です`);
        if (s.pages !== undefined && !isStr(s.pages)) error(file, tbId, `${where}の pages は文字列です`);
        if (!isStrArray(s.questionIds)) return error(file, tbId, `${where}の questionIds（問題IDの一覧）は文字列の配列です`);

        let published = 0;
        for (const qid of s.questionIds) {
          const info = questions.get(qid);
          if (!info) {
            error(file, tbId, `${where}: 問題ID「${qid}」は問題データにありません`);
            continue;
          }
          referenced.add(qid);
          const prev = inTextbook.get(qid);
          if (prev === where) error(file, tbId, `${where}: 問題ID「${qid}」が同じ節に2回あります`);
          else if (prev) warn(file, tbId, `問題ID「${qid}」が ${prev} と ${where} の両方にあります`);
          else inTextbook.set(qid, where);
          if (!info.verified) warn(file, tbId, `${where}: 問題「${qid}」は未確認のため公開されません`);
          else published += 1;
          if (isStr(subject) && info.subject && info.subject !== subject) {
            warn(file, tbId, `${where}: 問題「${qid}」は別の科目（${info.subject}）の問題です`);
          }
        }
        if (published === 0) emptySections.push(where);
      });
    });
    // 問題の入力が途中の教科書では多くなるので、教科書ごとに1件にまとめる
    if (emptySections.length > 0) {
      const shown = emptySections.slice(0, 10).join('、') + (emptySections.length > 10 ? ' ほか' : '');
      warn(file, tbId, `公開される問題がない節が${emptySections.length}個あります（「準備中」と表示します）: ${shown}`);
    }
  }

  // ---- 教科書に載っていない問題（縦割り・横割りには出る） ----
  const orphans = new Map<string, string[]>();
  for (const [id, info] of questions) {
    if (!info.verified || referenced.has(id)) continue;
    const list = orphans.get(info.subject) ?? [];
    list.push(id);
    orphans.set(info.subject, list);
  }
  for (const [subject, ids] of orphans) {
    const shown = ids.slice(0, 10).join(', ') + (ids.length > 10 ? ' ほか' : '');
    warn(undefined, subject, `どの教科書にも載っていない確認済みの問題が${ids.length}問あります（受験復習モードには出ます）: ${shown}`);
  }

  return issues;
}

/** 表示用に1行にする */
export function formatIssue(issue: Issue): string {
  const where = [issue.file, issue.id ? `[${issue.id}]` : undefined].filter(Boolean).join(' ');
  return `${where ? `${where}: ` : ''}${issue.message}`;
}
