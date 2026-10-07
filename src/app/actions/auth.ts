'use server';

import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';
import { setSession } from '@/lib/auth';

export async function register(state: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password || password.length < 8) {
    return { error: 'Invalid email or password (min 8 chars).' };
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)').run(email, hashedPassword);
    await setSession(result.lastInsertRowid as number);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { error: 'Email already exists.' };
    }
    return { error: 'An error occurred.' };
  }
  
  redirect('/cases');
}

export async function login(state: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Invalid email or password.' };
  }

  const user = db.prepare('SELECT id, password FROM users WHERE email = ?').get(email) as any;
  if (!user) {
    return { error: 'Invalid credentials.' };
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return { error: 'Invalid credentials.' };
  }

  await setSession(user.id);
  redirect('/cases');
}

export async function logout() {
  const { clearSession } = await import('@/lib/auth');
  await clearSession();
  redirect('/login');
}
