import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { GhAuditLog } from '../src/gh/audit.js';

describe('GhAuditLog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-gh-audit-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should log an entry', () => {
    const audit = new GhAuditLog(tmpDir);
    audit.log({
      timestamp: new Date().toISOString(),
      command: 'gh pr list',
      riskLevel: 'safe',
      decision: 'allowed',
      channelId: 'ch1',
    });

    const entries = audit.recent(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].command).toBe('gh pr list');
  });

  it('should return recent entries in reverse chronological order', () => {
    const audit = new GhAuditLog(tmpDir);
    audit.log({
      timestamp: '2026-01-01T00:00:00Z',
      command: 'gh pr list',
      riskLevel: 'safe',
      decision: 'allowed',
      channelId: 'ch1',
    });
    audit.log({
      timestamp: '2026-01-02T00:00:00Z',
      command: 'gh issue view 1',
      riskLevel: 'safe',
      decision: 'allowed',
      channelId: 'ch1',
    });

    const entries = audit.recent(10);
    expect(entries).toHaveLength(2);
    expect(entries[0].command).toBe('gh issue view 1');
    expect(entries[1].command).toBe('gh pr list');
  });

  it('should limit recent entries', () => {
    const audit = new GhAuditLog(tmpDir);
    for (let i = 0; i < 20; i++) {
      audit.log({
        timestamp: new Date().toISOString(),
        command: `gh pr view ${i}`,
        riskLevel: 'safe',
        decision: 'allowed',
        channelId: 'ch1',
      });
    }

    expect(audit.recent(5)).toHaveLength(5);
    expect(audit.recent(10)).toHaveLength(10);
  });

  it('should persist as JSONL', () => {
    const audit = new GhAuditLog(tmpDir);
    audit.log({
      timestamp: '2026-01-01T00:00:00Z',
      command: 'gh pr list',
      riskLevel: 'safe',
      decision: 'allowed',
      channelId: 'ch1',
    });

    const content = readFileSync(join(tmpDir, 'gh-audit.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).command).toBe('gh pr list');
  });

  it('should load existing entries on construction', () => {
    const audit1 = new GhAuditLog(tmpDir);
    audit1.log({
      timestamp: '2026-01-01T00:00:00Z',
      command: 'gh pr list',
      riskLevel: 'safe',
      decision: 'allowed',
      channelId: 'ch1',
    });

    const audit2 = new GhAuditLog(tmpDir);
    expect(audit2.recent(10)).toHaveLength(1);
  });

  it('should trim to 1000 entries', () => {
    const audit = new GhAuditLog(tmpDir);
    for (let i = 0; i < 1050; i++) {
      audit.log({
        timestamp: new Date().toISOString(),
        command: `gh pr view ${i}`,
        riskLevel: 'safe',
        decision: 'allowed',
        channelId: 'ch1',
      });
    }

    // reload to verify trimming
    const audit2 = new GhAuditLog(tmpDir);
    expect(audit2.recent(2000)).toHaveLength(1000);
  });
});
