import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { initDb, getDb, getUser, getUserById, getUserByIdFull, updateUser, getAllUsers, getCategories, getCategoryById, createCategory, updateCategory, deleteCategory, addTransaction, getTransactions, updateTransactionDate, deleteTransaction, getSetting, setSetting, getUserSettings, dbPath } from './database.js';
import SqliteSessionStore from './sessions.js';
import { getAIResponse } from './aiProviders.js';
import { getSmartAnswer } from './analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
const app = express();
app.set('trust proxy', 1); // Must be before session middleware
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// ==================== INIT DB FIRST ====================
initDb();

// ==================== SESSION (SQLite-backed, persists across restarts) ====================
app.use(session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'expense-tracker-secret-change-me-in-prod',
  resave: false,
  saveUninitialized: false,
  name: 'sid',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'محاولات كتير' } });

// ==================== AUTH ====================
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'مطلوب' });
  const user = getUser(username, password);
  if (!user) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غلط' });
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.displayName = user.display_name;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ success: true, user: { id: user.id, username: user.username, displayName: user.display_name } });
  });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => { res.clearCookie('sid'); res.json({ success: true }); }); });

app.get('/api/auth/check', (req, res) => {
  res.json({ isAuthenticated: !!req.session?.userId, user: req.session?.userId ? { id: req.session.userId, username: req.session.username, displayName: req.session.displayName } : null });
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/check') return next();
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// ==================== USERS ====================
app.get('/api/users', (req, res) => { const u = getUserById(req.session.userId); res.json(u ? [u] : []); });
app.put('/api/users/profile', (req, res) => { updateUser(req.session.userId, { displayName: req.body.displayName }); req.session.displayName = req.body.displayName; res.json({ success: true }); });
app.put('/api/users/password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword || newPassword.length < 4) return res.status(400).json({ error: 'مطلوب' });
  const user = getUserByIdFull(req.session.userId);
  if (!getUser(user.username, oldPassword)) return res.status(400).json({ error: 'كلمة المرور القديمة غلط' });
  updateUser(req.session.userId, { password: newPassword }); res.json({ success: true });
});
app.put('/api/users/username', (req, res) => {
  const { newUsername, currentPassword } = req.body;
  if (!newUsername || !currentPassword) return res.status(400).json({ error: 'مطلوب' });
  const user = getUserByIdFull(req.session.userId);
  if (!getUser(user.username, currentPassword)) return res.status(400).json({ error: 'كلمة المرور غلط' });
  const trimmed = newUsername.trim().toLowerCase();
  if (trimmed.length < 3) return res.status(400).json({ error: 'قصير جدًا' });
  const existing = getDb().prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(trimmed, req.session.userId);
  if (existing) return res.status(409).json({ error: 'مستخدم بالفعل' });
  getDb().prepare('UPDATE users SET username = ? WHERE id = ?').run(trimmed, req.session.userId);
  req.session.username = trimmed; res.json({ success: true, username: trimmed });
});

// ==================== CATEGORIES ====================
app.get('/api/categories', (req, res) => { res.json(getCategories(req.session.userId)); });
app.post('/api/categories', (req, res) => {
  const { name, icon, color, keywords } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الفئة مطلوب' });
  const id = createCategory(req.session.userId, { name, icon, color, keywords });
  res.json({ success: true, id });
});
app.put('/api/categories/:id', (req, res) => {
  if (!updateCategory(parseInt(req.params.id), req.session.userId, req.body))
    return res.status(404).json({ error: 'فئة غير موجودة' });
  res.json({ success: true });
});
app.delete('/api/categories/:id', (req, res) => {
  if (!deleteCategory(parseInt(req.params.id), req.session.userId))
    return res.status(400).json({ error: 'مش هقدر أمسح الفئة دي' });
  res.json({ success: true });
});

// ==================== CHAT ====================
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'مطلوب' });
    const text = message.trim();
    const userId = req.session.userId;
    const categories = getCategories(userId);
    const transactions = getTransactions(userId, { limit: 500 });
    const settings = getUserSettings(userId);
    const user = getUserById(userId);

    const ai = await getAIResponse(text, { categories, settings, user });

    const monthKey = (ai.date || new Date()).toISOString().slice(0, 7);
    const sourceTimestamp = (ai.date || new Date()).toISOString();

    switch (ai.action) {
      case 'log_expense': {
        const cat = categories.find(c => c.name === ai.category) || categories.find(c => c.name === 'أخرى');
        addTransaction({
          rawMessage: text, amount: ai.amount, type: 'expense',
          category: cat?.name || 'أخرى', categoryId: cat?.id,
          description: ai.description || cat?.name || '', withdrawalPurpose: null,
          userId, sourceTimestamp, monthKey, needsReview: 0, confidence: 0.9
        });
        io.emit('new_transaction', { amount: ai.amount, type: 'expense', category: cat?.name, raw_message: text, month_key: monthKey, user_id: userId });
        return res.json({ type: 'transaction', message: `✅ اتسجل ${ai.amount} ج.م تحت ${cat?.icon || ''} ${cat?.name || 'أخرى'}\n📝 ${ai.description || ''}` });
      }
      case 'log_withdrawal': {
        addTransaction({
          rawMessage: text, amount: ai.amount, type: 'withdrawal',
          category: 'أخرى', categoryId: categories.find(c => c.name === 'أخرى')?.id,
          description: ai.purpose || 'سحب من الراتب', withdrawalPurpose: ai.purpose || null,
          userId, sourceTimestamp, monthKey, needsReview: 0, confidence: 0.9
        });
        io.emit('new_transaction', { amount: ai.amount, type: 'withdrawal', category: 'أخرى', raw_message: text, month_key: monthKey, user_id: userId });
        const purpose = ai.purpose ? `\n🎯 عشان: ${ai.purpose}` : '';
        return res.json({ type: 'transaction', message: `🏧 سحبت ${ai.amount} ج.م${purpose}` });
      }
      case 'log_salary': {
        addTransaction({
          rawMessage: text, amount: ai.amount, type: 'salary',
          category: 'أخرى', categoryId: categories.find(c => c.name === 'أخرى')?.id,
          description: 'راتب', withdrawalPurpose: null,
          userId, sourceTimestamp, monthKey, needsReview: 0, confidence: 0.95
        });
        io.emit('new_transaction', { amount: ai.amount, type: 'salary', raw_message: text, month_key: monthKey, user_id: userId });
        return res.json({ type: 'transaction', message: `💵 راتب ${ai.amount} ج.م اتسجل` });
      }
      case 'question': {
        const answer = getSmartAnswer(text, transactions, settings, user, categories);
        return res.json({ type: 'answer', message: answer });
      }
      default:
        return res.json({ type: 'answer', message: ai.reply || '🤖 مش فاهم. جرب "صرفت 50 أكل" أو "رصيدي كام؟"' });
    }
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Error' });
  }
});


