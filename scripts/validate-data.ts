// データの検証（npm run validate）。ビルド前に自動で実行される（package.json の prebuild）。
// エラーがあれば一覧を表示して終了コード 1 で終わる（＝ビルドが止まる）。

import { loadDataSet } from './lib/load';
import { formatIssue, validateData, type Issue } from './lib/validate';

const { dataSet, issues: loadIssues } = loadDataSet();
const issues: Issue[] = [...loadIssues, ...(dataSet ? validateData(dataSet) : [])];
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');

console.log('データの検証');
if (dataSet) {
  const questionCount = dataSet.questionFiles.reduce((n, f) => {
    const list = (f.data as { questions?: unknown[] })?.questions;
    return n + (Array.isArray(list) ? list.length : 0);
  }, 0);
  console.log(`  問題ファイル ${dataSet.questionFiles.length}件（${questionCount}問）・教科書 ${dataSet.textbooks.length}冊`);
}
for (const w of warnings) console.warn(`  ⚠ ${formatIssue(w)}`);
for (const e of errors) console.error(`  ✖ ${formatIssue(e)}`);

if (errors.length > 0) {
  console.error(`\n✖ エラー ${errors.length}件・警告 ${warnings.length}件。エラーを直すまでビルドできません。`);
  process.exit(1);
}
console.log(`  ✓ エラーなし（警告 ${warnings.length}件）`);
