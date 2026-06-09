import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { rotateManagerKey } from '@/lib/auth-store';
import type { Manager } from '@/lib/auth-store';

type SafeManager = Omit<Manager, 'accessKeyHash'>;

function strip(m: Manager): SafeManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessKeyHash: _, ...safe } = m;
  return safe;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await verifySession(req.cookies.get('session')?.value ?? '');
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const { id } = await params;
  const result = await rotateManagerKey(id);
  if (!result) return NextResponse.json({ error: 'Менеджер не найден' }, { status: 404 });

  return NextResponse.json({ manager: strip(result.manager), rawKey: result.rawKey });
}
