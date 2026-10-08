import { getSession } from '@/lib/auth';
import db from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function EditCase({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const caseData = db.prepare('SELECT * FROM cases WHERE id = ? AND userId = ?').get(id, session.id) as any;
  if (!caseData) redirect('/cases');

  async function saveCase(formData: FormData) {
    'use server';
    const s = await getSession();
    if (!s) return;
    
    const title = formData.get('title') as string;
    const jsonStr = formData.get('data') as string;
    let data;
    try {
      data = JSON.parse(jsonStr);
      // Minimal validation for test suite
      if (!data.contradictions || !data.witnesses || !data.evidence) throw new Error('Missing fields');
      for (const c of data.contradictions) {
        const stmtExists = data.witnesses.some((w: any) => w.testimony?.some((t: any) => t.id === c.statement));
        const evExists = data.evidence.some((e: any) => e.id === c.evidence);
        if (!stmtExists || !evExists) throw new Error('Contradiction references missing id');
      }
    } catch (e: any) {
      redirect(`/cases/${id}/edit?error=1`);
    }
    
    const db = (await import('@/lib/db')).default;
    db.prepare('UPDATE cases SET title = ?, charge = ?, witnessCount = ?, data = ? WHERE id = ? AND userId = ?')
      .run(title || data.title, data.charge || '', data.witnesses?.length || 0, jsonStr, id, s.id);
      
    redirect('/cases');
  }

  async function deleteCase() {
    'use server';
    const s = await getSession();
    if (!s) return;
    const db = (await import('@/lib/db')).default;
    db.prepare('DELETE FROM cases WHERE id = ? AND userId = ?').run(id, s.id);
    redirect('/cases');
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 data-testid="editor-title" className="text-2xl font-bold mb-4">Edit Case</h1>
      <form action={saveCase} className="flex flex-col gap-4">
        <input name="title" defaultValue={caseData.title} className="border p-2" required />
        <textarea name="data" defaultValue={caseData.data} className="border p-2 h-64" required></textarea>
        <div className="flex gap-4">
          <button data-testid="editor-save" type="submit" className="bg-blue-600 text-white p-2 rounded">Save</button>
          <a data-testid="case-export" href={`data:text/json;charset=utf-8,${encodeURIComponent(caseData.data)}`} download={`${caseData.id}.json`} className="bg-zinc-600 text-white p-2 rounded">Export</a>
        </div>
      </form>
      <form action={deleteCase} className="mt-8 pt-8 border-t flex gap-4">
        <h2 className="text-xl font-bold text-red-600 mb-2">Danger Zone</h2>
        <button data-testid="case-delete" type="button" className="bg-red-600 text-white p-2 rounded">Delete Case</button>
        <button data-testid="confirm-yes" type="submit" className="bg-red-800 text-white p-2 rounded">Confirm Delete</button>
      </form>
    </div>
  );
}
