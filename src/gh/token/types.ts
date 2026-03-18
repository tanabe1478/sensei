export type GhTokenScope =
  | 'contents:read'
  | 'contents:write'
  | 'pull_requests:read'
  | 'pull_requests:write'
  | 'issues:read'
  | 'issues:write'
  | 'metadata:read';

export interface GhTokenEntry {
  readonly id: string;
  readonly label: string;
  readonly repositories: readonly string[];
  readonly scopes: readonly GhTokenScope[];
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly lastUsedAt?: string;
}

export interface GhTokenEncrypted {
  readonly ciphertext: string;
  readonly iv: string;
  readonly tag: string;
  readonly salt: string;
}

export interface GhTokenRecord {
  readonly entry: GhTokenEntry;
  readonly encrypted: GhTokenEncrypted;
}

export interface GhTokenStoreData {
  readonly version: 1;
  readonly tokens: readonly GhTokenRecord[];
}

export interface GhTokenResolveResult {
  readonly token: string;
  readonly entry: GhTokenEntry;
}
