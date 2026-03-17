import type { GhCommand, GhSecurityLevel } from './types.js';
import type { GhAllowlistStore } from './store.js';

export type PolicyDecision = 'allowed' | 'denied' | 'confirm';

export class GhPolicy {
  constructor(
    private readonly securityLevel: GhSecurityLevel,
    private readonly store: GhAllowlistStore,
  ) {}

  evaluate(cmd: GhCommand): PolicyDecision {
    if (this.securityLevel === 'deny') {
      return 'denied';
    }

    if (this.securityLevel === 'full') {
      if (cmd.riskLevel === 'dangerous') {
        return 'confirm';
      }
      return 'allowed';
    }

    // allowlist mode
    const inAllowlist = this.store.isAllowed(cmd.subcommand, cmd.action);
    if (!inAllowlist) {
      return 'denied';
    }

    if (cmd.riskLevel === 'dangerous') {
      return 'confirm';
    }

    return 'allowed';
  }
}
