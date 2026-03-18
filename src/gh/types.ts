export type GhRiskLevel = 'safe' | 'moderate' | 'dangerous';

export type GhDecision = 'allowed' | 'denied' | 'confirmed' | 'rejected' | 'timeout';

export type GhSecurityLevel = 'deny' | 'allowlist' | 'full';

export interface GhCommand {
  readonly raw: string;
  readonly subcommand: string;
  readonly action: string;
  readonly args: readonly string[];
  readonly riskLevel: GhRiskLevel;
}

export interface GhAuditEntry {
  readonly timestamp: string;
  readonly command: string;
  readonly riskLevel: GhRiskLevel;
  readonly decision: GhDecision;
  readonly channelId: string;
  readonly executionMs?: number;
  readonly exitCode?: number | null;
  readonly tokenLabel?: string;
}

export interface GhAllowlistEntry {
  readonly pattern: string;
  readonly addedAt: string;
  readonly lastUsedAt: string;
}

export interface GhExecutionResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}
