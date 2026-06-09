import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { listManagers, createManager } from '@/lib/auth-store';
import type { Manager } from '@/lib/auth-store';

type SafeManager = Omit<Manager, 'accessKeyHash'>;

function strip(m: Manager): SafeManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessKeyHash: _, ...safe } = m;
  return safe;
}

export async function GET(req: NextRequest) {
  const user = await verifySession(req.cookies.get('session')?.value ?? '');
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const managers = await listManagers();
  return NextResponse.json({ managers: managers.map(strip) });
}

export async function POST(req: NextRequest) {
  const user = await verifySession(req.cookies.get('session')?.value ?? '');
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  let body: { label?: string; wbTagName?: string; notes?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const label = String(body.label ?? '').trim();
  const wbTagName = String(body.wbTagName ?? '').trim();
  if (!label) return NextResponse.json({ error: 'Имя менеджера обязательно' }, { status: 400 });
  if (!wbTagName) return NextResponse.json({ error: 'WB-тег обязателен' }, { status: 400 });

  const { manager, rawKey } = await createManager({
    label,
    wbTagName,
    notes: String(body.notes ?? '').trim(),
  });

  return NextResponse.json({ manager: strip(manager), rawKey }, { status: 201 });
}
