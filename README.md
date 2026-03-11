# Sensei

認知科学に基づいた AI 学習支援 Discord Bot。

間隔反復（SM-2）、想起練習、自己説明などの学習理論を活用し、日々の学習を支援します。

## 機能

- **Discord Bot**: メンション or 自動返信チャンネルで AI と対話
- **スキルシステム**: `skills/` ディレクトリの Markdown ファイルをコマンドとして実行
- **間隔反復**: SM-2 アルゴリズムによる復習スケジューリング
- **スケジューラ**: cron ジョブ / ワンタイムリマインダー（自然言語入力対応）
- **セッション管理**: チャンネルごとにセッションを永続化

## セットアップ

### 必要な環境

- Node.js >= 22
- [Codex CLI](https://github.com/openai/codex) (`npm i -g @openai/codex`)
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Codex の認証（以下のいずれか）:
  - `codex login` で OAuth 認証（API キー不要）
  - または `OPENAI_API_KEY` 環境変数

### インストール

```bash
npm install
cp .env.example .env
# .env を編集して DISCORD_TOKEN 等を設定
```

### 起動

```bash
npm run build
npm start

# 開発モード
npm run dev
```

### Docker

```bash
docker compose up -d
```

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `DISCORD_TOKEN` | Yes | Discord Bot トークン |
| `DISCORD_ALLOWED_USER` | Yes | 操作を許可するユーザー ID |
| `AUTO_REPLY_CHANNELS` | No | 自動返信するチャンネル ID（カンマ区切り） |
| `OPENAI_API_KEY` | No | OpenAI API キー（`codex login` で OAuth 認証済みなら不要） |
| `AGENT_MODEL` | No | Codex で使用するモデル名（デフォルト: Codex CLI の設定に従う） |
| `CODEX_SANDBOX` | No | サンドボックスモード: `read-only`, `workspace-write`, `danger-full-access`（デフォルト: `read-only`） |
| `TIMEOUT_MS` | No | エージェント実行タイムアウト（デフォルト: 300000） |
| `WORKSPACE_PATH` | No | 作業ディレクトリ（デフォルト: カレントディレクトリ） |
| `SCHEDULER_ENABLED` | No | スケジューラ有効化（デフォルト: true） |
| `DATA_DIR` | No | データ保存先ディレクトリ |

## スラッシュコマンド

| コマンド | 説明 |
|----------|------|
| `/new` | 新しいセッションを開始 |
| `/stop` | 実行中のタスクを停止 |
| `/skills` | 利用可能なスキル一覧 |
| `/skill <name> [args]` | スキルを実行 |
| `/schedule add <input>` | スケジュール追加（例: `毎日 9:00 おはよう`） |
| `/schedule list` | スケジュール一覧 |
| `/schedule remove <id>` | スケジュール削除 |

## スケジュール入力フォーマット

- `毎日 9:00 おはよう` → 毎日 9:00 に実行
- `毎時 チェック` → 毎時 0 分に実行
- `毎週月曜 9:00 週次レビュー` → 毎週月曜に実行
- `30分後 リマインド` → 30 分後に一度だけ実行
- `15:00 ミーティング` → 今日の 15:00（過ぎていたら明日）
- `cron 0 9 * * * おはよう` → cron 式を直接指定

## スキル

`skills/` ディレクトリに SKILL.md ファイルを配置すると、自動的にスラッシュコマンドとして登録されます。

```markdown
---
name: today
description: 今日の学習計画を確認する
---
# Today スキル
...
```

## テスト

```bash
npm test
```

## ライセンス

MIT
