import { useState, useEffect, useRef } from 'react';
import {
  FiSend, FiHome, FiList, FiBarChart2, FiSettings, FiMenu, FiX,
  FiLogOut, FiEdit2, FiTrash2, FiUser, FiMic, FiCalendar, FiPlus,
  FiChevronLeft, FiAlertCircle, FiRefreshCw
} from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

const CATEGORIES = {
  food: { name: 'أكل', icon: '🍔', color: '#f59e0b', bg: '#fef3c7' },
  transport: { name: 'مواصلات', icon: '🚗', color: '#3b82f6', bg: '#dbeafe' },
  health: { name: 'صحة', icon: '💊', color: '#ec4899', bg: '#fce7f3' },
  bills: { name: 'فواتير', icon: '📄', color: '#6366f1', bg: '#e0e7ff' },
  shopping: { name: 'تسوق', icon: '🛍️', color: '#10b981', bg: '#d1fae5' },
  work: { name: 'شغل', icon: '💼', color: '#8b5cf6', bg: '#f3e8ff' },
  home: { name: 'بيت', icon: '🏠', color: '#f97316', bg: '#fff7ed' },
  entertainment: { name: 'ترفيه', icon: '🎮', color: '#ef4444', bg: '#fef2f2' },
  other: { name: 'أخرى', icon: '📦', color: '#64748b', bg: '#f1f5f9' },
};
const categoryNames = Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.name]));
const COLORS = ['#f59e0b','#3b82f6','#ec4899','#6366f1','#10b981','#8b5cf6','#f97316','#ef4444','#64748b'];

