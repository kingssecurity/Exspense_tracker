import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import SqliteStore from 'better-sqlite3-session-store';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { initDb, getDb, getUser, getUserById, getUserByIdFull, updateUser, getAllUsers, addTransaction, getTransactions, getTransactionById, updateTransactionDate, deleteTransaction, getSetting, setSetting, getUserSettings } from './database.js';
import { analyzeMessage, getSmartAnswer } from './analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ==================== SESSION (persisted in SQLite) ====================
const db = getDb();

app.use(session({
  store: new SqliteStore({
    client: db,
    expired: { clear: true, intervalMs: 900000 },
  }),
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// ==================== RATE LIMITING ====================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'محاولات كتير، جرب تاني بعد 15 دقيقة' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==================== API ROUTES ====================

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Auth
app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'مطلوب' });
  const user = getUser(username, password);
  if (!user) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
  
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.display_name;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      res.json({ success: true, user: { id: user.id, username: user.username, displayName: user.display_name } });
    });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie('sid');
    res.json({ success: true });
  });
});

app.get('/api/auth/check', (req, res) => {
  res.json({
    isAuthenticated: !!req.session?.userId,
    user: req.session?.userId ? { id: req.session.userId, username: req.session.username, displayName: req.session.displayName } : null
  });
});

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/check') return next();
  return requireAuth(req, res, next);
});

// ==================== USERS ====================

// Only return current user's own profile
app.get('/api/users', (req, res) => {
  const user = getUserById(req.session.userId);
  res.json(user ? [user] : []);
});

// Update own profile only
app.put('/api/users/profile', (req, res) => {
  const { displayName } = req.body;
  updateUser(req.session.userId, { displayName });
  req.session.displayName = displayName;
  res.json({ success: true });
});

// Change own password only
app.put('/api/users/password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: 'مطلوب' });
  if (newPassword.length < 4) return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة' });
  
  const user = getUserByIdFull(req.session.userId);
  if (!user) return res.status(404).json({ error: 'مستخدم غير موجود' });
  
  // Verify old password using the getUser function which does bcrypt check
  const verified = getUser(user.username, oldPassword);
  if (!verified) {
    return res.status(400).json({ error: 'كلمة المرور القديمة غلط' });
  }
  
  updateUser(req.session.userId, { password: newPassword });
  res.json({ success: true, message: 'تم تغيير كلمة المرور' });
});

// ==================== CHAT ====================

app.post('/api/chat', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'مطلوب' });
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
    const cats = { work:'شغل', home:'بيت', transport:'مواصلات', health:'صحة', education:'تعليم', bills:'فواتير', shopping:'تسوق', entertainment:'ترفيه', other:'أخرى' };
    const catAr = cats[analysis.category] || 'أخرى';
    const purpose = analysis.withdrawalPurpose ? `\n🎯 عشان: ${analysis.withdrawalPurpose}` : '';

    io.emit('new_transaction', { ...analysis, raw_message: text, month_key: monthKey, user_id: userId });
    res.json({ type: 'transaction', message: `${emoji} ${typeAr}: ${analysis.amount || '?'} ج.م\n📂 ${catAr}\n📝 ${analysis.description}${purpose}` });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Error' });
  }
});

// ==================== TRANSACTIONS ====================

app.get('/api/transactions', (req, res) => {
  const { type, category, month, limit = 100 } = req.query;
  const filters = { limit: parseInt(limit) };
  if (type) filters.type = type;
  if (category) filters.category = category;
  if (month) filters.monthKey = month;
  const transactions = getTransactions(req.session.userId, filters);
  res.json({ transactions, pagination: { total: transactions.length } });
});

// Secure: verify ownership before update
app.put('/api/transactions/:id/date', (req, res) => {
  const { date } = req.body;
  const newDate = new Date(date);
  const success = updateTransactionDate(req.params.id, req.session.userId, newDate.toISOString(), newDate.toISOString().slice(0, 7));
  if (!success) return res.status(404).json({ error: 'معاملة غير موجودة' });
  res.json({ success: true });
});

// Secure: verify ownership before delete
app.delete('/api/transactions/:id', (req, res) => {
  const success = deleteTransaction(req.params.id, req.session.userId);
  if (!success) return res.status(404).json({ error: 'معاملة غير موجودة' });
  res.json({ success: true });
});

// ==================== SUMMARY & CHARTS ====================

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

// ==================== SETTINGS ====================

app.get('/api/settings', (req, res) => res.json(getUserSettings(req.session.userId)));
app.put('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) setSetting(`${key}_${req.session.userId}`, String(value));
  res.json({ success: true });
});

// ==================== SERVE FRONTEND ====================

const possiblePaths = [
  path.join(process.cwd(), 'frontend/dist'),
  path.join(__dirname, '../../frontend/dist'),
];

let frontendPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    frontendPath = p;
    break;
  }
}

if (frontendPath) {
  app.use(express.static(frontendPath));
  app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));
} else {
  app.get('*', (req, res) => res.status(500).json({ error: 'Frontend not built' }));
}

// ==================== START ====================

io.on('connection', s => s.on('disconnect', () => {}));
initDb();
httpServer.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
process.on('uncaughtException', e => console.error(e.message));
process.on('unhandledRejection', e => console.error(e?.message));
