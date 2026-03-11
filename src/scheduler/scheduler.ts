import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import cron from 'node-cron';

export interface Schedule {
  readonly id: string;
  readonly type: 'cron' | 'once';
  readonly expression?: string;
  readonly runAt?: string;
  readonly message: string;
  readonly channelId: string;
  readonly createdAt: string;
  readonly enabled: boolean;
}

export type SendFn = (channelId: string, message: string) => Promise<void>;

export class Scheduler {
  private schedules: Schedule[] = [];
  private readonly cronJobs = new Map<string, cron.ScheduledTask>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly filePath: string;
  private sender?: SendFn;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'schedules.json');
    this.load();
  }

  registerSender(sender: SendFn): void {
    this.sender = sender;
  }

  add(schedule: Omit<Schedule, 'id' | 'createdAt' | 'enabled'>): Schedule {
    if (schedule.type === 'cron' && (!schedule.expression || !cron.validate(schedule.expression))) {
      throw new Error(`Invalid cron expression: ${schedule.expression}`);
    }
    if (schedule.type === 'once' && (!schedule.runAt || new Date(schedule.runAt).getTime() <= Date.now())) {
      throw new Error('runAt must be a future date');
    }

    const entry: Schedule = {
      ...schedule,
      id: `sch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      enabled: true,
    };

    this.schedules = [...this.schedules, entry];
    this.save();
    this.startJob(entry);
    return entry;
  }

  remove(id: string): boolean {
    const before = this.schedules.length;
    this.stopJob(id);
    this.schedules = this.schedules.filter((s) => s.id !== id);
    if (this.schedules.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  list(): readonly Schedule[] {
    return this.schedules;
  }

  startAll(): void {
    for (const schedule of this.schedules) {
      if (schedule.enabled) this.startJob(schedule);
    }
    console.log(`[sensei] Scheduler: ${this.schedules.filter((s) => s.enabled).length} jobs started`);
  }

  stopAll(): void {
    for (const [id] of this.cronJobs) this.stopJob(id);
    for (const [id] of this.timers) this.stopJob(id);
  }

  private startJob(schedule: Schedule): void {
    this.stopJob(schedule.id);

    if (schedule.type === 'cron' && schedule.expression) {
      const task = cron.schedule(
        schedule.expression,
        () => { this.execute(schedule); },
        { timezone: 'Asia/Tokyo' }
      );
      this.cronJobs.set(schedule.id, task);
    } else if (schedule.type === 'once' && schedule.runAt) {
      const delay = new Date(schedule.runAt).getTime() - Date.now();
      if (delay <= 0) {
        this.execute(schedule);
        this.remove(schedule.id);
        return;
      }
      const timer = setTimeout(() => {
        this.execute(schedule);
        this.remove(schedule.id);
      }, delay);
      this.timers.set(schedule.id, timer);
    }
  }

  private stopJob(id: string): void {
    this.cronJobs.get(id)?.stop();
    this.cronJobs.delete(id);
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  private execute(schedule: Schedule): void {
    if (!this.sender) {
      console.error('[sensei] Scheduler: no sender registered');
      return;
    }
    this.sender(schedule.channelId, schedule.message).catch((err) => {
      console.error(`[sensei] Scheduler: failed to send message for ${schedule.id}:`, err);
    });
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        this.schedules = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      this.schedules = [];
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.schedules, null, 2), 'utf-8');
      renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[sensei] Scheduler: failed to save:', err);
    }
  }
}
