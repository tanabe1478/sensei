import type { GhCommand, GhRiskLevel } from './types.js';

const RISK_MAP: ReadonlyMap<string, ReadonlyMap<string, GhRiskLevel>> = new Map([
  [
    'pr',
    new Map<string, GhRiskLevel>([
      ['list', 'safe'],
      ['view', 'safe'],
      ['status', 'safe'],
      ['checks', 'safe'],
      ['diff', 'safe'],
      ['create', 'moderate'],
      ['comment', 'moderate'],
      ['review', 'moderate'],
      ['edit', 'moderate'],
      ['merge', 'dangerous'],
      ['close', 'dangerous'],
    ]),
  ],
  [
    'issue',
    new Map<string, GhRiskLevel>([
      ['list', 'safe'],
      ['view', 'safe'],
      ['status', 'safe'],
      ['create', 'moderate'],
      ['comment', 'moderate'],
      ['edit', 'moderate'],
      ['reopen', 'moderate'],
      ['close', 'dangerous'],
      ['delete', 'dangerous'],
    ]),
  ],
  [
    'repo',
    new Map<string, GhRiskLevel>([
      ['view', 'safe'],
      ['list', 'safe'],
      ['delete', 'dangerous'],
      ['archive', 'dangerous'],
    ]),
  ],
  [
    'release',
    new Map<string, GhRiskLevel>([
      ['list', 'safe'],
      ['view', 'safe'],
      ['create', 'moderate'],
      ['delete', 'dangerous'],
    ]),
  ],
  [
    'run',
    new Map<string, GhRiskLevel>([
      ['list', 'safe'],
      ['view', 'safe'],
    ]),
  ],
  [
    'label',
    new Map<string, GhRiskLevel>([
      ['create', 'moderate'],
    ]),
  ],
]);

/** gh コマンド文字列をパースして GhCommand に変換する（リスクレベルなし） */
export function parseGhCommand(raw: string): Omit<GhCommand, 'riskLevel'> & { riskLevel: GhRiskLevel } {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  const parts = trimmed.startsWith('gh ') ? trimmed.slice(3).split(' ') : trimmed.split(' ');
  const subcommand = parts[0] || '';
  const action = parts[1] || '';
  const args = parts.slice(2);

  return classifyCommand({
    raw: trimmed.startsWith('gh ') ? trimmed : `gh ${trimmed}`,
    subcommand,
    action,
    args,
    riskLevel: 'dangerous', // placeholder
  });
}

/** GhCommand にリスクレベルを設定して返す */
export function classifyCommand(cmd: Omit<GhCommand, 'riskLevel'> & { riskLevel?: GhRiskLevel }): GhCommand {
  const subMap = RISK_MAP.get(cmd.subcommand);
  if (!subMap) {
    return { ...cmd, riskLevel: 'dangerous' };
  }

  const level = subMap.get(cmd.action);
  if (level === undefined) {
    return { ...cmd, riskLevel: 'dangerous' };
  }

  return { ...cmd, riskLevel: level };
}