// ==================== TRANSACTIONS ====================
app.post('/api/transactions', (req, res) => {
  const { amount, category_id, description, type = 'expense' } = req.body;
  if (!amount) return res.status(400).json({ error: 'المبلغ مطلوب' });
  const userId = req.session.userId;
  const categories = getCategories(userId);
  const cat = categories.find(c => c.id === category_id) || categories.find(c => c.name === 'أخرى');
  const monthKey = new Date().toISOString().slice(0, 7);
  const id = addTransaction({
    rawMessage: description || `${cat?.name || 'أخرى'} ${amount}`,
    amount, type, category: cat?.name || 'أخرى', categoryId: category_id || cat?.id,
    description: description || cat?.name || '', withdrawalPurpose: null,
    userId, sourceTimestamp: new Date().toISOString(), monthKey,
    needsReview: 0, confidence: 1.0
  });
  io.emit('new_transaction', { amount, type, category: cat?.name, raw_message: description, month_key: monthKey, user_id: userId });
  res.json({ success: true, id });
});

app.get('/api/transactions', (req, res) => {
  const { type, category, month, limit = 100 } = req.query;
  const filters = { limit: parseInt(limit) };
  if (type) filters.type = type;
  if (category) filters.category = category;
  if (month) filters.monthKey = month;
  res.json({ transactions: getTransactions(req.session.userId, filters), pagination: { total: 0 } });
});

