import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Use /tmp for Railway (persists during deployment)
const dbPath = process.env.DB_PATH || '/tmp/expense-tracker.db';

let db;

export function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    
    // ONLY create tables if they don't exist - NEVER drop them!
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
    
    // Add missing columns if needed (without deleting data)
    try {
      const cols = db.prepare("PRAGMA table_info(transactions)").all().map(c => c.name);
      if (!cols.includes('withdrawal_purpose')) db.exec('ALTER TABLE transactions ADD COLUMN withdrawal_purpose TEXT');
      if (!cols.includes('user_id')) db.exec('ALTER TABLE transactions ADD COLUMN user_id TEXT');
    } catch {}
    
    // Create default users ONLY if table is empty
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
      db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)').run('user1', 'ahmed', '1234', 'أحمد');
      db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)').run('user2', 'sara', '1234', 'سارة');
    }
  }
  return db;
}

// Initialize database (safe - won't delete anything)
export function initDb() {
  getDb(); // This will create tables if needed
  console.log('✅ Database ready');
}

// User operations
export function getUser(username, password) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
}

export function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUser(id, data) {
  const db = getDb();
  if (data.password) {
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(data.password, id);
  }
  if (data.displayName) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(data.displayName, id);
  }
}

export function getAllUsers() {
  return getDb().prepare('SELECT id, username, display_name FROM users').all();
}

// Transaction operations
export function addTransaction(tx) {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO transactions (raw_message, amount, type, category, description, withdrawal_purpose, user_id, source_timestamp, month_key, needs_review, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tx.rawMessage, tx.amount, tx.type, tx.category, tx.description, tx.withdrawalPurpose, tx.userId, tx.sourceTimestamp, tx.monthKey, tx.needsReview, tx.confidence);
  return result.lastInsertRowid;
}

export function getTransactions(userId, filters = {}) {
  let query = 'SELECT * FROM transactions WHERE user_id = ?';
  const params = [userId];
  
  if (filters.type) { query += ' AND type = ?'; params.push(filters.type); }
  if (filters.category) { query += ' AND category = ?'; params.push(filters.category); }
  if (filters.monthKey) { query += ' AND month_key = ?'; params.push(filters.monthKey); }
  
  query += ' ORDER BY source_timestamp DESC';
  if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
  
  return getDb().prepare(query).all(...params);
}

export function updateTransactionDate(id, date, monthKey) {
  getDb().prepare('UPDATE transactions SET source_timestamp = ?, month_key = ? WHERE id = ?').run(date, monthKey, id);
}

export function deleteTransaction(id) {
  getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id);
}

// Settings operations
export function getSetting(key) {
  return getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

export function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

export function getUserSettings(userId) {
  return {
    monthly_balance: parseFloat(getSetting(`monthly_balance_${userId}`) || '0'),
    budgets: JSON.parse(getSetting(`budgets_${userId}`) || '{}'),
    savings_goal: getSetting(`savings_goal_${userId}`) || '0',
    savings_saved: getSetting(`savings_saved_${userId}`) || '0'
  };
}
