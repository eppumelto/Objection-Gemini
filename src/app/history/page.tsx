export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import db from '@/lib/db';

export default async function History() {
  const session = await getSession();
  if (!session) return null;

  const trials = db.prepare('SELECT t.*, c.title FROM trials t JOIN cases c ON t.caseInternalId = c.internalId WHERE t.userId = ? ORDER BY t.createdAt DESC').all(session.id) as any[];

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold mb-6">Trial History</h1>
      <div className="space-y-4">
        {trials.map((t) => (
          <div key={t.id} data-testid="history-item" className="p-4 border rounded bg-white dark:bg-zinc-900">
            <h2 className="font-bold text-xl">{t.title}</h2>
            <p>Date: {new Date(t.createdAt).toLocaleString()}</p>
            <p>Verdict: {t.verdict || 'In Progress'}</p>
            <p>Score: {t.score}</p>
            <a href={`/history/${t.id}`} className="text-blue-500 hover:underline">Replay</a>
          </div>
        ))}
      </div>
    </div>
  );
}
