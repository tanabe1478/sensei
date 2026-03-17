import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import type { GhAllowlistEntry } from './types.js';

export class GhAllowlistStore {
  private entries: GhAllowlistEntry[] = [];
  private readonly filePath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'gh-allowlist.json');
    this.load();
  }

  list(): readonly GhAllowlistEntry[] {
    return this.entries;
  }

  add(pattern: string): GhAllowlistEntry {
    const existing = this.entries.find((e) => e.pattern === pattern);
    if (existing) return existing;

    const now = new Date().toISOString();
    const entry: GhAllowlistEntry = {
      pattern,
      addedAt: now,
      lastUsedAt: now,
    };

    this.entries = [...this.entries, entry];
    this.save();
    return entry;
  }

  remove(pattern: string): boolean {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.pattern !== pattern);
    if (this.entries.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  isAllowed(subcommand: string, action: string): boolean {
    const key = `${subcommand} ${action}`;
    return this.entries.some((e) => {
      if (e.pattern === key) return true;
      // wildcard: "pr *" matches "pr create", "pr merge", etc.
      const [patSub, patAct] = e.pattern.split(' ');
      return patSub === subcommand && patAct === '*';
    });
  }

  touch(pattern: string): void {
    this.entries = this.entries.map((e) =>
      e.pattern === pattern ? { ...e, lastUsedAt: new Date().toISOString() } : e,
    );
    this.save();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        this.entries = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      this.entries = [];
    }
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.entries, null, 2), 'utf-8');
      renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[sensei] GhAllowlistStore: failed to save:', err);
    }
  }
}
