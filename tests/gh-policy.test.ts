import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhPolicy } from '../src/gh/policy.js';
import { GhAllowlistStore } from '../src/gh/store.js';
import type { GhCommand, GhSecurityLevel } from '../src/gh/types.js';

function makeCmd(overrides: Partial<GhCommand> = {}): GhCommand {
  return {
    raw: 'gh pr list',
    subcommand: 'pr',
    action: 'list',
    args: [],
    riskLevel: 'safe',
    ...overrides,
  };
}

describe('GhPolicy', () => {
  let tmpDir: string;
  let store: GhAllowlistStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-gh-policy-'));
    store = new GhAllowlistStore(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('deny mode', () => {
    it('should deny all commands', () => {
      const policy = new GhPolicy('deny', store);
      expect(policy.evaluate(makeCmd({ riskLevel: 'safe' }))).toBe('denied');
      expect(policy.evaluate(makeCmd({ riskLevel: 'moderate' }))).toBe('denied');
      expect(policy.evaluate(makeCmd({ riskLevel: 'dangerous' }))).toBe('denied');
    });
  });

  describe('allowlist mode', () => {
    it('should deny commands not in allowlist', () => {
      const policy = new GhPolicy('allowlist', store);
      expect(policy.evaluate(makeCmd({ riskLevel: 'safe' }))).toBe('denied');
    });

    it('should allow commands in allowlist', () => {
      store.add('pr list');
      const policy = new GhPolicy('allowlist', store);
      expect(policy.evaluate(makeCmd({ riskLevel: 'safe' }))).toBe('allowed');
    });

    it('should require confirmation for dangerous commands even if in allowlist', () => {
      store.add('pr merge');
      const policy = new GhPolicy('allowlist', store);
      expect(
        policy.evaluate(makeCmd({ subcommand: 'pr', action: 'merge', riskLevel: 'dangerous' })),
      ).toBe('confirm');
    });

    it('should deny dangerous commands not in allowlist', () => {
      const policy = new GhPolicy('allowlist', store);
      expect(
        policy.evaluate(makeCmd({ subcommand: 'pr', action: 'merge', riskLevel: 'dangerous' })),
      ).toBe('denied');
    });

    it('should allow moderate commands in allowlist', () => {
      store.add('pr create');
      const policy = new GhPolicy('allowlist', store);
      expect(
        policy.evaluate(makeCmd({ subcommand: 'pr', action: 'create', riskLevel: 'moderate' })),
      ).toBe('allowed');
    });
  });

  describe('full mode', () => {
    it('should auto-allow safe commands', () => {
      const policy = new GhPolicy('full', store);
      expect(policy.evaluate(makeCmd({ riskLevel: 'safe' }))).toBe('allowed');
    });

    it('should auto-allow moderate commands', () => {
      const policy = new GhPolicy('full', store);
      expect(policy.evaluate(makeCmd({ riskLevel: 'moderate' }))).toBe('allowed');
    });

    it('should require confirmation for dangerous commands', () => {
      const policy = new GhPolicy('full', store);
      expect(policy.evaluate(makeCmd({ riskLevel: 'dangerous' }))).toBe('confirm');
    });
  });
});
