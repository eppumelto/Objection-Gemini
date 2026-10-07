import { getSession } from '@/lib/auth';
import db from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function NewCase() {
  const session = await getSession();
  if (!session) redirect('/login');

  async function saveCase(formData: FormData) {
    'use server';
    const s = await getSession();
    if (!s) return;
    
    const title = formData.get('title') as string;
    const jsonStr = formData.get('data') as string;
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      // ignore
      return;
    }
    
    // Add validation later
    
    const db = (await import('@/lib/db')).default;
    db.prepare('INSERT INTO cases (id, userId, title, charge, witnessCount, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.id, s.id, title || data.title, data.charge || '', data.witnesses?.length || 0, jsonStr);
      
    redirect('/cases');
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 data-testid="editor-title" className="text-2xl font-bold mb-4">New Case</h1>
      <form action={saveCase} className="flex flex-col gap-4">
        <input name="title" placeholder="Case Title" className="border p-2" required />
        <textarea name="data" placeholder="Paste full case JSON here..." className="border p-2 h-64" required></textarea>
        <button data-testid="editor-save" type="submit" className="bg-blue-600 text-white p-2 rounded">Save</button>
      </form>
    </div>
  );
}
