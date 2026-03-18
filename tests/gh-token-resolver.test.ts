import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhTokenResolver } from '../src/gh/token/resolver.js';
import { GhTokenStore } from '../src/gh/token/store.js';
import type { GhCommand } from '../src/gh/types.js';

function makeCommand(raw: string, subcommand: string, action: string): GhCommand {
  return {
    raw,
    subcommand,
    action,
    args: raw.split(/\s+/).slice(3),
    riskLevel: 'safe',
  };
}

describe('GhTokenResolver', () => {
  let tmpDir: string;
  let store: GhTokenStore;
  let resolver: GhTokenResolver;
  const masterKey = 'test-key';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-gh-resolver-'));
    store = new GhTokenStore(tmpDir, masterKey);
    resolver = new GhTokenResolver(store);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('extractRepo', () => {
    it('should extract repo from --repo flag', () => {
      const cmd = makeCommand('gh pr list --repo owner/repo', 'pr', 'list');
      expect(resolver.extractRepo(cmd)).toBe('owner/repo');
    });

    it('should extract repo from -R flag', () => {
      const cmd = makeCommand('gh pr list -R owner/repo', 'pr', 'list');
      expect(resolver.extractRepo(cmd)).toBe('owner/repo');
    });

    it('should return undefined when no repo flag', () => {
      const cmd = makeCommand('gh pr list', 'pr', 'list');
      expect(resolver.extractRepo(cmd)).toBeUndefined();
    });

    it('should handle --repo=value format', () => {
      const cmd = makeCommand('gh pr list --repo=owner/repo', 'pr', 'list');
      expect(resolver.extractRepo(cmd)).toBe('owner/repo');
    });
  });

  describe('resolve', () => {
    it('should resolve token for repo-specific command', () => {
      store.add({
        label: 'my-token',
        token: 'ghp_test123',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:read'],
      });

      const cmd = makeCommand('gh pr list --repo owner/repo', 'pr', 'list');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
      expect(result!.token).toBe('ghp_test123');
    });

    it('should return null when no token available', () => {
      const cmd = makeCommand('gh pr list --repo owner/repo', 'pr', 'list');
      expect(resolver.resolve(cmd)).toBeNull();
    });

    it('should use default token when no repo flag', () => {
      store.add({
        label: 'default',
        token: 'ghp_default',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:read', 'metadata:read'],
      });

      const cmd = makeCommand('gh pr list', 'pr', 'list');
      const result = resolver.resolve(cmd);
      // Should fall back to default since no repo specified
      expect(result).not.toBeNull();
      expect(result!.token).toBe('ghp_default');
    });
  });

  describe('scope validation', () => {
    beforeEach(() => {
      store.add({
        label: 'read-only',
        token: 'ghp_readonly',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:read', 'issues:read', 'metadata:read'],
      });
    });

    it('should allow pr list with pull_requests:read scope', () => {
      const cmd = makeCommand('gh pr list --repo owner/repo', 'pr', 'list');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });

    it('should allow pr view with pull_requests:read scope', () => {
      const cmd = makeCommand('gh pr view 123 --repo owner/repo', 'pr', 'view');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });

    it('should deny pr create with only pull_requests:read scope', () => {
      const cmd = makeCommand('gh pr create --repo owner/repo', 'pr', 'create');
      const result = resolver.resolve(cmd);
      expect(result).toBeNull();
    });

    it('should deny pr merge with only pull_requests:read scope', () => {
      const cmd = makeCommand('gh pr merge 123 --repo owner/repo', 'pr', 'merge');
      const result = resolver.resolve(cmd);
      expect(result).toBeNull();
    });

    it('should allow issue list with issues:read scope', () => {
      const cmd = makeCommand('gh issue list --repo owner/repo', 'issue', 'list');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });

    it('should deny issue create with only issues:read scope', () => {
      const cmd = makeCommand('gh issue create --repo owner/repo', 'issue', 'create');
      const result = resolver.resolve(cmd);
      expect(result).toBeNull();
    });

    it('should allow repo view with metadata:read scope', () => {
      const cmd = makeCommand('gh repo view owner/repo --repo owner/repo', 'repo', 'view');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });
  });

  describe('scope validation with write scopes', () => {
    beforeEach(() => {
      store.add({
        label: 'full-access',
        token: 'ghp_full',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:write', 'issues:write', 'contents:write', 'metadata:read'],
      });
    });

    it('should allow pr create with pull_requests:write scope', () => {
      const cmd = makeCommand('gh pr create --repo owner/repo', 'pr', 'create');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });

    it('should allow pr merge with pull_requests:write scope', () => {
      const cmd = makeCommand('gh pr merge 123 --repo owner/repo', 'pr', 'merge');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });

    it('should allow issue create with issues:write scope', () => {
      const cmd = makeCommand('gh issue create --repo owner/repo', 'issue', 'create');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });

    it('should allow pr list with pull_requests:write scope (write implies read)', () => {
      const cmd = makeCommand('gh pr list --repo owner/repo', 'pr', 'list');
      const result = resolver.resolve(cmd);
      expect(result).not.toBeNull();
    });
  });

  describe('getRequiredScopes', () => {
    it('should return correct scopes for known operations', () => {
      expect(resolver.getRequiredScopes('pr', 'list')).toEqual(['pull_requests:read']);
      expect(resolver.getRequiredScopes('pr', 'create')).toEqual(['pull_requests:write']);
      expect(resolver.getRequiredScopes('issue', 'list')).toEqual(['issues:read']);
      expect(resolver.getRequiredScopes('issue', 'create')).toEqual(['issues:write']);
      expect(resolver.getRequiredScopes('repo', 'view')).toEqual(['metadata:read']);
    });

    it('should return empty array for unknown operations', () => {
      expect(resolver.getRequiredScopes('unknown', 'action')).toEqual([]);
    });
  });
});
