// 教科書ページの「テスト範囲を選んで問題を作る」フォーム。
// 選んだ章・節と出題の設定を出題画面の URL（/practice/?tb=…&r=…）にまとめる。
// その URL がそのまま「範囲の共有」「マイ範囲」に使われる。

import { parsePracticeParams, practiceQuery, QUICK_OPTIONS } from '../lib/params';
import {
  collectQuestionIds,
  describeRange,
  resolveRange,
  selectableSectionKeys,
  serializeRange,
  toRangeTextbook,
} from '../lib/range';
import { summarize, weakIdSet } from '../lib/stats';
import { LEVELS, type ClientTextbook, type Level } from '../lib/types';
import { paths } from '../lib/url';
import { askConfirm, askText } from './dialog';
import { absoluteHref, byId, h, href, readJsonScript } from './dom';
import { shareOrCopy, toast } from './share';
import { store } from './storage';

const COUNT_CHOICES = [10, 20, 30, 50, 0];
const BUILDER_PARAMS = ['r', 'n', 'order', 'lv', 'weak'];

export function initRangeBuilder(): void {
  const form = document.getElementById('range-form') as HTMLFormElement | null;
  const data = readJsonScript<ClientTextbook>('textbook-data');
  if (!form || !data) return;

  const rangeTb = toRangeTextbook(data);
  const levelOf = new Map<string, Level>(data.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.q)));
  const selectable = new Set(rangeTb.chapters.flatMap(selectableSectionKeys));
  const stats = store.getStats();
  const weak = weakIdSet(stats);

  const chapterBoxes = [...form.querySelectorAll<HTMLInputElement>('.chk-chapter')];
  const sectionBoxes = [...form.querySelectorAll<HTMLInputElement>('.chk-section')];
  const tabTree = byId<HTMLButtonElement>('tab-tree');
  const tabSpan = byId<HTMLButtonElement>('tab-span');
  const panelTree = byId('panel-tree');
  const panelSpan = byId('panel-span');
  const spanFrom = byId<HTMLSelectElement>('span-from');
  const spanTo = byId<HTMLSelectElement>('span-to');
  const summaryRange = byId('summary-range');
  const summaryCount = byId('summary-count');
  const startButton = byId<HTMLButtonElement>('btn-start');
  const quickLink = byId<HTMLAnchorElement>('btn-quick');

  let selected = new Set<string>();
  let mode: 'tree' | 'span' = 'tree';

  // ---- 設定の読み書き ----

  const radioValue = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? '';
  const setRadio = (name: string, value: string) => {
    const input = form.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };

  function readOptions() {
    const count = Number(radioValue('n')) || 0;
    const order = radioValue('order') === 'random' ? ('random' as const) : undefined;
    const checked = [...form!.querySelectorAll<HTMLInputElement>('input[name="lv"]:checked')].map((i) => i.value as Level);
    const levels = checked.length === LEVELS.length ? [] : checked;
    const weakOnly = form!.querySelector<HTMLInputElement>('input[name="weak"]')?.checked ?? false;
    return { count, order, levels, weakOnly, noLevel: checked.length === 0 };
  }

  function currentQuery(extra: Parameters<typeof practiceQuery>[1] = {}): string {
    const { count, order, levels, weakOnly } = readOptions();
    return practiceQuery(
      { kind: 'textbook', textbookId: data!.id, range: serializeRange(rangeTb, selected) },
      { count, order, levels, weakOnly, ...extra },
    );
  }

  /** URL のクエリ（共有された範囲や前回の範囲）をフォームに反映する */
  function applyQuery(query: string): void {
    const q = new URLSearchParams(query);
    q.delete('tb');
    // 範囲や設定のパラメータがないとき（utm_source などだけのとき）は何もしない
    if (![...q.keys()].some((k) => BUILDER_PARAMS.includes(k))) return;
    const parsed = parsePracticeParams(`tb=${encodeURIComponent(data!.id)}&${q.toString()}`);
    if (!parsed.ok || parsed.params.source.kind !== 'textbook') return;
    const p = parsed.params;
    selected = new Set(resolveRange(rangeTb, p.source.kind === 'textbook' ? p.source.range : '').filter((k) => selectable.has(k)));
    setRadio('n', COUNT_CHOICES.includes(p.count) ? String(p.count) : p.count > 0 ? String(COUNT_CHOICES.find((c) => c >= p.count) ?? 0) : '0');
    setRadio('order', p.order === 'random' ? 'random' : 'textbook');
    for (const input of form!.querySelectorAll<HTMLInputElement>('input[name="lv"]')) {
      input.checked = p.levels.length === 0 || p.levels.includes(input.value as Level);
    }
    const weakBox = form!.querySelector<HTMLInputElement>('input[name="weak"]');
    if (weakBox) weakBox.checked = p.weakOnly;
  }

  // ---- 画面の更新 ----

  function syncCheckboxes(): void {
    for (const box of sectionBoxes) box.checked = selected.has(box.value);
    for (const box of chapterBoxes) {
      const ch = rangeTb.chapters.find((c) => String(c.no) === box.dataset.chapter);
      const keys = ch ? selectableSectionKeys(ch) : [];
      const picked = keys.filter((k) => selected.has(k)).length;
      box.checked = keys.length > 0 && picked === keys.length;
      box.indeterminate = picked > 0 && picked < keys.length;
    }
  }

  function update(): void {
    syncCheckboxes();
    const { count, levels, weakOnly, noLevel } = readOptions();
    const ids = collectQuestionIds(rangeTb, selected);
    const pool = ids.filter((id) => (levels.length === 0 || levels.includes(levelOf.get(id)!)) && (!weakOnly || weak.has(id)));
    const n = count > 0 ? Math.min(count, pool.length) : pool.length;
    const basicCount = ids.filter((id) => levelOf.get(id) === 'basic').length;

    if (selected.size === 0) {
      summaryRange.textContent = '範囲を選んでください';
      summaryCount.textContent = '章・節にチェックを入れると、問題数がここに出ます。';
    } else {
      summaryRange.textContent = `${data!.name}　${describeRange(rangeTb, selected)}`;
      if (noLevel) summaryCount.textContent = '重要度を1つ以上選んでください。';
      else if (weakOnly && pool.length === 0) summaryCount.textContent = 'この範囲に苦手な問題はありません（まちがえた問題がここに入ります）。';
      else summaryCount.textContent = `該当 ${pool.length}問 → ${n}問を出題`;
    }

    const query = currentQuery();
    startButton.disabled = n === 0 || noLevel;
    quickLink.href = href(paths.practice(currentQuery({ ...QUICK_OPTIONS, count: 0, weakOnly: false })));
    quickLink.textContent = selected.size === 0 ? 'テスト直前モード（基本だけ）' : `テスト直前モード（基本 ${basicCount}問をランダムに）`;
    quickLink.setAttribute('aria-disabled', String(basicCount === 0));
    if (selected.size > 0) store.saveBuilderState(data!.id, query);
  }

  // ---- 章・節のチェック ----

  form.addEventListener('change', (event) => {
    const target = event.target;
    if (target === spanFrom || target === spanTo) {
      applySpan();
    } else if (target instanceof HTMLInputElement && target.classList.contains('chk-section')) {
      if (target.checked) selected.add(target.value);
      else selected.delete(target.value);
    } else if (target instanceof HTMLInputElement && target.classList.contains('chk-chapter')) {
      const ch = rangeTb.chapters.find((c) => String(c.no) === target.dataset.chapter);
      for (const key of ch ? selectableSectionKeys(ch) : []) {
        if (target.checked) selected.add(key);
        else selected.delete(key);
      }
    }
    update();
  });

  for (const button of form.querySelectorAll<HTMLButtonElement>('.tree-toggle')) {
    button.addEventListener('click', () => {
      const list = document.getElementById(button.getAttribute('aria-controls') ?? '');
      if (!list) return;
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      list.hidden = !open;
    });
  }

  for (const button of form.querySelectorAll<HTMLButtonElement>('[data-select]')) {
    button.addEventListener('click', () => {
      selected = button.dataset.select === 'all' ? new Set(selectable) : new Set();
      update();
    });
  }

  // ---- 「第◯章〜第◯章」 ----

  function applySpan(): void {
    const a = Number(spanFrom.value);
    const b = Number(spanTo.value);
    const [from, to] = a <= b ? [a, b] : [b, a];
    selected = new Set(
      rangeTb.chapters.filter((ch) => ch.no >= from && ch.no <= to).flatMap(selectableSectionKeys),
    );
  }

  function setMode(next: 'tree' | 'span'): void {
    mode = next;
    tabTree.setAttribute('aria-selected', String(mode === 'tree'));
    tabSpan.setAttribute('aria-selected', String(mode === 'span'));
    panelTree.hidden = mode !== 'tree';
    panelSpan.hidden = mode !== 'span';
    if (mode === 'span') applySpan();
    update();
  }

  tabTree.addEventListener('click', () => setMode('tree'));
  tabSpan.addEventListener('click', () => setMode('span'));

  // ---- 開始・共有・保存 ----

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (startButton.disabled) return;
    window.location.href = href(paths.practice(currentQuery()));
  });

  byId('btn-share').addEventListener('click', () => {
    if (selected.size === 0) return toast('先に範囲を選んでください');
    void shareOrCopy(absoluteHref(paths.practice(currentQuery())), `${data.name} ${describeRange(rangeTb, selected)}の一問一答`);
  });

  byId('btn-save').addEventListener('click', async () => {
    if (selected.size === 0) return toast('先に範囲を選んでください');
    const suggested = `${data.name} ${describeRange(rangeTb, selected)}`;
    const name = await askText('マイ範囲に保存', '名前（例：2学期中間テスト）', suggested, '保存する');
    if (name === null) return;
    store.saveRange({
      id: `r${Date.now().toString(36)}`,
      name: name.trim() || suggested,
      query: currentQuery(),
      subject: data.subject,
      textbookId: data.id,
      createdAt: Date.now(),
    });
    renderSavedRanges();
    toast('マイ範囲に保存しました');
  });

  // ---- マイ範囲（この教科書） ----

  function renderSavedRanges(): void {
    const section = document.getElementById('my-ranges-section');
    const list = document.getElementById('my-ranges');
    if (!section || !list) return;
    const ranges = store.getRanges().filter((r) => r.textbookId === data!.id);
    section.hidden = ranges.length === 0;
    list.replaceChildren(
      ...ranges.map((r) => {
        const start = h('a', { class: 'btn btn-primary btn-small', href: href(paths.practice(r.query)) }, '解く');
        const edit = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, 'この範囲を選ぶ');
        const del = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, '削除');
        edit.addEventListener('click', () => {
          applyQuery(r.query);
          setMode('tree');
          form!.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        del.addEventListener('click', async () => {
          if (!(await askConfirm('マイ範囲を削除', `「${r.name}」を削除しますか？`, '削除する', true))) return;
          store.removeRange(r.id);
          renderSavedRanges();
        });
        return h('li', { class: 'row-static' }, h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, r.name)), h('span', { class: 'saved-actions' }, start, edit, del));
      }),
    );
  }

  // ---- 章ごとの学習状況 ----

  function renderProgress(): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-progress-chapter]')) {
      const ch = rangeTb.chapters.find((c) => String(c.no) === el.dataset.progressChapter);
      if (!ch) continue;
      const ids = ch.sections.flatMap((s) => s.questionIds);
      const sum = summarize(stats, ids);
      if (sum.answered === 0) continue;
      el.replaceChildren(h('span', { class: 'ok' }, `○${sum.mastered}`), h('span', { class: 'ng' }, `×${sum.weak}`), h('span', {}, `未${sum.total - sum.answered}`));
      el.setAttribute('aria-label', `正解${sum.mastered}問、不正解${sum.weak}問、未学習${sum.total - sum.answered}問`);
    }
  }

  // ---- 初期表示 ----

  applyQuery(window.location.search.length > 1 ? window.location.search : (store.getBuilderState(data.id) ?? ''));
  setMode('tree');
  renderSavedRanges();
  renderProgress();
  // 章のチェックが一部だけのときは、節の一覧を開いておく
  for (const box of chapterBoxes) {
    if (!box.indeterminate) continue;
    const toggle = box.closest('.tree-row')?.querySelector<HTMLButtonElement>('.tree-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click();
  }
}
