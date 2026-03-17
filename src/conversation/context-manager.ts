import type { ConversationMessage } from './types.js';
import type { ConversationStore } from './store.js';

const PROTECTED_TURNS = 5;
const PROTECTED_MESSAGES = PROTECTED_TURNS * 2;

export interface ContextManagerConfig {
  readonly tokenBudget: number;
  readonly compactionModel: string;
  readonly openaiApiKey: string;
}

export class ContextManager {
  private readonly store: ConversationStore;
  private readonly config: ContextManagerConfig;

  constructor(store: ConversationStore, config: ContextManagerConfig) {
    this.store = store;
    this.config = config;
  }

  estimateTokens(messages: readonly ConversationMessage[]): number {
    return Math.ceil(JSON.stringify(messages).length / 4);
  }

  async buildHistory(channelId: string): Promise<string> {
    const messages = this.store.getAll(channelId);
    if (messages.length === 0) return '';

    const tokens = this.estimateTokens(messages);
    if (tokens <= this.config.tokenBudget) {
      return this.formatHistory(messages);
    }

    // Compaction: 直近メッセージを保護し、古いメッセージを要約
    const recentCount = Math.min(PROTECTED_MESSAGES, messages.length);
    const recent = messages.slice(-recentCount);
    const old = messages.slice(0, -recentCount);

    if (old.length === 0) {
      return this.formatHistory(messages);
    }

    const summary = await this.compactMessages(old);
    this.store.replaceWithCompaction(channelId, summary, recent);

    const updated = this.store.getAll(channelId);
    return this.formatHistory(updated);
  }

  async compactMessages(messages: readonly ConversationMessage[]): Promise<string> {
    const conversationText = messages
      .map((m) => {
        if (m.role === 'summary') return `[以前の要約]: ${m.content}`;
        return `${m.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${m.content}`;
      })
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.compactionModel,
        messages: [
          {
            role: 'system',
            content:
              '以下の会話を簡潔に要約してください。重要な文脈、決定事項、ユーザーの意図を保持してください。要約のみを出力してください。',
          },
          { role: 'user', content: conversationText },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Compaction API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }

  formatHistory(messages: readonly ConversationMessage[]): string {
    const summaryIdx = messages.findIndex((m) => m.role === 'summary');

    if (summaryIdx !== -1) {
      const summaryMsg = messages[summaryIdx];
      const rest = messages.filter((m) => m.role !== 'summary');
      const lines: string[] = [
        '## これまでの会話の要約',
        summaryMsg.content,
        '',
        '## 直近の会話',
        ...rest.map((m) => this.formatMessage(m)),
      ];
      return lines.join('\n');
    }

    return messages.map((m) => this.formatMessage(m)).join('\n');
  }

  private formatMessage(m: ConversationMessage): string {
    const label = m.role === 'user' ? 'ユーザー' : 'アシスタント';
    return `${label}: ${m.content}`;
  }
}
