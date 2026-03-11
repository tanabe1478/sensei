import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { MemoryStore } from '../memory/store.js';

/** SOUL.md とメモリを統合したシステムプロンプトを構築する */
export function buildSystemPrompt(workdir: string, memory: MemoryStore): string {
  const parts: string[] = [];

  // SOUL.md を読み込む
  const soulPath = join(workdir, 'SOUL.md');
  if (existsSync(soulPath)) {
    parts.push(readFileSync(soulPath, 'utf-8'));
  }

  // 長期記憶
  const longTerm = memory.readLongTerm();
  if (longTerm) {
    parts.push('---\n## 記憶（長期）\n以下はこれまでの会話で記憶した情報です。文脈として活用してください。\n');
    parts.push(longTerm);
  }

  // 今日のログ
  const daily = memory.readDaily();
  if (daily) {
    parts.push('---\n## 今日の記録\n');
    parts.push(daily);
  }

  // メモリ操作の指示
  parts.push(`---
## メモリの使い方

あなたは以下のディレクトリにメモリファイルを持っています: ${memory.directory}

- **${memory.directory}/MEMORY.md**: 長期記憶。ユーザーの好み、プロジェクト情報、重要な決定事項を記録
- **${memory.directory}/YYYY-MM-DD.md**: 日次ログ。その日の会話の要点やタスクの進捗を記録

重要な情報が出てきたら、適宜メモリファイルに書き込んでください。
ユーザーが「覚えて」「メモして」と言ったら必ず記録してください。
ユーザーが「忘れて」「削除して」と言ったら該当する記録を削除してください。`);

  return parts.join('\n\n');
}
