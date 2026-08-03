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
    if (!columns.includes('user_id')) {
      try { db.exec('ALTER TABLE transactions ADD COLUMN user_id TEXT'); } catch {}
    }
  }
  return db;
}

export function initDb() {
  const db = getDb();
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_message TEXT NOT NULL,
      amount REAL,
      type TEXT,
      category TEXT,
      description TEXT,
      withdrawal_purpose TEXT,
      user_id TEXT,
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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      password TEXT,
      display_name TEXT
    );
  `);
  
  // Default settings
  const defaults = { 'monthly_balance': '0' };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);
  
  // Default users (2 users)
  const defaultUsers = [
    { id: 'user1', username: 'ahmed', password: '1234', display_name: 'أحمد' },
    { id: 'user2', username: 'sara', password: '1234', display_name: 'سارة' }
  ];
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)');
  for (const u of defaultUsers) insertUser.run(u.id, u.username, u.password, u.display_name);
  
  console.log('✅ Database ready');
}

export function getSetting(key) {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function getUser(username, password) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUser(id, data) {
  const db = getDb();
  if (data.password) {
    db.prepare('UPDATE users SET password = ?, display_name = COALESCE(?, display_name) WHERE id = ?')
      .run(data.password, data.display_name, id);
  } else if (data.display_name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(data.display_name, id);
  }
}

export function getAllUsers() {
  return getDb().prepare('SELECT id, username, display_name FROM users').all();
}
