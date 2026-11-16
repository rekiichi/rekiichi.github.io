// リポジトリに入っている実際のデータ（data/）が検証を通ること。
// CSV から生成した JSON が CSV と食い違っていないことも確かめる。
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertQuestionRows, convertTextbookRows } from '../scripts/lib/convert';
import { decodeCsvBytes, parseCsv } from '../scripts/lib/csv';
import { listFiles, loadDataSet, QUESTIONS_DIR, TEXTBOOKS_DIR } from '../scripts/lib/load';
import { validateData } from '../scripts/lib/validate';
import { compareIds } from '../src/lib/natural-sort';
import type { Subject } from '../src/lib/types';

describe('data/', () => {
  it('検証でエラーが出ない', () => {
    const { dataSet, issues } = loadDataSet();
    expect(issues).toEqual([]);
    expect(dataSet).not.toBeNull();
    const errors = validateData(dataSet!).filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
  });

  it('生成された JSON が CSV の内容と一致している（npm run data:csv 済み）', () => {
    const subjects = JSON.parse(readFileSync('data/subjects.json', 'utf8')) as Subject[];
    for (const csv of listFiles(QUESTIONS_DIR, '.csv')) {
      const { rows, lines } = parseCsv(decodeCsvBytes(readFileSync(csv)).text);
      const json = JSON.parse(readFileSync(csv.replace(/\.csv$/, '.json'), 'utf8'));
      expect(json.questions, csv).toEqual(convertQuestionRows(rows, lines, { subjects }).value);
    }
    // 教科書CSVの「w-0102-*」のようなまとめ書きは、すべての問題ID（ID 順）から展開される
    const questionIds = listFiles(QUESTIONS_DIR, '.json')
      .flatMap((path) => (JSON.parse(readFileSync(path, 'utf8')) as { questions: { id: string }[] }).questions.map((q) => q.id))
      .sort(compareIds);
    for (const csv of listFiles(TEXTBOOKS_DIR, '.csv')) {
      const { rows, lines } = parseCsv(decodeCsvBytes(readFileSync(csv)).text);
      const { generatedFrom: _g, _note: _n, ...json } = JSON.parse(readFileSync(csv.replace(/\.csv$/, '.json'), 'utf8'));
      const converted = convertTextbookRows(rows, lines, { subjects, fileStem: basename(csv, '.csv'), questionIds }).value;
      expect(json, csv).toEqual(converted);
    }
  });

  it('各科目にサンプル教科書とサンプル問題がある', () => {
    const { dataSet } = loadDataSet();
    const subjects = (dataSet!.subjects.data as Subject[]).map((s) => s.id);
    const textbooks = dataSet!.textbooks.map((f) => f.data as { id: string; subject: string });
    const questions = dataSet!.questionFiles.flatMap((f) => (f.data as { questions: { id: string; subject: string; verified: boolean }[] }).questions);
    for (const s of subjects) {
      expect(textbooks.some((tb) => tb.subject === s && tb.id.startsWith('sample-')), s).toBe(true);
      const sample = questions.filter((q) => q.subject === s && q.id.startsWith('sample-') && q.verified);
      expect(sample.length, s).toBeGreaterThanOrEqual(10);
    }
  });
});
