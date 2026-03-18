import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AgentRunner } from '../agent/types.js';
import type { Config } from '../config.js';
import { splitMessage } from './message.js';
import { buildCoreCommands, buildSkillCommands } from './commands.js';
import { loadSkills, formatSkillList, type Skill } from '../skill/loader.js';
import { SessionStore } from '../session/store.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { parseScheduleInput } from '../scheduler/parser.js';
import { readFileSync } from 'fs';
import { MemoryStore } from '../memory/store.js';
import { GhHandler } from '../gh/handler.js';
import type { GhTokenStore } from '../gh/token/store.js';
import { GH_TOKEN_COLLECT_TIMEOUT_MS } from '../constants.js';
import type { ConversationStore } from '../conversation/store.js';
import type { ContextManager } from '../conversation/context-manager.js';

interface BotDeps {
  readonly config: Config;
  readonly agent: AgentRunner;
  readonly sessions: SessionStore;
  readonly scheduler: Scheduler;
  readonly memory?: MemoryStore;
  readonly ghHandler?: GhHandler;
  readonly tokenStore?: GhTokenStore;
  readonly conversationStore?: ConversationStore;
  readonly contextManager?: ContextManager;
}

export async function startBot(deps: BotDeps): Promise<void> {
  const { config, agent, sessions, scheduler, memory, ghHandler, tokenStore, conversationStore, contextManager } = deps;
  const skills: Skill[] = loadSkills(config.agent.workdir);
  console.log(`[sensei] Loaded ${skills.length} skills`);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // スケジューラの送信関数を登録
  scheduler.registerSender(async (channelId, message) => {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased() && 'send' in channel) {
      await (channel as { send: (msg: string) => Promise<unknown> }).send(message);
    }
  });

  const allCommands = [...buildCoreCommands(), ...buildSkillCommands(skills)];

  client.once(Events.ClientReady, async (c) => {
    console.log(`[sensei] Ready! Logged in as ${c.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    for (const [guildId, guild] of c.guilds.cache) {
      await rest.put(Routes.applicationGuildCommands(c.user.id, guildId), { body: allCommands });
      console.log(`[sensei] ${allCommands.length} commands registered for: ${guild.name}`);
    }

    if (config.scheduler.enabled) {
      scheduler.startAll();
    }
  });

  // スラッシュコマンド
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.user.id !== config.discord.allowedUser) {
      await interaction.reply({ content: '許可されていないユーザーです', ephemeral: true });
      return;
    }

    try {
      await handleCommand(interaction, { config, agent, sessions, scheduler, memory, ghHandler, tokenStore, conversationStore, contextManager, skills });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(`エラー: ${msg.slice(0, 200)}`).catch(() => {});
      } else {
        await interaction.reply({ content: `エラー: ${msg.slice(0, 200)}`, ephemeral: true }).catch(() => {});
      }
    }
  });

  // メンション / auto-reply
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (message.author.id !== config.discord.allowedUser) return;

    const isMention = message.mentions.has(client.user!);
    const isAutoReply = config.discord.autoReplyChannels.includes(message.channelId);
    if (!isMention && !isAutoReply) return;

    const prompt = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!prompt) return;

    await message.channel.sendTyping();

    // 会話履歴をコンテキストとして取得
    let conversationHistory: string | undefined;
    if (contextManager) {
      try {
        conversationHistory = await contextManager.buildHistory(message.channelId) || undefined;
      } catch (err) {
        console.error('[sensei] Failed to build conversation history:', err);
      }
    }

    const sessionId = sessions.get(message.channelId);
    const result = await agent.run(prompt, { sessionId, channelId: message.channelId, conversationHistory });
    sessions.set(message.channelId, result.sessionId);

    // 会話を永続化
    if (conversationStore) {
      conversationStore.append(message.channelId, 'user', prompt);
      conversationStore.append(message.channelId, 'assistant', result.result);
    }

    for (const chunk of splitMessage(result.result)) {
      await message.channel.send(chunk);
    }

    // gh コマンドの後処理
    if (ghHandler) {
      const ghResults = await ghHandler.processAgentOutput(result.result, message.channelId);
      for (const ghResult of ghResults) {
        const label =
          ghResult.decision === 'allowed' || ghResult.decision === 'confirmed'
            ? `\`${ghResult.command.raw}\` の結果:`
            : `\`${ghResult.command.raw}\`:`;
        for (const chunk of splitMessage(`${label}\n${ghResult.output}`)) {
          await message.channel.send(chunk);
        }
      }
    }
  });

  await client.login(config.discord.token);
}

