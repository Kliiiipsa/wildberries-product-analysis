import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { AdminConsole } from './AdminConsole';

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value ?? '';
  const user = await verifySession(session);
  if (!user || user.role !== 'admin') redirect('/');

  return <AdminConsole />;
}
