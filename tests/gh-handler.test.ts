import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhHandler, type GhHandlerResult } from '../src/gh/handler.js';
import { GhTokenStore } from '../src/gh/token/store.js';

describe('GhHandler', () => {
  let tmpDir: string;
  let handler: GhHandler;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-gh-handler-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('deny mode', () => {
    beforeEach(() => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'deny',
        timeoutMs: 5000,
      });
    });

    it('should deny all commands', async () => {
      const results = await handler.processAgentOutput('```gh\ngh pr list\n```', 'ch1');
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe('denied');
      expect(results[0].output).toContain('拒否');
    });
  });

  describe('full mode', () => {
    beforeEach(() => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        executeFn: async () => ({ stdout: 'PR #1\nPR #2', stderr: '', exitCode: 0 }),
      });
    });

    it('should auto-allow safe commands', async () => {
      const results = await handler.processAgentOutput('```gh\ngh pr list\n```', 'ch1');
      expect(results).toHaveLength(1);
      expect(results[0].decision).toBe('allowed');
      expect(results[0].output).toBe('PR #1\nPR #2');
    });

    it('should handle multiple commands', async () => {
      const text = '```gh\ngh pr list\n```\n```gh\ngh issue list\n```';
      const results = await handler.processAgentOutput(text, 'ch1');
      expect(results).toHaveLength(2);
      expect(results[0].decision).toBe('allowed');
      expect(results[1].decision).toBe('allowed');
    });

    it('should request confirmation for dangerous commands', async () => {
      const confirmFn = vi.fn().mockResolvedValue(true);
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        executeFn: async () => ({ stdout: 'merged', stderr: '', exitCode: 0 }),
        confirmFn,
      });

      const results = await handler.processAgentOutput('```gh\ngh pr merge 123\n```', 'ch1');
      expect(confirmFn).toHaveBeenCalled();
      expect(results[0].decision).toBe('confirmed');
      expect(results[0].output).toBe('merged');
    });

    it('should reject when confirmation is denied', async () => {
      const confirmFn = vi.fn().mockResolvedValue(false);
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        confirmFn,
      });

      const results = await handler.processAgentOutput('```gh\ngh pr merge 123\n```', 'ch1');
      expect(results[0].decision).toBe('rejected');
    });

    it('should handle confirmation timeout', async () => {
      const confirmFn = vi.fn().mockRejectedValue(new Error('timeout'));
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        confirmFn,
      });

      const results = await handler.processAgentOutput('```gh\ngh pr merge 123\n```', 'ch1');
      expect(results[0].decision).toBe('timeout');
    });
  });

  describe('allowlist mode', () => {
    it('should deny commands not in allowlist', async () => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'allowlist',
        timeoutMs: 5000,
      });

      const results = await handler.processAgentOutput('```gh\ngh pr list\n```', 'ch1');
      expect(results[0].decision).toBe('denied');
    });

    it('should allow commands in allowlist', async () => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'allowlist',
        timeoutMs: 5000,
        executeFn: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
      });
      handler.allowlist.add('pr list');

      const results = await handler.processAgentOutput('```gh\ngh pr list\n```', 'ch1');
      expect(results[0].decision).toBe('allowed');
    });
  });

  describe('no gh commands', () => {
    it('should return empty array when no gh blocks found', async () => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
      });

      const results = await handler.processAgentOutput('no commands here', 'ch1');
      expect(results).toEqual([]);
    });
  });

  describe('execution error', () => {
    it('should include stderr on non-zero exit code', async () => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        executeFn: async () => ({ stdout: '', stderr: 'not found', exitCode: 1 }),
      });

      const results = await handler.processAgentOutput('```gh\ngh pr view 999\n```', 'ch1');
      expect(results[0].decision).toBe('allowed');
      expect(results[0].output).toContain('not found');
    });
  });

  describe('audit', () => {
    it('should record all commands in audit log', async () => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        executeFn: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
      });

      await handler.processAgentOutput('```gh\ngh pr list\n```', 'ch1');
      const entries = handler.audit.recent(10);
      expect(entries).toHaveLength(1);
      expect(entries[0].command).toBe('gh pr list');
      expect(entries[0].decision).toBe('allowed');
    });
  });

  describe('token integration', () => {
    it('should inject GH_TOKEN env when token is resolved', async () => {
      let capturedEnv: Record<string, string> | undefined;
      const tokenStore = new GhTokenStore(tmpDir, 'test-key');
      tokenStore.add({
        label: 'test-token',
        token: 'ghp_injected_token',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:read'],
      });

      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        tokenStore,
        executeFn: async (_cmd, _timeout, env) => {
          capturedEnv = env;
          return { stdout: 'ok', stderr: '', exitCode: 0 };
        },
      });

      await handler.processAgentOutput('```gh\ngh pr list --repo owner/repo\n```', 'ch1');
      expect(capturedEnv).toEqual({ GH_TOKEN: 'ghp_injected_token' });
    });

    it('should record tokenLabel in audit log', async () => {
      const tokenStore = new GhTokenStore(tmpDir, 'test-key');
      tokenStore.add({
        label: 'my-labeled-token',
        token: 'ghp_audit',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:read'],
      });

      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        tokenStore,
        executeFn: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
      });

      await handler.processAgentOutput('```gh\ngh pr list --repo owner/repo\n```', 'ch1');
      const entries = handler.audit.recent(1);
      expect(entries[0].tokenLabel).toBe('my-labeled-token');
    });

    it('should deny when token lacks required scope', async () => {
      const tokenStore = new GhTokenStore(tmpDir, 'test-key');
      tokenStore.add({
        label: 'read-only',
        token: 'ghp_readonly',
        repositories: ['owner/repo'],
        scopes: ['pull_requests:read'],
      });

      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        tokenStore,
        executeFn: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
      });

      // pr create requires pull_requests:write — token only has read
      // Without token, command executes without GH_TOKEN (no env injected)
      let capturedEnv: Record<string, string> | undefined;
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        tokenStore,
        executeFn: async (_cmd, _timeout, env) => {
          capturedEnv = env;
          return { stdout: 'ok', stderr: '', exitCode: 0 };
        },
      });

      await handler.processAgentOutput('```gh\ngh pr create --repo owner/repo\n```', 'ch1');
      // Token not injected because scope check fails
      expect(capturedEnv).toBeUndefined();
    });

    it('should work without tokenStore (backward compatible)', async () => {
      handler = new GhHandler({
        dataDir: tmpDir,
        securityLevel: 'full',
        timeoutMs: 5000,
        executeFn: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
      });

      const results = await handler.processAgentOutput('```gh\ngh pr list\n```', 'ch1');
      expect(results[0].decision).toBe('allowed');
    });
  });
});
