import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type Message,
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

interface BotDeps {
  readonly config: Config;
  readonly agent: AgentRunner;
  readonly sessions: SessionStore;
  readonly scheduler: Scheduler;
}

export async function startBot(deps: BotDeps): Promise<void> {
  const { config, agent, sessions, scheduler } = deps;
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
      await handleCommand(interaction, { config, agent, sessions, scheduler, skills });
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

    const sessionId = sessions.get(message.channelId);
    const result = await agent.run(prompt, { sessionId, channelId: message.channelId });
    sessions.set(message.channelId, result.sessionId);

    for (const chunk of splitMessage(result.result)) {
      await message.channel.send(chunk);
    }
  });

  await client.login(config.discord.token);
}

interface CommandContext extends BotDeps {
  readonly skills: readonly Skill[];
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  ctx: CommandContext,
): Promise<void> {
  const { agent, sessions, scheduler, skills } = ctx;
  const channelId = interaction.channelId;

  switch (interaction.commandName) {
    case 'new':
      sessions.delete(channelId);
      agent.destroy(channelId);
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
