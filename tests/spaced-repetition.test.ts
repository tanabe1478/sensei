import { describe, it, expect } from 'vitest';
import {
  calculateNextReview,
  createReviewItem,
  getDueItems,
  getOverdueItems,
} from '../src/learning/spaced-repetition.js';
import type { ReviewItem } from '../src/learning/types.js';

describe('createReviewItem', () => {
  it('デフォルトの ease factor は 2.5', () => {
    const item = createReviewItem('テスト', '内容');
    expect(item.easeFactor).toBe(2.5);
    expect(item.repetitions).toBe(0);
    expect(item.interval).toBe(0);
    expect(item.topic).toBe('テスト');
    expect(item.content).toBe('内容');
  });

  it('source を指定できる', () => {
    const item = createReviewItem('テスト', '内容', 'log');
    expect(item.source).toBe('log');
  });

  it('id が生成される', () => {
    const a = createReviewItem('a', 'a');
    const b = createReviewItem('b', 'b');
    expect(a.id).not.toBe(b.id);
  });
});

describe('calculateNextReview', () => {
  const baseItem: ReviewItem = {
    id: 'test-1',
    topic: 'テスト',
    content: '内容',
    createdAt: '2026-01-01T00:00:00.000Z',
    nextReview: '2026-01-02T00:00:00.000Z',
    interval: 1,
    easeFactor: 2.5,
    repetitions: 0,
  };

  it('quality < 3 でリセットされる', () => {
    const result = calculateNextReview(baseItem, 2);
    expect(result.repetitions).toBe(0);
    expect(result.interval).toBe(1);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it('quality = 0 で ease factor が下がる', () => {
    const result = calculateNextReview(baseItem, 0);
    expect(result.easeFactor).toBe(2.3);
  });

  it('初回正解で interval = 1', () => {
    const result = calculateNextReview(baseItem, 4);
    expect(result.repetitions).toBe(1);
    expect(result.interval).toBe(1);
  });

  it('2回目正解で interval = 3', () => {
    const item = { ...baseItem, repetitions: 1 };
    const result = calculateNextReview(item, 4);
    expect(result.repetitions).toBe(2);
    expect(result.interval).toBe(3);
  });

  it('3回目以降は interval * easeFactor', () => {
    const item = { ...baseItem, repetitions: 2, interval: 3 };
    const result = calculateNextReview(item, 5);
    expect(result.repetitions).toBe(3);
    expect(result.interval).toBe(Math.round(3 * result.easeFactor));
  });

  it('ease factor は 1.3 を下回らない', () => {
    const item = { ...baseItem, easeFactor: 1.3 };
    const result = calculateNextReview(item, 0);
    expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it('quality = 5 で ease factor が上がる', () => {
    const result = calculateNextReview(baseItem, 5);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });
});

describe('getDueItems', () => {
  const now = new Date('2026-03-11T12:00:00.000Z');

  it('今日が期限のアイテムを返す', () => {
    const items: ReviewItem[] = [
      { ...createReviewItem('a', 'a'), nextReview: '2026-03-11T08:00:00.000Z' },
      { ...createReviewItem('b', 'b'), nextReview: '2026-03-12T08:00:00.000Z' },
    ];
    const due = getDueItems(items, now);
    expect(due).toHaveLength(1);
    expect(due[0].topic).toBe('a');
  });

  it('過去のアイテムも含む', () => {
    const items: ReviewItem[] = [
      { ...createReviewItem('a', 'a'), nextReview: '2026-03-09T00:00:00.000Z' },
      { ...createReviewItem('b', 'b'), nextReview: '2026-03-11T10:00:00.000Z' },
    ];
    const due = getDueItems(items, now);
    expect(due).toHaveLength(2);
  });

  it('空配列なら空を返す', () => {
    expect(getDueItems([], now)).toHaveLength(0);
  });
});

describe('getOverdueItems', () => {
  const now = new Date('2026-03-11T12:00:00.000Z');

  it('今日より前が期限のアイテムだけ返す', () => {
    const items: ReviewItem[] = [
      { ...createReviewItem('past', 'p'), nextReview: '2026-03-09T00:00:00.000Z' },
      { ...createReviewItem('today', 't'), nextReview: '2026-03-11T08:00:00.000Z' },
      { ...createReviewItem('future', 'f'), nextReview: '2026-03-15T00:00:00.000Z' },
    ];
    const overdue = getOverdueItems(items, now);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].topic).toBe('past');
  });
});
