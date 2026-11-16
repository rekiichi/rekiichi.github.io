// data/ 配下のファイルを読む（Node 用）。サイトのビルドは src/lib/site-data.ts が同じファイルを読む。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DataFile, DataSet, Issue } from './validate';

export const DATA_DIR = 'data';
export const QUESTIONS_DIR = join(DATA_DIR, 'questions');
export const TEXTBOOKS_DIR = join(DATA_DIR, 'textbooks');

export function listFiles(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(ext) && !name.startsWith('.'))
    .sort()
    .map((name) => join(dir, name));
}

/** JSON を読む。読めなければ issues に追加して undefined */
export function readJson(path: string, root: string, issues: Issue[]): DataFile | undefined {
  const file = relative(root, path) || path;
  try {
    return { file, data: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (e) {
    issues.push({ level: 'error', file, message: `JSON として読めません: ${(e as Error).message}` });
    return undefined;
  }
}

export function loadDataSet(root = process.cwd()): { dataSet: DataSet | null; issues: Issue[] } {
  const issues: Issue[] = [];
  const subjects = readJson(join(root, DATA_DIR, 'subjects.json'), root, issues);
  const taxonomy = readJson(join(root, DATA_DIR, 'taxonomy.json'), root, issues);
  const questionFiles = listFiles(join(root, QUESTIONS_DIR), '.json')
    .map((p) => readJson(p, root, issues))
    .filter((f): f is DataFile => f !== undefined);
  const textbooks = listFiles(join(root, TEXTBOOKS_DIR), '.json')
    .map((p) => readJson(p, root, issues))
    .filter((f): f is DataFile => f !== undefined);
  if (!subjects || !taxonomy) return { dataSet: null, issues };
  return { dataSet: { subjects, taxonomy, questionFiles, textbooks }, issues };
}
