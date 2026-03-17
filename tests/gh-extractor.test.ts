import { describe, it, expect } from 'vitest';
import { extractGhCommands } from '../src/gh/extractor.js';

describe('extractGhCommands', () => {
  it('should extract single gh command from code block', () => {
    const text = 'Here is the command:\n```gh\ngh pr list\n```';
    const cmds = extractGhCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].raw).toBe('gh pr list');
    expect(cmds[0].subcommand).toBe('pr');
    expect(cmds[0].action).toBe('list');
  });

  it('should extract multiple gh commands', () => {
    const text = [
      'First:',
      '```gh',
      'gh pr list',
      '```',
      'Second:',
      '```gh',
      'gh issue view 123',
      '```',
    ].join('\n');
    const cmds = extractGhCommands(text);
    expect(cmds).toHaveLength(2);
    expect(cmds[0].subcommand).toBe('pr');
    expect(cmds[1].subcommand).toBe('issue');
  });

  it('should return empty array when no gh blocks exist', () => {
    const text = 'No commands here.\n```js\nconsole.log("hi")\n```';
    expect(extractGhCommands(text)).toEqual([]);
  });

  it('should handle multiline gh blocks (only first line)', () => {
    const text = '```gh\ngh pr list --limit 10\nsome other stuff\n```';
    const cmds = extractGhCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].raw).toBe('gh pr list --limit 10');
  });

  it('should ignore empty gh blocks', () => {
    const text = '```gh\n\n```';
    expect(extractGhCommands(text)).toEqual([]);
  });

  it('should handle gh block without gh prefix in command', () => {
    const text = '```gh\npr list\n```';
    const cmds = extractGhCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].subcommand).toBe('pr');
    expect(cmds[0].action).toBe('list');
  });

  it('should trim whitespace in commands', () => {
    const text = '```gh\n  gh pr list  \n```';
    const cmds = extractGhCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].raw).toBe('gh pr list');
  });
});
