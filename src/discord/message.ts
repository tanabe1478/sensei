import { DISCORD_SAFE_LENGTH } from '../constants.js';

/** メッセージを Discord の文字数制限で分割する */
export function splitMessage(text: string, maxLength: number = DISCORD_SAFE_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if (current.length + line.length + 1 > maxLength) {
      if (current) chunks.push(current.trimEnd());
      if (line.length > maxLength) {
        // 1行が上限を超える場合は強制分割
        for (let i = 0; i < line.length; i += maxLength) {
          chunks.push(line.slice(i, i + maxLength));
        }
        current = '';
      } else {
        current = line;
      }
    } else {
      current += (current ? '\n' : '') + line;
    }
  }

  if (current) chunks.push(current.trimEnd());
  return chunks;
}
