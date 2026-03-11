import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LearningStore } from '../src/learning/store.js';
import { createReviewItem } from '../src/learning/spaced-repetition.js';
import type { LearningLog, Experiment, ErrorEntry } from '../src/learning/types.js';

describe('LearningStore', () => {
  let store: LearningStore;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sensei-test-'));
    store = new LearningStore(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('プロジェクト管理', () => {
    it('プロジェクトを作成できる', () => {
      const project = store.createProject('ime');
      expect(project.name).toBe('ime');
      expect(project.createdAt).toBeTruthy();
    });

    it('プロジェクト一覧を取得できる', () => {
      store.createProject('ime');
      store.createProject('rust');
      const projects = store.listProjects();
      expect(projects).toHaveLength(2);
    });

    it('ensureProject は既存なら何もしない', () => {
      store.createProject('ime');
      store.ensureProject('ime');
      expect(store.listProjects()).toHaveLength(1);
    });
  });

  describe('学習ログ', () => {
    const testLog: LearningLog = {
      date: '2026-03-11',
      focus: 'かな漢字変換',
      learned: ['Viterbi アルゴリズム'],
      unclear: ['辞書構造'],
      designDecisions: ['trie を選択'],
      nextHypothesis: 'ダブル配列の方が速いか',
    };

    it('ログを追加・取得できる', () => {
      store.addLog('ime', testLog);
      const retrieved = store.getLog('ime', '2026-03-11');
      expect(retrieved).toEqual(testLog);
    });

    it('最新ログを取得できる', () => {
      store.addLog('ime', testLog);
      store.addLog('ime', { ...testLog, date: '2026-03-12', focus: '辞書' });
      const latest = store.getLatestLog('ime');
      expect(latest?.focus).toBe('辞書');
    });

    it('ログ数を取得できる', () => {
      store.addLog('ime', testLog);
      store.addLog('ime', { ...testLog, date: '2026-03-12' });
      expect(store.getLogCount('ime')).toBe(2);
    });

    it('存在しないログは null', () => {
      store.ensureProject('ime');
      expect(store.getLog('ime', '2099-01-01')).toBeNull();
    });
  });

  describe('復習アイテム', () => {
    it('アイテムを追加・取得できる', () => {
      const item = createReviewItem('Viterbi', 'ビタビアルゴリズムの説明');
      store.addReviewItem('ime', item);
      const items = store.getReviewItems('ime');
      expect(items).toHaveLength(1);
      expect(items[0].topic).toBe('Viterbi');
    });

    it('アイテムを更新できる', () => {
      const item = createReviewItem('Viterbi', '説明');
      store.addReviewItem('ime', item);
      store.updateReviewItem('ime', item.id, { repetitions: 1, interval: 3 });
      const items = store.getReviewItems('ime');
      expect(items[0].repetitions).toBe(1);
      expect(items[0].interval).toBe(3);
    });

    it('アイテムを削除できる', () => {
      const item = createReviewItem('Viterbi', '説明');
      store.addReviewItem('ime', item);
      store.removeReviewItem('ime', item.id);
      expect(store.getReviewItems('ime')).toHaveLength(0);
    });
  });

  describe('実験帳', () => {
    const testExperiment: Experiment = {
      id: 'exp-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      hypothesis: 'ダブル配列は trie より速い',
      method: 'ベンチマーク比較',
    };

    it('実験を追加・取得できる', () => {
      store.addExperiment('ime', testExperiment);
      const experiments = store.getExperiments('ime');
      expect(experiments).toHaveLength(1);
      expect(experiments[0].hypothesis).toBe('ダブル配列は trie より速い');
    });

    it('実験を更新できる', () => {
      store.addExperiment('ime', testExperiment);
      store.updateExperiment('ime', 'exp-1', {
        result: 'ダブル配列が2倍速い',
        conclusion: '採用する',
        completedAt: '2026-03-12T00:00:00.000Z',
      });
      const experiments = store.getExperiments('ime');
      expect(experiments[0].result).toBe('ダブル配列が2倍速い');
    });
  });

  describe('誤り台帳', () => {
    const testError: ErrorEntry = {
      id: 'err-1',
      createdAt: '2026-03-11T00:00:00.000Z',
      category: 'アルゴリズム',
      description: 'Viterbi のコスト計算を逆にした',
    };

    it('エラーを追加・取得できる', () => {
      store.addError('ime', testError);
      const errors = store.getErrors('ime');
      expect(errors).toHaveLength(1);
      expect(errors[0].category).toBe('アルゴリズム');
    });
  });

  describe('進捗', () => {
    it('プロジェクトの進捗を取得できる', () => {
      store.createProject('ime');
      const progress = store.getProgress('ime');
      expect(progress.projectName).toBe('ime');
      expect(progress.totalLogs).toBe(0);
      expect(progress.totalReviewItems).toBe(0);
    });
  });
});
