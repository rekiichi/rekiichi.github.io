// localStorage の読み書き。プライベートブラウズや容量オーバーで失敗しても例外を外に出さない。
// 個人情報は保存しない（保存するのは問題IDごとの正誤・マイ範囲・設定だけ）。

import { addHistoryEntry, addRange, sanitizeHistory, sanitizeRanges, sanitizeSettings, type HistoryEntry, type MyRange, type Settings } from '../lib/records';
import { applyResult, sanitizeStats, type StatsMap } from '../lib/stats';
import { STORAGE_PREFIX } from '../site.config';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ThemeMode = 'light' | 'dark';

/** window.localStorage を取り出す（アクセスするだけで例外になる環境がある） */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createStore(storage: KeyValueStorage | null, prefix = STORAGE_PREFIX) {
  const readRaw = (key: string): string | null => {
    if (!storage) return null;
    try {
      return storage.getItem(prefix + key);
    } catch {
      return null;
    }
  };
  const writeRaw = (key: string, value: string): boolean => {
    if (!storage) return false;
    try {
      storage.setItem(prefix + key, value);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (key: string): void => {
    if (!storage) return;
    try {
      storage.removeItem(prefix + key);
    } catch {
      // 消せなくても続ける
    }
  };
  const read = (key: string): unknown => {
    const raw = readRaw(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const write = (key: string, value: unknown): boolean => {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch {
      return false;
    }
  };

  const store = {
    /** 実際に保存できるか（書いて消してみる） */
    available(): boolean {
      const ok = writeRaw('__test__', '1');
      remove('__test__');
      return ok;
    },

    getStats(): StatsMap {
      return sanitizeStats(read('stats'));
    },
    /** 1問の結果を記録する。保存できなかった場合も計算後の記録を返す */
    recordResult(id: string, correct: boolean, subject?: string): StatsMap {
      const stats = applyResult(store.getStats(), id, correct, subject, Date.now());
      write('stats', stats);
      return stats;
    },

    getRanges(): MyRange[] {
      return sanitizeRanges(read('ranges'));
    },
    saveRange(range: MyRange): MyRange[] {
      const list = addRange(store.getRanges(), range);
      write('ranges', list);
      return list;
    },
    renameRange(id: string, name: string): MyRange[] {
      const list = store.getRanges().map((r) => (r.id === id ? { ...r, name } : r));
      write('ranges', sanitizeRanges(list));
      return store.getRanges();
    },
    removeRange(id: string): MyRange[] {
      const list = store.getRanges().filter((r) => r.id !== id);
      write('ranges', list);
      return list;
    },

    getHistory(): HistoryEntry[] {
      return sanitizeHistory(read('history'));
    },
    addHistory(entry: HistoryEntry): HistoryEntry[] {
      const list = addHistoryEntry(store.getHistory(), entry);
      write('history', list);
      return list;
    },

    getSettings(): Settings {
      return sanitizeSettings(read('settings'));
    },
    saveSettings(patch: Partial<Settings>): Settings {
      const settings = sanitizeSettings({ ...store.getSettings(), ...patch });
      write('settings', settings);
      return settings;
    },

    /** 教科書ページで最後に選んだ範囲（クエリ文字列） */
    getBuilderState(textbookId: string): string | null {
      const v = read(`builder:${textbookId}`);
      return typeof v === 'string' ? v : null;
    },
    saveBuilderState(textbookId: string, query: string): void {
      write(`builder:${textbookId}`, query);
    },

    /** 表示テーマ（<head> のスクリプトが読むので JSON ではなく文字列のまま保存する） */
    getTheme(): ThemeMode | null {
      const v = readRaw('theme');
      return v === 'light' || v === 'dark' ? v : null;
    },
    setTheme(mode: ThemeMode | null): void {
      if (mode) writeRaw('theme', mode);
      else remove('theme');
    },

    clear(kind: 'stats' | 'ranges' | 'history'): void {
      remove(kind);
    },
  };
  return store;
}

export type Store = ReturnType<typeof createStore>;

export const store: Store = createStore(getBrowserStorage());
