import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/scheduler/scheduler.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Scheduler', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-sched-'));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-11T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('cron スケジュールを追加・一覧できる', () => {
    const scheduler = new Scheduler(tmpDir);
    const schedule = scheduler.add({
      type: 'cron',
      expression: '0 9 * * *',
      message: 'おはよう',
      channelId: 'ch-1',
    });
    expect(schedule.id).toBeTruthy();
    expect(schedule.enabled).toBe(true);
    expect(scheduler.list()).toHaveLength(1);
  });

  it('once スケジュールを追加できる', () => {
    const scheduler = new Scheduler(tmpDir);
    const runAt = new Date(Date.now() + 60_000).toISOString();
    const schedule = scheduler.add({
      type: 'once',
      runAt,
      message: 'リマインド',
      channelId: 'ch-1',
    });
    expect(schedule.type).toBe('once');
    expect(schedule.runAt).toBe(runAt);
  });

  it('不正な cron expression でエラー', () => {
    const scheduler = new Scheduler(tmpDir);
    expect(() =>
      scheduler.add({
        type: 'cron',
        expression: 'invalid',
        message: 'test',
        channelId: 'ch-1',
      }),
    ).toThrow('Invalid cron expression');
  });

  it('過去の runAt でエラー', () => {
    const scheduler = new Scheduler(tmpDir);
    expect(() =>
      scheduler.add({
        type: 'once',
        runAt: '2020-01-01T00:00:00.000Z',
        message: 'test',
        channelId: 'ch-1',
      }),
    ).toThrow('runAt must be a future date');
  });

  it('remove で削除できる', () => {
    const scheduler = new Scheduler(tmpDir);
    const schedule = scheduler.add({
      type: 'cron',
      expression: '0 9 * * *',
      message: 'test',
      channelId: 'ch-1',
    });
    expect(scheduler.remove(schedule.id)).toBe(true);
    expect(scheduler.list()).toHaveLength(0);
  });

  it('存在しない ID の remove は false', () => {
    const scheduler = new Scheduler(tmpDir);
    expect(scheduler.remove('nonexistent')).toBe(false);
  });

  it('ファイルから復元できる', () => {
    const s1 = new Scheduler(tmpDir);
    s1.add({
      type: 'cron',
      expression: '0 9 * * *',
      message: 'おはよう',
      channelId: 'ch-1',
    });

    const s2 = new Scheduler(tmpDir);
    expect(s2.list()).toHaveLength(1);
    expect(s2.list()[0].message).toBe('おはよう');
  });

  it('once スケジュールが時間通りに実行される', async () => {
    const scheduler = new Scheduler(tmpDir);
    const sender = vi.fn().mockResolvedValue(undefined);
    scheduler.registerSender(sender);

    const runAt = new Date(Date.now() + 5000).toISOString();
    scheduler.add({
      type: 'once',
      runAt,
      message: 'タイマー発火',
      channelId: 'ch-1',
    });

    expect(sender).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(sender).toHaveBeenCalledWith('ch-1', 'タイマー発火');
  });
});
