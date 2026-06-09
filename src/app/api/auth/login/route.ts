import { NextResponse } from 'next/server';
import { signSession } from '@/lib/auth';
import { findManagerByAccessKey, touchLastUsedAt } from '@/lib/auth-store';

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Неверный формат запроса' }, { status: 400 });
  }

  // Accept both new `accessKey` and legacy `password` field
  const rawKey = String(body.accessKey ?? body.password ?? '').trim();
  if (!rawKey) {
    return NextResponse.json({ error: 'Ключ доступа не может быть пустым' }, { status: 400 });
  }

  const adminKey = (process.env.ADMIN_ACCESS_KEY ?? '').trim();

  // Legacy keys kept for backward compat during migration (remove after all managers re-created)
  const legacyKeys = [
    (process.env.SITE_PASSWORD ?? '').trim(),
    (process.env.SESSION_SECRET ?? '').trim(),
    (process.env.ILYA_SESSION_KEY ?? '').trim(),
  ].filter(Boolean);

  let sessionToken: string;
  let label: string;

  if ((adminKey && rawKey === adminKey) || legacyKeys.includes(rawKey)) {
    // Admin login
    sessionToken = await signSession({
      uid: 'admin',
      role: 'admin',
      label: 'Администратор',
      tagName: process.env.SELLER_LABEL ?? '',
    });
    label = 'Администратор';
  } else if (rawKey.startsWith('wbm_')) {
    // Manager login — key lookup (never log rawKey)
    const manager = await findManagerByAccessKey(rawKey);
    if (!manager) {
      return NextResponse.json({ error: 'Неверный ключ доступа' }, { status: 401 });
    }
    // Fire-and-forget — don't block on this
    touchLastUsedAt(manager.id).catch(() => {});
    sessionToken = await signSession({
      uid: manager.id,
      role: 'manager',
      label: manager.label,
      tagName: manager.wbTagName,
    });
    label = manager.label;
  } else {
    return NextResponse.json({ error: 'Неверный ключ доступа' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, label });
  res.cookies.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
