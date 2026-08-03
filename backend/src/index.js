import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initFirebase, getUser, getUserById, updateUser, getAllUsers, addTransaction, getTransactions, updateTransaction, deleteTransaction, getSetting, setSetting, getUserSettings } from './firebase.js';
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
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await getUser(username, password);
  if (user) {
    req.session.auth = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.displayName = user.displayName;
    return res.json({ success: true, user: { id: user.id, username: user.username, displayName: user.displayName } });
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

// Auth middleware
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/check') return next();
  if (!req.session?.auth) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Users management
app.get('/api/users', async (req, res) => {
  res.json(await getAllUsers());
});

app.put('/api/users/:id/password', async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.params.id;
  
  // Verify old password
  const user = await getUserById(userId);
  if (!user || user.password !== oldPassword) {
    return res.status(400).json({ error: 'كلمة المرور القديمة غلط' });
  }
  
  // Update password
  await updateUser(userId, { password: newPassword });
  res.json({ success: true, message: 'تم تغيير كلمة المرور' });
});

app.put('/api/users/:id', async (req, res) => {
  const { displayName } = req.body;
  await updateUser(req.params.id, { displayName });
  res.json({ success: true });
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const text = message.trim();
    const userId = req.session.userId;

    // Check if it's a question
    const questionWords = ['كام', 'قد ايه', 'رصيد', 'متبقي', 'باقي', 'أكتر', 'اكثر', 'تفصيل', 'تفاصيل', 'عدد', 'اليوم', 'نهارده', 'إيه', 'ايه', 'ازاي', 'ليه', 'امتى', 'تحليل', 'نصيحة', 'نصائح', 'ميزانية', 'هدف'];
    const isQuestion = questionWords.some(w => text.includes(w)) || text.includes('?') || text.includes('؟');

    if (isQuestion) {
      const transactions = await getTransactions(userId, { limit: 500 });
      const settings = await getUserSettings(userId);
      const user = await getUserById(userId);
      const answer = getSmartAnswer(text, transactions, settings, user);
      return res.json({ type: 'answer', message: answer });
    }

    // Analyze as expense
    const analysis = analyzeMessage(text);
    const transactionDate = analysis.transactionDate || new Date();
    const monthKey = transactionDate.toISOString().slice(0, 7);
    const sourceTimestamp = transactionDate.toISOString();

    await addTransaction({
      rawMessage: text,
      amount: analysis.amount,
      type: analysis.type,
      category: analysis.category,
      description: analysis.description,
      withdrawalPurpose: analysis.withdrawalPurpose,
      userId: userId,
      sourceTimestamp: sourceTimestamp,
      monthKey: monthKey,
      needsReview: analysis.needsReview ? 1 : 0,
      confidence: analysis.confidence
    });

    const emoji = analysis.type === 'expense' ? '💸' : analysis.type === 'withdrawal' ? '🏧' : '💵';
    const typeAr = analysis.type === 'expense' ? 'مصروف' : analysis.type === 'withdrawal' ? 'سحب' : 'راتب';
    const categoryNames = { work:'شغل', home:'بيت', transport:'مواصلات', health:'صحة', education:'تعليم', bills:'فواتير', shopping:'تسوق', entertainment:'ترفيه', other:'أخرى' };
    const catAr = categoryNames[analysis.category] || 'أخرى';
    const reviewNote = analysis.needsReview ? '\n⚠️ محتاج مراجعة' : '';
    const purposeNote = analysis.withdrawalPurpose ? `\n🎯 عشان: ${analysis.withdrawalPurpose}` : '';

    const responseMessage = `${emoji} ${typeAr}: ${analysis.amount || '?'} ج.م\n📂 ${catAr}\n📝 ${analysis.description}${purposeNote}${reviewNote}`;

    io.emit('new_transaction', { ...analysis, raw_message: text, month_key: monthKey, user_id: userId });
    res.json({ type: 'transaction', message: responseMessage, data: analysis });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Error processing message' });
  }
});

// Get transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const userId = req.session.userId;
    const { type, category, month, limit = 100 } = req.query;
    
    const filters = { limit: parseInt(limit) };
    if (type) filters.type = type;
    if (category) filters.category = category;
    if (month) filters.monthKey = month;
    
    const transactions = await getTransactions(userId, filters);
    res.json({ transactions, pagination: { total: transactions.length } });
  } catch (err) {
    console.error('Transactions error:', err.message);
    res.json({ transactions: [], pagination: { total: 0 } });
  }
});

// Summary
app.get('/api/summary', async (req, res) => {
  try {
    const userId = req.session.userId;
    const monthKey = req.query.month || new Date().toISOString().slice(0, 7);
    
    const transactions = await getTransactions(userId, { monthKey, limit: 1000 });
    
    const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
    const withdrawals = transactions.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
    const salary = transactions.filter(t => t.type === 'salary').reduce((s, t) => s + (t.amount || 0), 0);
    
    const settings = await getUserSettings(userId);
    const balance = (salary + settings.monthly_balance) - withdrawals;

    // Breakdown by category
    const breakdown = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      if (!breakdown[t.category]) breakdown[t.category] = { category: t.category, total: 0, count: 0 };
      breakdown[t.category].total += t.amount || 0;
      breakdown[t.category].count++;
    });

    res.json({ 
      month: monthKey, 
      totals: { salary: salary + settings.monthly_balance, expenses, withdrawals, balance }, 
      breakdown: Object.values(breakdown),
      months: [monthKey]
    });
  } catch (err) {
    console.error('Summary error:', err.message);
    res.json({ month: new Date().toISOString().slice(0,7), totals: { salary: 0, expenses: 0, withdrawals: 0, balance: 0 }, breakdown: [], months: [] });
  }
});

// Charts
app.get('/api/charts/daily', async (req, res) => {
  try {
    const userId = req.session.userId;
    const monthKey = req.query.month || new Date().toISOString().slice(0, 7);
    const transactions = await getTransactions(userId, { monthKey, limit: 1000 });
    
    const daily = {};
    transactions.forEach(t => {
      const date = t.sourceTimestamp?.slice(0, 10);
      if (!date) return;
      if (!daily[date]) daily[date] = { date, expenses: 0, withdrawals: 0 };
      if (t.type === 'expense') daily[date].expenses += t.amount || 0;
      if (t.type === 'withdrawal') daily[date].withdrawals += t.amount || 0;
    });
    
    res.json(Object.values(daily));
  } catch (err) {
    res.json([]);
  }
});

// Update transaction date
app.put('/api/transactions/:id/date', async (req, res) => {
  try {
    const { date } = req.body;
    const newDate = new Date(date);
    const monthKey = newDate.toISOString().slice(0, 7);
    
    await updateTransaction(req.params.id, {
      sourceTimestamp: newDate.toISOString(),
      monthKey: monthKey
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete transaction
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    await deleteTransaction(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Settings
app.get('/api/settings', async (req, res) => {
  const userId = req.session.userId;
  res.json(await getUserSettings(userId));
});

app.put('/api/settings', async (req, res) => {
  const userId = req.session.userId;
  for (const [key, value] of Object.entries(req.body)) {
    await setSetting(userId, key, String(value));
  }
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
  console.log('⚠️ Frontend not found');
  app.get('/', (req, res) => res.json({ message: 'API running', frontend: 'not built' }));
}

io.on('connection', s => { console.log('Connected'); s.on('disconnect', () => console.log('Disconnected')); });

// Initialize Firebase
await initFirebase();

httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

process.on('uncaughtException', e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', e => console.error('Unhandled:', e?.message));
