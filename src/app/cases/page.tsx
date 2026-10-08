export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import db from '@/lib/db';
import Link from 'next/link';

export default async function CasesLibrary() {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

  // Fetch all cases (built-in and user-created)
  const cases = db.prepare('SELECT internalId, id, title, charge, witnessCount FROM cases WHERE userId IS NULL OR userId = ?').all(session.id) as any[];

  // Fetch best scores for each case
  const bestScores = db.prepare('SELECT caseInternalId, MAX(score) as bestScore FROM trials WHERE userId = ? GROUP BY caseInternalId').all(session.id) as any[];
  const scoreMap = new Map(bestScores.map(row => [row.caseInternalId, row.bestScore]));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Case Library</h1>
        <div className="flex gap-4">
          <Link href="/cases/import" data-testid="case-import-file" className="rounded bg-zinc-200 px-4 py-2 text-black hover:bg-zinc-300">
            Import Case
          </Link>
          <Link href="/cases/new" data-testid="case-new" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            + New Case
          </Link>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cases.map((c) => {
          const score = scoreMap.get(c.internalId);
          return (
            <div key={c.internalId} data-testid="case-item" className="flex flex-col justify-between rounded border bg-white p-6 shadow dark:border-zinc-700 dark:bg-zinc-900">
              <div>
                <h2 data-testid="case-title" className="mb-2 text-xl font-bold">{c.title}</h2>
                <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">Charge: {c.charge}</p>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">Witnesses: {c.witnessCount}</p>
                <p className="mb-4 font-semibold">
                  Best Score: <span data-testid="case-best-score">{score !== undefined ? score : '—'}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  data-testid="case-start"
                  href={`/trial/start/${c.internalId}`}
                  className="flex-1 rounded bg-green-600 py-2 text-center text-white hover:bg-green-700"
                >
                  Start Trial
                </Link>
                {c.userId === session.id && (
                  <Link
                    href={`/cases/${c.id}/edit`}
                    className="rounded bg-zinc-200 px-4 py-2 text-black hover:bg-zinc-300"
                  >
                    Edit
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
