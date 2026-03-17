import type { GhCommand, GhDecision, GhExecutionResult, GhSecurityLevel } from './types.js';
import { extractGhCommands } from './extractor.js';
import { GhPolicy } from './policy.js';
import { GhAllowlistStore } from './store.js';
import { GhAuditLog } from './audit.js';
import { executeGhCommand } from './executor.js';

export interface GhHandlerOptions {
  readonly dataDir: string;
  readonly securityLevel: GhSecurityLevel;
  readonly timeoutMs: number;
  readonly executeFn?: (cmd: GhCommand, timeoutMs: number) => Promise<GhExecutionResult>;
  readonly confirmFn?: (cmd: GhCommand, channelId: string) => Promise<boolean>;
}

export interface GhHandlerResult {
  readonly command: GhCommand;
  readonly decision: GhDecision;
  readonly output: string;
}

export class GhHandler {
  readonly allowlist: GhAllowlistStore;
  readonly audit: GhAuditLog;
  private readonly policy: GhPolicy;
  private readonly timeoutMs: number;
  private readonly executeFn: (cmd: GhCommand, timeoutMs: number) => Promise<GhExecutionResult>;
  private readonly confirmFn?: (cmd: GhCommand, channelId: string) => Promise<boolean>;

  constructor(options: GhHandlerOptions) {
    this.allowlist = new GhAllowlistStore(options.dataDir);
    this.audit = new GhAuditLog(options.dataDir);
    this.policy = new GhPolicy(options.securityLevel, this.allowlist);
    this.timeoutMs = options.timeoutMs;
    this.executeFn = options.executeFn ?? executeGhCommand;
    this.confirmFn = options.confirmFn;
  }

  async processAgentOutput(text: string, channelId: string): Promise<GhHandlerResult[]> {
    const commands = extractGhCommands(text);
    const results: GhHandlerResult[] = [];

    for (const cmd of commands) {
      const result = await this.handleCommand(cmd, channelId);
      results.push(result);
    }

    return results;
  }

  private async handleCommand(cmd: GhCommand, channelId: string): Promise<GhHandlerResult> {
    const policyDecision = this.policy.evaluate(cmd);
    const startMs = Date.now();

    if (policyDecision === 'denied') {
      this.logAudit(cmd, 'denied', channelId);
      return {
        command: cmd,
        decision: 'denied',
        output: `コマンド \`${cmd.raw}\` は拒否されました (risk: ${cmd.riskLevel})`,
      };
    }

    if (policyDecision === 'confirm') {
      const decision = await this.requestConfirmation(cmd, channelId);
      if (decision !== 'confirmed') {
        this.logAudit(cmd, decision, channelId);
        return {
          command: cmd,
          decision,
          output:
            decision === 'rejected'
              ? `コマンド \`${cmd.raw}\` はユーザーにより拒否されました`
              : `コマンド \`${cmd.raw}\` の確認がタイムアウトしました`,
        };
      }
    }

    // Execute
    try {
      const result = await this.executeFn(cmd, this.timeoutMs);
      const executionMs = Date.now() - startMs;
      const decision: GhDecision = policyDecision === 'confirm' ? 'confirmed' : 'allowed';

      this.logAudit(cmd, decision, channelId, executionMs, result.exitCode);

      const output =
        result.exitCode === 0
          ? result.stdout || '(no output)'
          : `Error (exit ${result.exitCode}):\n${result.stderr || result.stdout}`;

      return { command: cmd, decision, output };
    } catch (err) {
      const executionMs = Date.now() - startMs;
      const decision: GhDecision = policyDecision === 'confirm' ? 'confirmed' : 'allowed';
      this.logAudit(cmd, decision, channelId, executionMs);

      return {
        command: cmd,
        decision,
        output: `コマンド実行エラー: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async requestConfirmation(
    cmd: GhCommand,
    channelId: string,
  ): Promise<'confirmed' | 'rejected' | 'timeout'> {
    if (!this.confirmFn) {
      return 'rejected';
    }

    try {
      const confirmed = await this.confirmFn(cmd, channelId);
      return confirmed ? 'confirmed' : 'rejected';
    } catch {
      return 'timeout';
    }
  }

  private logAudit(
    cmd: GhCommand,
    decision: GhDecision,
    channelId: string,
    executionMs?: number,
    exitCode?: number | null,
  ): void {
    this.audit.log({
      timestamp: new Date().toISOString(),
      command: cmd.raw,
      riskLevel: cmd.riskLevel,
      decision,
      channelId,
      executionMs,
      exitCode,
    });
  }
}
