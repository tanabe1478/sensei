import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextManager } from '../src/conversation/context-manager.js';
import { ConversationStore } from '../src/conversation/store.js';
import { MemoryStore } from '../src/memory/store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextManager', () => {
  let tmpDir: string;
  let store: ConversationStore;
  let memoryStore: MemoryStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-ctx-test-'));
    store = new ConversationStore(tmpDir);
    memoryStore = new MemoryStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('estimateTokens', () => {
    it('日本語向け安全マージン: JSON文字列長 / 3 でトークンを見積もる', () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 4000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      const messages = [
        { role: 'user' as const, content: 'hello', timestamp: '2026-01-01T00:00:00Z' },
      ];
      const tokens = manager.estimateTokens(messages);
      const expected = Math.ceil(JSON.stringify(messages).length / 3);
      expect(tokens).toBe(expected);
    });
  });

  describe('buildHistory', () => {
    it('予算内なら全メッセージがそのまま返る', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 10000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      store.append('ch-1', 'user', 'こんにちは');
      store.append('ch-1', 'assistant', 'やあ！');
      store.append('ch-1', 'user', '元気？');

      const history = await manager.buildHistory('ch-1');
      expect(history).toContain('こんにちは');
      expect(history).toContain('やあ！');
      expect(history).toContain('元気？');
    });

    it('メッセージがなければ空文字を返す', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 4000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      const history = await manager.buildHistory('ch-empty');
      expect(history).toBe('');
    });

    it('予算超過時に compaction が実行される', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 50,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      vi.spyOn(manager, 'compactMessages').mockResolvedValue({
        historyEntry: '要約された会話',
        memoryUpdate: null,
      });

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `質問${i}: これは長めのメッセージです。テスト用に文字数を増やしています。`);
        store.append('ch-1', 'assistant', `回答${i}: こちらも長めの応答です。コンテキストの予算を超過させるためです。`);
      }

      const history = await manager.buildHistory('ch-1');

      expect(history).toContain('要約された会話');
      expect(history).toContain('質問19');
      expect(history).toContain('回答19');
    });

    it('直近5ターンが保護される', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 50,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      vi.spyOn(manager, 'compactMessages').mockResolvedValue({
        historyEntry: '圧縮された要約',
        memoryUpdate: null,
      });

      for (let i = 0; i < 12; i++) {
        store.append('ch-1', i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`);
      }

      const history = await manager.buildHistory('ch-1');

      expect(history).toContain('msg-2');
      expect(history).toContain('msg-11');
    });

    it('compaction 後にストアが更新される', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 50,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      vi.spyOn(manager, 'compactMessages').mockResolvedValue({
        historyEntry: '要約テキスト',
        memoryUpdate: null,
      });

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `長い質問${i}。これは十分に長いメッセージです。`);
        store.append('ch-1', 'assistant', `長い応答${i}。これも十分に長いメッセージです。`);
      }

      await manager.buildHistory('ch-1');

      const messages = store.getAll('ch-1');
      expect(messages[0].role).toBe('summary');
      expect(messages[0].content).toBe('要約テキスト');
    });

    it('APIキーなしで予算超過時は 70/20/10 truncation で返す', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 200,
        compactionModel: 'gpt-4o-mini',
        idleMinutes: 60,
      });

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `質問${i}: これは長めのメッセージです。テスト用に文字数を増やしています。`);
        store.append('ch-1', 'assistant', `回答${i}: こちらも長めの応答です。コンテキストの予算を超過させるためです。`);
      }

      const history = await manager.buildHistory('ch-1');

      // 先頭のメッセージが含まれる（70% head）
      expect(history).toContain('質問0');
      // 末尾のメッセージが含まれる（20% tail）
      expect(history).toContain('回答19');
      // 省略マーカーが含まれる
      expect(history).toContain('中略');
      // ストアは変更されていない
      expect(store.getAll('ch-1')).toHaveLength(40);
    });

    // Phase 1: compaction失敗時のフォールバック
    it('compaction 失敗時は直近メッセージのみ返し、ストアは変更しない', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 50,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      vi.spyOn(manager, 'compactMessages').mockRejectedValue(new Error('API error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `質問${i}`);
        store.append('ch-1', 'assistant', `回答${i}`);
      }

      const originalCount = store.getAll('ch-1').length;
      const history = await manager.buildHistory('ch-1');

      // 直近メッセージが返る
      expect(history).toContain('質問19');
      expect(history).toContain('回答19');
      // ストアは変更されない（データロス防止）
      expect(store.getAll('ch-1')).toHaveLength(originalCount);
      // エラーがログに出る
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Compaction failed'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    // Phase 1: アイドルリセット
    it('アイドル時間超過でリセットされ空文字を返す', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 10000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      // 2時間前のタイムスタンプでメッセージを追加
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const filePath = join(tmpDir, 'conversations', 'ch-idle.jsonl');
      const { writeFileSync, mkdirSync } = await import('fs');
      mkdirSync(join(tmpDir, 'conversations'), { recursive: true });
      const msg = JSON.stringify({ role: 'user', content: '古いメッセージ', timestamp: twoHoursAgo });
      writeFileSync(filePath, msg + '\n', 'utf-8');

      const history = await manager.buildHistory('ch-idle');

      expect(history).toBe('');
      // ストアがクリアされている
      expect(store.getAll('ch-idle')).toHaveLength(0);
    });

    it('アイドル時間内であればリセットされない', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 10000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      store.append('ch-active', 'user', '最近のメッセージ');

      const history = await manager.buildHistory('ch-active');

      expect(history).toContain('最近のメッセージ');
    });

    // Phase 3: 構造化compaction — memory_update がMemoryStoreに保存される
    it('compaction で memory_update があれば MemoryStore に追記される', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 50,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      vi.spyOn(manager, 'compactMessages').mockResolvedValue({
        historyEntry: '要約テキスト',
        memoryUpdate: 'ユーザーはTypeScriptが得意。締切は金曜日。',
      });

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `質問${i}。長いメッセージです。`);
        store.append('ch-1', 'assistant', `回答${i}。長い応答です。`);
      }

      await manager.buildHistory('ch-1');

      const longTerm = memoryStore.readLongTerm();
      expect(longTerm).toContain('ユーザーはTypeScriptが得意');
      expect(longTerm).toContain('締切は金曜日');
    });

    it('compaction で memory_update が null なら MemoryStore は変更されない', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 50,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      vi.spyOn(manager, 'compactMessages').mockResolvedValue({
        historyEntry: '要約テキスト',
        memoryUpdate: null,
      });

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `質問${i}。長いメッセージです。`);
        store.append('ch-1', 'assistant', `回答${i}。長い応答です。`);
      }

      await manager.buildHistory('ch-1');

      expect(memoryStore.readLongTerm()).toBe('');
    });

    // Phase 3: アイドルリセット時に最後の要約を退避
    it('アイドルリセット時に直前の要約が退避され、次回初回に注入される', async () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 10000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });

      // 要約付きの古いメッセージをファイルに直接書き込む
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { writeFileSync, mkdirSync } = await import('fs');
      mkdirSync(join(tmpDir, 'conversations'), { recursive: true });
      const summaryMsg = JSON.stringify({
        role: 'summary',
        content: '前回の会話要約: TypeScript移行について議論した',
        timestamp: twoHoursAgo,
      });
      const userMsg = JSON.stringify({
        role: 'user',
        content: '古い質問',
        timestamp: twoHoursAgo,
      });
      writeFileSync(
        join(tmpDir, 'conversations', 'ch-resume.jsonl'),
        summaryMsg + '\n' + userMsg + '\n',
        'utf-8',
      );

      // アイドルリセット発動
      const history = await manager.buildHistory('ch-resume');
      expect(history).toBe('');

      // last-summary が退避されている
      const lastSummary = store.getLastSummary('ch-resume');
      expect(lastSummary).toContain('TypeScript移行について議論した');

      // 新しいメッセージを追加して再度buildHistory
      store.append('ch-resume', 'user', '新しい質問');
      const history2 = await manager.buildHistory('ch-resume');

      // 前回の要約が注入される
      expect(history2).toContain('これまでの会話の要約');
      expect(history2).toContain('TypeScript移行について議論した');
      expect(history2).toContain('新しい質問');
    });
  });

  describe('truncateMessages (70/20/10)', () => {
    it('予算が十分なら全メッセージを返す', () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 10000,
        compactionModel: 'gpt-4o-mini',
        idleMinutes: 60,
      });
      const messages = [
        { role: 'user' as const, content: 'hello', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant' as const, content: 'hi', timestamp: '2026-01-01T00:00:01Z' },
      ];
      const result = manager.truncateMessages(messages, 10000);
      expect(result).toHaveLength(2);
    });

    it('予算超過時に先頭と末尾を保持し中間を省略する', () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 10000,
        compactionModel: 'gpt-4o-mini',
        idleMinutes: 60,
      });

      const messages = Array.from({ length: 30 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `メッセージ${i}の内容です。これは十分に長いテストメッセージです。`,
        timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
      }));

      // 全メッセージの半分程度の予算
      const totalTokens = manager.estimateTokens(messages);
      const result = manager.truncateMessages(messages, Math.floor(totalTokens * 0.5));

      // 先頭のメッセージが含まれる
      expect(result.some((m) => m.content.includes('メッセージ0'))).toBe(true);
      // 末尾のメッセージが含まれる
      expect(result.some((m) => m.content.includes('メッセージ29'))).toBe(true);
      // 省略マーカーが含まれる
      expect(result.some((m) => m.role === 'summary' && m.content.includes('中略'))).toBe(true);
      // 元のメッセージ数より少ない
      expect(result.length).toBeLessThan(messages.length);
    });
  });

  describe('formatHistory', () => {
    it('ユーザーとアシスタントのメッセージを整形する', () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 4000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      const messages = [
        { role: 'user' as const, content: 'こんにちは', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant' as const, content: 'やあ！', timestamp: '2026-01-01T00:00:01Z' },
      ];
      const formatted = manager.formatHistory(messages);
      expect(formatted).toContain('ユーザー: こんにちは');
      expect(formatted).toContain('アシスタント: やあ！');
    });

    it('要約メッセージは要約セクションとして整形する', () => {
      const manager = new ContextManager(store, memoryStore, {
        tokenBudget: 4000,
        compactionModel: 'gpt-4o-mini',
        openaiApiKey: 'test',
        idleMinutes: 60,
      });
      const messages = [
        { role: 'summary' as const, content: '以前の会話の要約', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'user' as const, content: '新しい質問', timestamp: '2026-01-01T00:00:01Z' },
      ];
      const formatted = manager.formatHistory(messages);
      expect(formatted).toContain('これまでの会話の要約');
      expect(formatted).toContain('以前の会話の要約');
      expect(formatted).toContain('直近の会話');
      expect(formatted).toContain('ユーザー: 新しい質問');
    });
  });
});
