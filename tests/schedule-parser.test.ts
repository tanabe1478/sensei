import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseScheduleInput } from '../src/scheduler/parser.js';

describe('parseScheduleInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-11T03:00:00.000Z')); // JST 12:00
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cron 直接指定をパースする', () => {
    const result = parseScheduleInput('cron 0 9 * * * おはよう');
    expect(result).toEqual({
      type: 'cron',
      expression: '0 9 * * *',
      message: 'おはよう',
    });
  });

  it('毎日 HH:MM をパースする', () => {
    const result = parseScheduleInput('毎日 9:00 おはようございます');
    expect(result).toEqual({
      type: 'cron',
      expression: '0 9 * * *',
      message: 'おはようございます',
    });
  });

  it('毎日 22:30 をパースする', () => {
    const result = parseScheduleInput('毎日 22:30 おやすみ');
    expect(result).toEqual({
      type: 'cron',
      expression: '30 22 * * *',
      message: 'おやすみ',
    });
  });

  it('毎時をパースする', () => {
    const result = parseScheduleInput('毎時 チェック');
    expect(result).toEqual({
      type: 'cron',
      expression: '0 * * * *',
      message: 'チェック',
    });
  });

  it('毎時 MM分をパースする', () => {
    const result = parseScheduleInput('毎時 15分 進捗確認');
    expect(result).toEqual({
      type: 'cron',
      expression: '15 * * * *',
      message: '進捗確認',
    });
  });

  it('毎週X曜をパースする', () => {
    const result = parseScheduleInput('毎週月曜 9:00 週次レビュー');
    expect(result).toEqual({
      type: 'cron',
      expression: '0 9 * * 1',
      message: '週次レビュー',
    });
  });

  it('毎週日曜をパースする', () => {
    const result = parseScheduleInput('毎週日曜 18:00 振り返り');
    expect(result).toEqual({
      type: 'cron',
      expression: '0 18 * * 0',
      message: '振り返り',
    });
  });

  it('N分後をパースする', () => {
    const result = parseScheduleInput('30分後 リマインド');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('once');
    expect(result!.message).toBe('リマインド');
    const runAt = new Date(result!.runAt!).getTime();
    const expected = Date.now() + 30 * 60_000;
    expect(Math.abs(runAt - expected)).toBeLessThan(1000);
  });

  it('N時間後をパースする', () => {
    const result = parseScheduleInput('2時間後 確認');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('once');
    expect(result!.message).toBe('確認');
    const runAt = new Date(result!.runAt!).getTime();
    const expected = Date.now() + 2 * 3_600_000;
    expect(Math.abs(runAt - expected)).toBeLessThan(1000);
  });

  it('HH:MM メッセージをパースする（未来の時刻）', () => {
    const result = parseScheduleInput('15:00 ミーティング');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('once');
    expect(result!.message).toBe('ミーティング');
  });

  it('認識できない入力は null を返す', () => {
    expect(parseScheduleInput('hello world')).toBeNull();
    expect(parseScheduleInput('')).toBeNull();
  });
});
