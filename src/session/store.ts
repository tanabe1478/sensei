import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/** チャンネル ID とセッション ID のマッピングを永続化する */
export class SessionStore {
  private sessions = new Map<string, string>();
  private readonly filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'sessions.json');
    this.load();
  }

  get(channelId: string): string | undefined {
    return this.sessions.get(channelId);
  }

  set(channelId: string, sessionId: string): void {
    this.sessions.set(channelId, sessionId);
    this.save();
  }

  delete(channelId: string): boolean {
    const deleted = this.sessions.delete(channelId);
    if (deleted) this.save();
    return deleted;
  }

  get size(): number {
    return this.sessions.size;
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
        this.sessions = new Map(Object.entries(data));
      }
    } catch {
      this.sessions = new Map();
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const data = Object.fromEntries(this.sessions);
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[sensei] Failed to save sessions:', err);
    }
  }
}
