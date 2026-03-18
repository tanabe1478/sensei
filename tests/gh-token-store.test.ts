import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhTokenStore } from '../src/gh/token/store.js';

describe('GhTokenStore', () => {
  let tmpDir: string;
  let store: GhTokenStore;
  const masterKey = 'test-encryption-key';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-gh-token-'));
    store = new GhTokenStore(tmpDir, masterKey);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('add', () => {
    it('should add a token entry', () => {
      const entry = store.add({
        label: 'my-repo-token',
        token: 'ghp_abc123',
        repositories: ['owner/repo'],
        scopes: ['contents:read', 'pull_requests:read'],
      });

      expect(entry.label).toBe('my-repo-token');
      expect(entry.repositories).toEqual(['owner/repo']);
      expect(entry.scopes).toEqual(['contents:read', 'pull_requests:read']);
      // First token is auto-set as default
      expect(entry.isDefault).toBe(true);
      expect(entry.id).toBeDefined();
      expect(entry.createdAt).toBeDefined();
    });

    it('should set first token as default', () => {
      const entry = store.add({
        label: 'first',
        token: 'ghp_first',
        repositories: ['owner/repo'],
        scopes: ['metadata:read'],
      });

      expect(entry.isDefault).toBe(true);
    });

    it('should not set subsequent tokens as default', () => {
      store.add({
        label: 'first',
        token: 'ghp_first',
        repositories: ['owner/repo1'],
        scopes: ['metadata:read'],
      });
      const second = store.add({
        label: 'second',
        token: 'ghp_second',
        repositories: ['owner/repo2'],
        scopes: ['metadata:read'],
      });

      expect(second.isDefault).toBe(false);
    });

    it('should reject duplicate labels', () => {
      store.add({
        label: 'my-token',
        token: 'ghp_abc',
        repositories: ['owner/repo'],
        scopes: ['metadata:read'],
      });

      expect(() =>
        store.add({
          label: 'my-token',
          token: 'ghp_def',
          repositories: ['owner/repo2'],
          scopes: ['metadata:read'],
        }),
      ).toThrow(/duplicate/i);
    });
  });

  describe('list', () => {
    it('should return entries without token values', () => {
      store.add({
        label: 'token-a',
        token: 'ghp_secret_value',
        repositories: ['owner/repo'],
        scopes: ['contents:read'],
      });

      const list = store.list();
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe('token-a');
      // Token value must NEVER appear
      const serialized = JSON.stringify(list);
      expect(serialized).not.toContain('ghp_secret_value');
    });

    it('should return empty array when no tokens', () => {
      expect(store.list()).toEqual([]);
    });
  });

  describe('remove', () => {
    it('should remove a token by id', () => {
      const entry = store.add({
        label: 'to-remove',
        token: 'ghp_remove',
        repositories: ['owner/repo'],
        scopes: ['metadata:read'],
      });

      expect(store.remove(entry.id)).toBe(true);
      expect(store.list()).toHaveLength(0);
    });

    it('should return false for non-existent id', () => {
      expect(store.remove('non-existent')).toBe(false);
    });
  });

  describe('getTokenForRepo', () => {
    it('should return token for exact repo match', () => {
      store.add({
        label: 'exact',
        token: 'ghp_exact_token',
        repositories: ['owner/my-repo'],
        scopes: ['contents:read'],
      });

      const result = store.getTokenForRepo('owner/my-repo');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('ghp_exact_token');
      expect(result!.entry.label).toBe('exact');
    });

    it('should return token for wildcard match', () => {
      store.add({
        label: 'wildcard',
        token: 'ghp_wild',
        repositories: ['owner/*'],
        scopes: ['contents:read'],
      });

      const result = store.getTokenForRepo('owner/any-repo');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('ghp_wild');
    });

    it('should prefer exact match over wildcard', () => {
      store.add({
        label: 'wildcard',
        token: 'ghp_wild',
        repositories: ['owner/*'],
        scopes: ['contents:read'],
      });
      store.add({
        label: 'exact',
        token: 'ghp_exact',
        repositories: ['owner/specific'],
        scopes: ['contents:read'],
      });

      const result = store.getTokenForRepo('owner/specific');
      expect(result!.token).toBe('ghp_exact');
    });

    it('should fall back to default token', () => {
      store.add({
        label: 'default-token',
        token: 'ghp_default',
        repositories: ['other/repo'],
        scopes: ['metadata:read'],
      });

      const result = store.getTokenForRepo('unrelated/repo');
      expect(result).not.toBeNull();
      expect(result!.token).toBe('ghp_default');
      expect(result!.entry.isDefault).toBe(true);
    });

    it('should return null when no matching token and no default', () => {
      // Add non-default token for different repo
      store.add({
        label: 'first',
        token: 'ghp_first',
        repositories: ['owner/repo1'],
        scopes: ['metadata:read'],
      });
      // Remove the default by adding another and setting it as default, then removing it
      // Actually, the first token is automatically default, so let's test differently
      const store2 = new GhTokenStore(tmpDir + '-2', masterKey);
      expect(store2.getTokenForRepo('any/repo')).toBeNull();
      rmSync(tmpDir + '-2', { recursive: true, force: true });
    });
  });

  describe('setDefault', () => {
    it('should change the default token', () => {
      store.add({
        label: 'first',
        token: 'ghp_first',
        repositories: ['owner/repo1'],
        scopes: ['metadata:read'],
      });
      const second = store.add({
        label: 'second',
        token: 'ghp_second',
        repositories: ['owner/repo2'],
        scopes: ['metadata:read'],
      });

      expect(store.setDefault(second.id)).toBe(true);
      const list = store.list();
      expect(list.find((e) => e.id === second.id)!.isDefault).toBe(true);
      expect(list.filter((e) => e.isDefault)).toHaveLength(1);
    });

    it('should return false for non-existent id', () => {
      expect(store.setDefault('non-existent')).toBe(false);
    });
  });

  describe('rotate', () => {
    it('should replace the encrypted token', () => {
      const entry = store.add({
        label: 'rotatable',
        token: 'ghp_old_token',
        repositories: ['owner/repo'],
        scopes: ['contents:read'],
      });

      expect(store.rotate(entry.id, 'ghp_new_token')).toBe(true);

      const result = store.getTokenForRepo('owner/repo');
      expect(result!.token).toBe('ghp_new_token');
    });

    it('should return false for non-existent id', () => {
      expect(store.rotate('non-existent', 'ghp_new')).toBe(false);
    });
  });

  describe('updateLastUsedAt', () => {
    it('should update lastUsedAt timestamp', () => {
      const entry = store.add({
        label: 'test',
        token: 'ghp_test',
        repositories: ['owner/repo'],
        scopes: ['metadata:read'],
      });

      store.updateLastUsedAt(entry.id);
      const list = store.list();
      expect(list[0].lastUsedAt).toBeDefined();
    });
  });

  describe('expiration', () => {
    it('should not return expired tokens from getTokenForRepo', () => {
      store.add({
        label: 'expired',
        token: 'ghp_expired',
        repositories: ['owner/repo'],
        scopes: ['contents:read'],
        expiresAt: '2020-01-01T00:00:00Z',
      });

      const result = store.getTokenForRepo('owner/repo');
      expect(result).toBeNull();
    });

    it('should return non-expired tokens', () => {
      store.add({
        label: 'valid',
        token: 'ghp_valid',
        repositories: ['owner/repo'],
        scopes: ['contents:read'],
        expiresAt: '2099-12-31T23:59:59Z',
      });

      const result = store.getTokenForRepo('owner/repo');
      expect(result).not.toBeNull();
    });
  });

  describe('persistence', () => {
    it('should persist tokens across store instances', () => {
      store.add({
        label: 'persistent',
        token: 'ghp_persist',
        repositories: ['owner/repo'],
        scopes: ['contents:read'],
      });

      const store2 = new GhTokenStore(tmpDir, masterKey);
      const list = store2.list();
      expect(list).toHaveLength(1);
      expect(list[0].label).toBe('persistent');

      const result = store2.getTokenForRepo('owner/repo');
      expect(result!.token).toBe('ghp_persist');
    });

    it('should not contain plaintext token in the persisted file', () => {
      store.add({
        label: 'secret',
        token: 'ghp_super_secret_token_value',
        repositories: ['owner/repo'],
        scopes: ['contents:read'],
      });

      const fileContent = readFileSync(join(tmpDir, 'gh-tokens.json'), 'utf-8');
      expect(fileContent).not.toContain('ghp_super_secret_token_value');
    });
  });
});
