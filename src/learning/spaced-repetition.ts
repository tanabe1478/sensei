import type { ReviewItem, ReviewQuality } from './types.js';

/**
 * SM-2 アルゴリズムによる間隔反復スケジューリング
 *
 * quality (0-5):
 *   0 - 全く思い出せなかった
 *   1 - 間違った回答
 *   2 - 大きなヒントで思い出した
 *   3 - 小さなヒントで思い出した
 *   4 - 少し迷ったが正しく回答
 *   5 - 完璧に回答
 */

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

/** SM-2 アルゴリズムで次の復習パラメータを計算する */
export function calculateNextReview(
  item: ReviewItem,
  quality: ReviewQuality
): Pick<ReviewItem, 'nextReview' | 'interval' | 'easeFactor' | 'repetitions'> {
  // quality < 3 の場合はリセット
  if (quality < 3) {
    return {
      repetitions: 0,
      interval: 1,
      easeFactor: Math.max(MIN_EASE_FACTOR, item.easeFactor - 0.2),
      nextReview: addDays(new Date(), 1).toISOString(),
    };
  }

  const newRepetitions = item.repetitions + 1;
  const newEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    item.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  let newInterval: number;
  if (newRepetitions === 1) {
    newInterval = 1;
  } else if (newRepetitions === 2) {
    newInterval = 3;
  } else {
    newInterval = Math.round(item.interval * newEaseFactor);
  }

  return {
    repetitions: newRepetitions,
    interval: newInterval,
    easeFactor: newEaseFactor,
    nextReview: addDays(new Date(), newInterval).toISOString(),
  };
}

/** 新しい復習アイテムを作成する */
export function createReviewItem(
  topic: string,
  content: string,
  source?: ReviewItem['source']
): ReviewItem {
  const now = new Date();
  return {
    id: generateId(),
    topic,
    content,
    createdAt: now.toISOString(),
    nextReview: addDays(now, 1).toISOString(),
    interval: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    repetitions: 0,
    source,
  };
}

/** 今日復習すべきアイテムを抽出する */
export function getDueItems(items: readonly ReviewItem[], now: Date = new Date()): ReviewItem[] {
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  return items
    .filter((item) => new Date(item.nextReview) <= todayEnd)
    .sort((a, b) => new Date(a.nextReview).getTime() - new Date(b.nextReview).getTime());
}

/** 期限超過のアイテムを抽出する */
export function getOverdueItems(
  items: readonly ReviewItem[],
  now: Date = new Date()
): ReviewItem[] {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  return items.filter((item) => new Date(item.nextReview) < todayStart);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
