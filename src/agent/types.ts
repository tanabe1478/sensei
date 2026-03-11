/** エージェント実行の結果 */
export interface AgentResult {
  readonly result: string;
  readonly sessionId: string;
}

/** エージェント実行のオプション */
export interface AgentRunOptions {
  readonly sessionId?: string;
  readonly channelId?: string;
  readonly timeoutMs?: number;
}

/** エージェントランナーのインターフェース */
export interface AgentRunner {
  run(prompt: string, options?: AgentRunOptions): Promise<AgentResult>;
  cancel(channelId: string): boolean;
  destroy(channelId: string): void;
}
