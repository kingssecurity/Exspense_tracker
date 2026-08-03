import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = './data/expense-tracker.db';

let db;

export function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    
    // Safely add new columns if they don't exist
    const tableInfo = db.prepare("PRAGMA table_info(transactions)").all();
    const columns = tableInfo.map(c => c.name);
    
    if (!columns.includes('withdrawal_purpose')) {
      try { db.exec('ALTER TABLE transactions ADD COLUMN withdrawal_purpose TEXT'); } catch {}
    }
  }
  return db;
}

export function initDb() {
  const db = getDb();
  
  // Create table if it doesn't exist (without dropping)
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_message TEXT NOT NULL,
      amount REAL,
      type TEXT,
      category TEXT,
      description TEXT,
      withdrawal_purpose TEXT,
      source_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      needs_review BOOLEAN DEFAULT 0,
      confidence REAL DEFAULT 1.0,
      month_key TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  
  const defaults = { 'app_password': '1234', 'monthly_balance': '0' };
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) insert.run(k, v);
  
  console.log('✅ Database ready');
}

export function getSetting(key) {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}
