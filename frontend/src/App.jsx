import { useState, useEffect, useRef } from 'react';
import { FiSend, FiHome, FiList, FiBarChart2, FiSettings, FiMenu, FiX, FiLogOut, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

const categoryNames = { work:'شغل', home:'بيت', transport:'مواصلات', health:'صحة', education:'تعليم', bills:'فواتير', shopping:'تسوق', other:'أخرى' };
const categoryColors = { work:'#3b82f6', home:'#22c55e', transport:'#f59e0b', health:'#ef4444', education:'#8b5cf6', bills:'#ec4899', shopping:'#14b8a6', other:'#64748b' };

export default function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [password, setPassword] = useState('');
  const [page, setPage] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [monthlyBalance, setMonthlyBalance] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (isAuth) loadData(); }, [isAuth]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function checkAuth() {
    try { const r = await api.get('/auth/check'); setIsAuth(r.data.isAuthenticated); } catch {}
  }

  async function handleLogin(e) {
    e.preventDefault();
    try { await api.post('/auth/login', { password }); setIsAuth(true); } catch { alert('كلمة المرور غلط'); }
  }

  async function loadData() {
    try {
      const [tx, sum, daily, settings] = await Promise.all([
        api.get('/transactions?limit=100'),
        api.get('/summary'),
        api.get('/charts/daily'),
        api.get('/settings')
      ]);
      setTransactions(tx.data.transactions);
      setSummary(sum.data);
      setDailyData(daily.data);
      setMonthlyBalance(settings.data.monthly_balance || '');
    } catch {}
  }

  async function handleSaveSettings() {
    try {
      await api.put('/settings', { monthly_balance: monthlyBalance });
      alert('تم حفظ الإعدادات!');
      loadData();
    } catch { alert('حصل خطأ'); }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    try {
      const r = await api.post('/chat', { message: msg });
      setMessages(prev => [...prev, { role: 'bot', content: r.data.message }]);
      loadData();
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: '❌ حصل خطأ، جرب تاني' }]);
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('متأكد؟')) return;
    await api.delete(`/transactions/${id}`);
    loadData();
  }

  if (!isAuth) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">💰</div>
          <h1 className="text-3xl font-bold text-blue-400">مصروفاتي</h1>
          <p className="text-dark-400 mt-2">تتبع مصاريفك بسهولة</p>
        </div>
        <form onSubmit={handleLogin} className="card space-y-4">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="كلمة المرور" autoFocus />
          <button type="submit" className="btn-primary w-full">دخول</button>
        </form>
      </div>
    </div>
  );

  const COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

  return (
    <div className="min-h-screen flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      
      <aside className={`fixed inset-y-0 right-0 z-50 w-64 bg-dark-900 border-l border-dark-700 transform transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-dark-700">
            <h1 className="text-2xl font-bold text-blue-400">مصروفاتي 💰</h1>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden absolute top-4 left-4"><FiX /></button>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {[
              { id:'chat', icon:FiSend, label:'الشات' },
              { id:'dashboard', icon:FiHome, label:'الرئيسية' },
              { id:'transactions', icon:FiList, label:'المعاملات' },
              { id:'charts', icon:FiBarChart2, label:'تحليلات' },
              { id:'settings', icon:FiSettings, label:'الإعدادات' },
            ].map(item => (
              <button key={item.id} onClick={() => { setPage(item.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${page === item.id ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-dark-300 hover:bg-dark-800'}`}>
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-dark-700">
            <button onClick={() => { api.post('/auth/logout'); setIsAuth(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-dark-400 hover:bg-dark-800 hover:text-red-400">
              <FiLogOut className="w-5 h-5" /><span>خروج</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-screen">
        <header className="sticky top-0 z-30 bg-dark-900/80 backdrop-blur border-b border-dark-700 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)}><FiMenu className="w-6 h-6" /></button>
            <h1 className="text-lg font-bold text-blue-400">مصروفاتي</h1>
            <div className="w-6" />
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {/* Chat Page */}
          {page === 'chat' && (
            <div className="flex flex-col h-[calc(100vh-120px)]">
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {messages.length === 0 && (
                  <div className="text-center text-dark-400 mt-20">
                    <div className="text-5xl mb-4">💬</div>
                    <p className="text-xl font-bold mb-2">أهلاً!</p>
                    <p>ابعتلي مصروفك وأنا أسجله</p>
                    <div className="mt-6 space-y-2 text-sm">
                      <p className="bg-dark-800 inline-block px-3 py-1 rounded-lg">صرفت 150 جنيه أكل</p>
                      <p className="bg-dark-800 inline-block px-3 py-1 rounded-lg">سحبت 2000 من الراتب</p>
                      <p className="bg-dark-800 inline-block px-3 py-1 rounded-lg">رصيدي كام؟</p>
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl whitespace-pre-line ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-dark-800 text-dark-100 rounded-tl-sm'}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && <div className="flex justify-start"><div className="bg-dark-800 px-4 py-2.5 rounded-2xl rounded-tl-sm">⏳ بفكر...</div></div>}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSend} className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} className="input flex-1" placeholder="ابعت مصروفك أو اسألني سؤال..." disabled={loading} />
                <button type="submit" disabled={loading || !input.trim()} className="btn-primary px-5"><FiSend className="w-5 h-5" /></button>
              </form>
            </div>
          )}

          {/* Dashboard */}
          {page === 'dashboard' && summary && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">📊 ملخص الشهر</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card text-center"><p className="text-2xl font-bold text-green-400">{summary.totals.salary || 0}</p><p className="text-sm text-dark-400">💵 الراتب</p></div>
                <div className="card text-center"><p className="text-2xl font-bold text-yellow-400">{summary.totals.withdrawals}</p><p className="text-sm text-dark-400">🏧 سلف</p></div>
                <div className="card text-center"><p className={`text-2xl font-bold ${summary.totals.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>{summary.totals.balance}</p><p className="text-sm text-dark-400">💰 متبقي من الراتب</p></div>
                <div className="card text-center"><p className="text-2xl font-bold text-red-400">{summary.totals.expenses}</p><p className="text-sm text-dark-400">💸 مصروفات</p></div>
              </div>
              {summary.breakdown.length > 0 && (
                <div className="card">
                  <h3 className="font-bold mb-4">توزيع المصروفات</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart><Pie data={summary.breakdown.filter(b => b.type === 'expense').map(b => ({ name: categoryNames[b.category] || b.category, value: b.total }))} cx="50%" cy="50%" outerRadius={80} label={({name, percent}) => `${name} ${(percent*100).toFixed(0)}%`} dataKey="value">
                      {summary.breakdown.filter(b => b.type === 'expense').map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie><Tooltip formatter={v => `${v} ج.م`} contentStyle={{ background:'#1e293b', border:'1px solid #334155', borderRadius:8 }} /></PieChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="card">
                <h3 className="font-bold mb-3">آخر المعاملات</h3>
                {transactions.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-dark-700/50 last:border-0">
                    <div>
                      <p className="text-sm">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-dark-400">{categoryNames[t.category]}</span>
                        {t.withdrawal_purpose && <span className="text-xs text-blue-400">🎯 {t.withdrawal_purpose}</span>}
                      </div>
                    </div>
                    <div className="text-left">
                      <p className={`font-bold ${t.type === 'expense' ? 'text-red-400' : t.type === 'withdrawal' ? 'text-yellow-400' : 'text-green-400'}`}>{t.amount} ج.م</p>
                      <p className="text-xs text-dark-400">{t.type === 'expense' ? '💸' : t.type === 'withdrawal' ? '🏧' : '💵'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions */}
          {page === 'transactions' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">📋 المعاملات</h2>
              {transactions.length === 0 ? <p className="text-dark-400 text-center py-8">📭 مفيش معاملات</p> : transactions.map(t => (
                <div key={t.id} className="card flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm">{t.raw_message}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded ${t.type === 'expense' ? 'bg-red-500/20 text-red-400' : t.type === 'withdrawal' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{t.type === 'expense' ? 'مصروف' : t.type === 'withdrawal' ? 'سحب' : 'راتب'}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">{categoryNames[t.category]}</span>
                      {t.withdrawal_purpose && <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">🎯 {t.withdrawal_purpose}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`font-bold ${t.type === 'expense' ? 'text-red-400' : t.type === 'withdrawal' ? 'text-yellow-400' : 'text-green-400'}`}>{t.amount} ج.م</p>
                    <button onClick={() => handleDelete(t.id)} className="p-1 text-dark-400 hover:text-red-400"><FiTrash2 /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Settings */}
          {page === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">⚙️ الإعدادات</h2>
              <div className="card space-y-4">
                <h3 className="font-bold">💵 الراتب الشهري</h3>
                <p className="text-sm text-dark-400">حط راتبك هنا عشان يتحسبلك المتبقي بعد المصروفات</p>
                <div className="flex gap-2">
                  <input type="number" value={monthlyBalance} onChange={e => setMonthlyBalance(e.target.value)} className="input flex-1" placeholder="مثال: 10000" />
                  <button onClick={handleSaveSettings} className="btn-primary">حفظ</button>
                </div>
                <p className="text-xs text-dark-400">💡 ممكن تسجل راتبك كمان بالشات: "راتبي 10000"</p>
              </div>
              <div className="card space-y-4">
                <h3 className="font-bold">🔑 تغيير كلمة المرور</h3>
                <div className="flex gap-2">
                  <input type="password" id="newPassword" className="input flex-1" placeholder="كلمة مرور جديدة" />
                  <button onClick={async () => { const pw = document.getElementById('newPassword').value; if (pw) { await api.post('/auth/password', { newPassword: pw }); alert('تم التغيير!'); } }} className="btn-secondary">تغيير</button>
                </div>
              </div>
              <div className="card">
                <h3 className="font-bold mb-3">💡 أمثلة للتسجيل</h3>
                <div className="space-y-2 text-sm text-dark-300">
                  <p>• <span className="text-green-400">راتبي 10000</span> - لتسجيل الراتب</p>
                  <p>• <span className="text-red-400">صرفت 150 جنيه أكل</span> - لمصروف</p>
                  <p>• <span className="text-yellow-400">سحبت 2000 من الراتب عشان مصاريف البيت</span> - لسحب مع السبب</p>
                  <p>• <span className="text-blue-400">رصيدي كام؟</span> - لسؤال عن الرصيد</p>
                  <p>• <span className="text-purple-400">تفصيل المصاريف</span> - لتوزيع المصروفات</p>
                </div>
              </div>
            </div>
          )}

          {/* Charts */}
          {page === 'charts' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">📈 تحليلات</h2>
              {dailyData.length > 0 && (
                <div className="card">
                  <h3 className="font-bold mb-4">المصروفات اليومية</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={(() => { const grouped = {}; dailyData.forEach(d => { if (!grouped[d.date]) grouped[d.date] = { date: d.date, expenses: 0, withdrawals: 0 }; grouped[d.date][d.type === 'expense' ? 'expenses' : 'withdrawals'] += d.total; }); return Object.values(grouped); })()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey="date" stroke="#94a3b8" tickFormatter={v => new Date(v).getDate()} /><YAxis stroke="#94a3b8" /><Tooltip contentStyle={{ background:'#1e293b', border:'1px solid #334155', borderRadius:8 }} /><Bar dataKey="expenses" name="مصروفات" fill="#ef4444" /><Bar dataKey="withdrawals" name="مسحوبات" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
