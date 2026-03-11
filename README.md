# Sensei

An AI-powered Discord bot that acts as your personal partner for development, task management, and learning — powered by [Codex CLI](https://github.com/openai/codex).

Sensei uses a **SOUL.md** personality definition and **persistent memory** (inspired by [OpenClaw](https://github.com/openinterface-ai/openclaw)) to maintain context across conversations and grow with you over time.

## Features

- **Partner, not assistant** — Opinionated, proactive, remembers your context
- **SOUL.md** — Defines the bot's personality, values, and behavior
- **Persistent memory** — Markdown-based long-term memory and daily logs
- **Skill system** — Drop a `SKILL.md` into `skills/` to register new slash commands
- **Scheduler** — Cron jobs and one-time reminders with natural language input
- **Learning support** — Spaced repetition (SM-2), recall practice, self-explanation (auxiliary)
- **Session management** — Per-channel session persistence

## Prerequisites

- Node.js >= 22
- [Codex CLI](https://github.com/openai/codex) (`npm i -g @openai/codex`)
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Codex authentication (one of):
  - `codex login` for OAuth (no API key needed)
  - `OPENAI_API_KEY` environment variable

## Setup

```bash
git clone https://github.com/tanabe1478/sensei.git
cd sensei
npm install
cp .env.example .env
cp SOUL.md.example SOUL.md
# Edit .env with your tokens
# Edit SOUL.md to define your bot's personality
npm run build
npm start
```

### Development

```bash
npm run dev
```

### Docker

```bash
docker compose up -d
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `DISCORD_ALLOWED_USER` | Yes | Your Discord user ID |
| `OPENAI_API_KEY` | No | OpenAI API key (not needed if authenticated via `codex login`) |
| `AUTO_REPLY_CHANNELS` | No | Comma-separated channel IDs for auto-reply |
| `AGENT_MODEL` | No | Model for Codex CLI (defaults to Codex CLI config) |
| `CODEX_SANDBOX` | No | `read-only`, `workspace-write`, `danger-full-access` (default: `workspace-write`) |
| `TIMEOUT_MS` | No | Agent execution timeout in ms (default: 300000) |
| `WORKSPACE_PATH` | No | Working directory (default: cwd) |
| `SCHEDULER_ENABLED` | No | Enable scheduler (default: true) |
| `DATA_DIR` | No | Data storage directory |

## Slash Commands

| Command | Description |
|---------|-------------|
| `/new` | Start a new session |
| `/stop` | Stop the running task |
| `/skills` | List available skills |
| `/skill <name> [args]` | Run a skill |
| `/memory show` | Show memory summary |
| `/memory remember <content>` | Save to long-term memory |
| `/memory search <keyword>` | Search memory |
| `/memory clear` | Clear long-term memory |
| `/schedule add <input>` | Add a schedule |
| `/schedule list` | List schedules |
| `/schedule remove <id>` | Remove a schedule |

## SOUL.md

`SOUL.md` in the project root defines the bot's personality. Copy the template and customize it:

```bash
cp SOUL.md.example SOUL.md
```

`SOUL.md` is gitignored — your personality config stays private. Edit it to define tone, priorities, and boundaries.

## Memory

Sensei maintains persistent memory as plain Markdown files in the data directory:

- **`memory/MEMORY.md`** — Long-term memory (preferences, project info, decisions)
- **`memory/YYYY-MM-DD.md`** — Daily logs (conversation highlights, task progress)

All memory files are stored in the data directory (`.sensei/` by default), which is gitignored. Your conversation history and personal data never leave your machine.

Memory is automatically included in the system prompt and can be managed via `/memory` commands or natural language ("remember this", "forget that").

## Skills

Drop a `SKILL.md` file into `skills/<name>/SKILL.md` to register it as a slash command:

```markdown
---
name: today
description: Review today's learning plan
---
# Today Skill
...
```

## Schedule Input Formats

Supports Japanese natural language and cron expressions:

- `cron 0 9 * * *` — Direct cron expression
- `毎日 9:00 message` — Daily at 9:00
- `毎時 message` — Every hour
- `毎週月曜 9:00 message` — Weekly on Monday
- `30分後 message` — 30 minutes from now
- `15:00 message` — Today at 15:00 (or tomorrow if past)

## Testing

```bash
npm test
```

## License

MIT
