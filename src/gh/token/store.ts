import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import type { GhTokenEntry, GhTokenRecord, GhTokenStoreData, GhTokenResolveResult } from './types.js';
import { encrypt, decrypt } from './crypto.js';

export interface AddTokenOptions {
  readonly label: string;
  readonly token: string;
  readonly repositories: readonly string[];
  readonly scopes: readonly string[];
  readonly expiresAt?: string;
}

export class GhTokenStore {
  private data: GhTokenStoreData;
  private readonly filePath: string;
  private readonly masterKey: string;

  constructor(dataDir: string, masterKey: string) {
    mkdirSync(dataDir, { recursive: true });
    this.filePath = join(dataDir, 'gh-tokens.json');
    this.masterKey = masterKey;
    this.data = this.load();
  }

  add(options: AddTokenOptions): GhTokenEntry {
    const existing = this.data.tokens.find((r) => r.entry.label === options.label);
    if (existing) {
      throw new Error(`Duplicate label: "${options.label}" already exists`);
    }

    const isDefault = this.data.tokens.length === 0;
    const now = new Date().toISOString();

    const entry: GhTokenEntry = {
      id: randomUUID(),
      label: options.label,
      repositories: [...options.repositories],
      scopes: [...options.scopes] as GhTokenEntry['scopes'],
      isDefault,
      createdAt: now,
      expiresAt: options.expiresAt,
    };

    const encrypted = encrypt(options.token, this.masterKey);
    const record: GhTokenRecord = { entry, encrypted };

    this.data = {
      ...this.data,
      tokens: [...this.data.tokens, record],
    };
    this.save();

    return entry;
  }

  remove(id: string): boolean {
    const before = this.data.tokens.length;
    const filtered = this.data.tokens.filter((r) => r.entry.id !== id);
    if (filtered.length === before) return false;

    this.data = { ...this.data, tokens: filtered };
    this.save();
    return true;
  }

  list(): readonly GhTokenEntry[] {
    return this.data.tokens.map((r) => r.entry);
  }

  getTokenForRepo(repo: string): GhTokenResolveResult | null {
    // 1. Exact match
    const exact = this.findByRepo(repo, false);
    if (exact) return this.decryptRecord(exact);

    // 2. Wildcard match (owner/*)
    const [owner] = repo.split('/');
    const wildcard = this.findByRepo(`${owner}/*`, true);
    if (wildcard) return this.decryptRecord(wildcard);

    // 3. Default token
    const defaultRecord = this.data.tokens.find((r) => r.entry.isDefault);
    if (defaultRecord && !this.isExpired(defaultRecord.entry)) {
      return this.decryptRecord(defaultRecord);
    }

    return null;
  }

  setDefault(id: string): boolean {
    const target = this.data.tokens.find((r) => r.entry.id === id);
    if (!target) return false;

    this.data = {
      ...this.data,
      tokens: this.data.tokens.map((r) => ({
        ...r,
        entry: { ...r.entry, isDefault: r.entry.id === id },
      })),
    };
    this.save();
    return true;
  }

  rotate(id: string, newToken: string): boolean {
    const target = this.data.tokens.find((r) => r.entry.id === id);
    if (!target) return false;

    const encrypted = encrypt(newToken, this.masterKey);
    this.data = {
      ...this.data,
      tokens: this.data.tokens.map((r) =>
        r.entry.id === id ? { ...r, encrypted } : r,
      ),
    };
    this.save();
    return true;
  }

  updateLastUsedAt(id: string): void {
    this.data = {
      ...this.data,
      tokens: this.data.tokens.map((r) =>
        r.entry.id === id
          ? { ...r, entry: { ...r.entry, lastUsedAt: new Date().toISOString() } }
          : r,
      ),
    };
    this.save();
  }

  private findByRepo(repoPattern: string, isWildcard: boolean): GhTokenRecord | undefined {
    return this.data.tokens.find((r) => {
      if (this.isExpired(r.entry)) return false;
      if (isWildcard) {
        return r.entry.repositories.includes(repoPattern);
      }
      return r.entry.repositories.includes(repoPattern);
    });
  }

  private isExpired(entry: GhTokenEntry): boolean {
    if (!entry.expiresAt) return false;
    return new Date(entry.expiresAt) <= new Date();
  }

  private decryptRecord(record: GhTokenRecord): GhTokenResolveResult {
    const token = decrypt(record.encrypted, this.masterKey);
    return { token, entry: record.entry };
  }

  private load(): GhTokenStoreData {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return { version: 1, tokens: [] };
  }

  private save(): void {
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
      renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[sensei] GhTokenStore: failed to save:', err);
    }
  }
}
