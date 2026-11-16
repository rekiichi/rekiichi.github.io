// サイト全体で使うデータの型。data/ 配下の JSON はこの形に従う。

export const LEVELS = ['basic', 'standard', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  basic: '基本',
  standard: '標準',
  advanced: '発展',
};

/** ID が sample- で始まるデータは開発用サンプル（site.config.ts の includeSampleData で出し分ける） */
export const SAMPLE_ID_PREFIX = 'sample-';
export const isSampleId = (id: string): boolean => id.startsWith(SAMPLE_ID_PREFIX);

/** 問題（data/questions/*.json の questions 配列の1要素） */
export interface Question {
  /** 英数字・ハイフン・アンダースコアのみ。サイト全体で一意 */
  id: string;
  /** 科目ID（data/subjects.json の id） */
  subject: string;
  question: string;
  answer: string;
  /** 答えの読み（ひらがな）。読みにくい答えにだけ書く。答えと一緒に表示する（入力の判定には使わない） */
  reading?: string;
  /** 別解（正解として扱う別の表記） */
  alternatives: string[];
  /** 短い解説 */
  explanation: string;
  /** 年代。紀元前は負の数（前221年 → -221） */
  yearStart?: number;
  yearEnd?: number;
  /** 年代がおおよそ（「◯年ごろ」）のとき true */
  yearApprox?: boolean;
  /** 地域タグ（data/taxonomy.json の regions[].name）。主なものを先頭に書く */
  regions: string[];
  /** テーマタグ（data/taxonomy.json の themes[].name）。主なものを先頭に書く */
  themes: string[];
  level: Level;
  /** false の問題はビルドに含めない */
  verified: boolean;
  /** 作成者用のメモ（サイトには表示しない） */
  memo?: string;
}

export interface QuestionFile {
  /** CSV から生成した場合の元ファイル名（手で書いた JSON にはない） */
  generatedFrom?: string;
  _note?: string;
  questions: Question[];
}

export interface Section {
  no: number;
  /** 表示名（省略時は「第◯節」） */
  label?: string;
  title: string;
  /** 教科書のページ（例: "p.12〜19"）。範囲選びの目安として表示する */
  pages?: string;
  questionIds: string[];
}

export interface Chapter {
  no: number;
  /** 表示名（省略時は「第◯章」、0 は「序章」） */
  label?: string;
  title: string;
  /** 「第1部 ○○」のような上位の区分（任意） */
  part?: string;
  sections: Section[];
}

/** 教科書（data/textbooks/*.json） */
export interface Textbook {
  generatedFrom?: string;
  _note?: string;
  /** URL に使う ID。半角英小文字・数字・ハイフンのみ */
  id: string;
  subject: string;
  /** 表示名（例: 「サンプル世界史探究」） */
  name: string;
  publisher?: string;
  description?: string;
  /** 科目ページでの並び順（小さいほど先。省略時は最後） */
  order?: number;
  /** 章立て・ページの出典（例: 教科書会社のウェブサイトの資料名と確認日）。教科書ページに表示する */
  source?: string;
  chapters: Chapter[];
}

export interface Period {
  slug: string;
  name: string;
  /** この年以上（省略時は下限なし） */
  start?: number;
  /** この年以下（省略時は上限なし） */
  end?: number;
}

export type VerticalAxis = 'region' | 'theme';

export interface Subject {
  /** URL に使う ID */
  id: string;
  name: string;
  /** 狭い場所で使う短い名前（例: 「世界史」） */
  shortName: string;
  description: string;
  /** 受験復習モード「縦割り」でまとめる軸（世界史・歴史総合は地域、日本史はテーマ） */
  verticalAxis: VerticalAxis;
  /** 受験復習モード「横割り」の時代区分 */
  periods: Period[];
}

export interface Tag {
  /** URL に使う名前（半角英小文字・数字・ハイフン） */
  slug: string;
  /** 問題データに書くタグ名 */
  name: string;
  /** 補足（例: 「エジプト・北アフリカを含む」）。受験復習モードのページに表示する */
  note?: string;
}

export interface Taxonomy {
  regions: Tag[];
  themes: Tag[];
}

/** 出題画面に渡す問題（ビルド時に JSON として書き出す。空の項目は省く） */
export interface ClientQuestion {
  id: string;
  subject: string;
  question: string;
  answer: string;
  reading?: string;
  alternatives?: string[];
  explanation?: string;
  yearStart?: number;
  yearEnd?: number;
  yearApprox?: true;
  level: Level;
  sample?: true;
}

/** 出題画面・範囲選びに渡す教科書の構造（確認済みの問題IDだけを含む） */
export interface ClientTextbook {
  id: string;
  subject: string;
  name: string;
  chapters: {
    no: number;
    label?: string;
    title: string;
    sections: {
      no: number;
      label?: string;
      title: string;
      pages?: string;
      /** [問題ID, 重要度] */
      q: [string, Level][];
    }[];
  }[];
}

/** 受験復習モードの出題データ（科目ごと） */
export interface ClientReview {
  subject: string;
  /** 科目の全問題（年代順） */
  all: string[];
  region?: Record<string, string[]>;
  theme?: Record<string, string[]>;
  period: Record<string, string[]>;
}

/** 問題データの分割ファイルの目録（出題画面に埋め込む） */
export interface QuestionManifest {
  /** データの版（キャッシュ対策） */
  v: string;
  /** 各ファイルに入っている問題IDの範囲 [最初, 最後]（compareIds の順） */
  chunks: [string, string][];
}
