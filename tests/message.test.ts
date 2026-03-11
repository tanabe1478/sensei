import { describe, it, expect } from 'vitest';
import { splitMessage } from '../src/discord/message.js';

describe('splitMessage', () => {
  it('短いメッセージはそのまま返す', () => {
    const result = splitMessage('hello');
    expect(result).toEqual(['hello']);
  });

  it('空文字列はそのまま返す', () => {
    const result = splitMessage('');
    expect(result).toEqual(['']);
  });

  it('上限を超えるメッセージを行単位で分割する', () => {
    const line1 = 'a'.repeat(50);
    const line2 = 'b'.repeat(50);
    const line3 = 'c'.repeat(50);
    const text = [line1, line2, line3].join('\n');
    const result = splitMessage(text, 60);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(60);
    }
  });

  it('1行が上限を超える場合は強制分割する', () => {
    const long = 'x'.repeat(200);
    const result = splitMessage(long, 80);
    expect(result.length).toBe(3);
    expect(result[0]).toBe('x'.repeat(80));
    expect(result[1]).toBe('x'.repeat(80));
    expect(result[2]).toBe('x'.repeat(40));
  });

  it('改行を保持して分割する', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`);
    const text = lines.join('\n');
    const result = splitMessage(text, 30);
    expect(result.length).toBeGreaterThan(1);
    const joined = result.join('\n');
    for (const line of lines) {
      expect(joined).toContain(line);
    }
  });

  it('maxLength ちょうどのメッセージは分割しない', () => {
    const text = 'a'.repeat(100);
    const result = splitMessage(text, 100);
    expect(result).toEqual([text]);
  });
});
