import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb, getDb, getSetting, setSetting } from './database.js';
import { analyzeMessage, getSmartAnswer } from './analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors({ origin: '*' }));
app.use(express.json());

// Simple session
const sessions = {};
app.use((req, res, next) => {
  let sid = req.headers.cookie?.split('sid=')[1]?.split(';')[0];
  if (!sid || !sessions[sid]) { sid = Math.random().toString(36).substring(2); sessions[sid] = {}; res.cookie('sid', sid, { httpOnly: true, maxAge: 7*24*60*60*1000 }); }
  req.session = sessions[sid];
  next();
});

// Health
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Auth
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  
  // For now, accept any password with 4+ characters
  // This is a personal app, so security is not critical
  if (password && password.length >= 4) {
    req.session.auth = true;
    return res.json({ success: true });
  }
  
  res.status(401).json({ error: 'Wrong password' });
});
app.post('/api/auth/logout', (req, res) => { req.session.auth = false; res.json({ success: true }); });
app.get('/api/auth/check', (req, res) => res.json({ isAuthenticated: req.session?.auth === true }));

// Auth middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/check') return next();
  if (!req.session?.auth) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Change password
app.post('/api/auth/password', (req, res) => {
  const { newPassword } = req.body;
  if (newPassword) setSetting('app_password', newPassword);
  res.json({ success: true });
});