app.put('/api/transactions/:id/date', (req, res) => {
  const newDate = new Date(req.body.date);
  if (!updateTransactionDate(req.params.id, req.session.userId, newDate.toISOString(), newDate.toISOString().slice(0, 7)))
    return res.status(404).json({ error: 'معاملة غير موجودة' });
  res.json({ success: true });
});

app.delete('/api/transactions/:id', (req, res) => {
  if (!deleteTransaction(req.params.id, req.session.userId))
    return res.status(404).json({ error: 'معاملة غير موجودة' });
  res.json({ success: true });
});

// ==================== SUMMARY & CHARTS ====================
app.get('/api/summary', (req, res) => {
  const userId = req.session.userId;
  const monthKey = req.query.month || new Date().toISOString().slice(0, 7);
  const transactions = getTransactions(userId, { monthKey, limit: 1000 });
  const settings = getUserSettings(userId);
  const categories = getCategories(userId);
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const withdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const salary = transactions.filter(t => t.type === 'salary').reduce((s, t) => s + (t.amount || 0), 0);
  const balance = (salary + settings.monthly_balance) - withdrawals;
  const breakdown = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const key = t.category || 'أخرى';
    if (!breakdown[key]) {
      const cat = categories.find(c => c.id === t.category_id) || { name: key, icon: '📦', color: '#64748b' };
      breakdown[key] = { category: key, category_id: t.category_id, icon: cat.icon, color: cat.color, total: 0, count: 0 };
    }
    breakdown[key].total += t.amount || 0; breakdown[key].count++;
  });
  res.json({ month: monthKey, totals: { salary: salary + settings.monthly_balance, expenses, withdrawals, balance }, breakdown: Object.values(breakdown), months: [monthKey] });
});

app.get('/api/charts/daily', (req, res) => {
  const transactions = getTransactions(req.session.userId, { monthKey: req.query.month || new Date().toISOString().slice(0, 7), limit: 1000 });
  const daily = {};
  transactions.forEach(t => {
    const date = t.source_timestamp?.slice(0, 10); if (!date) return;
    if (!daily[date]) daily[date] = { date, expenses: 0, withdrawals: 0 };
    if (t.type === 'expense') daily[date].expenses += t.amount || 0;
    if (t.type === 'withdrawal') daily[date].withdrawals += t.amount || 0;
  });
  res.json(Object.values(daily));
});

// ==================== SETTINGS ====================
app.get('/api/settings', (req, res) => res.json(getUserSettings(req.session.userId)));
app.put('/api/settings', (req, res) => { for (const [k, v] of Object.entries(req.body)) setSetting(`${k}_${req.session.userId}`, String(v)); res.json({ success: true }); });

// ==================== FRONTEND ====================
const possiblePaths = [path.join(process.cwd(), 'frontend/dist'), path.join(__dirname, '../../frontend/dist')];
let frontendPath = null;
for (const p of possiblePaths) { if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) { frontendPath = p; break; } }
if (frontendPath) { app.use(express.static(frontendPath)); app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html'))); }
else { app.get('*', (req, res) => res.status(500).json({ error: 'Frontend not built' })); }

io.on('connection', s => s.on('disconnect', () => {}));
httpServer.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`📂 DB: ${dbPath}`);
});
process.on('uncaughtException', e => console.error(e.message));
process.on('unhandledRejection', e => console.error(e?.message));
