import { appendFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { GhAuditEntry } from './types.js';

const MAX_ENTRIES = 1000;

export class GhAuditLog {
  private entries: GhAuditEntry[] = [];
  private readonly filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'gh-audit.jsonl');
    this.load();
  }

  log(entry: GhAuditEntry): void {
    this.entries.push(entry);
    appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');

    if (this.entries.length > MAX_ENTRIES) {
      this.trim();
    }
  }

  recent(n: number): readonly GhAuditEntry[] {
    return this.entries.slice(-n).reverse();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8').trim();
        if (content) {
          this.entries = content.split('\n').map((line) => JSON.parse(line));
        }
      }
    } catch {
      this.entries = [];
    }
  }

  private trim(): void {
    this.entries = this.entries.slice(-MAX_ENTRIES);
    try {
      const content = this.entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      writeFileSync(this.filePath, content, 'utf-8');
    } catch (err) {
      console.error('[sensei] GhAuditLog: failed to trim:', err);
    }
  }
}
