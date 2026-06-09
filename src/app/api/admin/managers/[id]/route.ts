import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { updateManager } from '@/lib/auth-store';
import type { Manager } from '@/lib/auth-store';

type SafeManager = Omit<Manager, 'accessKeyHash'>;

function strip(m: Manager): SafeManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessKeyHash: _, ...safe } = m;
  return safe;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifySession(req.cookies.get('session')?.value ?? '');
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const { id } = await params;

  let body: { label?: string; wbTagName?: string; isActive?: boolean; notes?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const updates: Partial<Manager> = {};
  if (body.label !== undefined) updates.label = String(body.label).trim();
  if (body.wbTagName !== undefined) updates.wbTagName = String(body.wbTagName).trim();
  if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
  if (body.notes !== undefined) updates.notes = String(body.notes).trim();

  const manager = await updateManager(id, updates);
  if (!manager) return NextResponse.json({ error: 'Менеджер не найден' }, { status: 404 });

  return NextResponse.json({ manager: strip(manager) });
}
