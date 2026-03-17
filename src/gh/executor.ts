import { runProcess } from '../agent/process.js';
import type { GhCommand, GhExecutionResult } from './types.js';

const DEFAULT_GH_TIMEOUT_MS = 30_000;

export async function executeGhCommand(
  cmd: GhCommand,
  timeoutMs: number = DEFAULT_GH_TIMEOUT_MS,
): Promise<GhExecutionResult> {
  // raw は "gh pr list ..." の形式なので、"gh" を除いた部分を args に
  const parts = cmd.raw.split(/\s+/);
  const command = parts[0]; // "gh"
  const args = parts.slice(1);

  const { promise } = runProcess({
    command,
    args,
    timeoutMs,
  });

  return promise;
}
