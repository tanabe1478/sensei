import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhAllowlistStore } from '../src/gh/store.js';

describe('GhAllowlistStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-gh-store-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should start with empty allowlist', () => {
    const store = new GhAllowlistStore(tmpDir);
    expect(store.list()).toEqual([]);
  });

  it('should add a pattern', () => {
    const store = new GhAllowlistStore(tmpDir);
    const entry = store.add('pr create');
    expect(entry.pattern).toBe('pr create');
    expect(store.list()).toHaveLength(1);
  });

  it('should not add duplicate patterns', () => {
    const store = new GhAllowlistStore(tmpDir);
    store.add('pr create');
    store.add('pr create');
    expect(store.list()).toHaveLength(1);
  });

  it('should remove a pattern', () => {
    const store = new GhAllowlistStore(tmpDir);
    store.add('pr create');
    expect(store.remove('pr create')).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('should return false when removing non-existent pattern', () => {
    const store = new GhAllowlistStore(tmpDir);
    expect(store.remove('nonexistent')).toBe(false);
  });

  it('should check if command is allowed', () => {
    const store = new GhAllowlistStore(tmpDir);
    store.add('pr create');
    expect(store.isAllowed('pr', 'create')).toBe(true);
    expect(store.isAllowed('pr', 'merge')).toBe(false);
  });

  it('should support wildcard patterns', () => {
    const store = new GhAllowlistStore(tmpDir);
    store.add('pr *');
    expect(store.isAllowed('pr', 'create')).toBe(true);
    expect(store.isAllowed('pr', 'merge')).toBe(true);
    expect(store.isAllowed('issue', 'create')).toBe(false);
  });

  it('should update lastUsedAt on touch', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const store = new GhAllowlistStore(tmpDir);
    store.add('pr create');
    const before = store.list()[0].lastUsedAt;

    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    store.touch('pr create');
    const after = store.list()[0].lastUsedAt;
    expect(after).not.toBe(before);
    vi.useRealTimers();
  });

  it('should persist across instances', () => {
    const store1 = new GhAllowlistStore(tmpDir);
    store1.add('pr create');
    store1.add('issue list');

    const store2 = new GhAllowlistStore(tmpDir);
    expect(store2.list()).toHaveLength(2);
    expect(store2.isAllowed('pr', 'create')).toBe(true);
  });

  it('should write atomically (tmp + rename)', () => {
    const store = new GhAllowlistStore(tmpDir);
    store.add('pr create');
    const content = readFileSync(join(tmpDir, 'gh-allowlist.json'), 'utf-8');
    expect(JSON.parse(content)).toHaveLength(1);
  });
});
