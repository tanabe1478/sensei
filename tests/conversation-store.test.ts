import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationStore } from '../src/conversation/store.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ConversationStore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-conv-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('append でメッセージを追加し getAll で取得できる', () => {
    const store = new ConversationStore(tmpDir);
    store.append('ch-1', 'user', 'こんにちは');
    store.append('ch-1', 'assistant', 'やあ！');

    const messages = store.getAll('ch-1');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('こんにちは');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('やあ！');
  });

  it('チャンネル間でメッセージが分離される', () => {
    const store = new ConversationStore(tmpDir);
    store.append('ch-1', 'user', 'チャンネル1');
    store.append('ch-2', 'user', 'チャンネル2');

    expect(store.getAll('ch-1')).toHaveLength(1);
    expect(store.getAll('ch-1')[0].content).toBe('チャンネル1');
    expect(store.getAll('ch-2')).toHaveLength(1);
    expect(store.getAll('ch-2')[0].content).toBe('チャンネル2');
  });

  it('存在しないチャンネルは空配列を返す', () => {
    const store = new ConversationStore(tmpDir);
    expect(store.getAll('nonexistent')).toEqual([]);
  });

  it('clear でチャンネルの会話をクリアできる', () => {
    const store = new ConversationStore(tmpDir);
    store.append('ch-1', 'user', 'テスト');
    store.clear('ch-1');
    expect(store.getAll('ch-1')).toEqual([]);
  });

  it('replaceWithCompaction で要約と直近メッセージに置換できる', () => {
    const store = new ConversationStore(tmpDir);
    store.append('ch-1', 'user', '古い1');
    store.append('ch-1', 'assistant', '古い応答1');
    store.append('ch-1', 'user', '古い2');
    store.append('ch-1', 'assistant', '古い応答2');
    store.append('ch-1', 'user', '最近の質問');
    store.append('ch-1', 'assistant', '最近の応答');

    const recent = store.getAll('ch-1').slice(-2);
    store.replaceWithCompaction('ch-1', '以前の会話の要約です', recent);

    const messages = store.getAll('ch-1');
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('summary');
    expect(messages[0].content).toBe('以前の会話の要約です');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('最近の質問');
    expect(messages[2].role).toBe('assistant');
    expect(messages[2].content).toBe('最近の応答');
  });

  it('JSONL ファイルに永続化される', () => {
    const store = new ConversationStore(tmpDir);
    store.append('ch-1', 'user', 'テスト');

    const filePath = join(tmpDir, 'conversations', 'ch-1.jsonl');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8').trim();
    const parsed = JSON.parse(content);
    expect(parsed.role).toBe('user');
    expect(parsed.content).toBe('テスト');
  });

  it('ファイルから復元できる', () => {
    const store1 = new ConversationStore(tmpDir);
    store1.append('ch-1', 'user', 'メッセージ1');
    store1.append('ch-1', 'assistant', '応答1');

    const store2 = new ConversationStore(tmpDir);
    const messages = store2.getAll('ch-1');
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('メッセージ1');
    expect(messages[1].content).toBe('応答1');
  });

  it('最大200件を超えるメッセージは古いものが切り捨てられる', () => {
    const store = new ConversationStore(tmpDir);
    for (let i = 0; i < 210; i++) {
      store.append('ch-1', 'user', `msg-${i}`);
    }

    const messages = store.getAll('ch-1');
    expect(messages).toHaveLength(200);
    expect(messages[0].content).toBe('msg-10');
    expect(messages[199].content).toBe('msg-209');
  });

  it('timestamp が ISO 形式で記録される', () => {
    const store = new ConversationStore(tmpDir);
    store.append('ch-1', 'user', 'テスト');

    const messages = store.getAll('ch-1');
    expect(() => new Date(messages[0].timestamp)).not.toThrow();
    expect(new Date(messages[0].timestamp).toISOString()).toBe(messages[0].timestamp);
  });
});
