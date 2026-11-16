// テスト範囲（章・節の選択）の組み立て。
//
// URL パラメータ r の書式（カンマ区切りのトークンの和集合）:
//   3      … 第3章すべて
//   1-3    … 第1章〜第3章すべて
//   2.1    … 第2章 第1節
// 例) r=1-3,4.2 → 第1章〜第3章と第4章第2節
// r が空なら教科書の全範囲。

import type { ClientTextbook } from './types';

export interface RangeSection {
  no: number;
  label?: string;
  title?: string;
  questionIds: readonly string[];
}

export interface RangeChapter {
  no: number;
  label?: string;
  title?: string;
  sections: readonly RangeSection[];
}

export interface RangeTextbook {
  chapters: readonly RangeChapter[];
}

/** 節を表すキー。"章番号.節番号"（例: "3.2"） */
export type SectionKey = string;

export type RangeToken =
  | { kind: 'chapters'; from: number; to: number }
  | { kind: 'section'; chapter: number; section: number };

export const sectionKey = (chapterNo: number, sectionNo: number): SectionKey => `${chapterNo}.${sectionNo}`;

export function chapterLabel(chapter: { no: number; label?: string }): string {
  if (chapter.label) return chapter.label;
  return chapter.no === 0 ? '序章' : `第${chapter.no}章`;
}

export function sectionLabel(section: { no: number; label?: string }): string {
  return section.label ?? `第${section.no}節`;
}

/** r パラメータを解釈する。書式に合わないトークンは無視する */
export function parseRange(r: string | null | undefined): RangeToken[] {
  if (!r) return [];
  const tokens: RangeToken[] = [];
  for (const raw of r.split(',')) {
    const t = raw.trim();
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{1,3})$/))) {
      const n = Number(m[1]);
      tokens.push({ kind: 'chapters', from: n, to: n });
    } else if ((m = t.match(/^(\d{1,3})-(\d{1,3})$/))) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      tokens.push({ kind: 'chapters', from: Math.min(a, b), to: Math.max(a, b) });
    } else if ((m = t.match(/^(\d{1,3})\.(\d{1,3})$/))) {
      tokens.push({ kind: 'section', chapter: Number(m[1]), section: Number(m[2]) });
    }
  }
  return tokens;
}

/** 教科書の全節キー（教科書順） */
export function allSectionKeys(textbook: RangeTextbook): SectionKey[] {
  return textbook.chapters.flatMap((ch) => ch.sections.map((s) => sectionKey(ch.no, s.no)));
}

/** 問題が1問以上ある（選ぶ意味のある）節のキー。問題のない節は「準備中」として選択の判定から外す */
export function selectableSectionKeys(chapter: RangeChapter): SectionKey[] {
  return chapter.sections.filter((s) => s.questionIds.length > 0).map((s) => sectionKey(chapter.no, s.no));
}

/**
 * r パラメータ（またはトークン）を教科書の節キーの一覧にする。
 * 教科書順に並べ、重複と存在しない章・節は除く。r が空なら全範囲。
 */
export function resolveRange(textbook: RangeTextbook, r: string | readonly RangeToken[] | null | undefined): SectionKey[] {
  const tokens = typeof r === 'string' || r == null ? parseRange(r) : r;
  if (tokens.length === 0) return allSectionKeys(textbook);
  const keys: SectionKey[] = [];
  for (const ch of textbook.chapters) {
    for (const s of ch.sections) {
      const hit = tokens.some((t) =>
        t.kind === 'chapters' ? ch.no >= t.from && ch.no <= t.to : t.chapter === ch.no && t.section === s.no,
      );
      if (hit) keys.push(sectionKey(ch.no, s.no));
    }
  }
  return keys;
}

/**
 * 選んだ節の集合を、なるべく短い r パラメータにする。
 * 問題のある節がすべてそろった章は章番号に、連続する章は「1-3」にまとめる。全範囲なら空文字。
 */
export function serializeRange(textbook: RangeTextbook, selected: Iterable<SectionKey>): string {
  const set = new Set(selected);
  const all = textbook.chapters.flatMap(selectableSectionKeys);
  if (all.length > 0 && all.every((k) => set.has(k))) return '';

  const tokens: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length === 1) tokens.push(String(run[0]));
    else if (run.length > 1) tokens.push(`${run[0]}-${run[run.length - 1]}`);
    run = [];
  };
  for (const ch of textbook.chapters) {
    const keys = selectableSectionKeys(ch);
    const picked = keys.filter((k) => set.has(k));
    if (keys.length > 0 && picked.length === keys.length) {
      run.push(ch.no);
      continue;
    }
    flush();
    tokens.push(...picked);
  }
  flush();
  return tokens.join(',');
}

/** 範囲を「第1章〜第3章、第4章 第2節」のような日本語にする */
export function describeRange(textbook: RangeTextbook, selected: Iterable<SectionKey>): string {
  const set = new Set(selected);
  const all = textbook.chapters.flatMap(selectableSectionKeys);
  const pickedAll = all.filter((k) => set.has(k));
  if (pickedAll.length === 0) return '範囲なし';
  if (pickedAll.length === all.length) return '全範囲';

  const parts: string[] = [];
  let run: RangeChapter[] = [];
  const flush = () => {
    if (run.length === 1) parts.push(chapterLabel(run[0]));
    else if (run.length > 1) parts.push(`${chapterLabel(run[0])}〜${chapterLabel(run[run.length - 1])}`);
    run = [];
  };
  for (const ch of textbook.chapters) {
    const keys = new Set(selectableSectionKeys(ch));
    const picked = ch.sections.filter((s) => keys.has(sectionKey(ch.no, s.no)) && set.has(sectionKey(ch.no, s.no)));
    if (keys.size > 0 && picked.length === keys.size) {
      run.push(ch);
      continue;
    }
    flush();
    if (picked.length > 0) {
      const labels = picked.map(sectionLabel);
      // 表示名が数字だけ（「1」「2」…）のときは「第1部の1・2」のように書く
      const glue = labels.every((l) => /^\d+$/.test(l)) ? 'の' : ' ';
      // 同じ表示名の節がある章（「②」が3つの節に付いているなど）では、見出しも添えて区別する
      const allLabels = ch.sections.map(sectionLabel);
      const ambiguous = new Set(allLabels).size < allLabels.length;
      const names = ambiguous ? picked.map((s, i) => (s.title ? `${labels[i]} ${s.title}` : labels[i])) : labels;
      parts.push(`${chapterLabel(ch)}${glue}${names.join('・')}`);
    }
  }
  flush();
  return parts.join('、');
}

/** 節キーの一覧から、教科書順・重複なしの問題IDを取り出す */
export function collectQuestionIds(textbook: RangeTextbook, keys: Iterable<SectionKey>): string[] {
  const set = new Set(keys);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const ch of textbook.chapters) {
    for (const s of ch.sections) {
      if (!set.has(sectionKey(ch.no, s.no))) continue;
      for (const id of s.questionIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/** 出題画面・範囲選びに渡した教科書データ（ClientTextbook）を範囲計算用の形にする */
export function toRangeTextbook(tb: ClientTextbook): RangeTextbook {
  return {
    chapters: tb.chapters.map((ch) => ({
      ...ch,
      sections: ch.sections.map((s) => ({ ...s, questionIds: s.q.map(([id]) => id) })),
    })),
  };
}
