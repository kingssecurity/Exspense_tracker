import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const dbPath = process.env.DB_PATH || '/tmp/expense-tracker.db';
export { dbPath };
let db;

export function getDb() {
  if (!db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '📦',
        color TEXT DEFAULT '#64748b',
        keywords TEXT DEFAULT '[]',
        is_default BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        raw_message TEXT NOT NULL,
        amount REAL,
        type TEXT,
        category TEXT,
        category_id INTEGER,
        description TEXT,
        withdrawal_purpose TEXT,
        user_id TEXT NOT NULL,
        source_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        needs_review BOOLEAN DEFAULT 0,
        confidence REAL DEFAULT 1.0,
        month_key TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(month_key);
      CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
      CREATE INDEX IF NOT EXISTS idx_cat_user ON categories(user_id);
    `);

    // Add missing columns safely
    try {
      const cols = db.prepare("PRAGMA table_info(transactions)").all().map(c => c.name);
      if (!cols.includes('withdrawal_purpose')) db.exec('ALTER TABLE transactions ADD COLUMN withdrawal_purpose TEXT');
      if (!cols.includes('user_id')) db.exec('ALTER TABLE transactions ADD COLUMN user_id TEXT');
      if (!cols.includes('category_id')) db.exec('ALTER TABLE transactions ADD COLUMN category_id INTEGER');
    } catch {}

    // Create default users
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (userCount === 0) {
      const hash = bcrypt.hashSync('1234', 10);
      db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)').run('user1', 'ahmed', hash, 'أحمد');
      db.prepare('INSERT INTO users (id, username, password, display_name) VALUES (?, ?, ?, ?)').run('user2', 'sara', hash, 'سارة');
      console.log('✅ Default users created');
    }

    // Seed default categories for users who have none
    const users = db.prepare('SELECT id FROM users').all();
    for (const u of users) {
      const catCount = db.prepare('SELECT COUNT(*) as c FROM categories WHERE user_id = ?').get(u.id).c;
      if (catCount === 0) seedDefaultCategories(u.id);
    }

    console.log('📂 Database path:', dbPath);
  }
  return db;
}

function seedDefaultCategories(userId) {
  const defaults = [
    { name: 'أكل وشرب', icon: '🍔', color: '#f59e0b', keywords: '["أكل","مطعم","كافيه","قهوة","شاي","بيتزا","برجر","فطار","غدا","عشا","فاكهة","خضار","لحم","دجاج","سمك","عيش"]' },
    { name: 'مواصلات', icon: '🚗', color: '#3b82f6', keywords: '["مواصلات","تاكسي","أوبر","كريم","ميكروباص","اتوبيس","مترو","بنزين","موقف"]' },
    { name: 'فواتير بيت', icon: '🏠', color: '#f97316', keywords: '["كهرباء","مية","غاز","إيجار","صيانة","فاتورة بيت"]' },
    { name: 'فواتير موبايل', icon: '📱', color: '#8b5cf6', keywords: '["فودافون","اورنج","اتصالات","شحن","نت موبايل","فون"]' },
    { name: 'صحة', icon: '💊', color: '#ec4899', keywords: '["دكتور","علاج","صيدلية","عيادة","مستشفى","تحاليل","أشعة","دوا"]' },
    { name: 'تسوق', icon: '🛍️', color: '#10b981', keywords: '["ملابس","جزمة","شنطة","محل","أونلاين","هدايا","شراء","اشتريت"]' },
    { name: 'تعليم', icon: '📚', color: '#6366f1', keywords: '["مدرسة","جامعة","دورة","كورس","كتب","مذاكرة","دروس"]' },
    { name: 'ترفيه', icon: '🎮', color: '#ef4444', keywords: '["سينما","فيلم","لعبة","خروج","فسح","رحلة","نت شغل"]' },
    { name: 'شغل', icon: '💼', color: '#7c3aed', keywords: '["شغل","مكتب","عميل","مشروع","بنزين شغل","شركة"]' },
    { name: 'أخرى', icon: '📦', color: '#64748b', keywords: '[]' },
  ];

  const insert = db.prepare('INSERT INTO categories (user_id, name, icon, color, keywords, is_default) VALUES (?, ?, ?, ?, ?, 1)');
  for (const cat of defaults) {
    insert.run(userId, cat.name, cat.icon, cat.color, cat.keywords);
  }
}

export function initDb() {
  getDb();
  console.log('✅ Database ready at:', dbPath);
}

// ==================== USER OPS ====================
export function getUser(username, password) {
  const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) return null;
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
  if (data.password) db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(data.password, 10), id);
  if (data.displayName !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(data.displayName, id);
  if (data.username !== undefined) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(data.username, id);
}
export function getAllUsers() {
  return getDb().prepare('SELECT id, username, display_name FROM users').all();
}

// ==================== CATEGORY OPS ====================
export function getCategories(userId) {
  return getDb().prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY created_at').all(userId);
}
export function getCategoryById(id, userId) {
  return getDb().prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(id, userId);
}
export function createCategory(userId, data) {
  const result = getDb().prepare('INSERT INTO categories (user_id, name, icon, color, keywords) VALUES (?, ?, ?, ?, ?)').run(userId, data.name, data.icon || '📦', data.color || '#64748b', JSON.stringify(data.keywords || []));
  return result.lastInsertRowid;
}
export function updateCategory(id, userId, data) {
  const existing = getCategoryById(id, userId);
  if (!existing) return false;
  const fields = [];
  const params = [];
  if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
  if (data.icon !== undefined) { fields.push('icon = ?'); params.push(data.icon); }
  if (data.color !== undefined) { fields.push('color = ?'); params.push(data.color); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); params.push(JSON.stringify(data.keywords)); }
  if (fields.length === 0) return true;
  params.push(id, userId);
  getDb().prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
  return true;
}
export function deleteCategory(id, userId) {
  const db = getDb();
  const existing = getCategoryById(id, userId);
  if (!existing || existing.is_default) return false;
  const fallback = db.prepare("SELECT id FROM categories WHERE user_id = ? AND name = 'أخرى'").get(userId);
  if (fallback) {
    db.prepare('UPDATE transactions SET category_id = ?, category = ? WHERE category_id = ? AND user_id = ?').run(fallback.id, 'أخرى', id, userId);
  }
  db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(id, userId);
  return true;
}

// ==================== TRANSACTION OPS ====================
export function addTransaction(tx) {
  const result = getDb().prepare(`
    INSERT INTO transactions (raw_message, amount, type, category, category_id, description, withdrawal_purpose, user_id, source_timestamp, month_key, needs_review, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tx.rawMessage, tx.amount, tx.type, tx.category, tx.categoryId || null, tx.description, tx.withdrawalPurpose, tx.userId, tx.sourceTimestamp, tx.monthKey, tx.needsReview, tx.confidence);
  return result.lastInsertRowid;
}
export function getTransactions(userId, filters = {}) {
  let query = 'SELECT t.*, c.icon as cat_icon, c.color as cat_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ?';
  const params = [userId];
  if (filters.type) { query += ' AND t.type = ?'; params.push(filters.type); }
  if (filters.category) { query += ' AND t.category = ?'; params.push(filters.category); }
  if (filters.categoryId) { query += ' AND t.category_id = ?'; params.push(filters.categoryId); }
  if (filters.monthKey) { query += ' AND t.month_key = ?'; params.push(filters.monthKey); }
  query += ' ORDER BY t.source_timestamp DESC';
  if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }
  return getDb().prepare(query).all(...params);
}
export function updateTransactionDate(id, userId, date, monthKey) {
  return getDb().prepare('UPDATE transactions SET source_timestamp = ?, month_key = ? WHERE id = ? AND user_id = ?').run(date, monthKey, id, userId).changes > 0;
}
export function deleteTransaction(id, userId) {
  return getDb().prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

// ==================== SETTINGS OPS ====================
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
