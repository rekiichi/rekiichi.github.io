// ビルド時にページが使うデータ。data/ の JSON を読み、公開する分だけに絞って整える。
// - 確認済み（verified: true）の問題だけを使う
// - site.config.ts の includeSampleData（または環境変数 INCLUDE_SAMPLE_DATA）が false なら sample- で始まる問題・教科書を除く
// - 教科書の節からは、公開しない問題IDを除く
// （検証は npm run validate がビルド前に済ませている）

import subjectsJson from '../../data/subjects.json';
import taxonomyJson from '../../data/taxonomy.json';
import { siteConfig } from '../site.config';
import { compareIds } from './natural-sort';
import { groupByPeriod, groupVertical, sortChronological, type PeriodGroup, type VerticalGroup } from './review';
import {
  isSampleId,
  LEVELS,
  type Chapter,
  type ClientQuestion,
  type ClientReview,
  type ClientTextbook,
  type Level,
  type Question,
  type QuestionFile,
  type Section,
  type Subject,
  type Tag,
  type Taxonomy,
  type Textbook,
} from './types';

const questionFiles = import.meta.glob<QuestionFile>('/data/questions/*.json', { eager: true, import: 'default' });
const textbookFiles = import.meta.glob<Textbook>('/data/textbooks/*.json', { eager: true, import: 'default' });

// 環境変数 INCLUDE_SAMPLE_DATA=false / true で site.config.ts の設定を上書きできる（本番ビルドだけサンプルを外す、など）
const envSample = process.env.INCLUDE_SAMPLE_DATA;
const includeSampleData = envSample === 'true' ? true : envSample === 'false' ? false : siteConfig.includeSampleData;
const isVisible = (id: string) => includeSampleData || !isSampleId(id);

export const subjects: Subject[] = subjectsJson as Subject[];
export const taxonomy: Taxonomy = taxonomyJson as Taxonomy;

export const questions: Question[] = Object.values(questionFiles)
  .flatMap((file) => file.questions ?? [])
  .filter((q) => q.verified === true && isVisible(q.id));

export const questionById = new Map(questions.map((q) => [q.id, q]));

export interface ResolvedSection extends Omit<Section, 'questionIds'> {
  questions: Question[];
}

export interface ResolvedChapter extends Omit<Chapter, 'sections'> {
  sections: ResolvedSection[];
  /** 章の問題（重複なし・教科書順） */
  questions: Question[];
}

export interface ResolvedTextbook extends Omit<Textbook, 'chapters' | 'generatedFrom' | '_note'> {
  chapters: ResolvedChapter[];
  /** 教科書の問題（重複なし・教科書順） */
  questions: Question[];
  sample: boolean;
}

const uniqueQuestions = (lists: Question[][]): Question[] => {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of lists.flat()) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
};

function resolveTextbook(tb: Textbook): ResolvedTextbook {
  const chapters = tb.chapters.map((ch) => {
    const sections = ch.sections.map(({ questionIds, ...rest }) => ({
      ...rest,
      questions: questionIds.map((id) => questionById.get(id)).filter((q): q is Question => q !== undefined),
    }));
    return { ...ch, sections, questions: uniqueQuestions(sections.map((s) => s.questions)) };
  });
  const { generatedFrom: _g, _note: _n, ...meta } = tb;
  return { ...meta, chapters, questions: uniqueQuestions(chapters.map((c) => c.questions)), sample: isSampleId(tb.id) };
}

export const textbooks: ResolvedTextbook[] = Object.values(textbookFiles)
  .filter((tb) => isVisible(tb.id))
  .map(resolveTextbook)
  .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name, 'ja'));

export function getSubject(id: string): Subject {
  const s = subjects.find((sub) => sub.id === id);
  if (!s) throw new Error(`科目「${id}」がありません`);
  return s;
}

export const textbooksOf = (subjectId: string) => textbooks.filter((tb) => tb.subject === subjectId);
export const questionsOf = (subjectId: string) => questions.filter((q) => q.subject === subjectId);

/** 章ページを作る章（公開する問題が1問以上ある章） */
export const publishedChapters = (tb: ResolvedTextbook) => tb.chapters.filter((ch) => ch.questions.length > 0);

