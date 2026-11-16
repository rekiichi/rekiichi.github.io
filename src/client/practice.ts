// 出題画面（/practice/）。URL パラメータから出題範囲を組み立て、1問ずつ出題する。
// - 自己採点モード: 答えを見る → ○／× を自分でつける
// - 入力モード: 答えを入力して判定（表記ゆれは src/lib/normalize.ts で吸収）
// - テスト直前モード（quick=1）: 答えを見て ○／× をすばやく回す
// 結果は問題ごとに localStorage へ記録し、「苦手（最後にまちがえた問題）」の出題に使う。

import { isCorrectAnswer } from '../lib/normalize';
import { findChunk } from '../lib/natural-sort';
import { defaultOrder, parsePracticeParams, practiceQuery, type PracticeParams } from '../lib/params';
import { chapterLabel, collectQuestionIds, describeRange, resolveRange, sectionLabel, toRangeTextbook } from '../lib/range';
import type { AnswerMode } from '../lib/records';
import { buildQuestionSet, ORDER_LABELS, type Order } from '../lib/select';
import { formatPercent, weakIdSet } from '../lib/stats';
import { LEVEL_LABELS, LEVELS, type ClientQuestion, type ClientReview, type ClientTextbook, type QuestionManifest } from '../lib/types';
import { paths } from '../lib/url';
import { formatYears } from '../lib/years';
import { askText } from './dialog';
import { absoluteHref, byId, h, href, readJsonScript } from './dom';
import { shareOrCopy, toast } from './share';
import { store } from './storage';

interface Boot {
  manifest: QuestionManifest;
  siteName: string;
  reportUrl: string;
  subjects: Record<string, { name: string }>;
  textbooks: Record<string, { name: string; subject: string }>;
  /** 受験復習モードのまとまりの名前（科目ID → 種類 → スラッグ → 名前） */
  groups: Record<string, Record<string, Record<string, string>>>;
}

interface Source {
  title: string;
  rangeLabel: string;
  subject: string;
  textbookId?: string;
  ids: string[];
  /** 問題ID → 「第2章 第1節」 */
  locations: Map<string, string>;
  backHref: string;
  backLabel: string;
}

interface Result {
  q: ClientQuestion;
  correct: boolean;
  input?: string;
}

/** 利用者に見せるエラー（文面をそのまま表示する） */
class UserError extends Error {}

