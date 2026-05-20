import { NextResponse } from 'next/server';
import { findAccountByPassword } from '@/lib/accounts';

export async function POST(request: Request) {
  const { password } = await request.json();
  const account = findAccountByPassword(password || '');

  if (!account) {
    return NextResponse.json({ error: 'Неверный ключ' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, label: account.label });
  res.cookies.set('session', account.sessionKey, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
  return res;
}
