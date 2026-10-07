import { cookies } from 'next/headers';
import db from './db';

export async function getSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session')?.value;
  if (!sessionId) return null;

  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND expiresAt > ?').get(sessionId, Date.now()) as any;
  if (!session) return null;

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(session.userId) as any;
  return user as { id: number; email: string } | undefined;
}

export async function setSession(userId: number) {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  db.prepare('INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
  const cookieStore = await cookies();
  cookieStore.set('session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(expiresAt),
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session')?.value;
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    cookieStore.delete('session');
  }
}