export default function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [page, setPage] = useState('home');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [monthlyBalance, setMonthlyBalance] = useState('');
  const [budgets, setBudgets] = useState({});
  const [savingsGoal, setSavingsGoal] = useState('');
  const [savingsSaved, setSavingsSaved] = useState('');
  const [editingUser, setEditingUser] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (isAuth) loadData(); }, [isAuth]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function checkAuth() {
    try {
      const r = await api.get('/auth/check');
      setIsAuth(r.data.isAuthenticated);
      if (r.data.user) setUser(r.data.user);
    } catch (err) {
      console.error('Auth check failed:', err);
      setIsAuth(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault(); setLoginError('');
    try {
      const r = await api.post('/auth/login', { username, password });
      setIsAuth(true); setUser(r.data.user);
    } catch (err) {
      setLoginError(err.response?.data?.error || 'خطأ في تسجيل الدخول');
    }
  }

  async function loadData() {
    setDataLoading(true);
    setDataError(null);

    // Fetch each independently so one failure doesn't block everything
    const results = await Promise.allSettled([
      api.get('/transactions?limit=200'),
      api.get('/summary'),
      api.get('/charts/daily'),
      api.get('/settings'),
    ]);

    const [txResult, sumResult, dailyResult, settingsResult] = results;

    // Debug: log all results
    console.log('loadData results:', results.map((r, i) => ({
      endpoint: ['/transactions', '/summary', '/charts/daily', '/settings'][i],
      status: r.status,
      error: r.status === 'rejected' ? r.reason?.message || r.reason : null,
      data: r.status === 'fulfilled' ? 'ok' : null,
    })));

    if (txResult.status === 'fulfilled') {
      setTransactions(txResult.value.data.transactions || []);
    } else {
      console.error('Transactions fetch failed:', txResult.reason?.response?.status, txResult.reason?.message);
    }

    if (sumResult.status === 'fulfilled') {
      setSummary(sumResult.value.data);
    } else {
      console.error('Summary fetch failed:', sumResult.reason?.response?.status, sumResult.reason?.message);
    }

    if (dailyResult.status === 'fulfilled') {
      setDailyData(dailyResult.value.data || []);
    } else {
      console.error('Daily charts fetch failed:', dailyResult.reason?.response?.status, dailyResult.reason?.message);
    }

    if (settingsResult.status === 'fulfilled') {
      const s = settingsResult.value.data;
      setMonthlyBalance(s.monthly_balance || '');
      setBudgets(s.budgets || {});
      setSavingsGoal(s.savings_goal || '');
      setSavingsSaved(s.savings_saved || '');
    } else {
      console.error('Settings fetch failed:', settingsResult.reason?.response?.status, settingsResult.reason?.message);
    }

    // If ALL failed, show error with details
    const failedEndpoints = results
      .filter(r => r.status === 'rejected')
      .map((r, i) => `${['transactions','summary','charts','settings'][i]}: ${r.reason?.response?.status || r.reason?.message}`);

    if (failedEndpoints.length === results.length) {
      setDataError(`فشل تحميل كل البيانات:\n${failedEndpoints.join('\n')}`);
    } else if (failedEndpoints.length > 0) {
      console.warn('Some endpoints failed:', failedEndpoints);
    }

    setDataLoading(false);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim(); setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }]);
    setLoading(true);
    try {
      const r = await api.post('/chat', { message: msg });
      setMessages(prev => [...prev, { role: 'bot', content: r.data.message, time: new Date() }]);
      loadData();
    } catch (err) {
      console.error('Chat error:', err);
      setMessages(prev => [...prev, { role: 'bot', content: '❌ حصل خطأ', time: new Date() }]);
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('متأكد من المسح؟')) return;
    try { await api.delete(`/transactions/${id}`); loadData(); } catch (err) { console.error(err); alert('حصل خطأ'); }
  }

  async function handleUpdateDate() {
    if (!editingTx || !editDate) return;
    try { await api.put(`/transactions/${editingTx.id}/date`, { date: editDate }); setEditingTx(null); setEditDate(''); loadData(); }
    catch (err) { console.error(err); alert('حصل خطأ'); }
  }

  async function handleSaveSettings() {
    try {
      await api.put('/settings', { monthly_balance: monthlyBalance, budgets: JSON.stringify(budgets), savings_goal: savingsGoal, savings_saved: savingsSaved });
      alert('تم الحفظ!'); loadData();
    } catch (err) { console.error(err); alert('حصل خطأ'); }
  }

  async function handleUpdateProfile() {
    try { await api.put('/users/profile', { displayName: newDisplayName }); setEditingUser(false); loadData(); }
    catch (err) { console.error(err); alert('حصل خطأ'); }
  }

  async function handleChangePassword() {
    if (!oldPassword || !newPassword) return alert('اكتبي القديم والجديد');
    try { await api.put('/users/password', { oldPassword, newPassword }); alert('تم التغيير!'); setOldPassword(''); setNewPassword(''); }
    catch (err) { console.error(err); alert(err.response?.data?.error || 'حصل خطأ'); }
  }

  async function handleChangeUsername() {
    if (!newUsername || !usernamePassword) return alert('اكتبي اسم الدخول الجديد وكلمة المرور');
    try {
      const r = await api.put('/users/username', { newUsername, currentPassword: usernamePassword });
      setUser(prev => ({ ...prev, username: r.data.username }));
      alert('تم تغيير اسم الدخول! سجلي دخول بالاسم الجديد');
      setNewUsername('');
      setUsernamePassword('');
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'حصل خطأ');
    }
  }

  function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('المتصفح مش بيدعم الصوت');
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR(); r.lang = 'ar-EG'; r.continuous = false; r.interimResults = true;
    r.onstart = () => setIsListening(true);
    r.onresult = (e) => { setInput(e.results[0][0].transcript); if (e.results[0].isFinal) setIsListening(false); };
    r.onerror = () => setIsListening(false);
    r.onend = () => setIsListening(false);
    r.start(); recognitionRef.current = r;
  }

  function fmt(d) { return d ? new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : ''; }
  function fmtTime(d) { return d ? new Date(d).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function fmtAmount(n) { return (n || 0).toLocaleString('ar-EG'); }

  function groupByDate(txs) {
    const groups = {};
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    txs.forEach(t => {
      const d = t.source_timestamp?.slice(0, 10) || 'unknown';
      const label = d === today ? 'النهارده' : d === yesterday ? 'إمبارح' : fmt(d);
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    });
    return groups;
  }

  // ==================== LOGIN ====================
  if (!isAuth) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-3xl flex items-center justify-center shadow-2xl">
            <span className="text-4xl">💰</span>
          </div>
          <h1 className="text-3xl font-bold text-white">مصروفاتي</h1>
          <p className="text-white/70 mt-1">تتبع مصاريفك بسهولة</p>
        </div>
        <form onSubmit={handleLogin} className="bg-white rounded-3xl p-6 shadow-2xl space-y-4">
          <div>
            <label className="block text-sm text-slate-500 mb-1.5 font-medium">اسم المستخدم</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-slate-500 mb-1.5 font-medium">كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" />
          </div>
          {loginError && <p className="text-red-500 text-sm text-center font-medium">{loginError}</p>}
          <button type="submit" className="btn-primary w-full">دخول</button>
        </form>
      </div>
    </div>
  );

  // ==================== LOADING STATE ====================
  if (dataLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-500">جاري التحميل...</p>
      </div>
    </div>
  );

  // ==================== ERROR STATE ====================
  if (dataError) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="text-center card max-w-sm">
        <FiAlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-700 font-bold mb-2">حصل خطأ</p>
        <p className="text-slate-500 text-sm mb-4">{dataError}</p>
        <button onClick={loadData} className="btn-primary">
          <FiRefreshCw className="w-4 h-4" /> إعادة المحاولة
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 px-4 pt-4 pb-6" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
              <FiUser className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white/70 text-xs">أهلاً</p>
              <p className="text-white font-bold">{user?.displayName || user?.username}</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center">
            <FiMenu className="w-5 h-5 text-white" />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="font-bold text-slate-800">مصروفاتي</p>
                <p className="text-xs text-slate-400">@{user?.username}</p>
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)}><FiX className="w-5 h-5 text-slate-400" /></button>
          </div>
          <nav className="space-y-1 flex-1">
            {[
              { id:'home', icon:FiHome, label:'الرئيسية' },
              { id:'transactions', icon:FiList, label:'المعاملات' },
              { id:'analytics', icon:FiBarChart2, label:'تحليلات' },
              { id:'settings', icon:FiSettings, label:'الإعدادات' },
            ].map(item => (
              <button key={item.id} onClick={() => { setPage(item.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-right ${page === item.id ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
                <item.icon className="w-5 h-5" /><span>{item.label}</span>
              </button>
            ))}
          </nav>
          <button onClick={() => { api.post('/auth/logout'); setIsAuth(false); setUser(null); setSummary(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50 transition-all">
            <FiLogOut className="w-5 h-5" /><span>خروج</span>
          </button>
        </div>
      </aside>

      {/* ==================== HOME ==================== */}
      {page === 'home' && summary && (
        <div className="px-4 -mt-2 space-y-4 animate-slide-up">
          {/* Balance Card */}
          <div className="card-gradient" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <p className="text-white/70 text-sm mb-1">المتبقي من الراتب</p>
            <p className="text-3xl font-bold text-white mb-4">{fmtAmount(summary.totals.balance)} <span className="text-lg font-normal">ج.م</span></p>
            <div className="flex gap-3">
              <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-white/60 text-xs">💵 الراتب</p>
                <p className="text-white font-bold text-sm">{fmtAmount(summary.totals.salary)}</p>
              </div>
              <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-white/60 text-xs">🏧 سلف</p>
                <p className="text-white font-bold text-sm">{fmtAmount(summary.totals.withdrawals)}</p>
              </div>
              <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-white/60 text-xs">💸 مصروفات</p>
                <p className="text-white font-bold text-sm">{fmtAmount(summary.totals.expenses)}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-3">
            <button onClick={() => setShowChat(true)} className="flex-1 btn bg-white shadow-sm border border-slate-100 text-slate-700 rounded-2xl">
              <FiPlus className="w-4 h-4" /> إضافة مصروف
            </button>
            <button onClick={() => setPage('analytics')} className="flex-1 btn bg-white shadow-sm border border-slate-100 text-slate-700 rounded-2xl">
              <FiBarChart2 className="w-4 h-4" /> تحليلات
            </button>
          </div>

          {/* Spending Breakdown */}
          {summary.breakdown.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-4">توزيع المصاريف</h3>
              <div className="flex items-center gap-4">
                <div className="w-36 h-36 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={summary.breakdown.map(b => ({ name: categoryNames[b.category] || b.category, value: b.total }))}
                        cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                        {summary.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => `${fmtAmount(v)} ج.م`} contentStyle={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  {summary.breakdown.sort((a,b) => b.total - a.total).map((b, i) => {
                    const cat = CATEGORIES[b.category] || CATEGORIES.other;
                    return (
                      <div key={b.category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-slate-600">{cat.icon} {cat.name}</span>
                        </div>
                        <span className="text-xs font-bold text-slate-800">{fmtAmount(b.total)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800">آخر المعاملات</h3>
              <button onClick={() => setPage('transactions')} className="text-sm text-blue-500 font-medium">عرض الكل</button>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <span className="text-4xl block mb-2">📭</span>
                <p>مفيش معاملات لسه</p>
              </div>
            ) : transactions.slice(0, 5).map(t => {
              const cat = CATEGORIES[t.category] || CATEGORIES.other;
              return (
                <div key={t.id} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: cat.bg }}>
                    {cat.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.description || t.raw_message}</p>
                    <p className="text-xs text-slate-400">{fmt(t.source_timestamp)}</p>
                  </div>
                  <p className={`font-bold text-sm ${t.type === 'expense' ? 'text-red-500' : t.type === 'withdrawal' ? 'text-amber-500' : 'text-green-500'}`}>
                    {t.type === 'expense' ? '-' : '+'}{fmtAmount(t.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== TRANSACTIONS ==================== */}
      {page === 'transactions' && (
        <div className="px-4 space-y-4 animate-slide-up">
          <h2 className="text-xl font-bold text-slate-800">المعاملات</h2>
          {transactions.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <span className="text-5xl block mb-3">📭</span><p>مفيش معاملات</p>
            </div>
          ) : Object.entries(groupByDate(transactions)).map(([dateLabel, txs]) => (
            <div key={dateLabel}>
              <p className="text-sm font-semibold text-slate-400 mb-2">{dateLabel}</p>
              <div className="card p-0 divide-y divide-slate-100 overflow-hidden">
                {txs.map(t => {
                  const cat = CATEGORIES[t.category] || CATEGORIES.other;
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-4 group">
                      <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: cat.bg }}>{cat.icon}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{t.description || t.raw_message}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-slate-400">{fmtTime(t.source_timestamp)}</span>
                          <button onClick={() => { setEditingTx(t); setEditDate(t.source_timestamp?.slice(0,10)||''); }} className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                            <FiCalendar className="w-3 h-3" /> تغيير التاريخ
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className={`font-bold text-sm ${t.type === 'expense' ? 'text-red-500' : t.type === 'withdrawal' ? 'text-amber-500' : 'text-green-500'}`}>
                          {t.type === 'expense' ? '-' : '+'}{fmtAmount(t.amount)}
                        </p>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                          <FiTrash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== ANALYTICS ==================== */}
      {page === 'analytics' && summary && (
        <div className="px-4 space-y-4 animate-slide-up">
          <h2 className="text-xl font-bold text-slate-800">تحليلات</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-gradient" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <p className="text-white/70 text-xs">الراتب</p>
              <p className="text-2xl font-bold text-white">{fmtAmount(summary.totals.salary)}</p>
              <p className="text-white/50 text-xs mt-1">حساب بنكي</p>
            </div>
            <div className="card-gradient" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
              <p className="text-white/70 text-xs">المصروفات</p>
              <p className="text-2xl font-bold text-white">{fmtAmount(summary.totals.expenses)}</p>
              <p className="text-white/50 text-xs mt-1">هذا الشهر</p>
            </div>
          </div>
          {summary.breakdown.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-2">توزيع المصاريف</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={summary.breakdown.map(b => ({ name: categoryNames[b.category] || b.category, value: b.total }))}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                      {summary.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={v => `${fmtAmount(v)} ج.م`} contentStyle={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {summary.breakdown.sort((a,b) => b.total - a.total).map((b, i) => {
                  const cat = CATEGORIES[b.category] || CATEGORIES.other;
                  const pct = summary.totals.expenses > 0 ? ((b.total / summary.totals.expenses) * 100).toFixed(0) : 0;
                  return (
                    <div key={b.category} className="flex items-center gap-2 p-2 rounded-xl" style={{ background: cat.bg }}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-slate-700 truncate">{cat.icon} {cat.name}</span>
                      <span className="text-xs font-bold text-slate-800 mr-auto">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {dailyData.length > 0 && (
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-3">المصروفات اليومية</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => { const g = {}; dailyData.forEach(d => { if (!g[d.date]) g[d.date] = { date: d.date, expenses: 0, withdrawals: 0 }; g[d.date][d.type==='expense'?'expenses':'withdrawals'] += d.total; }); return Object.values(g); })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" stroke="#94a3b8" tickFormatter={v => new Date(v).getDate()} fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:16, boxShadow:'0 4px 20px rgba(0,0,0,0.08)' }} />
                    <Bar dataKey="expenses" name="مصروفات" fill="#ef4444" radius={[6,6,0,0]} />
                    <Bar dataKey="withdrawals" name="سلف" fill="#f59e0b" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SETTINGS ==================== */}
      {page === 'settings' && (
        <div className="px-4 space-y-4 animate-slide-up">
          <h2 className="text-xl font-bold text-slate-800">الإعدادات</h2>
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">👤 الملف الشخصي</h3>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl mb-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                <FiUser className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-slate-800">{user?.displayName}</p>
                <p className="text-sm text-slate-400">@{user?.username}</p>
              </div>
              <button onClick={() => { setEditingUser(true); setNewDisplayName(user?.displayName || ''); }} className="mr-auto p-2 text-slate-400 hover:text-blue-500">
                <FiEdit2 className="w-4 h-4" />
              </button>
            </div>
            {editingUser && (
              <div className="space-y-3 p-3 bg-slate-50 rounded-2xl">
                <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="input" placeholder="الاسم" />
                <div className="flex gap-2">
                  <button onClick={handleUpdateProfile} className="btn-primary flex-1 text-sm">حفظ الاسم</button>
                  <button onClick={() => setEditingUser(false)} className="btn-secondary flex-1 text-sm">إلغاء</button>
                </div>
              </div>
            )}
          </div>
          {/* Change Username */}
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-1">✏️ تغيير اسم الدخول</h3>
            <p className="text-xs text-slate-400 mb-3">اسم المستخدم اللي بتستخدميه لتسجيل الدخول</p>
            <div className="space-y-3">
              <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value.toLowerCase().trim())} className="input" placeholder="اسم الدخول الجديد" />
              <input type="password" value={usernamePassword} onChange={e => setUsernamePassword(e.target.value)} className="input" placeholder="كلمة المرور الحالية (للتأكيد)" />
              <button onClick={handleChangeUsername} className="btn-primary w-full text-sm">تغيير اسم الدخول</button>
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">🔐 تغيير كلمة المرور</h3>
            <div className="space-y-3">
              <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="input" placeholder="كلمة المرور القديمة" />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input" placeholder="كلمة المرور الجديدة" />
              <button onClick={handleChangePassword} className="btn-primary w-full text-sm">تغيير كلمة المرور</button>
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">💵 الراتب الشهري</h3>
            <div className="flex gap-2">
              <input type="number" value={monthlyBalance} onChange={e => setMonthlyBalance(e.target.value)} className="input flex-1" />
              <button onClick={handleSaveSettings} className="btn-primary">حفظ</button>
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">🎯 ميزانيات</h3>
            <div className="space-y-2">
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 w-20">{cat.icon} {cat.name}</span>
                  <input type="number" value={budgets[key] || ''} onChange={e => setBudgets(prev => ({...prev, [key]: parseFloat(e.target.value)||0}))} className="input flex-1 text-sm" />
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">💰هدف التوفير</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 font-medium">الهدف</label>
                <input type="number" value={savingsGoal} onChange={e => setSavingsGoal(e.target.value)} className="input" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium">المتوفر</label>
                <input type="number" value={savingsSaved} onChange={e => setSavingsSaved(e.target.value)} className="input" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CHAT OVERLAY ==================== */}
      {showChat && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <header className="flex items-center gap-3 p-4 border-b border-slate-100">
            <button onClick={() => setShowChat(false)} className="p-2 hover:bg-slate-100 rounded-2xl"><FiChevronLeft className="w-5 h-5 text-slate-600" /></button>
            <h2 className="font-bold text-slate-800">الشات</h2>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 mt-20">
                <div className="w-16 h-16 mx-auto mb-4 rounded-3xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea20, #764ba220)' }}>
                  <span className="text-3xl">💬</span>
                </div>
                <p className="font-bold text-slate-600 mb-2">ابعتلي مصروفك</p>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {['راتبي 5000', 'سحبت 1000', 'صرفت 50 أكل', 'رصيدي كام؟'].map((ex, i) => (
                    <button key={i} onClick={() => setInput(ex)} className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-sm hover:bg-slate-200">{ex}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl whitespace-pre-line text-sm ${msg.role === 'user' ? 'text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}
                  style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #667eea, #764ba2)' } : {}}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-slate-100 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm text-slate-400">بفكر...</div></div>}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-slate-100 bg-white">
            <button type="button" onClick={startVoiceInput} className={`p-3 rounded-2xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-400'}`}>
              <FiMic className="w-5 h-5" />
            </button>
            <input value={input} onChange={e => setInput(e.target.value)} className="input flex-1" placeholder="اكتب هنا..." disabled={loading} />
            <button type="submit" disabled={loading || !input.trim()} className="p-3 rounded-2xl text-white disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
              <FiSend className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}

      {/* ==================== EDIT DATE MODAL ==================== */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={() => setEditingTx(null)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-800 mb-2">📅 تغيير التاريخ</h3>
            <p className="text-sm text-slate-500 mb-4">{editingTx.raw_message}</p>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="input mb-4" />
            <div className="flex gap-2">
              <button onClick={handleUpdateDate} className="btn-primary flex-1">حفظ</button>
              <button onClick={() => setEditingTx(null)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== BOTTOM NAV ==================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4">
        <div className="bg-white rounded-3xl shadow-lg shadow-black/5 border border-slate-100 flex items-center justify-around py-2 px-4 relative">
          {[
            { id:'home', icon:FiHome, label:'الرئيسية' },
            { id:'transactions', icon:FiList, label:'المعاملات' },
            { id:'analytics', icon:FiBarChart2, label:'تحليلات' },
            { id:'settings', icon:FiSettings, label:'الإعدادات' },
          ].map(item => (
            <button key={item.id} onClick={() => setPage(item.id)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-2xl transition-all ${page === item.id ? 'text-blue-600' : 'text-slate-400'}`}>
              <item.icon className="w-5 h-5" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
          <button onClick={() => setShowChat(true)}
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full text-white shadow-lg shadow-blue-500/30 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            <FiPlus className="w-6 h-6" />
          </button>
        </div>
      </nav>
    </div>
  );
}
