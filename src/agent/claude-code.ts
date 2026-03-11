import type { AgentRunner, AgentResult, AgentRunOptions } from './types.js';
import { runProcess } from './process.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';

interface ClaudeCodeConfig {
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly workdir?: string;
}

/** Claude Code CLI を使ったエージェントランナー */
export class ClaudeCodeRunner implements AgentRunner {
  private readonly config: ClaudeCodeConfig;
  private readonly activeProcesses = new Map<string, () => void>();

  constructor(config: ClaudeCodeConfig = {}) {
    this.config = config;
  }

  async run(prompt: string, options?: AgentRunOptions): Promise<AgentResult> {
    const args = ['--print', '--output-format', 'text'];

    if (options?.sessionId) {
      args.push('--session-id', options.sessionId);
    }

    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    args.push(prompt);

    const { promise, kill } = runProcess({
      command: 'claude',
      args,
      cwd: this.config.workdir,
      timeoutMs: options?.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    const channelId = options?.channelId ?? 'default';
    this.activeProcesses.set(channelId, kill);

    try {
      const result = await promise;
      this.activeProcesses.delete(channelId);

      const output = result.stdout.trim() || result.stderr.trim();
      // Claude Code CLI は --print 時に session ID を stderr に出すことがある
      const sessionIdMatch = result.stderr.match(/Session ID: (\S+)/);
      const sessionId = sessionIdMatch?.[1] ?? options?.sessionId ?? '';

      return { result: output || '(応答なし)', sessionId };
    } catch (err) {
      this.activeProcesses.delete(channelId);
      throw err;
    }
  }

  cancel(channelId: string): boolean {
    const kill = this.activeProcesses.get(channelId);
    if (kill) {
      kill();
      this.activeProcesses.delete(channelId);
      return true;
    }
    return false;
  }

  destroy(channelId: string): void {
    this.cancel(channelId);
  }
}
