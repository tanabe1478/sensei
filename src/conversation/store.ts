import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { ConversationMessage } from './types.js';

const MAX_MESSAGES = 200;

export class ConversationStore {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'conversations');
    mkdirSync(this.dir, { recursive: true });
  }

  append(channelId: string, role: 'user' | 'assistant' | 'summary', content: string): void {
    const message: ConversationMessage = {
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    const filePath = this.filePath(channelId);
    appendFileSync(filePath, JSON.stringify(message) + '\n', 'utf-8');

    // 最大件数を超えたら切り詰め
    const all = this.loadFromFile(channelId);
    if (all.length > MAX_MESSAGES) {
      const trimmed = all.slice(all.length - MAX_MESSAGES);
      this.writeAll(channelId, trimmed);
    }
  }

  getAll(channelId: string): ConversationMessage[] {
    return this.loadFromFile(channelId);
  }

  clear(channelId: string): void {
    const filePath = this.filePath(channelId);
    if (existsSync(filePath)) {
      writeFileSync(filePath, '', 'utf-8');
    }
  }

  replaceWithCompaction(
    channelId: string,
    summary: string,
    recentMessages: readonly ConversationMessage[],
  ): void {
    const summaryMessage: ConversationMessage = {
      role: 'summary',
      content: summary,
      timestamp: new Date().toISOString(),
    };
    this.writeAll(channelId, [summaryMessage, ...recentMessages]);
  }

  saveLastSummary(channelId: string, summary: string): void {
    const filePath = join(this.dir, `${channelId}.last-summary.txt`);
    writeFileSync(filePath, summary, 'utf-8');
  }

  getLastSummary(channelId: string): string | null {
    const filePath = join(this.dir, `${channelId}.last-summary.txt`);
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return content || null;
  }

  clearLastSummary(channelId: string): void {
    const filePath = join(this.dir, `${channelId}.last-summary.txt`);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  private filePath(channelId: string): string {
    return join(this.dir, `${channelId}.jsonl`);
  }

  private loadFromFile(channelId: string): ConversationMessage[] {
    const filePath = this.filePath(channelId);
    if (!existsSync(filePath)) return [];

    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return [];

    return content.split('\n').map((line) => JSON.parse(line) as ConversationMessage);
  }

  private writeAll(channelId: string, messages: readonly ConversationMessage[]): void {
    const filePath = this.filePath(channelId);
    const content = messages.map((m) => JSON.stringify(m)).join('\n') + '\n';
    writeFileSync(filePath, content, 'utf-8');
  }
}
