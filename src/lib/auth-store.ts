// Manager storage — Node.js runtime only (NOT for Edge routes).
// Production: Upstash Redis REST API (set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN)
// Dev fallback: .data/access-keys.local.json  ← NOT reliable on Vercel, local dev only!

import { createHmac, randomBytes } from 'crypto';

export interface Manager {
  id: string;
  label: string;
  wbTagName: string;
  role: 'manager';
  accessKeyHash: string;    // HMAC-SHA256(AUTH_SECRET, rawKey) — never returned to client
  accessKeyPreview: string; // wbm_xxxx...xxxx — safe to show
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  notes: string;
}

const REDIS_KEY = 'wb:managers';

function pepper(): string {
  return (process.env.AUTH_SECRET || process.env.SESSION_SECRET || '').trim();
}

function hashKey(rawKey: string): string {
  return createHmac('sha256', pepper()).update(rawKey).digest('hex');
}

function newId(): string {
  return randomBytes(12).toString('hex');
}

export function generateManagerKey(): {
  rawKey: string;
  accessKeyHash: string;
  accessKeyPreview: string;
} {
  const rand = randomBytes(36).toString('hex'); // 72 hex chars
  const rawKey = `wbm_${rand}`;
  return {
    rawKey,
    accessKeyHash: hashKey(rawKey),
    accessKeyPreview: `${rawKey.slice(0, 14)}...${rawKey.slice(-6)}`,
  };
}

// ── Upstash Redis REST adapter ────────────────────────────────────────────────

async function redisGet(): Promise<Manager[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const res = await fetch(`${url}/get/${REDIS_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const json = await res.json() as { result?: string | null };
  if (!json.result) return [];
  return JSON.parse(json.result) as Manager[];
}

async function redisSet(managers: Manager[]): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  await fetch(`${url}/set/${REDIS_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(managers)),
    signal: AbortSignal.timeout(8000),
  });
}

// ── Local file adapter (dev only) ─────────────────────────────────────────────

function getDataFile(): string {
  // Vercel и другие serverless-платформы: используем /tmp (эфемерно, только dev-fallback)
  return process.env.VERCEL ? '/tmp/wb-access-keys.json' : '.data/access-keys.local.json';
}

async function localGet(): Promise<Manager[]> {
  const { readFile } = await import('fs/promises');
  try {
    return JSON.parse(await readFile(getDataFile(), 'utf8')) as Manager[];
  } catch {
    return [];
  }
}

async function localSet(managers: Manager[]): Promise<void> {
  const { writeFile, mkdir } = await import('fs/promises');
  const file = getDataFile();
  if (!file.startsWith('/tmp')) {
    await mkdir('.data', { recursive: true });
  }
  await writeFile(file, JSON.stringify(managers, null, 2), 'utf8');
}

function useRedis(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function getAll(): Promise<Manager[]> {
  return useRedis() ? redisGet() : localGet();
}

async function setAll(m: Manager[]): Promise<void> {
  return useRedis() ? redisSet(m) : localSet(m);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listManagers(): Promise<Manager[]> {
  return getAll();
}

export interface CreateManagerInput {
  label: string;
  wbTagName: string;
  notes?: string;
}

export async function createManager(
  input: CreateManagerInput,
): Promise<{ manager: Manager; rawKey: string }> {
  const all = await getAll();
  const { rawKey, accessKeyHash, accessKeyPreview } = generateManagerKey();
  const now = new Date().toISOString();
  const manager: Manager = {
    id: newId(),
    label: input.label,
    wbTagName: input.wbTagName,
    role: 'manager',
    accessKeyHash,
    accessKeyPreview,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    expiresAt: null,
    notes: input.notes ?? '',
  };
  await setAll([...all, manager]);
  return { manager, rawKey };
}

export async function updateManager(
  id: string,
  updates: Partial<Pick<Manager, 'label' | 'wbTagName' | 'isActive' | 'notes'>>,
): Promise<Manager | null> {
  const all = await getAll();
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return null;
  const updated: Manager = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  all[idx] = updated;
  await setAll(all);
  return updated;
}

export async function rotateManagerKey(
  id: string,
): Promise<{ manager: Manager; rawKey: string } | null> {
  const all = await getAll();
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return null;
  const { rawKey, accessKeyHash, accessKeyPreview } = generateManagerKey();
  const updated: Manager = {
    ...all[idx],
    accessKeyHash,
    accessKeyPreview,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  await setAll(all);
  return { manager: updated, rawKey };
}

export async function findManagerByAccessKey(rawKey: string): Promise<Manager | null> {
  if (!rawKey.startsWith('wbm_')) return null;
  const hash = hashKey(rawKey);
  const all = await getAll();
  return all.find(m => m.accessKeyHash === hash && m.isActive) ?? null;
}

export async function touchLastUsedAt(id: string): Promise<void> {
  const all = await getAll();
  const idx = all.findIndex(m => m.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], lastUsedAt: new Date().toISOString() };
    await setAll(all);
  }
}
