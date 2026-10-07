export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import { getTrial, getTranscript } from '@/lib/trial-db';
import { redirect } from 'next/navigation';
import CourtroomClient from './CourtroomClient';

export default async function TrialPage({ params }: { params: Promise<{ trialId: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { trialId } = await params;
  const data = getTrial(trialId, session.id);
  if (!data) return <div>Trial not found</div>;

  const transcript = getTranscript(trialId);

  return (
    <CourtroomClient
      trial={data.trial}
      caseData={data.caseData}
      initialTranscript={transcript}
    />
  );
}
