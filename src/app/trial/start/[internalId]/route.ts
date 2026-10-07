export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import db from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ internalId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL('/login', request.url));

  const { internalId } = await params;
  const caseData = db.prepare('SELECT id, data FROM cases WHERE internalId = ? AND (userId IS NULL OR userId = ?)').get(internalId, session.id) as any;
  if (!caseData) return new NextResponse('Case not found', { status: 404 });

  const parsedData = JSON.parse(caseData.data);
  const trialId = crypto.randomUUID();

  const initialState = {
    phase: 'OPENING',
    speaker: 'PLAYER',
    turnTimer: 90,
    witnessIndex: 0,
    subPhase: 'OPENING_PLAYER', // Tracks state within the state machine
    objectionsSustained: 0,
    objectionsRaised: 0,
    wrongPresentations: 0,
    closingGrade: 0,
    contradictionsFound: [], // List of contradicted statementIds
    actionsLeft: 6, // for cross exam
    lastAction: null, // e.g. { type: 'PROSECUTOR_QUESTION', text: '...' }
    prosecutorOpening: null,
    playerOpening: null,
    prosecutorClosing: null,
    playerClosing: null,
  };

  db.prepare(`
    INSERT INTO trials (id, userId, caseInternalId, state, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(trialId, session.id, internalId, JSON.stringify(initialState), Date.now());

  return NextResponse.redirect(new URL(`/trial/${trialId}`, request.url));
}
