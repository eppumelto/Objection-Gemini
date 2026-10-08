const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');
const crypto = require('crypto');

async function run() {
  console.log('Testing App Flow...');
  
  // 1. Create a mock user directly in the database
  const email = 'test2@test.com';
  const stmt = db.prepare('INSERT OR IGNORE INTO users (email, password) VALUES (?, ?)');
  stmt.run(email, 'hashed');
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  const userId = user.id;
  
  // 2. Create a mock session
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24;
  db.prepare('INSERT INTO sessions (id, userId, expiresAt) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
  const cookieStr = `session=${sessionId}`;
  
  // 3. Get the first case ID
  const caseData = db.prepare('SELECT internalId FROM cases LIMIT 1').get();
  const internalId = caseData.internalId;
  
  // 4. Start trial by hitting the route
  let res = await fetch(`http://localhost:3000/trial/start/${internalId}`, {
    headers: { 'Cookie': cookieStr },
    redirect: 'manual'
  });
  
  if (!res.headers.has('location')) {
    console.error('Failed to start trial:', res.status);
    return;
  }
  
  const trialUrl = res.headers.get('location');
  console.log('Trial started at', trialUrl);
  const trialId = trialUrl.split('/').pop();
  
  async function doAction(action, payload) {
    console.log(`Action: ${action}`, payload || '');
    const r = await fetch(`http://localhost:3000/api/trial/${trialId}/action`, {
      method: 'POST',
      headers: { 'Cookie': cookieStr, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    if (!r.ok) {
      console.error('Action failed:', r.status, await r.text());
      return false;
    }
    const text = await r.text();
    console.log(`Result text:`, text);
    
    const s = await fetch(`http://localhost:3000/api/trial/${trialId}/sync`, { headers: { 'Cookie': cookieStr }});
    const stateData = await s.json();
    console.log('SubPhase is now:', stateData.trial.state.subPhase);
    return stateData.trial.state;
  }

  let state = await doAction('SUBMIT_OPENING', { text: 'My opening statement' });
  state = await doAction('CONTINUE', {}); // triggers Prosecutor Question 1
  state = await doAction('CONTINUE', {}); // triggers Witness Answer 1
  state = await doAction('CONTINUE', {}); // triggers Prosecutor Question 2
  state = await doAction('CONTINUE', {}); // triggers Witness Answer 2
  state = await doAction('CONTINUE', {}); // triggers CROSS_START
  
  console.log('Phase:', state.phase, 'Actions left:', state.actionsLeft);
  
  state = await doAction('ASK_QUESTION', { text: 'Where were you?' });
  state = await doAction('NEXT_WITNESS', {});
  state = await doAction('CONTINUE', {}); // CLOSING
  state = await doAction('SUBMIT_CLOSING', { text: 'The defendant is completely innocent!' });
  state = await doAction('CONTINUE', {}); // Verdict

  
  console.log('Test complete!');
}

run().catch(console.error);