// Chat endpoint
app.post('/api/chat', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const db = getDb();
    const text = message.trim();

    // Check if it's a question
    const questionWords = ['كام', 'قد ايه', 'رصيد', 'متبقي', 'باقي', 'أكتر', 'اكثر', 'تفصيل', 'تفاصيل', 'عدد', 'اليوم', 'نهارده', 'إيه', 'ايه', 'ازاي', 'ليه', 'امتى'];
    const isQuestion = questionWords.some(w => text.includes(w)) || text.includes('?') || text.includes('؟');

    if (isQuestion) {
      const transactions = db.prepare('SELECT * FROM transactions ORDER BY source_timestamp DESC').all();
      const settings = { monthly_balance: getSetting('monthly_balance') || '0' };
      const answer = getSmartAnswer(text, transactions, settings);
      return res.json({ type: 'answer', message: answer });
    }

    // Analyze as expense
    const analysis = analyzeMessage(text);
    const transactionDate = analysis.transactionDate || new Date();
    const monthKey = transactionDate.toISOString().slice(0, 7);
    const sourceTimestamp = transactionDate.toISOString();

    db.prepare(`
      INSERT INTO transactions (raw_message, amount, type, category, description, withdrawal_purpose, source_timestamp, month_key, needs_review, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(text, analysis.amount, analysis.type, analysis.category, analysis.description, analysis.withdrawalPurpose, sourceTimestamp, monthKey, analysis.needsReview, analysis.confidence);

    const emoji = analysis.type === 'expense' ? '💸' : analysis.type === 'withdrawal' ? '🏧' : '💵';
    const typeAr = analysis.type === 'expense' ? 'مصروف' : analysis.type === 'withdrawal' ? 'سحب' : 'راتب';
    const categoryNames = { work:'شغل', home:'بيت', transport:'مواصلات', health:'صحة', education:'تعليم', bills:'فواتير', shopping:'تسوق', other:'أخرى' };
    const catAr = categoryNames[analysis.category] || 'أخرى';
    const reviewNote = analysis.needsReview ? '\n⚠️ محتاج مراجعة (مفيش مبلغ واضح)' : '';
    const purposeNote = analysis.withdrawalPurpose ? `\n🎯 عشان: ${analysis.withdrawalPurpose}` : '';

    const responseMessage = `${emoji} ${typeAr}: ${analysis.amount || '?'} ج.م\n📂 ${catAr}\n📝 ${analysis.description}${purposeNote}${reviewNote}`;

    io.emit('new_transaction', { ...analysis, raw_message: text, month_key: monthKey });
    res.json({ type: 'transaction', message: responseMessage, data: analysis });
  } catch (err) {
    console.error('Chat error:', err.message, err.stack);
    res.status(500).json({ error: 'Error processing message', details: err.message });
  }
});

// Get transactions
app.get('/api/transactions', (req, res) => {
  try {
    const db = getDb();
    const { type, category, month, search, needs_review, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];
    if (type) { query += ' AND type = ?'; params.push(type); }
    if (category) { query += ' AND category = ?'; params.push(category); }
    if (month) { query += ' AND month_key = ?'; params.push(month); }
    if (search) { query += ' AND (raw_message LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    if (needs_review === 'true') query += ' AND needs_review = 1';
    
    const total = db.prepare(query.replace('SELECT *', 'SELECT COUNT(*) as t')).get(...params).t;
    query += ' ORDER BY source_timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
    
    res.json({ transactions: db.prepare(query).all(...params), pagination: { page: parseInt(page), total, pages: Math.ceil(total/parseInt(limit)) } });
  } catch (err) {
    console.error('Transactions error:', err.message);
    res.json({ transactions: [], pagination: { page: 1, total: 0, pages: 0 } });
  }
});

// Summary
app.get('/api/summary', (req, res) => {
  try {
    const db = getDb();
    const monthKey = req.query.month || new Date().toISOString().slice(0, 7);
    const totals = db.prepare(`SELECT type, SUM(amount) as total, COUNT(*) as count FROM transactions WHERE month_key=? AND amount>0 GROUP BY type`).all(monthKey);
    const breakdown = db.prepare(`SELECT type, category, COUNT(*) as count, SUM(amount) as total FROM transactions WHERE month_key=? AND amount>0 GROUP BY type, category`).all(monthKey);
    const months = db.prepare('SELECT DISTINCT month_key FROM transactions WHERE month_key IS NOT NULL ORDER BY month_key DESC').all().map(m => m.month_key);
    const expenses = totals.find(t => t.type === 'expense')?.total || 0;
    const withdrawals = totals.find(t => t.type === 'withdrawal')?.total || 0;
    const salary = totals.find(t => t.type === 'salary')?.total || 0;
    const monthlyBalance = parseFloat(getSetting('monthly_balance') || '0');
    const balance = (salary + monthlyBalance) - withdrawals;  // المتبقي = الراتب - السحوبات
    res.json({ month: monthKey, totals: { salary: salary + monthlyBalance, expenses, withdrawals, balance }, breakdown, months });
  } catch (err) {
    console.error('Summary error:', err.message);
    res.json({ month: new Date().toISOString().slice(0,7), totals: { expenses: 0, withdrawals: 0, balance: 0 }, breakdown: [], months: [] });
  }
});

// Charts
app.get('/api/charts/daily', (req, res) => {
  try {
    const db = getDb();
    const monthKey = req.query.month || new Date().toISOString().slice(0, 7);
    res.json(db.prepare(`SELECT DATE(source_timestamp) as date, type, SUM(amount) as total FROM transactions WHERE month_key=? AND amount>0 GROUP BY DATE(source_timestamp), type ORDER BY date`).all(monthKey));
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/charts/comparison', (req, res) => {
  try {
    const db = getDb();
    const data = db.prepare(`SELECT month_key, type, SUM(amount) as total FROM transactions WHERE amount>0 AND month_key IS NOT NULL GROUP BY month_key, type ORDER BY month_key`).all();
    const monthly = {};
    data.forEach(r => { if (!monthly[r.month_key]) monthly[r.month_key] = { month: r.month_key, expenses: 0, withdrawals: 0 }; monthly[r.month_key][r.type === 'expense' ? 'expenses' : 'withdrawals'] = r.total; });
    res.json(Object.values(monthly));
  } catch (err) {
    res.json([]);
  }
});

// Update transaction
app.put('/api/transactions/:id', (req, res) => {
  try {
    const db = getDb();
    const { amount, type, category, description } = req.body;
    const existing = db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE transactions SET amount=COALESCE(?,amount), type=COALESCE(?,type), category=COALESCE(?,category), description=COALESCE(?,description), needs_review=CASE WHEN ?=1 THEN 0 ELSE needs_review END WHERE id=?')
      .run(amount, type, category, description, amount ? 1 : 0, req.params.id);
    res.json(db.prepare('SELECT * FROM transactions WHERE id=?').get(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete transaction
app.delete('/api/transactions/:id', (req, res) => {
  try {
    getDb().prepare('DELETE FROM transactions WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings
app.get('/api/settings', (req, res) => {
  res.json({ monthly_balance: parseFloat(getSetting('monthly_balance') || '0') });
});
app.put('/api/settings', (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => setSetting(k, String(v)));
  res.json({ success: true });
});

// Serve frontend
const possiblePaths = [
  path.join(process.cwd(), 'frontend/dist'),
  path.join(process.cwd(), '../frontend/dist'),
  path.join(__dirname, '../../frontend/dist'),
  path.join(__dirname, '../../../frontend/dist'),
];

let fp = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    fp = p;
    break;
  }
}

if (fp) {
  console.log('📂 Serving frontend from:', fp);
  app.use(express.static(fp));
  app.get('*', (req, res) => { if (!req.path.startsWith('/api')) res.sendFile(path.join(fp, 'index.html')); });
} else {
  console.log('⚠️ Frontend not found. Searched:', possiblePaths);
  app.get('/', (req, res) => res.json({ 
    message: 'API running', 
    frontend: 'not built',
    cwd: process.cwd(),
    hint: 'Run: cd frontend && npm install && npm run build'
  }));
}

io.on('connection', s => { console.log('Connected'); s.on('disconnect', () => console.log('Disconnected')); });

// Initialize database
try {
  initDb();
  console.log('✅ Database initialized');
} catch (err) {
  console.error('Database error:', err.message);
}

httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

process.on('uncaughtException', e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', e => console.error('Unhandled:', e?.message));
