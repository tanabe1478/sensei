import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { DISCORD_SAFE_LENGTH } from '../constants.js';

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly path: string;
}

/** skills/ ディレクトリからスキルを読み込む */
export function loadSkills(workdir: string): Skill[] {
  const skillsDir = join(workdir, 'skills');
  if (!existsSync(skillsDir)) return [];

  const skills: Skill[] = [];

  try {
    for (const entry of readdirSync(skillsDir)) {
      const entryPath = join(skillsDir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        const skillFile = join(entryPath, 'SKILL.md');
        if (existsSync(skillFile)) {
          const skill = parseSkillFile(skillFile, entry);
          if (skill) skills.push(skill);
        }
      } else if (entry.endsWith('.md') && entry !== 'README.md') {
        const skill = parseSkillFile(entryPath, basename(entry, '.md'));
        if (skill) skills.push(skill);
      }
    }
  } catch (err) {
    console.error('[sensei] Failed to load skills:', err);
  }

  return skills;
}

function parseSkillFile(filePath: string, defaultName: string): Skill | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    let description = '';
    let name = defaultName;

    // YAML frontmatter からメタデータを抽出
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const fm = frontmatterMatch[1];
      const descMatch = fm.match(/description:\s*["']?([^"'\n]+)["']?/);
      const nameMatch = fm.match(/name:\s*["']?([^"'\n]+)["']?/);
      if (descMatch) description = descMatch[1].trim();
      if (nameMatch) name = nameMatch[1].trim();
    }

    // frontmatter がなければ最初の非見出し行を使う
    if (!description) {
      const line = content
        .split('\n')
        .find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
      if (line) description = line.slice(0, 100);
    }

    return { name, description: description || '(説明なし)', path: filePath };
  } catch {
    return null;
  }
}

/** スキル一覧をフォーマット */
export function formatSkillList(skills: readonly Skill[]): string {
  if (skills.length === 0) {
    return 'スキルがありません。skills/ ディレクトリに SKILL.md を追加してください。';
  }

  const lines = [`**利用可能なスキル** (${skills.length}件)`, ''];
  for (const skill of skills) {
    const desc = skill.description.length > 50 ? skill.description.slice(0, 50) + '...' : skill.description;
    lines.push(`- **${skill.name}**: ${desc}`);
  }

  const result = lines.join('\n');
  if (result.length > DISCORD_SAFE_LENGTH) {
    return [`**利用可能なスキル** (${skills.length}件)`, '', ...skills.map((s) => `- **${s.name}**`)].join('\n');
  }
  return result;
}
