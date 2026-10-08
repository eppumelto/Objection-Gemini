export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import db from '@/lib/db';

export default async function Stats() {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }

  const trials = db.prepare('SELECT score, verdict, state FROM trials WHERE userId = ? AND verdict IS NOT NULL').all(session.id) as any[];

  const played = trials.length;
  const wins = trials.filter(t => t.verdict === 'Not guilty').length;
  const winrate = played > 0 ? Math.round((wins / played) * 100) : 0;
  const avgScore = played > 0 ? Math.round(trials.reduce((sum, t) => sum + t.score, 0) / played) : 0;

  // calculate objections
  let totalRaised = 0;
  let totalSustained = 0;
  for (const t of trials) {
    const s = JSON.parse(t.state);
    if (s.objectionsRaised) {
      totalRaised += s.objectionsRaised;
      totalSustained += s.objectionsSustained || 0;
    }
  }
  const objRate = totalRaised > 0 ? Math.round((totalSustained / totalRaised) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold mb-6">Stats Dashboard</h1>
      <div className="grid grid-cols-2 gap-4 text-center">
        <div className="p-4 border rounded bg-white dark:bg-zinc-900">
          <div className="text-sm">Trials Played</div>
          <div data-testid="stats-played" className="text-3xl font-bold">{played}</div>
        </div>
        <div className="p-4 border rounded bg-white dark:bg-zinc-900">
          <div className="text-sm">Win Rate</div>
          <div data-testid="stats-winrate" className="text-3xl font-bold">{winrate}%</div>
        </div>
        <div className="p-4 border rounded bg-white dark:bg-zinc-900">
          <div className="text-sm">Average Score</div>
          <div data-testid="stats-avg" className="text-3xl font-bold">{avgScore}</div>
        </div>
        <div className="p-4 border rounded bg-white dark:bg-zinc-900">
          <div className="text-sm">Objection Success</div>
          <div data-testid="stats-objections" className="text-3xl font-bold">{objRate}%</div>
        </div>
      </div>
      <div data-testid="stats-chart" className="mt-8 p-4 border rounded h-64 flex items-end gap-2 bg-white dark:bg-zinc-900">
        {trials.map((t, i) => (
          <div key={i} className="bg-blue-500 w-8" style={{ height: `${t.score}%` }} title={`Score: ${t.score}`}></div>
        ))}
      </div>
    </div>
  );
}
