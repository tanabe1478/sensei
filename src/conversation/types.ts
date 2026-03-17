/** 会話メッセージの型 */
export interface ConversationMessage {
  readonly role: 'user' | 'assistant' | 'summary';
  readonly content: string;
  readonly timestamp: string;
}
