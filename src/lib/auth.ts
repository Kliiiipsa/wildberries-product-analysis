// Session signing and verification — Web Crypto API only (Edge runtime compatible).
// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)

export interface SessionUser {
  uid: string;      // "admin" | manager id
  role: 'admin' | 'manager';
  label: string;    // display name
  tagName: string;  // WB tag name; empty string for admin (uses SELLER_LABEL env)
  iat: number;
  exp: number;
}

const SESSION_DAYS = 30;

function getSecret(): string {
  return (process.env.AUTH_SECRET || process.env.SESSION_SECRET || '').trim();
}

function toB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4;
  const padded = pad ? s + '='.repeat(4 - pad) : s;
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(payload: Omit<SessionUser, 'iat' | 'exp'>): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('AUTH_SECRET не задан в переменных окружения');
  const now = Math.floor(Date.now() / 1000);
  const full: SessionUser = { ...payload, iat: now, exp: now + SESSION_DAYS * 86400 };
  const hdr = toB64url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(hdr));
  return `${hdr}.${toB64url(sig)}`;
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;
  try {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;
    const hdr = token.slice(0, dot);
    const sig = fromB64url(token.slice(dot + 1));
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      sig,
      new TextEncoder().encode(hdr),
    );
    if (!valid) return null;
    const user = JSON.parse(new TextDecoder().decode(fromB64url(hdr))) as SessionUser;
    if (!user.exp || Date.now() / 1000 > user.exp) return null;
    return user;
  } catch {
    return null;
  }
}

export function isAdmin(user: SessionUser): boolean { return user.role === 'admin'; }
export function isManager(user: SessionUser): boolean { return user.role === 'manager'; }
