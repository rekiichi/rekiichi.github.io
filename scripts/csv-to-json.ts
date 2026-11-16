// CSV → JSON 変換。
//
//   npm run data:csv                 … data/questions/*.csv と data/textbooks/*.csv をすべて変換
//   npm run data:csv -- path/to.csv  … 指定した CSV だけ変換（同じフォルダに同じ名前の .json を書く）
//
// 生成した JSON には "generatedFrom" が入る。元の CSV がなくなった生成 JSON は削除する。
// エラーがあった CSV の JSON は書き換えずに、終了コード 1 で終わる。

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { compareIds } from '../src/lib/natural-sort';
import type { Subject } from '../src/lib/types';
import { convertQuestionRows, convertTextbookRows, type ConvertIssue } from './lib/convert';
import { decodeCsvBytes, parseCsv } from './lib/csv';
import { DATA_DIR, QUESTIONS_DIR, TEXTBOOKS_DIR, listFiles } from './lib/load';

const root = process.cwd();
const rel = (p: string) => relative(root, p) || p;

function loadSubjects(): Subject[] {
  const path = join(root, DATA_DIR, 'subjects.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Subject[];
  } catch (e) {
    console.error(`✖ ${rel(path)} を読めません: ${(e as Error).message}`);
    process.exit(1);
  }
}

/** 内容が変わったときだけ書く（開発サーバーの無駄な再読み込みを防ぐ） */
function writeIfChanged(path: string, data: unknown): boolean {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  if (existsSync(path) && readFileSync(path, 'utf8') === json) return false;
  writeFileSync(path, json);
  return true;
}

const note = (csvName: string) =>
  `このファイルは ${csvName} から自動生成されます（npm run data:csv）。直接編集せず、CSV を編集してください。`;

type Kind = 'question' | 'textbook';

let questionIdCache: string[] | undefined;

/** data/questions/*.json にあるすべての問題ID（ID 順）。教科書CSVの「w-0102-*」のようなまとめ書きを展開するのに使う */
function loadQuestionIds(): string[] {
  if (questionIdCache) return questionIdCache;
  const ids: string[] = [];
  for (const path of listFiles(join(root, QUESTIONS_DIR), '.json')) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8')) as { questions?: { id?: unknown }[] };
      for (const q of data.questions ?? []) if (typeof q.id === 'string') ids.push(q.id);
    } catch {
      // 読めない JSON は検証（npm run validate）で報告する
    }
  }
  questionIdCache = ids.sort(compareIds);
  return questionIdCache;
}

function detectKind(path: string, header: string[]): Kind {
  const dir = basename(dirname(path));
  if (dir === 'textbooks') return 'textbook';
  if (dir === 'questions') return 'question';
  return header.some((h) => /章番号|chapter/i.test(h)) ? 'textbook' : 'question';
}

function convertFile(path: string, subjects: Subject[], forcedKind?: Kind): { ok: boolean; summary: string } {
  const decoded = decodeCsvBytes(readFileSync(path));
  const { rows, lines } = parseCsv(decoded.text);
  const kind = forcedKind ?? detectKind(path, rows[0] ?? []);
  const csvName = basename(path);
  const outPath = path.replace(/\.csv$/i, '.json');
  const issues: ConvertIssue[] = [];
  if (decoded.encoding === 'shift_jis') {
    issues.push({ level: 'warning', message: 'Shift_JIS として読み込みました（「CSV UTF-8」での保存をおすすめします）' });
  }

  let summary = '';
  let ok = false;
  if (kind === 'question') {
    const result = convertQuestionRows(rows, lines, { subjects });
    issues.push(...result.issues);
    if (result.value) {
      const changed = writeIfChanged(outPath, { generatedFrom: csvName, _note: note(csvName), questions: result.value });
      summary = `問題 ${result.value.length}問 → ${rel(outPath)}${changed ? '' : '（変更なし）'}`;
      ok = true;
    }
  } else {
    const stem = csvName.replace(/\.csv$/i, '');
    const result = convertTextbookRows(rows, lines, { subjects, fileStem: stem, questionIds: loadQuestionIds() });
    issues.push(...result.issues);
    if (result.value) {
      const tb = result.value;
      const sections = tb.chapters.reduce((n, ch) => n + ch.sections.length, 0);
      const changed = writeIfChanged(outPath, { generatedFrom: csvName, _note: note(csvName), ...tb });
      summary = `教科書「${tb.name}」${tb.chapters.length}章・${sections}節 → ${rel(outPath)}${changed ? '' : '（変更なし）'}`;
      ok = true;
    }
  }

  for (const issue of issues) {
    const mark = issue.level === 'error' ? '✖' : '⚠';
    const at = issue.line ? `:${issue.line}` : '';
    const out = issue.level === 'error' ? console.error : console.warn;
    out(`  ${mark} ${rel(path)}${at} ${issue.message}`);
  }
  return { ok, summary };
}

/** 元の CSV がなくなった生成 JSON を削除する */
function removeStaleJson(dir: string): void {
  for (const path of listFiles(dir, '.json')) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf8')) as { generatedFrom?: unknown };
      if (typeof data.generatedFrom === 'string' && !existsSync(join(dirname(path), data.generatedFrom))) {
        unlinkSync(path);
        console.log(`  - ${rel(path)} を削除しました（元の ${data.generatedFrom} がありません）`);
      }
    } catch {
      // 読めない JSON は検証（npm run validate）で報告する
    }
  }
}

function main(): void {
  const subjects = loadSubjects();
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const targets: { path: string; kind?: Kind }[] =
    args.length > 0
      ? args.map((a) => ({ path: join(root, a) }))
      : [
          ...listFiles(join(root, QUESTIONS_DIR), '.csv').map((path) => ({ path, kind: 'question' as const })),
          ...listFiles(join(root, TEXTBOOKS_DIR), '.csv').map((path) => ({ path, kind: 'textbook' as const })),
        ];

  console.log('CSV → JSON 変換');
  let failed = 0;
  for (const t of targets) {
    if (!existsSync(t.path)) {
      console.error(`  ✖ ${rel(t.path)} がありません`);
      failed++;
      continue;
    }
    const { ok, summary } = convertFile(t.path, subjects, t.kind);
    if (ok) console.log(`  ✓ ${summary}`);
    else failed++;
  }
  if (args.length === 0) {
    removeStaleJson(join(root, QUESTIONS_DIR));
    removeStaleJson(join(root, TEXTBOOKS_DIR));
  }
  if (targets.length === 0) console.log('  （CSV はありません）');
  if (failed > 0) {
    console.error(`\n✖ ${failed}件の CSV にエラーがあります。上の行番号を見て直してください。`);
    process.exit(1);
  }
}

main();
