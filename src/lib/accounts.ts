// Deprecated — replaced by src/lib/auth.ts + src/lib/auth-store.ts
// Kept as empty stub to avoid breaking any stale imports during migration.

export interface Account {
  label: string;
  password: string;
  sessionKey: string;
}

export function findAccountByPassword(_password: string): Account | undefined {
  return undefined;
}

export function findAccountBySession(_sessionKey: string): Account | undefined {
  return undefined;
}
