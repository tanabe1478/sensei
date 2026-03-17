import { loadConfig } from './config.js';
import { CodexRunner } from './agent/codex.js';
import { SessionStore } from './session/store.js';
import { Scheduler } from './scheduler/scheduler.js';
import { MemoryStore } from './memory/store.js';
import { GhHandler } from './gh/handler.js';
import { ConversationStore } from './conversation/store.js';
import { ContextManager } from './conversation/context-manager.js';
import { startBot } from './discord/bot.js';

async function main(): Promise<void> {
  const config = loadConfig();

  console.log('[sensei] Starting...');

  const memory = new MemoryStore(config.dataDir);

  const agent = new CodexRunner({
    model: config.agent.model,
    timeoutMs: config.agent.timeoutMs,
    workdir: config.agent.workdir,
    sandbox: config.agent.sandbox,
    memory,
  });

  const sessions = new SessionStore(config.dataDir);
  const scheduler = new Scheduler(config.dataDir);
  const ghHandler = new GhHandler({
    dataDir: config.dataDir,
    securityLevel: config.gh.securityLevel,
    timeoutMs: config.gh.timeoutMs,
  });

  const conversationStore = new ConversationStore(config.dataDir);

  const contextManager = new ContextManager(conversationStore, {
    tokenBudget: config.conversation.tokenBudget,
    compactionModel: config.conversation.compactionModel,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  await startBot({ config, agent, sessions, scheduler, memory, ghHandler, conversationStore, contextManager });
}

main().catch((err) => {
  console.error('[sensei] Fatal error:', err);
  process.exit(1);
});
