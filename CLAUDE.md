# Sensei - Project Guide

AI搭載のDiscord bot。開発・タスク管理・学習のパーソナルパートナー。

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js >= 22 |
| Discord | discord.js v14 |
| AI Runner | OpenAI Codex CLI (`@openai/codex`) |
| Scheduler | node-cron v4 |
| Testing | Vitest v4 |
| Linting | ESLint 9 + TypeScript-ESLint |
| Formatting | Prettier 3 |
| Container | Docker + docker-compose |

## Project Structure

```
src/
├── index.ts                  # エントリーポイント
├── config.ts                 # 環境変数の読み込み・バリデーション
├── constants.ts              # 定数 (Discord制限、タイムアウト等)
├── agent/                    # AIエージェント実行
│   ├── types.ts              # AgentRunner インターフェース
│   ├── codex.ts              # Codex CLI ラッパー (メインランナー)
│   ├── claude-code.ts        # Claude Code ランナー (代替)
│   ├── process.ts            # 子プロセス起動
│   └── system-prompt.ts      # SOUL.md + メモリ注入
├── discord/                  # Discord bot
│   ├── bot.ts                # クライアント・イベントハンドラ
│   ├── commands.ts           # スラッシュコマンド定義
│   └── message.ts            # メッセージ分割 (2000文字制限)
├── memory/store.ts           # Markdown ベースの永続メモリ
├── session/store.ts          # チャンネル別セッション管理 (JSON)
├── scheduler/
│   ├── scheduler.ts          # cron + setTimeout 管理
│   └── parser.ts             # 自然言語 → cron/日時パーサー
├── learning/                 # 学習科学機能
│   ├── types.ts              # ドメイン型
│   ├── spaced-repetition.ts  # SM-2 アルゴリズム
│   ├── store.ts              # 学習データ永続化
│   └── review-scheduler.ts   # レビュースケジューリング
└── skill/loader.ts           # SKILL.md パーサー・レジストリ

skills/                       # プラグインスキル (9個)
tests/                        # Vitest テスト (9ファイル)
workspace/                    # ユーザープロジェクトディレクトリ
```

## Key Files

- `SOUL.md` — ボットの人格定義 (gitignored、プライベート)
- `SOUL.md.example` — 人格テンプレート
- `.sensei/` — ランタイムデータ (memory, sessions, schedules)

## Deployment

### 環境: ConoHa VPS

- **IP**: 163.44.124.171
- **ユーザー**: root
- **SSH鍵**: `~/.ssh/conoha-sensei.pem`
- **デプロイ先**: `/opt/sensei/`
- **実行方式**: Docker Compose (`docker compose up -d`)
- **再起動ポリシー**: `unless-stopped`

### デプロイ手順

```bash
# ConoHaにSSH接続
ssh conoha-sensei

# デプロイ先で操作
cd /opt/sensei
git pull
docker compose up -d --build
```

### Docker構成

- **Dockerfile**: Node 22 slim → Codex CLIインストール → npm ci → tsc ビルド
- **永続ボリューム**: `sensei-data:/app/.sensei` (メモリ・セッション・スケジュール)
- **読み取り専用マウント**: `./skills:/app/skills:ro`
- **ワークスペース**: `./workspace:/app/workspace`
- **環境変数**: `.env` ファイルから読み込み

### SOUL.md 同期

ローカルの SOUL.md をサーバーに反映する場合:
```bash
scp -i ~/.ssh/conoha-sensei.pem SOUL.md root@163.44.124.171:/opt/sensei/SOUL.md
```

## Development

```bash
npm run dev          # tsx watch (ホットリロード)
npm test             # Vitest 実行
npm run typecheck    # 型チェックのみ
npm run lint         # ESLint
npm run format       # Prettier
npm run build        # tsc → dist/
npm start            # 本番実行
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | Yes | — | Discord bot トークン |
| `DISCORD_ALLOWED_USER` | Yes | — | 許可するDiscordユーザーID |
| `OPENAI_API_KEY` | No | — | OpenAI APIキー |
| `AUTO_REPLY_CHANNELS` | No | — | 自動返信チャンネルID (カンマ区切り) |
| `AGENT_MODEL` | No | — | Codex CLIのモデル |
| `CODEX_SANDBOX` | No | workspace-write | サンドボックスレベル |
| `TIMEOUT_MS` | No | 300000 | エージェント実行タイムアウト (ms) |
| `IDLE_TIMEOUT_MS` | No | 1800000 | アイドルタイムアウト (ms) |
| `DATA_DIR` | No | .sensei | データ保存ディレクトリ |

## Architecture Notes

- **実行フロー**: Discord メッセージ → bot.ts → codex.ts (system-prompt注入) → Codex CLI子プロセス → レスポンスをDiscordに返信
- **メモリ**: データベース不使用。Markdownファイル (`MEMORY.md` + 日次ログ) で永続化
- **スキル**: `skills/<name>/SKILL.md` を置くだけで自動的にスラッシュコマンドとして登録
- **セッション**: チャンネルID → セッションID のマッピングを `sessions.json` で管理
- **スケジューラ**: `schedules.json` で永続化、node-cron + setTimeout で実行
