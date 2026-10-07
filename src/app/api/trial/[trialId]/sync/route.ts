export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import { getTrial, getTranscript } from '@/lib/trial-db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ trialId: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const { trialId } = await params;
  const data = getTrial(trialId, session.id);
  if (!data) return new NextResponse('Not found', { status: 404 });

  const transcript = getTranscript(trialId);
  return NextResponse.json({ trial: data.trial, transcript });
}
