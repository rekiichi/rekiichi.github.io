// マイページ（/my/）。この端末に保存したマイ範囲・学習記録・履歴を表示する。

import { practiceQuery } from '../lib/params';
import { formatPercent, summarize } from '../lib/stats';
import { paths } from '../lib/url';
import { askConfirm, askText } from './dialog';
import { byId, formatDateTime, h, href, readJsonScript } from './dom';
import { toast } from './share';
import { store } from './storage';

interface MyBoot {
  subjects: { id: string; name: string }[];
  textbooks: Record<string, { name: string; subject: string }>;
}

function renderRanges(boot: MyBoot): void {
  const ranges = store.getRanges();
  byId('ranges-empty').hidden = ranges.length > 0;
  byId('ranges-list').replaceChildren(
    ...ranges.map((r) => {
      const sub = r.textbookId ? boot.textbooks[r.textbookId]?.name : boot.subjects.find((s) => s.id === r.subject)?.name;
      const start = h('a', { class: 'btn btn-primary btn-small', href: href(paths.practice(r.query)) }, '解く');
      const rename = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, '名前を変える');
      const del = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, '削除');
      rename.addEventListener('click', async () => {
        const name = await askText('名前を変える', '新しい名前', r.name, '変更する');
        if (name === null || !name.trim()) return;
        store.renameRange(r.id, name.trim());
        renderRanges(boot);
      });
      del.addEventListener('click', async () => {
        if (!(await askConfirm('マイ範囲を削除', `「${r.name}」を削除しますか？`, '削除する', true))) return;
        store.removeRange(r.id);
        renderRanges(boot);
      });
      return h(
        'li',
        { class: 'row-static' },
        h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.name), sub ? h('span', { class: 'row-sub' }, sub) : null),
        h('span', { class: 'saved-actions' }, start, rename, del),
      );
    }),
  );
}

function renderStats(boot: MyBoot): void {
  const stats = store.getStats();
  const all = summarize(stats);
  byId('stats-total').textContent =
    all.answered > 0 ? `これまでに ${all.answered}問を解きました（全回答の正答率 ${formatPercent(all.accuracy)}）。` : 'まだ記録がありません。';
  byId('stats-list').replaceChildren(
    ...boot.subjects.map((s) => {
      const sum = summarize(stats, undefined, (e) => e.s === s.id);
      const weakLink =
        sum.weak > 0
          ? h('a', { class: 'btn btn-secondary btn-small', href: href(paths.practice(practiceQuery({ kind: 'subject', subjectId: s.id }, { weakOnly: true, order: 'random' }))) }, `苦手 ${sum.weak}問を解く`)
          : null;
      return h(
        'li',
        { class: 'row-static' },
        h(
          'span',
          { class: 'row-main' },
          h('span', { class: 'row-title' }, s.name),
          h('span', { class: 'row-sub' }, sum.answered > 0 ? `解いた問題 ${sum.answered}問・正答率 ${formatPercent(sum.accuracy)}・苦手 ${sum.weak}問` : 'まだ解いていません'),
        ),
        weakLink,
      );
    }),
  );
}

function renderHistory(): void {
  const history = store.getHistory();
  byId('history-empty').hidden = history.length > 0;
  byId('history-list').replaceChildren(
    ...history.map((e) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: 'row-link', href: href(paths.practice(e.query)) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, e.title), h('span', { class: 'row-sub' }, formatDateTime(e.t))),
          h('span', { class: 'row-end' }, `${e.correct}/${e.total}問`),
        ),
      ),
    ),
  );
}

const boot = readJsonScript<MyBoot>('my-data');
if (boot) {
  byId('storage-warning').hidden = store.available();
  renderRanges(boot);
  renderStats(boot);
  renderHistory();

  const clearButtons: [string, 'stats' | 'ranges' | 'history', string][] = [
    ['btn-clear-stats', 'stats', '学習記録（問題ごとの正誤・苦手）'],
    ['btn-clear-ranges', 'ranges', 'マイ範囲'],
    ['btn-clear-history', 'history', '学習履歴'],
  ];
  for (const [id, kind, label] of clearButtons) {
    byId(id).addEventListener('click', async () => {
      if (!(await askConfirm(`${label}を消す`, `${label}をすべて消します。元に戻せません。よろしいですか？`, '消す', true))) return;
      store.clear(kind);
      renderRanges(boot);
      renderStats(boot);
      renderHistory();
      toast(`${label}を消しました`);
    });
  }
}
