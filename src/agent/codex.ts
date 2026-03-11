import type { AgentRunner, AgentResult, AgentRunOptions } from './types.js';
import { runProcess } from './process.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

interface CodexConfig {
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly workdir?: string;
  readonly sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
}

/** OpenAI Codex CLI を使ったエージェントランナー */
export class CodexRunner implements AgentRunner {
  private readonly config: CodexConfig;
  private readonly activeProcesses = new Map<string, () => void>();

  constructor(config: CodexConfig = {}) {
    this.config = config;
  }

  async run(prompt: string, options?: AgentRunOptions): Promise<AgentResult> {
    const args = ['exec'];

    if (this.config.model) {
      args.push('--model', this.config.model);
    }

    args.push('--sandbox', this.config.sandbox ?? 'workspace-write');

    if (this.config.workdir) {
      args.push('--cd', this.config.workdir);
    }

    if (options?.sessionId) {
      // Codex exec resume で前回セッションを継続
      args.splice(1, 0, 'resume', '--session-id', options.sessionId);
    }

    const fullPrompt = `${SYSTEM_PROMPT}\n\n## ユーザーの入力\n${prompt}`;
    args.push(fullPrompt);

    const { promise, kill } = runProcess({
      command: 'codex',
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

      return { result: output || '(応答なし)', sessionId: options?.sessionId ?? '' };
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
