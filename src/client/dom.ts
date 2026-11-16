// ブラウザ側の小さな道具。

import { joinBase } from '../lib/url';

/** サイトのベースパス（<html data-base>） */
export const siteBase = (): string => document.documentElement.dataset.base || '/';

/**
 * サイト内パス → ベースパス付きの URL。
 * <html data-index-file="index.html"> があるとき（ディレクトリの URL で index.html を返さない配信先）は、
 * "/" で終わるパスに index.html を補う。
 */
export function href(path: string): string {
  const url = joinBase(siteBase(), path);
  const indexFile = document.documentElement.dataset.indexFile;
  return indexFile ? url.replace(/\/(?=$|[?#])/, `/${indexFile}`) : url;
}

/** サイト内パス → 絶対 URL（共有用。ベースパスが相対でも正しくなるよう、いまのページを基準にする） */
export const absoluteHref = (path: string): string => new URL(href(path), window.location.href).href;

/** <script type="application/json" id="..."> の中身を読む */
export function readJsonScript<T>(id: string): T | null {
  const text = document.getElementById(id)?.textContent;
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がありません`);
  return el as T;
}

type Child = Node | string | null | undefined | false;

/** 要素を作る（文字列は textContent として入るので HTML エスケープは不要） */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/** "2026/10/29 18:05" */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
