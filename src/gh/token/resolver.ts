import type { GhCommand } from '../types.js';
import type { GhTokenScope, GhTokenResolveResult } from './types.js';
import type { GhTokenStore } from './store.js';

/**
 * gh操作 → 必要スコープのマッピング
 */
const SCOPE_MAP: Record<string, Record<string, GhTokenScope[]>> = {
  pr: {
    list: ['pull_requests:read'],
    view: ['pull_requests:read'],
    status: ['pull_requests:read'],
    checks: ['pull_requests:read'],
    diff: ['pull_requests:read'],
    create: ['pull_requests:write'],
    comment: ['pull_requests:write'],
    review: ['pull_requests:write'],
    edit: ['pull_requests:write'],
    merge: ['pull_requests:write'],
    close: ['pull_requests:write'],
  },
  issue: {
    list: ['issues:read'],
    view: ['issues:read'],
    status: ['issues:read'],
    create: ['issues:write'],
    comment: ['issues:write'],
    edit: ['issues:write'],
    close: ['issues:write'],
    reopen: ['issues:write'],
    delete: ['issues:write'],
  },
  repo: {
    view: ['metadata:read'],
    clone: ['metadata:read'],
    list: ['metadata:read'],
  },
};

/**
 * write スコープは対応する read を含む
 */
function scopeSatisfies(available: readonly string[], required: GhTokenScope): boolean {
  if (available.includes(required)) return true;
  // write implies read
  if (required.endsWith(':read')) {
    const writeVersion = required.replace(':read', ':write') as GhTokenScope;
    return available.includes(writeVersion);
  }
  return false;
}

export class GhTokenResolver {
  constructor(private readonly store: GhTokenStore) {}

  /**
   * コマンドから --repo / -R フラグを抽出
   */
  extractRepo(cmd: GhCommand): string | undefined {
    const raw = cmd.raw;
    const parts = raw.split(/\s+/);

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      // --repo=value or -R=value
      if (part.startsWith('--repo=')) return part.slice(7);
      if (part.startsWith('-R=')) return part.slice(3);
      // --repo value or -R value
      if ((part === '--repo' || part === '-R') && i + 1 < parts.length) {
        return parts[i + 1];
      }
    }

    return undefined;
  }

  /**
   * コマンドに対して適切なトークンを解決する
   * スコープが不足している場合は null を返す
   */
  resolve(cmd: GhCommand): GhTokenResolveResult | null {
    const repo = this.extractRepo(cmd);

    // リポジトリが指定されている場合はそのリポジトリ用のトークンを検索
    // 指定されていない場合はデフォルトトークンにフォールバック
    // repo未指定時は存在しないリポジトリ名でフォールバック検索
    // → getTokenForRepo はデフォルトトークンにフォールバックする
    const result = this.store.getTokenForRepo(repo ?? '__no_repo_specified__');

    if (!result) return null;

    // スコープ検証
    const requiredScopes = this.getRequiredScopes(cmd.subcommand, cmd.action);
    if (requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) =>
        scopeSatisfies(result.entry.scopes, scope),
      );
      if (!hasAllScopes) return null;
    }

    return result;
  }

  /**
   * 操作に必要なスコープを取得
   */
  getRequiredScopes(subcommand: string, action: string): GhTokenScope[] {
    return SCOPE_MAP[subcommand]?.[action] ?? [];
  }
}