const boot = readJsonScript<Boot>('practice-data');

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${href(path)}?v=${boot?.manifest.v ?? ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function loadSource(params: PracticeParams): Promise<Source> {
  const s = params.source;
  if (s.kind === 'textbook') {
    if (!boot!.textbooks[s.textbookId]) throw new UserError('教科書が見つかりません。URL が正しいか確かめてください。');
    const tb = await fetchJson<ClientTextbook>(paths.textbookData(s.textbookId));
    const rangeTb = toRangeTextbook(tb);
    const keys = resolveRange(rangeTb, s.range);
    const locations = new Map<string, string>();
    for (const ch of tb.chapters) {
      for (const sec of ch.sections) {
        for (const [id] of sec.q) if (!locations.has(id)) locations.set(id, `${chapterLabel(ch)} ${sectionLabel(sec)}`);
      }
    }
    // 「範囲を選び直す」で教科書ページに戻ったとき、いまの範囲と設定が選ばれた状態にする
    const back = new URLSearchParams(practiceQuery(s, { count: params.count, order: params.order, levels: params.levels, weakOnly: params.weakOnly }));
    back.delete('tb');
    const backQuery = back.toString().replace(/%2C/gi, ',');
    return {
      title: tb.name,
      rangeLabel: describeRange(rangeTb, keys),
      subject: tb.subject,
      textbookId: tb.id,
      ids: collectQuestionIds(rangeTb, keys),
      locations,
      backHref: `${href(paths.textbook(tb.subject, tb.id))}${backQuery ? `?${backQuery}` : ''}`,
      backLabel: '範囲を選び直す',
    };
  }

  const subject = boot!.subjects[s.subjectId];
  if (!subject) throw new UserError('科目が見つかりません。URL が正しいか確かめてください。');
  const review = await fetchJson<ClientReview>(paths.reviewData(s.subjectId));
  if (!s.filter) {
    return {
      title: subject.name,
      rangeLabel: '科目全体',
      subject: s.subjectId,
      ids: review.all,
      locations: new Map(),
      backHref: href(paths.subject(s.subjectId)),
      backLabel: `${subject.name}のページへ`,
    };
  }
  const { type, slug } = s.filter;
  const ids = type === 'period' ? review.period[slug] : review[type]?.[slug];
  const name = boot!.groups[s.subjectId]?.[type]?.[slug];
  if (!ids || !name) throw new UserError('指定されたまとまりが見つかりません。');
  return {
    title: subject.name,
    rangeLabel: `${type === 'period' ? '横割り' : '縦割り'}：${name}`,
    subject: s.subjectId,
    ids,
    locations: new Map(),
    backHref: href(paths.reviewGroup(s.subjectId, type, slug)),
    backLabel: 'まとまりのページへ',
  };
}

/** 必要な分割ファイルだけを読み込む */
async function loadQuestions(ids: readonly string[]): Promise<Map<string, ClientQuestion>> {
  const chunks = new Set<number>();
  for (const id of ids) {
    const index = findChunk(boot!.manifest.chunks, id);
    if (index >= 0) chunks.add(index);
  }
  const lists = await Promise.all([...chunks].map((i) => fetchJson<ClientQuestion[]>(paths.questionChunk(i))));
  return new Map(lists.flat().map((q) => [q.id, q]));
}

function reportHref(id: string): string {
  if (boot?.reportUrl.includes('{id}')) return boot.reportUrl.replace('{id}', encodeURIComponent(id));
  return `${href(paths.contact())}?id=${encodeURIComponent(id)}`;
}

function show(id: string, visible: boolean): void {
  byId(id).hidden = !visible;
}

/** 最初は隠れている広告枠（結果画面の下）を、表示したときに1回だけ読み込む。広告が設定されていなければ何もしない */
function loadDeferredAds(): void {
  for (const ins of document.querySelectorAll<HTMLElement>('ins.adsbygoogle[data-ad-deferred]')) {
    ins.removeAttribute('data-ad-deferred');
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // 広告を読み込めなくても学習は続けられる
    }
  }
}

function showError(message: string, backHref = href(paths.home()), backLabel = 'トップページへ'): void {
  show('practice-loading', false);
  show('practice-main', false);
  show('practice-summary', false);
  byId('error-message').textContent = message;
  const back = byId<HTMLAnchorElement>('error-back');
  back.href = backHref;
  back.textContent = backLabel;
  show('practice-error', true);
}

