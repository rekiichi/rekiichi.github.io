// ページ内の確認ダイアログ。ブラウザの prompt()・confirm() の代わりに使う
// （埋め込み表示やアプリ内ブラウザでは prompt()・confirm() が表示されず、すぐ null / false が返ることがあるため）。

import { h } from './dom';

interface DialogOptions {
  title: string;
  message?: string;
  /** 入力欄を出すとき */
  input?: { label: string; value: string };
  okLabel: string;
  /** 削除など、取り消せない操作 */
  danger?: boolean;
}

let dialog: HTMLDialogElement | null = null;

function openDialog(options: DialogOptions): Promise<string | null> {
  if (typeof HTMLDialogElement === 'undefined') {
    // <dialog> がない古いブラウザ
    if (options.input) return Promise.resolve(window.prompt(options.title, options.input.value));
    return Promise.resolve(window.confirm(options.message ?? options.title) ? '' : null);
  }
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    document.body.append(dialog);
  }
  const d = dialog;
  const input = options.input
    ? h('input', { class: 'dialog-input', id: 'dialog-input', type: 'text', value: options.input.value, maxlength: '60', autocomplete: 'off' })
    : null;
  const cancel = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, 'キャンセル');
  const ok = h('button', { type: 'submit', value: 'ok', class: `btn btn-small ${options.danger ? 'btn-danger' : 'btn-primary'}` }, options.okLabel);
  cancel.addEventListener('click', () => d.close('cancel'));
  const form = h(
    'form',
    { method: 'dialog', class: 'dialog-form' },
    h('h2', { class: 'dialog-title', id: 'dialog-title' }, options.title),
    options.message ? h('p', { class: 'dialog-message' }, options.message) : null,
    input ? h('label', { class: 'dialog-label', for: 'dialog-input' }, options.input!.label) : null,
    input,
    h('div', { class: 'dialog-actions' }, cancel, ok),
  );
  d.replaceChildren(form);
  d.returnValue = '';
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'ok' ? (input?.value ?? '') : null), { once: true });
    d.showModal();
    if (input) {
      input.focus();
      input.select();
    } else {
      ok.focus();
    }
  });
}

/** 文字を入力してもらう。キャンセルなら null */
export function askText(title: string, label: string, value: string, okLabel: string): Promise<string | null> {
  return openDialog({ title, input: { label, value }, okLabel });
}

/** 確認する。OK なら true */
export async function askConfirm(title: string, message: string, okLabel: string, danger = false): Promise<boolean> {
  return (await openDialog({ title, message, okLabel, danger })) !== null;
}
