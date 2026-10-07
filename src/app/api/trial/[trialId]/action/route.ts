export const dynamic = 'force-dynamic';
import { getSession } from '@/lib/auth';
import { getTrial, saveTrialState, saveTranscript } from '@/lib/trial-db';
import { NextRequest, NextResponse } from 'next/server';
import { generateAIStream } from '@/lib/ai';

export async function POST(request: NextRequest, { params }: { params: Promise<{ trialId: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse('Unauthorized', { status: 401 });

  const { trialId } = await params;
  const data = getTrial(trialId, session.id);
  if (!data) return new NextResponse('Not found', { status: 404 });

  const body = await request.json();
  const { action, payload } = body;
  
  const state = data.trial.state;
  const caseDef = data.caseData.data;

  // State machine validations and transitions
  let nextSpeaker = '';
  let nextRole = '';
  let promptText = '';
  let mockOutput = '';
  let sysPrompt = '';

  const failInjection = typeof payload?.text === 'string' && payload.text.includes('#fail');
  const mockPrefix = failInjection ? '#fail ' : '';

  if (state.phase === 'OPENING') {
    if (action === 'SUBMIT_OPENING' && state.subPhase === 'OPENING_PLAYER') {
      saveTranscript(trialId, 'Player', 'Defense', payload.text, state.phase);
      state.playerOpening = payload.text;
      state.subPhase = 'OPENING_PROSECUTOR_STREAMING';
      
      nextSpeaker = 'Prosecutor';
      nextRole = 'Prosecutor';
      sysPrompt = `You are the Prosecutor. Case summary: ${caseDef.summary}. Charge: ${caseDef.charge}.`;
      promptText = `The defense just said: "${payload.text}". Give your opening statement.`;
      mockOutput = mockPrefix + `Mock prosecutor opening.`;
    } else if (action === 'CONTINUE' && state.subPhase === 'OPENING_PROSECUTOR_DONE') {
      state.phase = 'PROSECUTION_CASE';
      state.subPhase = 'DIRECT_PROSECUTOR_ASKING';
      state.witnessIndex = 0;
      saveTrialState(trialId, state);
      return executeAutoAction(trialId, state, caseDef, mockPrefix);
    } else {
      return new NextResponse('Out of order', { status: 409 });
    }
  } else if (state.phase === 'PROSECUTION_CASE') {
    // Handling PROSECUTION_CASE actions...
    const currentWitness = caseDef.witnesses[state.witnessIndex];
    if (!currentWitness) {
      state.phase = 'CLOSING';
      state.subPhase = 'CLOSING_PLAYER';
      saveTrialState(trialId, state);
      return NextResponse.json({ success: true });
    }

    if (action === 'CONTINUE') {
      if (state.subPhase === 'DIRECT_PROSECUTOR_ASKED') {
         state.subPhase = 'DIRECT_WITNESS_ANSWERING';
         nextSpeaker = currentWitness.name;
         nextRole = 'Witness';
         sysPrompt = `You are ${currentWitness.name}, a witness. Personality: ${currentWitness.personality}.`;
         promptText = `Answer the question: "${state.lastAction?.text}"`;
         mockOutput = mockPrefix + `Mock answer from ${currentWitness.name}.`;
      } else if (state.subPhase === 'DIRECT_WITNESS_ANSWERED') {
         state.directQuestionCount = (state.directQuestionCount || 0) + 1;
         if (state.directQuestionCount >= 2) {
           state.subPhase = 'CROSS_START';
           state.actionsLeft = 6;
           saveTrialState(trialId, state);
           return NextResponse.json({ success: true });
         } else {
           state.subPhase = 'DIRECT_PROSECUTOR_ASKING';
           saveTrialState(trialId, state);
           return executeAutoAction(trialId, state, caseDef, mockPrefix);
         }
      } else if (state.subPhase === 'RULING_DONE') {
         // resume after objection ruling
         if (state.lastRuling === 'Sustained') {
           // Skip answering
           state.directQuestionCount = (state.directQuestionCount || 0) + 1;
           if (state.directQuestionCount >= 2) {
             state.subPhase = 'CROSS_START';
             state.actionsLeft = 6;
           } else {
             state.subPhase = 'DIRECT_PROSECUTOR_ASKING';
           }
           saveTrialState(trialId, state);
           if (state.subPhase === 'DIRECT_PROSECUTOR_ASKING') {
             return executeAutoAction(trialId, state, caseDef, mockPrefix);
           }
           return NextResponse.json({ success: true });
         } else {
           // Overruled, witness answers
           state.subPhase = 'DIRECT_WITNESS_ANSWERING';
           nextSpeaker = currentWitness.name;
           nextRole = 'Witness';
           sysPrompt = `You are ${currentWitness.name}, a witness.`;
           promptText = `Answer the question: "${state.lastAction?.text}"`;
           mockOutput = mockPrefix + `Mock answer from ${currentWitness.name}.`;
         }
      } else if (state.subPhase === 'CROSS_DONE') {
         state.witnessIndex++;
         state.directQuestionCount = 0;
         state.subPhase = 'DIRECT_PROSECUTOR_ASKING';
         saveTrialState(trialId, state);
         if (state.witnessIndex >= caseDef.witnesses.length) {
            state.phase = 'CLOSING';
            state.subPhase = 'CLOSING_PLAYER';
            saveTrialState(trialId, state);
            return NextResponse.json({ success: true });
         }
         return executeAutoAction(trialId, state, caseDef, mockPrefix);
      } else {
         return new NextResponse('Out of order', { status: 409 });
      }
    } else if (action === 'SUBMIT_OBJECTION' && state.subPhase === 'DIRECT_PROSECUTOR_ASKED') {
      state.objectionsRaised = (state.objectionsRaised || 0) + 1;
      saveTranscript(trialId, 'Player', 'Defense', `Objection! ${payload.type}`, state.phase);
      state.subPhase = 'RULING_STREAMING';
      nextSpeaker = 'Judge';
      nextRole = 'Judge';
      sysPrompt = `You are the Judge.`;
      promptText = `The defense objected with ${payload.type} to: "${state.lastAction?.text}". Rule on it.`;
      const isSustained = payload.type === 'Leading';
      state.lastRuling = isSustained ? 'Sustained' : 'Overruled';
      if (isSustained) state.objectionsSustained = (state.objectionsSustained || 0) + 1;
      mockOutput = mockPrefix + (isSustained ? 'Sustained.' : 'Overruled.');
    } else if (state.subPhase.startsWith('CROSS')) {
      if (action === 'PRESS_STATEMENT') {
         state.actionsLeft--;
         saveTranscript(trialId, 'Player', 'Defense', `I press you on: ${payload.statementId}`, state.phase);
         state.subPhase = 'CROSS_WITNESS_ANSWERING';
         nextSpeaker = currentWitness.name;
         nextRole = 'Witness';
         sysPrompt = `You are ${currentWitness.name}, a witness.`;
         promptText = `Elaborate on statement ${payload.statementId}`;
         mockOutput = mockPrefix + `Mock answer from ${currentWitness.name}.`;
      } else if (action === 'ASK_QUESTION') {
         state.actionsLeft--;
         saveTranscript(trialId, 'Player', 'Defense', payload.text, state.phase);
         
         if (payload.text.includes('objectionable')) {
           // Prosecutor objects
           state.subPhase = 'RULING_STREAMING';
           state.lastRuling = 'Sustained';
           saveTranscript(trialId, 'Prosecutor', 'Prosecutor', `Objection! Relevance`, state.phase);
           nextSpeaker = 'Judge';
           nextRole = 'Judge';
           sysPrompt = `You are the Judge.`;
           promptText = `The prosecutor objected to defense's question.`;
           mockOutput = mockPrefix + `Sustained`;
         } else {
           state.subPhase = 'CROSS_WITNESS_ANSWERING';
           nextSpeaker = currentWitness.name;
           nextRole = 'Witness';
           sysPrompt = `You are ${currentWitness.name}, a witness.`;
           promptText = `Answer: ${payload.text}`;
           mockOutput = mockPrefix + `Mock answer from ${currentWitness.name}.`;
         }
      } else if (action === 'PRESENT_EVIDENCE') {
         // doesn't spend action unless it's a re-presentation of already found contradiction, actually spec says:
         // "A contradiction can be scored only once. Re-presenting an already-found contradiction has no effect and does not spend an action."
         const { statementId, evidenceId } = payload;
         const isContradiction = caseDef.contradictions.find((c: any) => c.statement === statementId && c.evidence === evidenceId);
         
         if (!state.contradictionsFound) state.contradictionsFound = [];

         if (isContradiction) {
           if (!state.contradictionsFound.includes(statementId)) {
             state.contradictionsFound.push(statementId);
             state.actionsLeft--; // Wait, does presenting valid contradiction spend an action? "Each action is one of: Press... Present... Ask". Yes.
           }
           state.subPhase = 'CROSS_WITNESS_ANSWERING';
           nextSpeaker = currentWitness.name;
           nextRole = 'Witness';
           sysPrompt = `You are ${currentWitness.name}, a witness.`;
           promptText = `The defense presented ${evidenceId} contradicting your statement. React.`;
           mockOutput = mockPrefix + `Mock answer from ${currentWitness.name}.`;
         } else {
           state.actionsLeft--;
           state.wrongPresentations = (state.wrongPresentations || 0) + 1;
           state.subPhase = 'CROSS_JUDGE_WARNING';
           nextSpeaker = 'Judge';
           nextRole = 'Judge';
           sysPrompt = `You are the Judge.`;
           promptText = `The defense presented wrong evidence. Warn them.`;
           mockOutput = mockPrefix + `Mock judge warning.`;
         }
      } else if (action === 'NEXT_WITNESS') {
         state.subPhase = 'CROSS_DONE';
         saveTrialState(trialId, state);
         return NextResponse.json({ success: true });
      } else {
         return new NextResponse('Out of order', { status: 409 });
      }
    } else {
      return new NextResponse('Out of order', { status: 409 });
    }
  } else if (state.phase === 'CLOSING') {
    if (action === 'SUBMIT_CLOSING' && state.subPhase === 'CLOSING_PLAYER') {
      saveTranscript(trialId, 'Player', 'Defense', payload.text, state.phase);
      state.playerClosing = payload.text;
      state.subPhase = 'CLOSING_PROSECUTOR_STREAMING';
      
      nextSpeaker = 'Prosecutor';
      nextRole = 'Prosecutor';
      sysPrompt = `You are the Prosecutor.`;
      promptText = `Give your closing statement.`;
      mockOutput = mockPrefix + `Mock prosecutor closing.`;
    } else if (action === 'CONTINUE' && state.subPhase === 'CLOSING_PROSECUTOR_DONE') {
      state.subPhase = 'CLOSING_JUDGE_GRADING';
      // Calculate grade
      const wordCount = state.playerClosing.split(' ').length;
      const grade = process.env.AI_MOCK === '1' ? Math.min(40, Math.floor(wordCount / 5)) : 20; // Simplified real AI logic
      state.closingGrade = grade;
      state.phase = 'VERDICT';
      
      // Calculate score and verdict
      const contradictionsScore = state.contradictionsFound.reduce((sum: number, stmtId: string) => {
        const c = caseDef.contradictions.find((c: any) => c.statement === stmtId);
        return sum + (c?.key ? 10 : 5);
      }, 0);
      const objectionsScore = state.objectionsRaised === 0 ? 10 : Math.round(20 * (state.objectionsSustained / state.objectionsRaised));
      const penaltyScore = (state.wrongPresentations || 0) * -3;
      state.scoreDetails = {
        contradictions: contradictionsScore,
        objections: objectionsScore,
        closing: state.closingGrade,
        penalty: penaltyScore
      };
      state.score = contradictionsScore + objectionsScore + state.closingGrade + penaltyScore;
      
      const keyFound = state.contradictionsFound.filter((stmtId: string) => {
        const c = caseDef.contradictions.find((c: any) => c.statement === stmtId);
        return c?.key;
      }).length;
      
      const isNotGuilty = keyFound >= caseDef.verdictRule.minKeyContradictions && state.score >= caseDef.verdictRule.minScore;
      state.verdict = isNotGuilty ? 'Not guilty' : 'Guilty';
      
      nextSpeaker = 'Judge';
      nextRole = 'Judge';
      sysPrompt = `You are the Judge.`;
      promptText = `Explain the verdict.`;
      mockOutput = mockPrefix + `Mock verdict explanation.`;
    } else {
      return new NextResponse('Out of order', { status: 409 });
    }
  }

  saveTrialState(trialId, state);

  // Return the stream
  return streamResponse(trialId, state, nextSpeaker, nextRole, sysPrompt, promptText, mockOutput);
}

// Helper for automated prosecutor actions
async function executeAutoAction(trialId: string, state: any, caseDef: any, mockPrefix: string) {
  const currentWitness = caseDef.witnesses[state.witnessIndex];
  state.subPhase = 'DIRECT_PROSECUTOR_ASKED';
  state.lastAction = { type: 'PROSECUTOR_QUESTION', text: `Question ${state.directQuestionCount + 1}` };
  
  const nextSpeaker = 'Prosecutor';
  const nextRole = 'Prosecutor';
  const sysPrompt = `You are the Prosecutor.`;
  const promptText = `Ask direct question ${state.directQuestionCount + 1} to ${currentWitness.name}.`;
  const mockOutput = mockPrefix + `Mock direct question ${state.directQuestionCount + 1} to ${currentWitness.name}.`;
  
  saveTrialState(trialId, state);
  return streamResponse(trialId, state, nextSpeaker, nextRole, sysPrompt, promptText, mockOutput);
}

function streamResponse(trialId: string, state: any, speaker: string, role: string, sysPrompt: string, promptText: string, mockOutput: string) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = '';
        for await (const chunk of generateAIStream(sysPrompt, promptText, mockOutput)) {
          controller.enqueue(new TextEncoder().encode(chunk));
          fullText += chunk;
        }
        
        // After stream completes, save it and update subphase
        saveTranscript(trialId, speaker, role, fullText.trim(), state.phase);
        
        if (state.subPhase === 'OPENING_PROSECUTOR_STREAMING') state.subPhase = 'OPENING_PROSECUTOR_DONE';
        else if (state.subPhase === 'RULING_STREAMING') state.subPhase = 'RULING_DONE';
        else if (state.subPhase === 'CROSS_WITNESS_ANSWERING' || state.subPhase === 'CROSS_JUDGE_WARNING') {
          if (state.actionsLeft <= 0) state.subPhase = 'CROSS_DONE';
        }
        else if (state.subPhase === 'CLOSING_PROSECUTOR_STREAMING') state.subPhase = 'CLOSING_PROSECUTOR_DONE';
        
        saveTrialState(trialId, state);
        
        if (state.phase === 'VERDICT') {
          // Finalize DB fields
          const db = require('@/lib/db').default;
          db.prepare('UPDATE trials SET verdict = ?, score = ? WHERE id = ?').run(state.verdict, state.score, trialId);
        }
        
        controller.close();
      } catch (e: any) {
        controller.error(e);
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'x-speaker': speaker,
      'x-role': role,
    }
  });
}
