import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextManager } from '../src/conversation/context-manager.js';
import { ConversationStore } from '../src/conversation/store.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ContextManager', () => {
  let tmpDir: string;
  let store: ConversationStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-ctx-test-'));
    store = new ConversationStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('estimateTokens', () => {
    it('JSON文字列長 / 4 でトークンを見積もる', () => {
      const manager = new ContextManager(store, { tokenBudget: 4000, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
      const messages = [
        { role: 'user' as const, content: 'hello', timestamp: '2026-01-01T00:00:00Z' },
      ];
      const tokens = manager.estimateTokens(messages);
      const expected = Math.ceil(JSON.stringify(messages).length / 4);
      expect(tokens).toBe(expected);
    });
  });

  describe('buildHistory', () => {
    it('予算内なら全メッセージがそのまま返る', async () => {
      const manager = new ContextManager(store, { tokenBudget: 10000, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
      store.append('ch-1', 'user', 'こんにちは');
      store.append('ch-1', 'assistant', 'やあ！');
      store.append('ch-1', 'user', '元気？');

      const history = await manager.buildHistory('ch-1');
      expect(history).toContain('こんにちは');
      expect(history).toContain('やあ！');
      expect(history).toContain('元気？');
    });

    it('メッセージがなければ空文字を返す', async () => {
      const manager = new ContextManager(store, { tokenBudget: 4000, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
      const history = await manager.buildHistory('ch-empty');
      expect(history).toBe('');
    });

    it('予算超過時に compaction が実行される', async () => {
      // 非常に小さいトークン予算を設定
      const manager = new ContextManager(store, { tokenBudget: 50, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });

      // compactMessages をモック
      const compactSpy = vi.spyOn(manager, 'compactMessages').mockResolvedValue('要約された会話');

      // 多くのメッセージを追加
      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `質問${i}: これは長めのメッセージです。テスト用に文字数を増やしています。`);
        store.append('ch-1', 'assistant', `回答${i}: こちらも長めの応答です。コンテキストの予算を超過させるためです。`);
      }

      const history = await manager.buildHistory('ch-1');

      expect(compactSpy).toHaveBeenCalled();
      expect(history).toContain('要約された会話');
      // 直近5ターン(10メッセージ)は保護される
      expect(history).toContain('質問19');
      expect(history).toContain('回答19');
    });

    it('直近5ターンが保護される', async () => {
      const manager = new ContextManager(store, { tokenBudget: 50, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
      vi.spyOn(manager, 'compactMessages').mockResolvedValue('圧縮された要約');

      for (let i = 0; i < 12; i++) {
        store.append('ch-1', i % 2 === 0 ? 'user' : 'assistant', `msg-${i}`);
      }

      const history = await manager.buildHistory('ch-1');

      // 最後の10メッセージ(5ターン)が保護される
      expect(history).toContain('msg-2');
      expect(history).toContain('msg-11');
    });

    it('compaction 後にストアが更新される', async () => {
      const manager = new ContextManager(store, { tokenBudget: 50, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
      vi.spyOn(manager, 'compactMessages').mockResolvedValue('要約テキスト');

      for (let i = 0; i < 20; i++) {
        store.append('ch-1', 'user', `長い質問${i}。これは十分に長いメッセージです。`);
        store.append('ch-1', 'assistant', `長い応答${i}。これも十分に長いメッセージです。`);
      }

      await manager.buildHistory('ch-1');

      // ストアが compaction 結果に置き換わっている
      const messages = store.getAll('ch-1');
      expect(messages[0].role).toBe('summary');
      expect(messages[0].content).toBe('要約テキスト');
    });
  });

  describe('formatHistory', () => {
    it('ユーザーとアシスタントのメッセージを整形する', () => {
      const manager = new ContextManager(store, { tokenBudget: 4000, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
      const messages = [
        { role: 'user' as const, content: 'こんにちは', timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant' as const, content: 'やあ！', timestamp: '2026-01-01T00:00:01Z' },
      ];
      const formatted = manager.formatHistory(messages);
      expect(formatted).toContain('ユーザー: こんにちは');
      expect(formatted).toContain('アシスタント: やあ！');
    });

    it('要約メッセージは要約セクションとして整形する', () => {
      const manager = new ContextManager(store, { tokenBudget: 4000, compactionModel: 'gpt-4o-mini', openaiApiKey: 'test' });
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