interface CommandContext extends BotDeps {
  readonly skills: readonly Skill[];
  readonly ghHandler?: GhHandler;
  readonly tokenStore?: GhTokenStore;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const { agent, sessions, scheduler, memory, ghHandler, tokenStore, conversationStore, skills } = ctx;
  const channelId = interaction.channelId;

  switch (interaction.commandName) {
    case 'new':
      sessions.delete(channelId);
      agent.destroy(channelId);
      conversationStore?.clear(channelId);
      await interaction.reply('新しいセッションを開始しました');
      return;

    case 'stop':
      if (agent.cancel(channelId)) {
        await interaction.reply('タスクを停止しました');
      } else {
        await interaction.reply({ content: '実行中のタスクはありません', ephemeral: true });
      }
      return;

    case 'skills':
      await interaction.reply(formatSkillList(skills));
      return;

    case 'skill': {
      const name = interaction.options.getString('name', true);
      const args = interaction.options.getString('args') || '';
      const skill = skills.find((s) => s.name === name);
      if (!skill) {
        await interaction.reply({ content: `スキル "${name}" が見つかりません`, ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const skillContent = readFileSync(skill.path, 'utf-8');
      const prompt = `以下のスキルを実行してください:\n\n${skillContent}\n\n引数: ${args}`;
      const sessionId = sessions.get(channelId);
      const result = await agent.run(prompt, { sessionId, channelId });
      sessions.set(channelId, result.sessionId);
      for (const chunk of splitMessage(result.result)) {
        if (!interaction.replied) {
          await interaction.editReply(chunk);
        } else {
          await (interaction.channel as { send: (msg: string) => Promise<unknown> } | null)?.send(chunk);
        }
      }
      return;
    }

    case 'memory': {
      if (!memory) {
        await interaction.reply({ content: 'メモリが初期化されていません', ephemeral: true });
        return;
      }
      const sub = interaction.options.getSubcommand();
      if (sub === 'show') {
        await interaction.reply(memory.summary());
      } else if (sub === 'remember') {
        const content = interaction.options.getString('content', true);
        memory.appendLongTerm(content);
        await interaction.reply(`記憶しました: ${content.slice(0, 100)}`);
      } else if (sub === 'search') {
        const keyword = interaction.options.getString('keyword', true);
        const results = memory.search(keyword);
        if (results.length === 0) {
          await interaction.reply('該当する記憶が見つかりませんでした');
        } else {
          const lines = results.flatMap((r: { file: string; lines: string[] }) =>
            [`**${r.file}**:`, ...r.lines.slice(0, 5).map((l: string) => `> ${l}`)]
          );
          await interaction.reply(lines.join('\n').slice(0, 1900));
        }
      } else if (sub === 'clear') {
        memory.writeLongTerm('');
        await interaction.reply('長期記憶をクリアしました');
      }
      return;
    }

    case 'schedule': {
      const sub = interaction.options.getSubcommand();
      if (sub === 'add') {
        const input = interaction.options.getString('input', true);
        const parsed = parseScheduleInput(input);
        if (!parsed) {
          await interaction.reply({ content: '入力形式を認識できませんでした', ephemeral: true });
          return;
        }
        const schedule = scheduler.add({ ...parsed, channelId });
        await interaction.reply(`スケジュールを追加しました (ID: ${schedule.id})`);
      } else if (sub === 'list') {
        const list = scheduler.list();
        if (list.length === 0) {
          await interaction.reply('スケジュールはありません');
        } else {
          const lines = list.map((s, i) =>
            `${i + 1}. [${s.enabled ? 'ON' : 'OFF'}] ${s.type === 'cron' ? s.expression : s.runAt} - ${s.message} (${s.id})`
          );
          await interaction.reply(lines.join('\n'));
        }
      } else if (sub === 'remove') {
        const id = interaction.options.getString('id', true);
        if (scheduler.remove(id)) {
          await interaction.reply(`スケジュール ${id} を削除しました`);
        } else {
          await interaction.reply({ content: '指定された ID が見つかりません', ephemeral: true });
        }
      }
      return;
    }

    case 'gh': {
      if (!ghHandler) {
        await interaction.reply({ content: 'gh機能が初期化されていません', ephemeral: true });
        return;
      }
      const sub = interaction.options.getSubcommand();
      if (sub === 'security') {
        await interaction.reply(`セキュリティレベル: **${ctx.config.gh.securityLevel}**`);
      } else if (sub === 'audit') {
        const entries = ghHandler.audit.recent(10);
        if (entries.length === 0) {
          await interaction.reply('監査ログはありません');
        } else {
          const lines = entries.map(
            (e) => `\`${e.command}\` [${e.riskLevel}] → ${e.decision} (${e.timestamp})`,
          );
          await interaction.reply(lines.join('\n').slice(0, 1900));
        }
      } else if (sub === 'add') {
        const pattern = interaction.options.getString('pattern', true);
        ghHandler.allowlist.add(pattern);
        await interaction.reply(`Allowlistに追加: \`${pattern}\``);
      } else if (sub === 'remove') {
        const pattern = interaction.options.getString('pattern', true);
        if (ghHandler.allowlist.remove(pattern)) {
          await interaction.reply(`Allowlistから削除: \`${pattern}\``);
        } else {
          await interaction.reply({ content: `パターン "${pattern}" が見つかりません`, ephemeral: true });
        }
      } else if (sub === 'list') {
        const entries = ghHandler.allowlist.list();
        if (entries.length === 0) {
          await interaction.reply('Allowlistは空です');
        } else {
          const lines = entries.map((e) => `\`${e.pattern}\` (追加: ${e.addedAt})`);
          await interaction.reply(lines.join('\n'));
        }
      }
      return;
    }

    case 'gh-token': {
      if (!tokenStore) {
        await interaction.reply({ content: 'トークン管理が初期化されていません', ephemeral: true });
        return;
      }
      const sub = interaction.options.getSubcommand();

      if (sub === 'add') {
        const label = interaction.options.getString('label', true);
        const repos = interaction.options.getString('repos', true).split(',').map((s) => s.trim()).filter(Boolean);
        const scopes = interaction.options.getString('scopes', true).split(',').map((s) => s.trim()).filter(Boolean);
        const expires = interaction.options.getString('expires') || undefined;

        await interaction.reply({
          content: `トークンを入力してください (${GH_TOKEN_COLLECT_TIMEOUT_MS / 1000}秒以内):\n> メッセージは自動的に削除されます`,
          ephemeral: true,
        });

        const channel = interaction.channel;
        if (!channel || !('awaitMessages' in channel)) {
          await interaction.editReply('このチャンネルではトークン入力ができません');
          return;
        }

        try {
          const collected = await channel.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: GH_TOKEN_COLLECT_TIMEOUT_MS,
            errors: ['time'],
          });

          const tokenMsg = collected.first();
          if (!tokenMsg) {
            await interaction.editReply('トークンの入力がタイムアウトしました');
            return;
          }

          const tokenValue = tokenMsg.content.trim();
          await tokenMsg.delete().catch(() => {});

          const entry = tokenStore.add({
            label,
            token: tokenValue,
            repositories: repos,
            scopes,
            expiresAt: expires,
          });

          await interaction.editReply(
            `トークンを追加しました:\n` +
            `- **ラベル**: ${entry.label}\n` +
            `- **ID**: \`${entry.id}\`\n` +
            `- **リポジトリ**: ${entry.repositories.join(', ')}\n` +
            `- **スコープ**: ${entry.scopes.join(', ')}\n` +
            `- **デフォルト**: ${entry.isDefault ? 'はい' : 'いいえ'}` +
            (entry.expiresAt ? `\n- **有効期限**: ${entry.expiresAt}` : ''),
          );
        } catch {
          await interaction.editReply('トークンの入力がタイムアウトしました');
        }
      } else if (sub === 'list') {
        const entries = tokenStore.list();
        if (entries.length === 0) {
          await interaction.reply({ content: '登録されたトークンはありません', ephemeral: true });
        } else {
          const lines = entries.map((e) =>
            `${e.isDefault ? '**[DEFAULT]** ' : ''}**${e.label}** (\`${e.id.slice(0, 8)}...\`)\n` +
            `  リポジトリ: ${e.repositories.join(', ')}\n` +
            `  スコープ: ${e.scopes.join(', ')}` +
            (e.expiresAt ? `\n  有効期限: ${e.expiresAt}` : '') +
            (e.lastUsedAt ? `\n  最終使用: ${e.lastUsedAt}` : ''),
          );
          await interaction.reply({ content: lines.join('\n\n').slice(0, 1900), ephemeral: true });
        }
      } else if (sub === 'remove') {
        const id = interaction.options.getString('id', true);
        if (tokenStore.remove(id)) {
          await interaction.reply({ content: `トークン \`${id.slice(0, 8)}...\` を削除しました`, ephemeral: true });
        } else {
          await interaction.reply({ content: '指定されたIDが見つかりません', ephemeral: true });
        }
      } else if (sub === 'rotate') {
        const id = interaction.options.getString('id', true);
        await interaction.reply({
          content: `新しいトークンを入力してください (${GH_TOKEN_COLLECT_TIMEOUT_MS / 1000}秒以内):`,
          ephemeral: true,
        });

        const channel = interaction.channel;
        if (!channel || !('awaitMessages' in channel)) {
          await interaction.editReply('このチャンネルではトークン入力ができません');
          return;
        }

        try {
          const collected = await channel.awaitMessages({
            filter: (m) => m.author.id === interaction.user.id,
            max: 1,
            time: GH_TOKEN_COLLECT_TIMEOUT_MS,
            errors: ['time'],
          });

          const tokenMsg = collected.first();
          if (!tokenMsg) {
            await interaction.editReply('タイムアウトしました');
            return;
          }

          const newToken = tokenMsg.content.trim();
          await tokenMsg.delete().catch(() => {});

          if (tokenStore.rotate(id, newToken)) {
            await interaction.editReply(`トークン \`${id.slice(0, 8)}...\` をローテーションしました`);
          } else {
            await interaction.editReply('指定されたIDが見つかりません');
          }
        } catch {
          await interaction.editReply('タイムアウトしました');
        }
      } else if (sub === 'test') {
        const repo = interaction.options.getString('repo', true);
        await interaction.deferReply({ ephemeral: true });

        const result = tokenStore.getTokenForRepo(repo);
        if (!result) {
          await interaction.editReply(`リポジトリ \`${repo}\` に対応するトークンが見つかりません`);
          return;
        }

        // 実際にgh api を呼んでテスト
        try {
          const { executeGhCommand } = await import('../gh/executor.js');
          const testCmd = {
            raw: `gh api repos/${repo}`,
            subcommand: 'api',
            action: '',
            args: [`repos/${repo}`],
            riskLevel: 'safe' as const,
          };
          const execResult = await executeGhCommand(testCmd, 10_000, { GH_TOKEN: result.token });
          if (execResult.exitCode === 0) {
            await interaction.editReply(
              `トークン **${result.entry.label}** でリポジトリ \`${repo}\` にアクセスできました`,
            );
          } else {
            await interaction.editReply(
              `トークン **${result.entry.label}** でのアクセスに失敗:\n\`\`\`\n${execResult.stderr.slice(0, 500)}\n\`\`\``,
            );
          }
        } catch (err) {
          await interaction.editReply(`テスト実行エラー: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (sub === 'default') {
        const id = interaction.options.getString('id', true);
        if (tokenStore.setDefault(id)) {
          await interaction.reply({ content: `デフォルトトークンを設定しました`, ephemeral: true });
        } else {
          await interaction.reply({ content: '指定されたIDが見つかりません', ephemeral: true });
        }
      }
      return;
    }

    default: {
      // スキルコマンド
      const skill = skills.find(
        (s) => s.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32) === interaction.commandName
      );
      if (skill) {
        await interaction.deferReply();
        const args = interaction.options.getString('args') || '';
        const skillContent = readFileSync(skill.path, 'utf-8');
        const prompt = `以下のスキルを実行してください:\n\n${skillContent}\n\n引数: ${args}`;
        const sessionId = sessions.get(channelId);
        const result = await agent.run(prompt, { sessionId, channelId });
        sessions.set(channelId, result.sessionId);
        for (const chunk of splitMessage(result.result)) {
          if (!interaction.replied) {
            await interaction.editReply(chunk);
          } else {
            await (interaction.channel as { send: (msg: string) => Promise<unknown> } | null)?.send(chunk);
          }
        }
      } else {
        await interaction.reply({ content: '不明なコマンドです', ephemeral: true });
      }
    }
  }
}
