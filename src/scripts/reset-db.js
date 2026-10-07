const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'database.sqlite');

// Remove existing database
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  );

  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE cases (
    internalId INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    userId INTEGER, -- NULL for built-in cases
    title TEXT NOT NULL,
    charge TEXT NOT NULL,
    witnessCount INTEGER NOT NULL,
    data TEXT NOT NULL, -- Full JSON schema
    UNIQUE(id, userId),
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE trials (
    id TEXT PRIMARY KEY,
    userId INTEGER NOT NULL,
    caseInternalId INTEGER NOT NULL,
    state TEXT NOT NULL, -- JSON of the full trial state
    score INTEGER DEFAULT 0,
    verdict TEXT, -- 'Guilty' or 'Not guilty' or NULL
    createdAt INTEGER NOT NULL,
    FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(caseInternalId) REFERENCES cases(internalId) ON DELETE CASCADE
  );

  CREATE TABLE transcript (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trialId TEXT NOT NULL,
    speaker TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    phase TEXT NOT NULL,
    FOREIGN KEY(trialId) REFERENCES trials(id) ON DELETE CASCADE
  );
`);

// Seed built-in cases
const casesDir = path.resolve(process.cwd(), 'cases');
if (fs.existsSync(casesDir)) {
  const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.json'));
  const insertCase = db.prepare(`
    INSERT INTO cases (id, userId, title, charge, witnessCount, data)
    VALUES (@id, NULL, @title, @charge, @witnessCount, @data)
  `);

  db.transaction(() => {
    for (const file of files) {
      const dataStr = fs.readFileSync(path.join(casesDir, file), 'utf8');
      const data = JSON.parse(dataStr);
      insertCase.run({
        id: data.id,
        title: data.title,
        charge: data.charge,
        witnessCount: data.witnesses ? data.witnesses.length : 0,
        data: JSON.stringify(data)
      });
      console.log(`Seeded case: ${data.id}`);
    }
  })();
}

console.log('Database reset and seeded.');
db.close();
