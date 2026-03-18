import { join } from 'path';
import { DEFAULT_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS, DATA_DIR_NAME } from './constants.js';

export interface Config {
  readonly discord: {
    readonly token: string;
    readonly allowedUser: string;
    readonly autoReplyChannels: readonly string[];
  };
  readonly agent: {
    readonly model?: string;
    readonly timeoutMs: number;
    readonly workdir: string;
    readonly idleTimeoutMs: number;
    readonly sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  };
  readonly scheduler: {
    readonly enabled: boolean;
  };
  readonly learning: {
    readonly workspacePath: string;
    readonly defaultProject: string;
    readonly reviewNotifyChannel?: string;
  };
  readonly gh: {
    readonly securityLevel: 'deny' | 'allowlist' | 'full';
    readonly timeoutMs: number;
    readonly encryptionKey: string;
  };
  readonly conversation: {
    readonly tokenBudget: number;
    readonly compactionModel: string;
    readonly idleMinutes: number;
  };
  readonly dataDir: string;
}

export function loadConfig(): Config {
  const discordToken = process.env.DISCORD_TOKEN;
  if (!discordToken) {
    throw new Error('DISCORD_TOKEN environment variable is required');
  }

  const allowedUser = process.env.DISCORD_ALLOWED_USER;
  if (!allowedUser) {
    throw new Error('DISCORD_ALLOWED_USER environment variable is required');
  }

  const workdir = process.env.WORKSPACE_PATH || process.cwd();
  const dataDir = process.env.DATA_DIR || join(workdir, DATA_DIR_NAME);

  return {
    discord: {
      token: discordToken,
      allowedUser,
      autoReplyChannels:
        process.env.AUTO_REPLY_CHANNELS?.split(',')
          .map((s) => s.trim())
          .filter(Boolean) ?? [],
    },
    agent: {
      model: process.env.AGENT_MODEL || undefined,
      timeoutMs: process.env.TIMEOUT_MS ? parseInt(process.env.TIMEOUT_MS, 10) : DEFAULT_TIMEOUT_MS,
      workdir,
      idleTimeoutMs: process.env.IDLE_TIMEOUT_MS
        ? parseInt(process.env.IDLE_TIMEOUT_MS, 10)
        : DEFAULT_IDLE_TIMEOUT_MS,
      sandbox: (process.env.CODEX_SANDBOX as 'read-only' | 'workspace-write' | 'danger-full-access') || 'workspace-write',
    },
    scheduler: {
      enabled: process.env.SCHEDULER_ENABLED !== 'false',
    },
    learning: {
      workspacePath: process.env.LEARNING_WORKSPACE_PATH || join(workdir, 'workspace'),
      defaultProject: process.env.DEFAULT_PROJECT || 'default',
      reviewNotifyChannel: process.env.REVIEW_NOTIFY_CHANNEL || undefined,
    },
    gh: {
      securityLevel:
        (process.env.GH_SECURITY_LEVEL as 'deny' | 'allowlist' | 'full') || 'allowlist',
      timeoutMs: process.env.GH_TIMEOUT_MS ? parseInt(process.env.GH_TIMEOUT_MS, 10) : 30_000,
      encryptionKey: process.env.GH_TOKEN_ENCRYPTION_KEY || discordToken,
    },
    conversation: {
      tokenBudget: process.env.CONVERSATION_TOKEN_BUDGET
        ? parseInt(process.env.CONVERSATION_TOKEN_BUDGET, 10)
        : 4000,
      compactionModel: process.env.CONVERSATION_COMPACTION_MODEL || 'gpt-4o-mini',
      idleMinutes: process.env.CONVERSATION_IDLE_MINUTES
        ? parseInt(process.env.CONVERSATION_IDLE_MINUTES, 10)
        : 60,
    },
    dataDir,
  };
}
