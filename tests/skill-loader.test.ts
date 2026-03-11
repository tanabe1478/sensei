import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSkills, formatSkillList } from '../src/skill/loader.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('loadSkills', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'sensei-skill-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skills/ ディレクトリがなければ空配列を返す', () => {
    const skills = loadSkills(tmpDir);
    expect(skills).toEqual([]);
  });

  it('SKILL.md のあるディレクトリからスキルを読み込む', () => {
    const skillsDir = join(tmpDir, 'skills', 'today');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, 'SKILL.md'),
      '---\nname: today\ndescription: 今日の学習計画\n---\n# Today\n内容',
    );

    const skills = loadSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('today');
    expect(skills[0].description).toBe('今日の学習計画');
  });

  it('.md ファイルを直接スキルとして読み込む', () => {
    const skillsDir = join(tmpDir, 'skills');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'quick.md'), '# Quick\nクイックスキル');

    const skills = loadSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('quick');
    expect(skills[0].description).toBe('クイックスキル');
  });

  it('README.md は無視する', () => {
    const skillsDir = join(tmpDir, 'skills');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'README.md'), '# Skills README');

    const skills = loadSkills(tmpDir);
    expect(skills).toEqual([]);
  });

  it('frontmatter がないファイルでも最初の行を description にする', () => {
    const skillsDir = join(tmpDir, 'skills', 'simple');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(join(skillsDir, 'SKILL.md'), '# Simple\nこれは説明です');

    const skills = loadSkills(tmpDir);
    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('これは説明です');
  });
});

describe('formatSkillList', () => {
  it('スキルがなければメッセージを返す', () => {
    const result = formatSkillList([]);
    expect(result).toContain('スキルがありません');
  });

  it('スキル一覧をフォーマットする', () => {
    const skills = [
      { name: 'today', description: '今日の学習計画', path: '/tmp/a' },
      { name: 'review', description: '復習セッション', path: '/tmp/b' },
    ];
    const result = formatSkillList(skills);
    expect(result).toContain('**利用可能なスキル** (2件)');
    expect(result).toContain('**today**');
    expect(result).toContain('**review**');
  });

  it('長い description は 50文字で切り詰める', () => {
    const skills = [
      { name: 'long', description: 'あ'.repeat(60), path: '/tmp/a' },
    ];
    const result = formatSkillList(skills);
    expect(result).toContain('...');
  });
});