/** 重要度ごとの問題数 */
export function levelCounts(list: readonly Question[]): Record<Level, number> {
  const counts = { basic: 0, standard: 0, advanced: 0 } as Record<Level, number>;
  for (const q of list) counts[q.level] += 1;
  return counts;
}

/** 「基本3・標準2・発展1」 */
export function levelSummary(list: readonly Question[]): string {
  const counts = levelCounts(list);
  const names: Record<Level, string> = { basic: '基本', standard: '標準', advanced: '発展' };
  return LEVELS.filter((l) => counts[l] > 0)
    .map((l) => `${names[l]}${counts[l]}`)
    .join('・');
}

// ---- 受験復習モード ----

export const axisTags = (subject: Subject): Tag[] => (subject.verticalAxis === 'region' ? taxonomy.regions : taxonomy.themes);

export interface SubjectReview {
  subject: Subject;
  vertical: VerticalGroup<Question>[];
  periods: PeriodGroup<Question>[];
  all: Question[];
}

const reviewCache = new Map<string, SubjectReview>();

export function reviewOf(subjectId: string): SubjectReview {
  const cached = reviewCache.get(subjectId);
  if (cached) return cached;
  const subject = getSubject(subjectId);
  const list = questionsOf(subjectId);
  const tags = axisTags(subject);
  const review: SubjectReview = {
    subject,
    vertical: groupVertical(list, tags, subject.verticalAxis),
    periods: groupByPeriod(list, subject.periods, tags, subject.verticalAxis),
    all: sortChronological(list),
  };
  reviewCache.set(subjectId, review);
  return review;
}

// ---- 出題画面に渡すデータ ----

export function toClientQuestion(q: Question): ClientQuestion {
  return {
    id: q.id,
    subject: q.subject,
    question: q.question,
    answer: q.answer,
    ...(q.reading ? { reading: q.reading } : {}),
    ...(q.alternatives.length > 0 ? { alternatives: q.alternatives } : {}),
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...(q.yearStart !== undefined ? { yearStart: q.yearStart } : {}),
    ...(q.yearEnd !== undefined && q.yearEnd !== q.yearStart ? { yearEnd: q.yearEnd } : {}),
    ...(q.yearStart !== undefined && q.yearApprox ? { yearApprox: true as const } : {}),
    level: q.level,
    ...(isSampleId(q.id) ? { sample: true as const } : {}),
  };
}

export function toClientTextbook(tb: ResolvedTextbook): ClientTextbook {
  return {
    id: tb.id,
    subject: tb.subject,
    name: tb.name,
    chapters: tb.chapters.map((ch) => ({
      no: ch.no,
      ...(ch.label ? { label: ch.label } : {}),
      title: ch.title,
      sections: ch.sections.map((s) => ({
        no: s.no,
        ...(s.label ? { label: s.label } : {}),
        title: s.title,
        ...(s.pages ? { pages: s.pages } : {}),
        q: s.questions.map((q) => [q.id, q.level] as [string, Level]),
      })),
    })),
  };
}

export function toClientReview(subjectId: string): ClientReview {
  const review = reviewOf(subjectId);
  const axis = review.subject.verticalAxis;
  const vertical = Object.fromEntries(review.vertical.map((g) => [g.tag.slug, g.questions.map((q) => q.id)]));
  return {
    subject: subjectId,
    all: review.all.map((q) => q.id),
    [axis]: vertical,
    period: Object.fromEntries(review.periods.map((g) => [g.period.slug, g.questions.map((q) => q.id)])),
  };
}

/** 問題データを分割するときの1ファイルあたりの問題数 */
export const CHUNK_SIZE = 300;

/** 問題データを ID 順に分割する（出題画面は必要なファイルだけを読む） */
export function questionChunks(): ClientQuestion[][] {
  const sorted = questions.slice().sort((a, b) => compareIds(a.id, b.id));
  const chunks: ClientQuestion[][] = [];
  for (let i = 0; i < sorted.length; i += CHUNK_SIZE) {
    chunks.push(sorted.slice(i, i + CHUNK_SIZE).map(toClientQuestion));
  }
  return chunks;
}

/** データの版。内容が変わると変わる（分割ファイルの URL に付けてキャッシュを避ける） */
export const dataVersion: string = (() => {
  const text = JSON.stringify([questions, textbooks.map((tb) => [tb.id, tb.chapters])]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
})();
