import session from 'express-session';
import { getDb } from './database.js';

// Proper SQLite session store extending express-session's Store
export default class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this.db = getDb();
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)');
    // Clean expired on startup
    this.cleanup();
  }

  cleanup() {
    try {
      this.db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
    } catch {}
  }

  get(sid, callback) {
    try {
      const row = this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?').get(sid, Date.now());
      if (!row) return callback(null, null);
      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const maxAge = sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      this.db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), expired);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const maxAge = sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?').run(expired, sid);
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }
}
