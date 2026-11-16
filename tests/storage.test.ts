import { describe, expect, it } from 'vitest';
import { createStore, getBrowserStorage, type KeyValueStorage } from '../src/client/storage';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

/** プライベートブラウズや容量オーバーのように、すべての操作で例外を出すストレージ */
const throwing: KeyValueStorage = {
  getItem() {
    throw new Error('SecurityError');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
  removeItem() {
    throw new Error('SecurityError');
  },
};

describe('createStore', () => {
  it('記録・マイ範囲・設定を保存して読み戻せる', () => {
    const mem = new MemoryStorage();
    const store = createStore(mem, 'p:');
    expect(store.available()).toBe(true);
    store.recordResult('q1', false, 's');
    store.recordResult('q1', true, 's');
    expect(store.getStats().q1).toMatchObject({ c: 1, w: 1, r: 1, s: 's' });
    store.saveRange({ id: 'r1', name: '中間テスト', query: 'tb=x&r=1', subject: 's', createdAt: 1 });
    store.renameRange('r1', '期末テスト');
    expect(store.getRanges().map((r) => r.name)).toEqual(['期末テスト']);
    store.removeRange('r1');
    expect(store.getRanges()).toEqual([]);
    expect(store.saveSettings({ answerMode: 'input' })).toEqual({ answerMode: 'input' });
    expect(store.getSettings().answerMode).toBe('input');
    store.saveBuilderState('tb1', 'r=1-2');
    expect(store.getBuilderState('tb1')).toBe('r=1-2');
    store.addHistory({ t: 1, title: 't', query: 'q', total: 3, correct: 2 });
    expect(store.getHistory()).toHaveLength(1);
    store.clear('history');
    expect(store.getHistory()).toEqual([]);
    // キーには接頭辞が付く
    expect([...mem.data.keys()].every((k) => k.startsWith('p:'))).toBe(true);
  });

  it('表示テーマは文字列のまま保存する（<head> のスクリプトが読むため）', () => {
    const mem = new MemoryStorage();
    const store = createStore(mem, 'p:');
    store.setTheme('dark');
    expect(mem.data.get('p:theme')).toBe('dark');
    expect(store.getTheme()).toBe('dark');
    store.setTheme(null);
    expect(store.getTheme()).toBeNull();
  });

  it('ストレージが例外を出しても、例外を外に出さず既定値で動く', () => {
    const store = createStore(throwing);
    expect(store.available()).toBe(false);
    expect(() => store.recordResult('q1', true, 's')).not.toThrow();
    expect(store.recordResult('q1', true, 's').q1).toMatchObject({ c: 1 });
    expect(store.getStats()).toEqual({});
    expect(store.getRanges()).toEqual([]);
    expect(store.getSettings()).toEqual({ answerMode: 'self' });
    expect(() => store.saveRange({ id: 'r', name: 'n', query: 'q', subject: 's', createdAt: 0 })).not.toThrow();
    expect(() => store.clear('stats')).not.toThrow();
    expect(() => store.setTheme('light')).not.toThrow();
    expect(store.getTheme()).toBeNull();
  });

  it('ストレージがない環境（null）でも動く', () => {
    const store = createStore(null);
    expect(store.available()).toBe(false);
    expect(store.getHistory()).toEqual([]);
  });

  it('壊れた JSON は既定値として扱う', () => {
    const mem = new MemoryStorage();
    mem.setItem('p:stats', '{broken');
    mem.setItem('p:ranges', '"not an array"');
    const store = createStore(mem, 'p:');
    expect(store.getStats()).toEqual({});
    expect(store.getRanges()).toEqual([]);
  });

  it('window がない環境では getBrowserStorage は null', () => {
    expect(getBrowserStorage()).toBeNull();
  });
});
