import type { GhCommand } from './types.js';
import { parseGhCommand } from './classifier.js';

const GH_BLOCK_RE = /```gh\n([\s\S]*?)```/g;

/** エージェント出力から ```gh ... ``` ブロックを抽出し、GhCommand の配列を返す */
export function extractGhCommands(text: string): GhCommand[] {
  const commands: GhCommand[] = [];

  for (const match of text.matchAll(GH_BLOCK_RE)) {
    const block = match[1].trim();
    if (!block) continue;

    // ブロックの最初の行のみをコマンドとして使用
    const firstLine = block.split('\n')[0].trim();
    if (!firstLine) continue;

    commands.push(parseGhCommand(firstLine));
  }

  return commands;
}
