# Sensei vs OpenClaw 機能比較

> 調査日: 2026-03-12
> 目的: 汎用的な協業パートナーAIエージェントとしての機能開発の参考資料

## OpenClawの規模感

- GitHub Stars: 68,000+
- 対応プラットフォーム: 20+ (WhatsApp, Telegram, Discord, Slack, iMessage, Teams, LINE, Signal...)
- コントリビューター多数、エコシステム成熟

---

## Senseiが持っていてOpenClawにない/弱い機能

| 機能 | Sensei | OpenClaw |
|------|--------|----------|
| **SOUL.md 人格定義** | ボットの人格をMarkdownで完全定義 | なし (汎用アシスタント) |
| **学習科学 (SM-2)** | 間隔反復、リコール練習、自己説明 | なし |
| **日本語スケジューラ** | 「毎日9:00」「30分後」等の自然言語 | cron + webhook (英語のみ) |

---

## OpenClawにあってSenseiにない機能

| 機能 | OpenClaw | Sensei |
|------|----------|--------|
| **マルチプラットフォーム** | 20+ (WhatsApp, Telegram, Slack, LINE...) | Discord のみ |
| **ブラウザ操作** | Chrome制御、スナップショット、CDP | なし |
| **モバイルノード** | iOS/Android (カメラ, GPS, 連絡先, SMS) | なし |
| **マルチモデル** | OpenAI, Claude, DeepSeek, Ollama (ローカル) | Codex CLI のみ |
| **Gateway アーキテクチャ** | WebSocket制御プレーン、マルチエージェント | 単一プロセス |
| **スキルマーケット (ClawHub)** | 検索・インストール可能なスキルレジストリ | ローカルのみ |
| **Web UI** | ブラウザベースのControl UI + WebChat | なし |
| **Pairing認証** | ペアリングコードで未知の送信者をゲート | ユーザーID固定 |
| **グループチャット** | メンション検知、グループ別ルーティング | なし |
| **メディア処理** | 画像・音声・ドキュメントの双方向転送 | テキストのみ |
| **リモートアクセス** | Tailscale/SSH トンネル | SSH直接 |
| **macOSアプリ** | メニューバー、音声起動、PTT | なし |
| **拡張思考モード** | off/minimal/low/medium/high/xhigh | なし |

---

## 共通している機能

| 機能 | Sensei | OpenClaw |
|------|--------|----------|
| **永続メモリ** | Markdownファイル | ローカルセッション保存 |
| **スキルシステム** | SKILL.md ドロップイン | 3層 (bundled/managed/workspace) |
| **スケジューラ** | cron + 自然言語 | cron + webhook |
| **セッション管理** | チャンネル別 | チャンネル別 + グループ別 |
| **Docker デプロイ** | docker-compose | Docker / Nix / systemd |
| **ローカルファースト** | データはサーバー上 | データはローカル |

---

## Senseiを1から作る意義 (安全性の観点)

1. **攻撃面の最小化** — 20+プラットフォーム対応 = 20+の攻撃経路。Senseiは Discord単一で攻撃面が小さい
2. **コード理解** — 自分で書いたコードの挙動を100%把握できる。OpenClawは巨大で監査が困難
3. **依存関係の管理** — Senseiの依存は最小限 (discord.js, node-cron, @openai/codex)。OpenClawはpnpmモノレポで多数の依存
4. **実行権限の制御** — Senseiは `CODEX_SANDBOX` で明示的にサンドボックスレベルを制御。OpenClawは「elevated bash toggle」で権限昇格が可能
5. **シングルユーザー設計** — `DISCORD_ALLOWED_USER` で1人だけ許可。OpenClawのペアリングシステムはマルチユーザー前提で複雑

---

## 汎用パートナーとして発展させる場合の優先候補

OpenClawから参考にすべき機能（優先度順）:

1. **マルチモデル対応** — Codex CLI以外にClaude API直接、Ollama等を選択可能に
2. **ブラウザ操作** — Playwright等でWeb調査・自動化
3. **メディア処理** — 画像の送受信・解析
4. **Web UI** — 設定・メモリ閲覧用の簡易ダッシュボード
5. **マルチプラットフォーム** — Slack/Telegram追加 (必要に応じて)

---

## 参考リンク

- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Docs](https://docs.openclaw.ai)
