import { SlashCommandBuilder } from 'discord.js';
import type { Skill } from '../skill/loader.js';

/** 組み込みコマンドの定義 */
export function buildCoreCommands(): ReturnType<SlashCommandBuilder['toJSON']>[] {
  return [
    new SlashCommandBuilder()
      .setName('new')
      .setDescription('新しいセッションを開始する')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription('実行中のタスクを停止する')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('skills')
      .setDescription('利用可能なスキル一覧を表示')
      .toJSON(),
    new SlashCommandBuilder()
      .setName('skill')
      .setDescription('スキルを実行する')
      .addStringOption((opt) =>
        opt.setName('name').setDescription('スキル名').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('args').setDescription('引数').setRequired(false)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription('スケジュール管理')
      .addSubcommand((sub) =>
        sub.setName('add').setDescription('スケジュールを追加')
          .addStringOption((opt) =>
            opt.setName('input').setDescription('例: "毎日 9:00 おはよう"').setRequired(true)
          )
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('スケジュール一覧'))
      .addSubcommand((sub) =>
        sub.setName('remove').setDescription('スケジュールを削除')
          .addStringOption((opt) =>
            opt.setName('id').setDescription('スケジュールID').setRequired(true)
          )
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('memory')
      .setDescription('メモリ管理')
      .addSubcommand((sub) => sub.setName('show').setDescription('メモリの概要を表示'))
      .addSubcommand((sub) =>
        sub.setName('remember').setDescription('情報を記憶する')
          .addStringOption((opt) =>
            opt.setName('content').setDescription('記憶する内容').setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub.setName('search').setDescription('メモリを検索')
          .addStringOption((opt) =>
            opt.setName('keyword').setDescription('検索キーワード').setRequired(true)
          )
      )
      .addSubcommand((sub) => sub.setName('clear').setDescription('長期記憶をクリア'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('gh')
      .setDescription('GitHub CLI管理')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('Allowlistにパターンを追加')
          .addStringOption((opt) =>
            opt.setName('pattern').setDescription('例: "pr list", "pr *"').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('Allowlistからパターンを削除')
          .addStringOption((opt) =>
            opt.setName('pattern').setDescription('削除するパターン').setRequired(true),
          ),
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('Allowlist一覧'))
      .addSubcommand((sub) => sub.setName('audit').setDescription('最近の監査ログ'))
      .addSubcommand((sub) => sub.setName('security').setDescription('セキュリティレベル表示'))
      .toJSON(),
    new SlashCommandBuilder()
      .setName('gh-token')
      .setDescription('GitHubトークン管理')
      .addSubcommand((sub) =>
        sub
          .setName('add')
          .setDescription('トークンを追加')
          .addStringOption((opt) =>
            opt.setName('label').setDescription('トークンの名前').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('repos').setDescription('リポジトリ (カンマ区切り: owner/repo,owner/*)').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('scopes').setDescription('スコープ (カンマ区切り: contents:read,pull_requests:write)').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('expires').setDescription('有効期限 (ISO 8601, 例: 2026-12-31)').setRequired(false),
          ),
      )
      .addSubcommand((sub) => sub.setName('list').setDescription('トークン一覧'))
      .addSubcommand((sub) =>
        sub
          .setName('remove')
          .setDescription('トークンを削除')
          .addStringOption((opt) =>
            opt.setName('id').setDescription('トークンID').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('rotate')
          .setDescription('トークンをローテーション')
          .addStringOption((opt) =>
            opt.setName('id').setDescription('トークンID').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('test')
          .setDescription('トークンの接続テスト')
          .addStringOption((opt) =>
            opt.setName('repo').setDescription('テスト対象リポジトリ (owner/repo)').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('default')
          .setDescription('デフォルトトークンを設定')
          .addStringOption((opt) =>
            opt.setName('id').setDescription('トークンID').setRequired(true),
          ),
      )
      .toJSON(),
  ];
}

/** スキルを個別のスラッシュコマンドとして変換 */
export function buildSkillCommands(skills: readonly Skill[]): ReturnType<SlashCommandBuilder['toJSON']>[] {
  const commands: ReturnType<SlashCommandBuilder['toJSON']>[] = [];

  for (const skill of skills) {
    const name = skill.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);

    if (name) {
      commands.push(
        new SlashCommandBuilder()
          .setName(name)
          .setDescription(skill.description.slice(0, 100) || `${skill.name} スキルを実行`)
          .addStringOption((opt) =>
            opt.setName('args').setDescription('引数（任意）').setRequired(false)
          )
          .toJSON()
      );
    }
  }

  return commands;
}
