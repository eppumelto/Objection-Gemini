'use client';

import { useActionState } from 'react';
import { register } from '@/app/actions/auth';
import Link from 'next/link';

export default function Register() {
  const [state, formAction, isPending] = useActionState(register, null);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded bg-white p-8 shadow dark:bg-zinc-900">
        <h1 className="text-2xl font-bold">Register</h1>
        {state?.error && <div data-testid="auth-error" className="text-red-500">{state.error}</div>}
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            data-testid="register-email"
            name="email"
            type="email"
            required
            className="w-full rounded border px-3 py-2 text-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Password</label>
          <input
            data-testid="register-password"
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full rounded border px-3 py-2 text-black"
          />
        </div>
        <button
          data-testid="register-submit"
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Registering...' : 'Register'}
        </button>
        <div className="text-sm">
          Already have an account? <Link href="/login" className="text-blue-500 hover:underline">Log in</Link>
        </div>
      </form>
    </div>
  );
}
