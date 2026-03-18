import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGhCommand } from '../src/gh/executor.js';
import type { GhCommand } from '../src/gh/types.js';

// Mock runProcess to avoid actual process spawning
vi.mock('../src/agent/process.js', () => ({
  runProcess: vi.fn((options: { command: string; args: string[]; timeoutMs: number; env?: Record<string, string> }) => ({
    promise: Promise.resolve({
      stdout: JSON.stringify({ env: options.env }),
      stderr: '',
      exitCode: 0,
    }),
    kill: vi.fn(),
  })),
}));

describe('executeGhCommand with env', () => {
  const cmd: GhCommand = {
    raw: 'gh pr list',
    subcommand: 'pr',
    action: 'list',
    args: [],
    riskLevel: 'safe',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass env to runProcess when provided', async () => {
    const { runProcess } = await import('../src/agent/process.js');
    const env = { GH_TOKEN: 'ghp_test123' };

    await executeGhCommand(cmd, 30_000, env);

    expect(runProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { GH_TOKEN: 'ghp_test123' },
      }),
    );
  });

  it('should work without env (backward compatible)', async () => {
    const { runProcess } = await import('../src/agent/process.js');

    await executeGhCommand(cmd, 30_000);

    expect(runProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'gh',
        args: ['pr', 'list'],
        timeoutMs: 30_000,
      }),
    );
    // env should be undefined when not provided
    const callArgs = (runProcess as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.env).toBeUndefined();
  });
});
