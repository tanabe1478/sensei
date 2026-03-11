import { loadConfig } from './config.js';
import { CodexRunner } from './agent/codex.js';
import { SessionStore } from './session/store.js';
import { Scheduler } from './scheduler/scheduler.js';
import { MemoryStore } from './memory/store.js';
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

  await startBot({ config, agent, sessions, scheduler, memory });
}

main().catch((err) => {
  console.error('[sensei] Fatal error:', err);
  process.exit(1);
});
