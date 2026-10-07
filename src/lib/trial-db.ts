import db from './db';
import { generateAIStream } from './ai';

export function getTrial(trialId: string, userId: number) {
  const trial = db.prepare('SELECT * FROM trials WHERE id = ? AND userId = ?').get(trialId, userId) as any;
  if (!trial) return null;
  trial.state = JSON.parse(trial.state);
  const caseData = db.prepare('SELECT * FROM cases WHERE internalId = ?').get(trial.caseInternalId) as any;
  caseData.data = JSON.parse(caseData.data);
  return { trial, caseData };
}

export function saveTrialState(trialId: string, state: any) {
  db.prepare('UPDATE trials SET state = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(state), Date.now(), trialId);
}

export function saveTranscript(trialId: string, speaker: string, role: string, text: string, phase: string) {
  const timestamp = Date.now();
  const stmt = db.prepare('INSERT INTO transcript (trialId, speaker, role, text, timestamp, phase) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(trialId, speaker, role, text, timestamp, phase);
}

export function getTranscript(trialId: string) {
  return db.prepare('SELECT * FROM transcript WHERE trialId = ? ORDER BY timestamp ASC, id ASC').all(trialId);
}