async function main(): Promise<void> {
  if (!boot) return showError('ページの読み込みに失敗しました。再読み込みしてください。');
  const parsed = parsePracticeParams(window.location.search);
  if (!parsed.ok) return showError(`${parsed.error} 教科書のページから範囲を選び直してください。`);
  const params = parsed.params;

  let source: Source;
  let pool: ClientQuestion[];
  try {
    source = await loadSource(params);
    const questions = await loadQuestions(source.ids);
    pool = source.ids.map((id) => questions.get(id)).filter((q): q is ClientQuestion => q !== undefined);
  } catch (e) {
    if (e instanceof UserError) return showError(e.message);
    return showError('問題データを読み込めませんでした。通信状態を確かめて、再読み込みしてください。', window.location.href, '再読み込み');
  }

  const order: Order = params.order ?? defaultOrder(params.source);
  const quick = params.quick;
  const query = practiceQuery(params.source, {
    count: params.count,
    order: params.order,
    levels: params.levels,
    weakOnly: params.weakOnly,
    quick: params.quick,
  });
  const fullTitle = `${source.title}｜${source.rangeLabel}`;
  document.title = `${fullTitle} | ${boot.siteName}`;

  const makeSet = (): ClientQuestion[] =>
    buildQuestionSet(pool, {
      levels: params.levels,
      weakOnly: params.weakOnly,
      weakIds: weakIdSet(store.getStats()),
      order,
      count: params.count,
    });

  const firstSet = makeSet();
  if (pool.length === 0) return showError('この範囲にはまだ問題がありません。', source.backHref, source.backLabel);
  if (firstSet.length === 0) {
    const message = params.weakOnly
      ? 'この範囲に苦手な問題はありません。まちがえた問題があると、ここで出題されます。'
      : '選んだ重要度の問題が、この範囲にはありません。';
    return showError(message, source.backHref, source.backLabel);
  }

  // ---- 見出し ----
  byId('p-title').textContent = source.title;
  byId('p-range').textContent = source.rangeLabel;
  // 出題数の設定が範囲の問題数より多いときは、実際に出す数を「全◯問」と出す
  const allQuestions = params.count === 0 || firstSet.length < params.count;
  const chips = [
    allQuestions ? `全${firstSet.length}問` : `${firstSet.length}問`,
    ORDER_LABELS[order],
    params.levels.length > 0 && params.levels.length < LEVELS.length ? params.levels.map((l) => LEVEL_LABELS[l]).join('・') : '',
    params.weakOnly ? '苦手だけ' : '',
    quick ? 'テスト直前モード' : '',
  ].filter(Boolean);
  byId('p-chips').replaceChildren(...chips.map((c) => h('span', {}, c)));

  // ---- 状態 ----
  let set = firstSet;
  let index = 0;
  let results: Result[] = [];
  let revealed = false;
  let judged: { correct: boolean; input: string } | null = null;
  let answerMode: AnswerMode = store.getSettings().answerMode;
  let finished = false;
  /** 「まちがえた問題だけもう一度」のときは履歴の名前に印をつける */
  let retrying = false;
  const effectiveMode = (): AnswerMode | 'quick' => (quick ? 'quick' : answerMode);

  const card = byId('qcard');
  const input = byId<HTMLInputElement>('answer-input');
  const judge = byId('judge');

  function updateProgress(): void {
    const answered = results.length;
    const correct = results.filter((r) => r.correct).length;
    byId('p-count').textContent = `${Math.min(index + 1, set.length)} / ${set.length}`;
    byId('p-score').textContent = answered > 0 ? `正解 ${correct}・正答率 ${formatPercent(correct / answered)}` : '';
    byId('p-progress-bar').style.width = `${(answered / set.length) * 100}%`;
  }

  function updateModeSwitch(): void {
    show('mode-switch', !quick);
    for (const button of document.querySelectorAll<HTMLButtonElement>('#mode-switch [data-mode]')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === answerMode));
    }
  }

  function renderQuestion(): void {
    const q = set[index];
    revealed = false;
    judged = null;
    byId('q-number').textContent = `第${index + 1}問`;
    byId('q-location').textContent = source.locations.get(q.id) ?? formatYears(q.yearStart, q.yearEnd, q.yearApprox);
    const level = byId('q-level');
    level.textContent = LEVEL_LABELS[q.level];
    level.className = `badge level-${q.level}`;
    show('q-sample', q.sample === true);
    byId('q-text').textContent = q.question;

    const mode = effectiveMode();
    card.classList.toggle('is-tappable', mode === 'quick');
    show('self-controls', mode !== 'input');
    byId('btn-reveal').textContent = mode === 'quick' ? '答えを見る（カードをタップ）' : '答えを見る';
    show('input-form', mode === 'input');
    input.value = '';
    show('answer-area', false);
    show('grade-bar', false);
    show('next-bar', false);
    byId('key-hint').textContent =
      mode === 'input' ? 'Enter で判定／次へ' : 'スペースキーで答え、→ または O で○、← または X で×';
    updateProgress();
    if (mode === 'input') input.focus();
  }

  function fillAnswer(q: ClientQuestion): void {
    byId('a-text').textContent = q.answer;
    const reading = byId('a-reading');
    reading.textContent = q.reading ? `読み：${q.reading}` : '';
    reading.hidden = !q.reading;
    const alt = byId('a-alt');
    alt.textContent = q.alternatives?.length ? `別解：${q.alternatives.join('／')}` : '';
    alt.hidden = !q.alternatives?.length;
    const years = formatYears(q.yearStart, q.yearEnd, q.yearApprox);
    const yearsEl = byId('a-years');
    yearsEl.textContent = years ? `年代：${years}` : '';
    yearsEl.hidden = !years;
    const expl = byId('a-expl');
    expl.textContent = q.explanation ?? '';
    const quickMode = effectiveMode() === 'quick';
    expl.hidden = !q.explanation || quickMode;
    show('a-expl-toggle', Boolean(q.explanation) && quickMode);
    byId<HTMLAnchorElement>('a-report').href = reportHref(q.id);
  }

  function reveal(): void {
    if (revealed || finished || effectiveMode() === 'input') return;
    revealed = true;
    const q = set[index];
    fillAnswer(q);
    judge.hidden = true;
    show('a-your', false);
    show('self-controls', false);
    show('answer-area', true);
    show('grade-bar', true);
    byId('btn-right').focus({ preventScroll: true });
  }

  function commit(correct: boolean, typed?: string): void {
    const q = set[index];
    store.recordResult(q.id, correct, q.subject);
    results.push({ q, correct, ...(typed !== undefined ? { input: typed } : {}) });
    index += 1;
    if (index >= set.length) finish();
    else renderQuestion();
  }

  function showJudge(correct: boolean, overridden = false): void {
    judge.hidden = false;
    judge.textContent = correct ? (overridden ? '○ 正解にしました' : '○ 正解！') : '× 不正解';
    judge.className = `judge ${correct ? 'is-correct' : 'is-wrong'}`;
  }

  function submitInput(typed: string): void {
    if (judged || finished) return;
    const q = set[index];
    const correct = typed.trim() !== '' && isCorrectAnswer(typed, q.answer, q.alternatives ?? []);
    judged = { correct, input: typed };
    fillAnswer(q);
    showJudge(correct);
    const your = byId('a-your');
    your.textContent = typed.trim() ? `あなたの答え：${typed}` : 'あなたの答え：（わからない）';
    your.hidden = false;
    show('input-form', false);
    show('answer-area', true);
    show('next-bar', true);
    show('btn-override', !correct && typed.trim() !== '');
    byId('btn-next').focus({ preventScroll: true });
  }

  function finish(): void {
    finished = true;
    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    if (total > 0) {
      store.addHistory({
        t: Date.now(),
        title: retrying ? `${fullTitle}（まちがえた問題）` : fullTitle,
        query,
        total,
        correct,
        ...(retrying ? { retry: true } : {}),
      });
    }
    show('practice-main', false);
    show('practice-summary', true);
    show('practice-end-ad', true);
    loadDeferredAds();
    byId('s-correct').textContent = String(correct);
    byId('s-total').textContent = String(total);
    const rate = total > 0 ? correct / total : 0;
    byId('s-rate').textContent = total > 0 ? `正答率 ${formatPercent(rate)}` : 'まだ1問も解いていません';
    byId('s-message').textContent =
      total === 0 ? '' : rate === 1 ? '全問正解です。この調子！' : rate >= 0.8 ? 'よくできました。まちがえた問題を確認しておきましょう。' : rate >= 0.5 ? 'あと少し。まちがえた問題をもう一度解いてみましょう。' : 'まちがえた問題をくり返して、少しずつ覚えていきましょう。';

    const wrong = results.filter((r) => !r.correct);
    const retryWrong = byId<HTMLButtonElement>('btn-retry-wrong');
    retryWrong.hidden = wrong.length === 0;
    retryWrong.textContent = `まちがえた${wrong.length}問をもう一度`;
    show('s-wrong-section', wrong.length > 0);
    byId('s-wrong-list').replaceChildren(...wrong.map(resultItem));
    byId('s-all-count').textContent = String(total);
    byId('s-all-list').replaceChildren(...results.map(resultItem));
    window.scrollTo({ top: 0 });
    byId('practice-summary').focus({ preventScroll: true });
  }

  function resultItem(r: Result): HTMLLIElement {
    return h(
      'li',
      {},
      h('span', { class: `mark ${r.correct ? 'ok' : 'ng'}`, 'aria-label': r.correct ? '正解' : '不正解' }, r.correct ? '○' : '×'),
      h('span', { class: 'result-q' }, r.q.question),
      h('span', { class: 'result-a' }, r.q.answer),
      r.input !== undefined && !r.correct ? h('span', { class: 'answer-sub' }, `あなたの答え：${r.input || '（わからない）'}`) : null,
    );
  }

  function restart(next: ClientQuestion[], wrongOnly: boolean): void {
    retrying = wrongOnly;
    set = next;
    index = 0;
    results = [];
    finished = false;
    show('practice-summary', false);
    show('practice-end-ad', false);
    show('practice-main', true);
    renderQuestion();
    window.scrollTo({ top: 0 });
  }

  // ---- 操作 ----
  byId('btn-reveal').addEventListener('click', reveal);
  card.addEventListener('click', (event) => {
    if (effectiveMode() !== 'quick') return;
    if ((event.target as Element).closest('a, button, input')) return;
    reveal();
  });
  byId('btn-right').addEventListener('click', () => revealed && commit(true));
  byId('btn-wrong').addEventListener('click', () => revealed && commit(false));
  byId('a-expl-toggle').addEventListener('click', () => {
    show('a-expl', true);
    show('a-expl-toggle', false);
  });

  byId<HTMLFormElement>('input-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitInput(input.value);
  });
  byId('btn-giveup').addEventListener('click', () => submitInput(''));
  byId('btn-override').addEventListener('click', () => {
    if (!judged) return;
    judged.correct = true;
    showJudge(true, true);
    show('btn-override', false);
  });
  byId('btn-next').addEventListener('click', () => {
    if (judged) commit(judged.correct, judged.input);
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('#mode-switch [data-mode]')) {
    button.addEventListener('click', () => {
      const next = button.dataset.mode === 'input' ? 'input' : 'self';
      if (next === answerMode) return;
      answerMode = store.saveSettings({ answerMode: next }).answerMode;
      updateModeSwitch();
      // まだ答えていなければ、いまの問題から切り替える
      if (!revealed && !judged) renderQuestion();
    });
  }

  byId('btn-quit').addEventListener('click', () => {
    if (results.length === 0) {
      window.location.href = source.backHref;
      return;
    }
    finish();
  });

  byId('btn-retry-wrong').addEventListener('click', () => restart(results.filter((r) => !r.correct).map((r) => r.q), true));
  byId('btn-retry-all').addEventListener('click', () => restart(makeSet(), false));
  const back = byId<HTMLAnchorElement>('s-back');
  back.href = source.backHref;
  back.textContent = source.backLabel;

  byId('btn-s-share').addEventListener('click', () => {
    void shareOrCopy(absoluteHref(paths.practice(query)), `${fullTitle}の一問一答`);
  });
  byId('btn-s-save').addEventListener('click', async () => {
    const name = await askText('マイ範囲に保存', '名前（例：2学期中間テスト）', fullTitle, '保存する');
    if (name === null) return;
    store.saveRange({
      id: `r${Date.now().toString(36)}`,
      name: name.trim() || fullTitle,
      query,
      subject: source.subject,
      ...(source.textbookId ? { textbookId: source.textbookId } : {}),
      createdAt: Date.now(),
    });
    toast('マイ範囲に保存しました');
  });

  document.addEventListener('keydown', (event) => {
    if (finished || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    const mode = effectiveMode();
    if (mode === 'input') return;
    if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
      if (target.closest('a, button') && event.key === 'Enter') return;
      event.preventDefault();
      reveal();
    } else if (revealed && ['ArrowRight', 'o', 'O', 'k'].includes(event.key)) {
      event.preventDefault();
      commit(true);
    } else if (revealed && ['ArrowLeft', 'x', 'X', 'j'].includes(event.key)) {
      event.preventDefault();
      commit(false);
    }
  });

  show('practice-loading', false);
  show('practice-main', true);
  updateModeSwitch();
  renderQuestion();
}

void main();
