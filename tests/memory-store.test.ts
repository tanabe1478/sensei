import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../src/memory/store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MemoryStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-mem-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('初期状態で長期記憶は空', () => {
    const store = new MemoryStore(tmpDir);
    expect(store.readLongTerm()).toBe('');
  });

  it('長期記憶に追記できる', () => {
    const store = new MemoryStore(tmpDir);
    store.appendLongTerm('ユーザーはIMEを作っている');
    store.appendLongTerm('好きな言語はTypeScript');
    const content = store.readLongTerm();
    expect(content).toContain('ユーザーはIMEを作っている');
    expect(content).toContain('好きな言語はTypeScript');
  });

  it('長期記憶を上書きできる', () => {
    const store = new MemoryStore(tmpDir);
    store.appendLongTerm('古い情報');
    store.writeLongTerm('新しい情報');
    expect(store.readLongTerm()).toBe('新しい情報');
  });

  it('日次ログに追記・読み込みできる', () => {
    const store = new MemoryStore(tmpDir);
    store.appendDaily('タスクAを完了');
    store.appendDaily('タスクBに着手');
    const daily = store.readDaily();
    expect(daily).toContain('タスクAを完了');
    expect(daily).toContain('タスクBに着手');
  });

  it('キーワードでメモリを検索できる', () => {
    const store = new MemoryStore(tmpDir);
    store.appendLongTerm('ユーザーはIMEを開発中');
    store.appendDaily('IMEのキーマッピングを実装した');
    const results = store.search('IME');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.lines.some((l) => l.includes('IME')))).toBe(true);
  });

  it('一致しないキーワードは空結果', () => {
    const store = new MemoryStore(tmpDir);
    store.appendLongTerm('何かの情報');
    const results = store.search('存在しないキーワード');
    expect(results).toEqual([]);
  });

  it('summary が概要を返す', () => {
    const store = new MemoryStore(tmpDir);
    expect(store.summary()).toContain('メモリは空です');
    store.appendLongTerm('テストデータ');
    const summary = store.summary();
    expect(summary).toContain('メモリ');
    expect(summary).toContain('長期記憶');
  });
});
