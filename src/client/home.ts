// トップページの「続きから」。最近解いた範囲とマイ範囲を表示する（記録がなければ何も出さない）。

import { paths } from '../lib/url';
import { byId, h, href } from './dom';
import { store } from './storage';

// 「まちがえた問題だけ」の記録は除き、同じ範囲を何度も解いた場合はいちばん新しい記録だけを出す
const history = store
  .getHistory()
  .filter((e) => !e.retry)
  .filter((e, i, list) => list.findIndex((x) => x.query === e.query) === i)
  .slice(0, 3);
const ranges = store.getRanges().slice(0, 3);

if (history.length > 0 || ranges.length > 0) {
  const items = [
    ...history.map((e) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: 'row-link', href: href(paths.practice(e.query)) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, e.title), h('span', { class: 'row-sub' }, `前回 ${e.correct}/${e.total}問正解`)),
          h('span', { class: 'row-end' }, 'もう一度'),
        ),
      ),
    ),
    ...ranges.map((r) =>
      h(
        'li',
        {},
        h(
          'a',
          { class: 'row-link', href: href(paths.practice(r.query)) },
          h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.name), h('span', { class: 'row-sub' }, 'マイ範囲')),
          h('span', { class: 'row-end' }, '解く'),
        ),
      ),
    ),
  ];
  byId('continue-list').replaceChildren(...items);
  byId('continue').hidden = false;
}
