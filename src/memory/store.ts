import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

/** メモリストア: Markdown ファイルベースの永続記憶 */
export class MemoryStore {
  private readonly baseDir: string;

  constructor(dataDir: string) {
    this.baseDir = join(dataDir, 'memory');
    mkdirSync(this.baseDir, { recursive: true });
  }

  /** MEMORY.md（長期記憶）を読み込む */
  readLongTerm(): string {
    const path = join(this.baseDir, 'MEMORY.md');
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf-8');
  }

  /** MEMORY.md に追記する */
  appendLongTerm(content: string): void {
    const path = join(this.baseDir, 'MEMORY.md');
    const existing = this.readLongTerm();
    const updated = existing ? `${existing.trimEnd()}\n\n${content}` : content;
    writeFileSync(path, updated, 'utf-8');
  }

  /** MEMORY.md を上書きする */
  writeLongTerm(content: string): void {
    const path = join(this.baseDir, 'MEMORY.md');
    writeFileSync(path, content, 'utf-8');
  }

  /** 今日の日付のログに追記する */
  appendDaily(content: string): void {
    const today = new Date().toISOString().slice(0, 10);
    const path = join(this.baseDir, `${today}.md`);
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : `# ${today}\n`;
    const updated = `${existing.trimEnd()}\n\n${content}`;
    writeFileSync(updated.startsWith('#') ? path : path, updated, 'utf-8');
    writeFileSync(path, updated, 'utf-8');
  }

  /** 今日のログを読み込む */
  readDaily(): string {
    const today = new Date().toISOString().slice(0, 10);
    const path = join(this.baseDir, `${today}.md`);
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf-8');
  }

  /** キーワードでメモリを検索する */
  search(keyword: string): { file: string; lines: string[] }[] {
    const results: { file: string; lines: string[] }[] = [];
    if (!existsSync(this.baseDir)) return results;

    const lowerKeyword = keyword.toLowerCase();

    for (const file of readdirSync(this.baseDir)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(join(this.baseDir, file), 'utf-8');
      const matchingLines = content
        .split('\n')
        .filter((line) => line.toLowerCase().includes(lowerKeyword));

      if (matchingLines.length > 0) {
        results.push({ file, lines: matchingLines });
      }
    }

    return results;
  }

  /** メモリの概要を返す */
  summary(): string {
    if (!existsSync(this.baseDir)) return 'メモリは空です。';

    const files = readdirSync(this.baseDir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) return 'メモリは空です。';

    const longTerm = this.readLongTerm();
    const daily = this.readDaily();
    const lines: string[] = [];

    lines.push(`**メモリ** (${files.length}ファイル)`);
    if (longTerm) {
      const preview = longTerm.slice(0, 200).trimEnd();
      lines.push('', '**長期記憶 (MEMORY.md)**:', preview + (longTerm.length > 200 ? '...' : ''));
    }
    if (daily) {
      const preview = daily.slice(0, 200).trimEnd();
      lines.push('', '**今日のログ**:', preview + (daily.length > 200 ? '...' : ''));
    }

    return lines.join('\n');
  }

  get directory(): string {
    return this.baseDir;
  }
}
