import type { ConversationMessage } from './types.js';
import type { ConversationStore } from './store.js';
import type { MemoryStore } from '../memory/store.js';

const PROTECTED_TURNS = 5;
const PROTECTED_MESSAGES = PROTECTED_TURNS * 2;

export interface CompactionResult {
  readonly historyEntry: string;
  readonly memoryUpdate: string | null;
}

export interface ContextManagerConfig {
  readonly tokenBudget: number;
  readonly compactionModel: string;
  readonly openaiApiKey?: string;
  readonly idleMinutes: number;
}

export class ContextManager {
  private readonly store: ConversationStore;
  private readonly memoryStore: MemoryStore;
  private readonly config: ContextManagerConfig;

  constructor(store: ConversationStore, memoryStore: MemoryStore, config: ContextManagerConfig) {
    this.store = store;
    this.memoryStore = memoryStore;
    this.config = config;
  }

  /** 日本語向け安全マージン付きトークン見積もり（/3 = 約1.33xマージン） */
  estimateTokens(messages: readonly ConversationMessage[]): number {
    return Math.ceil(JSON.stringify(messages).length / 3);
  }

  async buildHistory(channelId: string): Promise<string> {
    // Phase 3: 日またぎ継続 — 前回の要約があればストアに注入
    this.injectLastSummaryIfAvailable(channelId);

    const messages = this.store.getAll(channelId);
    if (messages.length === 0) {
      return '';
    }

    // Phase 1: アイドルリセット
    const lastMessage = messages[messages.length - 1];
    const idleMs = Date.now() - new Date(lastMessage.timestamp).getTime();
    if (idleMs > this.config.idleMinutes * 60_000) {
      // Phase 3: 最後の要約を退避してからクリア
      const summaryMsg = messages.find((m) => m.role === 'summary');
      if (summaryMsg) {
        this.store.saveLastSummary(channelId, summaryMsg.content);
      }
      this.store.clear(channelId);
      return '';
    }

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

    // Phase 2: APIキーがなければ 70/20/10 truncation
    if (!this.config.openaiApiKey) {
      return this.formatHistory(this.truncateMessages(messages, this.config.tokenBudget));
    }

    // Phase 1: compaction失敗時のフォールバック
    try {
      const result = await this.compactMessages(old);
      this.store.replaceWithCompaction(channelId, result.historyEntry, recent);

      // Phase 3: memory_update があれば長期記憶に追記
      if (result.memoryUpdate) {
        this.memoryStore.appendLongTerm(result.memoryUpdate);
      }

      const updated = this.store.getAll(channelId);
      return this.formatHistory(updated);
    } catch (err) {
      console.error('[sensei] Compaction failed, using recent messages only:', err);
      return this.formatHistory(recent);
    }
  }

  async compactMessages(messages: readonly ConversationMessage[]): Promise<CompactionResult> {
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
            content: `以下の会話を分析し、JSONで回答してください。

出力フォーマット:
{
  "history_entry": "会話の簡潔な要約",
  "memory_update": "長期的に覚えておくべきユーザー情報（なければnull）"
}

history_entry に必ず保持すべき情報:
- 進行中のタスクとその進捗
- ユーザーが下した決定事項
- 未解決のTODOや質問
- ユーザーの制約や好み
- 具体的な識別子（URL、ファイルパス、数値）はそのまま保持

memory_update に含めるべき情報:
- ユーザーの属性・スキル・好み
- 繰り返し言及される重要な事実
- 長期的な目標や制約
- 特になければ null

JSONのみを出力してください。`,
          },
          { role: 'user', content: conversationText },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Compaction API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0].message.content;

    return this.parseCompactionResponse(content);
  }

  /** LLM応答をパースし、構造化されたCompactionResultを返す */
  private parseCompactionResponse(content: string): CompactionResult {
    try {
      // JSONブロックを抽出（```json ... ``` または直接JSON）
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as {
          history_entry?: string;
          memory_update?: string | null;
        };
        if (parsed.history_entry) {
          return {
            historyEntry: parsed.history_entry,
            memoryUpdate: parsed.memory_update ?? null,
          };
        }
      }
    } catch {
      // JSONパース失敗 → フォールバック
    }

    // パース失敗時: 応答全体をhistory_entryとして扱う
    return { historyEntry: content, memoryUpdate: null };
  }

  /** Phase 2: 70/20/10 truncation — 先頭70%、末尾20%、省略マーカー10% */
  truncateMessages(
    messages: readonly ConversationMessage[],
    budgetTokens: number,
  ): ConversationMessage[] {
    const totalTokens = this.estimateTokens(messages);
    if (totalTokens <= budgetTokens) {
      return [...messages];
    }

    const headBudget = Math.floor(budgetTokens * 0.7);
    const tailBudget = Math.floor(budgetTokens * 0.2);

    // 先頭からheadBudget分を収集
    const headMessages: ConversationMessage[] = [];
    let headTokensUsed = 0;
    for (const msg of messages) {
      const msgTokens = this.estimateTokens([msg]);
      if (headTokensUsed + msgTokens > headBudget) break;
      headMessages.push(msg);
      headTokensUsed += msgTokens;
    }

    // 末尾からtailBudget分を収集
    const tailMessages: ConversationMessage[] = [];
    let tailTokensUsed = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      // 先頭に含まれるメッセージとの重複を避ける
      if (headMessages.includes(msg)) continue;
      const msgTokens = this.estimateTokens([msg]);
      if (tailTokensUsed + msgTokens > tailBudget) break;
      tailMessages.unshift(msg);
      tailTokensUsed += msgTokens;
    }

    const skippedCount = messages.length - headMessages.length - tailMessages.length;

    if (skippedCount <= 0) {
      return [...messages];
    }

    const marker: ConversationMessage = {
      role: 'summary',
      content: `[... 中略: ${skippedCount}件のメッセージを省略 ...]`,
      timestamp: new Date().toISOString(),
    };

    return [...headMessages, marker, ...tailMessages];
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

  /** Phase 3: 日またぎ継続 — 前回の要約がある場合にストアに注入 */
  private injectLastSummaryIfAvailable(channelId: string): void {
    const lastSummary = this.store.getLastSummary(channelId);
    if (!lastSummary) return;

    // 注入後にlast-summaryをクリア（1回のみ注入）
    this.store.clearLastSummary(channelId);

    // 要約をsummaryメッセージとしてストアの先頭に追加
    const existing = this.store.getAll(channelId);
    this.store.replaceWithCompaction(channelId, lastSummary, existing);
  }

  private formatMessage(m: ConversationMessage): string {
    const label = m.role === 'user' ? 'ユーザー' : 'アシスタント';
    return `${label}: ${m.content}`;
  }
}
