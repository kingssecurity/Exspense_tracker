import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = process.env.DB_PATH || '/tmp/expense-tracker.db';
let db;

export function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message TEXT NOT NULL,
        amount REAL,
        type TEXT,
        category TEXT,
        description TEXT,
        withdrawal_purpose TEXT,
        user_id TEXT NOT NULL,
        source_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        needs_review BOOLEAN DEFAULT 0,
        confidence REAL DEFAULT 1.0,
        month_key TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(month_key);
      CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
    `);

    // Add missing columns safely
    try {
      const cols = db.prepare("PRAGMA table_info(transactions)").all().map(c => c.name);
      if (!cols.includes('withdrawal_purpose')) db.exec('ALTER TABLE transactions ADD COLUMN withdrawal_purpose TEXT');
      if (!cols.includes('user_id')) db.exec('ALTER TABLE transactions ADD COLUMN user_id TEXT');
    } catch {}

    // Create or migrate default users with hashed passwords
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
      const hash = bcrypt.hashSync('1234', 10);
      db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)').run('user1', 'ahmed', hash, 'أحمد');
      db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)').run('user2', 'sara', hash, 'سارة');
      console.log('✅ Default users created with hashed passwords');
    } else {
      // Migrate plaintext passwords to bcrypt if needed
      const users = db.prepare('SELECT * FROM users').all();
      for (const u of users) {
        if (u.password && !u.password.startsWith('$2')) {
          const hash = bcrypt.hashSync(u.password, 10);
          db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, u.id);
          console.log(`✅ Migrated password for user: ${u.username}`);
        }
      }
    }
  }
  return db;
}

export function initDb() {
  getDb();
  console.log('✅ Database ready');
}

// ==================== USER OPERATIONS ====================

export function getUser(username, password) {
  const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  return user;
}

export function getUserById(id) {
  return getDb().prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?').get(id);
}

export function getUserByIdFull(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function updateUser(id, data) {
  const db = getDb();
  if (data.password) {
    const hash = bcrypt.hashSync(data.password, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, id);
  }
  if (data.displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(data.displayName, id);
  }
}

export function getAllUsers() {
  return getDb().prepare('SELECT id, username, display_name FROM users').all();
}

// ==================== TRANSACTION OPERATIONS ====================

export function addTransaction(tx) {
  const result = getDb().prepare(`
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

export function getTransactionById(id, userId) {
  return getDb().prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(id, userId);
}

export function updateTransactionDate(id, userId, date, monthKey) {
  const result = getDb().prepare('UPDATE transactions SET source_timestamp = ?, month_key = ? WHERE id = ? AND user_id = ?').run(date, monthKey, id, userId);
  return result.changes > 0;
}

export function deleteTransaction(id, userId) {
  const result = getDb().prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

// ==================== SETTINGS OPERATIONS ====================

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
