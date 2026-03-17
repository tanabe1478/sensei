import { describe, it, expect } from 'vitest';
import { classifyCommand, parseGhCommand } from '../src/gh/classifier.js';

describe('parseGhCommand', () => {
  it('should parse simple gh command', () => {
    const cmd = parseGhCommand('gh pr list');
    expect(cmd.subcommand).toBe('pr');
    expect(cmd.action).toBe('list');
    expect(cmd.args).toEqual([]);
    expect(cmd.raw).toBe('gh pr list');
  });

  it('should parse command with args', () => {
    const cmd = parseGhCommand('gh pr view 123 --web');
    expect(cmd.subcommand).toBe('pr');
    expect(cmd.action).toBe('view');
    expect(cmd.args).toEqual(['123', '--web']);
  });

  it('should parse command with only subcommand', () => {
    const cmd = parseGhCommand('gh auth');
    expect(cmd.subcommand).toBe('auth');
    expect(cmd.action).toBe('');
    expect(cmd.args).toEqual([]);
  });

  it('should handle gh prefix stripping', () => {
    const cmd = parseGhCommand('gh issue create --title "bug"');
    expect(cmd.subcommand).toBe('issue');
    expect(cmd.action).toBe('create');
  });

  it('should handle extra whitespace', () => {
    const cmd = parseGhCommand('  gh   pr   list  ');
    expect(cmd.subcommand).toBe('pr');
    expect(cmd.action).toBe('list');
  });
});

describe('classifyCommand - safe commands', () => {
  const safeCmds = [
    'gh pr list',
    'gh pr view 123',
    'gh pr status',
    'gh pr checks 123',
    'gh pr diff 123',
    'gh issue list',
    'gh issue view 456',
    'gh issue status',
    'gh repo view',
    'gh repo list',
    'gh release list',
    'gh release view v1.0',
    'gh run list',
    'gh run view 789',
  ];

  for (const cmd of safeCmds) {
    it(`should classify "${cmd}" as safe`, () => {
      expect(classifyCommand(parseGhCommand(cmd)).riskLevel).toBe('safe');
    });
  }
});

describe('classifyCommand - moderate commands', () => {
  const moderateCmds = [
    'gh pr create --title "feat"',
    'gh pr comment 123 --body "lgtm"',
    'gh pr review 123 --approve',
    'gh pr edit 123 --title "new"',
    'gh issue create --title "bug"',
    'gh issue comment 456 --body "fix"',
    'gh issue edit 456 --body "update"',
    'gh issue reopen 456',
    'gh release create v2.0',
    'gh label create "priority"',
  ];

  for (const cmd of moderateCmds) {
    it(`should classify "${cmd}" as moderate`, () => {
      expect(classifyCommand(parseGhCommand(cmd)).riskLevel).toBe('moderate');
    });
  }
});

describe('classifyCommand - dangerous commands', () => {
  const dangerousCmds = [
    'gh pr merge 123',
    'gh pr close 123',
    'gh issue close 456',
    'gh issue delete 456',
    'gh repo delete owner/repo',
    'gh repo archive owner/repo',
    'gh release delete v1.0',
  ];

  for (const cmd of dangerousCmds) {
    it(`should classify "${cmd}" as dangerous`, () => {
      expect(classifyCommand(parseGhCommand(cmd)).riskLevel).toBe('dangerous');
    });
  }
});

describe('classifyCommand - unknown commands', () => {
  it('should classify unknown subcommand as dangerous', () => {
    const cmd = parseGhCommand('gh secret list');
    expect(classifyCommand(cmd).riskLevel).toBe('dangerous');
  });

  it('should classify unknown action as dangerous', () => {
    const cmd = parseGhCommand('gh pr unknown-action');
    expect(classifyCommand(cmd).riskLevel).toBe('dangerous');
  });

  it('should classify subcommand-only as dangerous', () => {
    const cmd = parseGhCommand('gh auth');
    expect(classifyCommand(cmd).riskLevel).toBe('dangerous');
  });
});
