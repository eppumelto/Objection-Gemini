import { getSession } from '@/lib/auth';
import { logout } from '@/app/actions/auth';
import Link from 'next/link';

export default async function Navbar() {
  const session = await getSession();

  if (!session) return null;

  return (
    <nav className="flex items-center justify-between bg-zinc-900 p-4 text-white">
      <div className="flex gap-4">
        <Link href="/cases" className="font-bold hover:underline">OBJECTION!</Link>
        <Link href="/cases" className="hover:underline">Cases</Link>
        <Link href="/history" className="hover:underline">History</Link>
        <Link href="/stats" className="hover:underline">Stats</Link>
      </div>
      <div className="flex items-center gap-4">
        <span>{session.email}</span>
        <form action={logout}>
          <button data-testid="logout" type="submit" className="rounded bg-red-600 px-3 py-1 hover:bg-red-700">
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
