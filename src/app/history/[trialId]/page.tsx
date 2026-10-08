'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function ReplayView() {
  const params = useParams();
  const trialId = params.trialId as string;
  const [transcript, setTranscript] = useState<any[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch(`/api/trial/${trialId}/sync`)
      .then(res => res.json())
      .then(data => setTranscript(data.transcript));
  }, [trialId]);

  if (transcript.length === 0) return <div>Loading...</div>;

  const currentLine = transcript[index];

  const exportText = transcript.map(l => `**${l.speaker}**: ${l.text}`).join('\n\n');

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Trial Replay</h1>
      <div className="flex gap-4 mb-4">
        <button data-testid="replay-prev" onClick={() => setIndex(i => Math.max(0, i - 1))} className="bg-blue-600 text-white px-4 py-2 rounded">Prev</button>
        <button data-testid="replay-next" onClick={() => setIndex(i => Math.min(transcript.length - 1, i + 1))} className="bg-blue-600 text-white px-4 py-2 rounded">Next</button>
        <a data-testid="transcript-export" href={`data:text/markdown;charset=utf-8,${encodeURIComponent(exportText)}`} download={`transcript-${trialId}.md`} className="bg-zinc-600 text-white px-4 py-2 rounded">Export Transcript</a>
      </div>
      <div className="border p-4 bg-white dark:bg-zinc-900 rounded">
        <div data-testid="replay-line">
          <span className="font-bold">{currentLine.speaker}: </span>
          <span>{currentLine.text}</span>
        </div>
      </div>
    </div>
  );
}
