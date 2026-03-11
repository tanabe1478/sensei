import type { ReviewItem } from './types.js';
import { getDueItems, getOverdueItems } from './spaced-repetition.js';

/** 復習通知用のサマリーを生成する */
export function generateReviewSummary(items: readonly ReviewItem[]): string {
  const now = new Date();
  const due = getDueItems(items, now);
  const overdue = getOverdueItems(items, now);

  if (due.length === 0) {
    return '今日の復習対象はありません。';
  }

  const lines: string[] = [];

  if (overdue.length > 0) {
    lines.push(`**期限超過: ${overdue.length}件**`);
    for (const item of overdue.slice(0, 3)) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(item.nextReview).getTime()) / (1000 * 60 * 60 * 24)
      );
      lines.push(`  - ${item.topic} (${daysOverdue}日超過)`);
    }
    if (overdue.length > 3) {
      lines.push(`  - ...他 ${overdue.length - 3}件`);
    }
    lines.push('');
  }

  const todayOnly = due.filter((item) => !overdue.some((o) => o.id === item.id));

  if (todayOnly.length > 0) {
    lines.push(`**今日の復習: ${todayOnly.length}件**`);
    for (const item of todayOnly.slice(0, 5)) {
      lines.push(`  - ${item.topic}`);
    }
    if (todayOnly.length > 5) {
      lines.push(`  - ...他 ${todayOnly.length - 5}件`);
    }
  }

  return lines.join('\n');
}

/** 学習ログリマインド用のメッセージを生成する */
export function generateLogReminder(lastLogDate: string | null): string {
  if (!lastLogDate) {
    return '今日の学びを `/log` で記録しませんか？';
  }

  const last = new Date(lastLogDate);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (lastLogDate === today) {
    return ''; // 今日は記録済み
  }

  const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

  if (daysSince === 1) {
    return '昨日の学びを振り返りましたか？ `/log` で今日の記録をつけましょう。';
  }

  return '前回の記録から' + daysSince + '日経っています。 /log で今日の学びを記録しませんか？';
}
