export interface ParsedSchedule {
  readonly type: 'cron' | 'once';
  readonly expression?: string;
  readonly runAt?: string;
  readonly message: string;
}

/**
 * 自然言語風の入力をスケジュールパラメータに変換する
 *
 * 対応フォーマット:
 * - "毎日 9:00 おはよう" → cron 0 9 * * *
 * - "毎時 チェック" → cron 0 * * * *
 * - "30分後 リマインド" → once (30分後)
 * - "15:00 ミーティング" → once (今日の15:00、過ぎていたら明日)
 * - "cron 0 9 * * * おはよう" → cron 直接指定
 */
export function parseScheduleInput(input: string): ParsedSchedule | null {
  const trimmed = input.trim();

  // "cron <式> メッセージ"
  const cronMatch = trimmed.match(/^cron\s+((?:\S+\s+){4}\S+)\s+(.+)$/i);
  if (cronMatch) {
    return { type: 'cron', expression: cronMatch[1].trim(), message: cronMatch[2].trim() };
  }

  // "毎日 HH:MM メッセージ"
  const dailyMatch = trimmed.match(/^毎日\s+(\d{1,2}):(\d{2})\s+(.+)$/);
  if (dailyMatch) {
    const min = parseInt(dailyMatch[2], 10);
    const hour = parseInt(dailyMatch[1], 10);
    return { type: 'cron', expression: `${min} ${hour} * * *`, message: dailyMatch[3].trim() };
  }

  // "毎時 メッセージ" or "毎時 MM分 メッセージ"
  const hourlyMatch = trimmed.match(/^毎時\s+(?:(\d{1,2})分\s+)?(.+)$/);
  if (hourlyMatch) {
    const min = hourlyMatch[1] ? parseInt(hourlyMatch[1], 10) : 0;
    return { type: 'cron', expression: `${min} * * * *`, message: hourlyMatch[2].trim() };
  }

  // "毎週X曜 HH:MM メッセージ"
  const weeklyMatch = trimmed.match(/^毎週(月|火|水|木|金|土|日)曜?\s+(\d{1,2}):(\d{2})\s+(.+)$/);
  if (weeklyMatch) {
    const dayMap: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
    const day = dayMap[weeklyMatch[1]] ?? 1;
    const hour = parseInt(weeklyMatch[2], 10);
    const min = parseInt(weeklyMatch[3], 10);
    return { type: 'cron', expression: `${min} ${hour} * * ${day}`, message: weeklyMatch[4].trim() };
  }

  // "N分後/N時間後 メッセージ"
  const relativeMatch = trimmed.match(/^(\d+)\s*(分|時間|秒)後?\s+(.+)$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const ms = unit === '秒' ? amount * 1000 : unit === '分' ? amount * 60_000 : amount * 3_600_000;
    return { type: 'once', runAt: new Date(Date.now() + ms).toISOString(), message: relativeMatch[3].trim() };
  }

  // "HH:MM メッセージ"
  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const min = parseInt(timeMatch[2], 10);
    const now = new Date();
    const jstOffset = 9 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const currentJst = (utcMinutes + jstOffset) % (24 * 60);
    const target = hour * 60 + min;
    let diff = target - currentJst;
    if (diff <= 0) diff += 24 * 60;
    return { type: 'once', runAt: new Date(now.getTime() + diff * 60_000).toISOString(), message: timeMatch[3].trim() };
  }

  return null;
}
