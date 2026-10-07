'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CourtroomClient({ trial, caseData, initialTranscript }: any) {
  const router = useRouter();
  const [state, setState] = useState(trial.state);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [streamingLine, setStreamingLine] = useState<{ speaker: string, role: string, text: string } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  
  const [openingInput, setOpeningInput] = useState('');
  const [closingInput, setClosingInput] = useState('');
  const [askInput, setAskInput] = useState('');
  const [selectedStatement, setSelectedStatement] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [objectionType, setObjectionType] = useState('Leading');
  const [showObjectionForm, setShowObjectionForm] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, streamingLine]);

  // Derive phase banner text
  let phaseBanner = '';
  const currentWitness = caseData.data.witnesses[state.witnessIndex];
  if (state.phase === 'OPENING') phaseBanner = 'Opening';
  else if (state.phase === 'PROSECUTION_CASE') {
    if (state.subPhase.startsWith('DIRECT')) phaseBanner = `Direct examination — ${currentWitness?.name}`;
    else phaseBanner = `Cross-examination — ${currentWitness?.name}`;
  }
  else if (state.phase === 'CLOSING') phaseBanner = 'Closing';
  else if (state.phase === 'VERDICT') phaseBanner = 'Verdict';

  const liveScore = Math.max(0, state.score);

  async function performAction(actionName: string, payload: any = {}) {
    setIsStreaming(true);
    setError('');
    setShowObjectionForm(false);
    
    try {
      const res = await fetch(`/api/trial/${trial.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, payload })
      });
      
      if (!res.ok) {
        if (res.status === 409) setError('Out of order action.');
        else setError('AI error or server error.');
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const decoder = new TextDecoder();
      
      let speaker = res.headers.get('x-speaker') || 'Unknown';
      let role = res.headers.get('x-role') || 'Unknown';
      
      let fullText = '';
      setStreamingLine({ speaker, role, text: '' });
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingLine({ speaker, role, text: fullText });
      }
      
      // Fetch full state sync
      const syncRes = await fetch(`/api/trial/${trial.id}/sync`);
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        setState(syncData.trial.state);
        setTranscript(syncData.transcript);
      }
    } catch (e) {
      setError('Connection dropped.');
    } finally {
      setIsStreaming(false);
      setStreamingLine(null);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b p-4 bg-zinc-100 dark:bg-zinc-900">
        <h2 data-testid="phase-banner" className="text-xl font-bold">{phaseBanner}</h2>
        <div className="flex gap-4">
          <div data-testid="turn-timer" className="rounded bg-black px-3 py-1 text-white">
            {state.turnTimer}
          </div>
          <div data-testid="live-score" className="rounded bg-black px-3 py-1 text-white">
            {liveScore}
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Transcript Panel */}
        <div className="flex flex-1 flex-col border-r bg-white dark:bg-black">
          <div ref={transcriptRef} data-testid="transcript" className="flex-1 overflow-y-auto p-4 space-y-2">
            {transcript.map((line: any) => (
              <div key={line.id} data-testid="transcript-line" className="rounded bg-zinc-50 p-2 dark:bg-zinc-800">
                <span className="font-bold">{line.speaker}: </span>
                <span>{line.text}</span>
              </div>
            ))}
            {streamingLine && (
              <div data-testid="transcript-line" className="rounded bg-zinc-100 p-2 italic dark:bg-zinc-700">
                <span className="font-bold">{streamingLine.speaker}: </span>
                <span>{streamingLine.text}</span>
              </div>
            )}
          </div>
          
          {error && (
            <div className="bg-red-100 p-4 text-red-700 flex justify-between">
              <span data-testid="ai-error">{error}</span>
              <button data-testid="ai-retry" onClick={() => performAction('RETRY')} className="underline">Retry</button>
            </div>
          )}

          {/* Action Area */}
          <div className="border-t p-4 bg-zinc-50 dark:bg-zinc-900">
            {state.phase === 'OPENING' && state.subPhase === 'OPENING_PLAYER' && (
              <div className="flex gap-2">
                <input
                  data-testid="opening-input"
                  className="flex-1 rounded border px-2 py-1 text-black"
                  value={openingInput}
                  onChange={e => setOpeningInput(e.target.value)}
                  maxLength={1000}
                />
                <button
                  data-testid="opening-submit"
                  disabled={isStreaming}
                  onClick={() => performAction('SUBMIT_OPENING', { text: openingInput })}
                  className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50"
                >Submit Opening</button>
              </div>
            )}

            {/* General Continue Button */}
            {['OPENING_PROSECUTOR_DONE', 'DIRECT_WITNESS_ANSWERED', 'RULING_DONE', 'CROSS_DONE'].includes(state.subPhase) && (
              <button
                data-testid="continue"
                disabled={isStreaming}
                onClick={() => performAction('CONTINUE')}
                className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
              >Continue</button>
            )}

            {/* Direct Exam Objections */}
            {state.subPhase === 'DIRECT_PROSECUTOR_ASKED' && (
              <div className="flex gap-2 items-center">
                <button
                  data-testid="continue"
                  disabled={isStreaming}
                  onClick={() => performAction('CONTINUE')}
                  className="rounded bg-zinc-300 px-4 py-2 text-black hover:bg-zinc-400 disabled:opacity-50"
                >Let Witness Answer (Continue)</button>
                
                {!showObjectionForm ? (
                  <button
                    data-testid="object-button"
                    disabled={isStreaming}
                    onClick={() => setShowObjectionForm(true)}
                    className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                  >Object</button>
                ) : (
                  <div className="flex gap-2">
                    <select
                      data-testid="object-type"
                      value={objectionType}
                      onChange={e => setObjectionType(e.target.value)}
                      className="rounded border px-2 py-1 text-black"
                    >
                      {['Leading', 'Hearsay', 'Speculation', 'Relevance', 'Argumentative'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <button
                      data-testid="object-submit"
                      disabled={isStreaming}
                      onClick={() => performAction('SUBMIT_OBJECTION', { type: objectionType })}
                      className="rounded bg-red-600 px-4 py-1 text-white disabled:opacity-50"
                    >Raise Objection</button>
                  </div>
                )}
              </div>
            )}

            {/* Cross Exam Actions */}
            {state.phase === 'PROSECUTION_CASE' && state.subPhase.startsWith('CROSS') && state.actionsLeft > 0 && !['RULING_DONE', 'CROSS_DONE'].includes(state.subPhase) && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div data-testid="actions-left" className="font-bold text-red-600">Actions left: {state.actionsLeft}</div>
                  <button
                    data-testid="press-button"
                    disabled={isStreaming || !selectedStatement}
                    onClick={() => performAction('PRESS_STATEMENT', { statementId: selectedStatement })}
                    className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50"
                  >Press</button>
                  <button
                    data-testid="present-button"
                    disabled={isStreaming || !selectedStatement || !selectedEvidence}
                    onClick={() => performAction('PRESENT_EVIDENCE', { statementId: selectedStatement, evidenceId: selectedEvidence })}
                    className="rounded bg-purple-600 px-4 py-1 text-white disabled:opacity-50"
                  >Present</button>
                  <button
                    data-testid="next-witness"
                    disabled={isStreaming}
                    onClick={() => performAction('NEXT_WITNESS')}
                    className="rounded bg-zinc-600 px-4 py-1 text-white disabled:opacity-50"
                  >Next Witness</button>
                </div>
                <div className="flex gap-2">
                  <input
                    data-testid="ask-input"
                    className="flex-1 rounded border px-2 py-1 text-black"
                    value={askInput}
                    onChange={e => setAskInput(e.target.value)}
                    maxLength={300}
                    placeholder="Free text question..."
                  />
                  <button
                    data-testid="ask-submit"
                    disabled={isStreaming || !askInput.trim()}
                    onClick={() => performAction('ASK_QUESTION', { text: askInput })}
                    className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50"
                  >Ask</button>
                </div>
              </div>
            )}

            {/* Closing */}
            {state.phase === 'CLOSING' && state.subPhase === 'CLOSING_PLAYER' && (
              <div className="flex gap-2">
                <textarea
                  data-testid="closing-input"
                  className="flex-1 rounded border px-2 py-1 text-black"
                  value={closingInput}
                  onChange={e => setClosingInput(e.target.value)}
                  maxLength={2000}
                />
                <button
                  data-testid="closing-submit"
                  disabled={isStreaming}
                  onClick={() => performAction('SUBMIT_CLOSING', { text: closingInput })}
                  className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50"
                >Submit Closing</button>
              </div>
            )}
            
            {/* Verdict */}
            {state.phase === 'VERDICT' && (
              <div className="space-y-1">
                <h3 className="font-bold">Verdict: <span data-testid="verdict">{state.verdict}</span></h3>
                <div data-testid="score-total">Total Score: {liveScore}</div>
                <div data-testid="score-contradictions">Contradictions: {state.scoreDetails?.contradictions || 0}</div>
                <div data-testid="score-objections">Objections: {state.scoreDetails?.objections || 0}</div>
                <div data-testid="score-closing">Closing: {state.scoreDetails?.closing || 0}</div>
                <div data-testid="score-penalty">Penalty: {state.scoreDetails?.penalty || 0}</div>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel (Witness / Evidence) */}
        <div className="w-80 flex-col border-l bg-zinc-50 dark:bg-zinc-900 overflow-y-auto hidden md:flex">
          {state.phase === 'PROSECUTION_CASE' && currentWitness && (
            <div className="p-4 border-b">
              <h3 className="font-bold mb-2">Testimony: {currentWitness.name}</h3>
              <div className="space-y-2">
                {currentWitness.testimony.map((t: any) => {
                  const isContradicted = state.contradictionsFound.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      data-testid="statement"
                      data-statement-id={t.id}
                      data-contradicted={isContradicted}
                      onClick={() => !isContradicted && setSelectedStatement(t.id)}
                      className={`cursor-pointer rounded p-2 text-sm border ${selectedStatement === t.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : 'border-zinc-300'} ${isContradicted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {t.text} {isContradicted && '✔'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <div className="p-4">
            <h3 className="font-bold mb-2">Evidence</h3>
            <div className="space-y-2">
              {caseData.data.evidence.map((e: any) => (
                <div
                  key={e.id}
                  data-testid="evidence-item"
                  data-evidence-id={e.id}
                  onClick={() => setSelectedEvidence(e.id)}
                  className={`cursor-pointer rounded p-2 text-sm border ${selectedEvidence === e.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-900' : 'border-zinc-300'}`}
                >
                  <div className="font-bold">{e.name}</div>
                  <div className="text-xs">{e.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
