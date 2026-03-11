import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../src/session/store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SessionStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('get/set でセッションを保存・取得できる', () => {
    const store = new SessionStore(tmpDir);
    store.set('ch-1', 'sess-abc');
    expect(store.get('ch-1')).toBe('sess-abc');
  });

  it('存在しないキーは undefined', () => {
    const store = new SessionStore(tmpDir);
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('delete でセッションを削除できる', () => {
    const store = new SessionStore(tmpDir);
    store.set('ch-1', 'sess-abc');
    const deleted = store.delete('ch-1');
    expect(deleted).toBe(true);
    expect(store.get('ch-1')).toBeUndefined();
  });

  it('存在しないキーの delete は false', () => {
    const store = new SessionStore(tmpDir);
    expect(store.delete('nonexistent')).toBe(false);
  });

  it('size でセッション数を取得できる', () => {
    const store = new SessionStore(tmpDir);
    expect(store.size).toBe(0);
    store.set('ch-1', 'sess-1');
    store.set('ch-2', 'sess-2');
    expect(store.size).toBe(2);
  });

  it('ファイルから復元できる', () => {
    const store1 = new SessionStore(tmpDir);
    store1.set('ch-1', 'sess-abc');
    store1.set('ch-2', 'sess-def');

    const store2 = new SessionStore(tmpDir);
    expect(store2.get('ch-1')).toBe('sess-abc');
    expect(store2.get('ch-2')).toBe('sess-def');
    expect(store2.size).toBe(2);
  });

  it('上書きできる', () => {
    const store = new SessionStore(tmpDir);
    store.set('ch-1', 'old');
    store.set('ch-1', 'new');
    expect(store.get('ch-1')).toBe('new');
  });
});
