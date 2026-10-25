import { redirect } from 'next/navigation';
import { LoginView } from '../../views/LoginView';
import { isDemo } from '../../lib/demo';
import { requestLang } from '../context';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  if (isDemo()) redirect('/');
  await requestLang();
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  const configured = Boolean(process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET);
  return <LoginView error={sp.error === '1'} next={next} configured={configured} />;
}
