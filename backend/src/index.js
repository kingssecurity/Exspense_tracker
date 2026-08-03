import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDb, getUser, getUserById, updateUser, getAllUsers, addTransaction, getTransactions, updateTransactionDate, deleteTransaction, getSetting, setSetting, getUserSettings } from './database.js';
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

// ==================== API ROUTES ====================

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Auth
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = getUser(username, password);
  if (user) {
    req.session.auth = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.display_name;
    return res.json({ success: true, user: { id: user.id, username: user.username, displayName: user.display_name } });
  }
  res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
});

app.post('/api/auth/logout', (req, res) => { 
  req.session.auth = false; 
  req.session.userId = null;
  res.json({ success: true }); 
});

app.get('/api/auth/check', (req, res) => res.json({ 
  isAuthenticated: req.session?.auth === true,
  user: req.session?.userId ? { id: req.session.userId, username: req.session.username, displayName: req.session.displayName } : null
}));

// Auth middleware for protected routes
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/check') return next();
  if (!req.session?.auth) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Users
app.get('/api/users', (req, res) => res.json(getAllUsers()));

app.put('/api/users/:id/password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.params.id;
  const user = getUserById(userId);
  if (!user || user.password !== oldPassword) {
    return res.status(400).json({ error: 'كلمة المرور القديمة غلط' });
  }
  updateUser(userId, { password: newPassword });
  res.json({ success: true });
});

app.put('/api/users/:id', (req, res) => {
  const { displayName } = req.body;
  updateUser(req.params.id, { displayName });
  res.json({ success: true });
});

// Chat
app.post('/api/chat', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const text = message.trim();
    const userId = req.session.userId;

    const questionWords = ['كام', 'رصيد', 'متبقي', 'أكتر', 'تفصيل', 'اليوم', 'تحليل', 'نصيحة', 'ميزانية', 'هدف'];
    const isQuestion = questionWords.some(w => text.includes(w)) || text.includes('?') || text.includes('؟');

    if (isQuestion) {
      const transactions = getTransactions(userId, { limit: 500 });
      const settings = getUserSettings(userId);
      const user = getUserById(userId);
      return res.json({ type: 'answer', message: getSmartAnswer(text, transactions, settings, user) });
    }

    const analysis = analyzeMessage(text);
    const transactionDate = analysis.transactionDate || new Date();
    const monthKey = transactionDate.toISOString().slice(0, 7);

    addTransaction({
      rawMessage: text, amount: analysis.amount, type: analysis.type,
      category: analysis.category, description: analysis.description,
      withdrawalPurpose: analysis.withdrawalPurpose, userId,
      sourceTimestamp: transactionDate.toISOString(), monthKey,
      needsReview: analysis.needsReview ? 1 : 0, confidence: analysis.confidence
    });

    const emoji = analysis.type === 'expense' ? '💸' : analysis.type === 'withdrawal' ? '🏧' : '💵';
    const typeAr = analysis.type === 'expense' ? 'مصروف' : analysis.type === 'withdrawal' ? 'سحب' : 'راتب';
    const cats = { work:'شغل', home:'بيت', transport:'مواصلات', other:'أخرى' };
    const catAr = cats[analysis.category] || 'أخرى';
    const purpose = analysis.withdrawalPurpose ? `\n🎯 عشان: ${analysis.withdrawalPurpose}` : '';

    io.emit('new_transaction', { ...analysis, raw_message: text, month_key: monthKey });
    res.json({ type: 'transaction', message: `${emoji} ${typeAr}: ${analysis.amount || '?'} ج.م\n📂 ${catAr}\n📝 ${analysis.description}${purpose}` });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// Transactions
app.get('/api/transactions', (req, res) => {
  const { type, category, month, limit = 100 } = req.query;
  const filters = { limit: parseInt(limit) };
  if (type) filters.type = type;
  if (category) filters.category = category;
  if (month) filters.monthKey = month;
  const transactions = getTransactions(req.session.userId, filters);
  res.json({ transactions, pagination: { total: transactions.length } });
});

app.put('/api/transactions/:id/date', (req, res) => {
  const { date } = req.body;
  const newDate = new Date(date);
  updateTransactionDate(req.params.id, newDate.toISOString(), newDate.toISOString().slice(0, 7));
  res.json({ success: true });
});

app.delete('/api/transactions/:id', (req, res) => {
  try {
    console.log('Delete request for transaction:', req.params.id);
    deleteTransaction(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Summary
app.get('/api/summary', (req, res) => {
  const userId = req.session.userId;
  const monthKey = req.query.month || new Date().toISOString().slice(0, 7);
  const transactions = getTransactions(userId, { monthKey, limit: 1000 });
  const settings = getUserSettings(userId);

  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const withdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const salary = transactions.filter(t => t.type === 'salary').reduce((s, t) => s + (t.amount || 0), 0);
  const balance = (salary + settings.monthly_balance) - withdrawals;

  const breakdown = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    if (!breakdown[t.category]) breakdown[t.category] = { category: t.category, total: 0, count: 0 };
    breakdown[t.category].total += t.amount || 0;
    breakdown[t.category].count++;
  });

  res.json({ month: monthKey, totals: { salary: salary + settings.monthly_balance, expenses, withdrawals, balance }, breakdown: Object.values(breakdown), months: [monthKey] });
});

// Charts
app.get('/api/charts/daily', (req, res) => {
  const transactions = getTransactions(req.session.userId, { monthKey: req.query.month || new Date().toISOString().slice(0, 7), limit: 1000 });
  const daily = {};
  transactions.forEach(t => {
    const date = t.source_timestamp?.slice(0, 10);
    if (!date) return;
    if (!daily[date]) daily[date] = { date, expenses: 0, withdrawals: 0 };
    if (t.type === 'expense') daily[date].expenses += t.amount || 0;
    if (t.type === 'withdrawal') daily[date].withdrawals += t.amount || 0;
  });
  res.json(Object.values(daily));
});

// Settings
app.get('/api/settings', (req, res) => res.json(getUserSettings(req.session.userId)));
app.put('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) setSetting(`${key}_${req.session.userId}`, String(value));
  res.json({ success: true });
});

// ==================== SERVE FRONTEND ====================

// Find frontend build
const possiblePaths = [
  path.join(process.cwd(), 'frontend/dist'),
  path.join(__dirname, '../../frontend/dist'),
  path.join(__dirname, '../../../frontend/dist'),
];

let frontendPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    frontendPath = p;
    break;
  }
}

if (frontendPath) {
  console.log('📂 Serving frontend from:', frontendPath);
  
  // Serve static files
  app.use(express.static(frontendPath));
  
  // Catch-all: serve index.html for all non-API routes (MUST be after API routes)
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
} else {
  console.log('⚠️ Frontend not found at:', possiblePaths);
  // Only show this if no frontend is found
  app.get('/', (req, res) => {
    res.status(500).json({ error: 'Frontend not built' });
  });
}

// ==================== START SERVER ====================

io.on('connection', s => s.on('disconnect', () => {}));
initDb();
httpServer.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
process.on('uncaughtException', e => console.error(e.message));
process.on('unhandledRejection', e => console.error(e?.message));
