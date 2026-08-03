import { useState, useEffect, useRef } from 'react';
import { FiSend, FiHome, FiList, FiBarChart2, FiSettings, FiMenu, FiX, FiLogOut, FiEdit2, FiTrash2, FiUser, FiMic, FiCalendar } from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

const categoryNames = { work:'شغل', home:'بيت', transport:'مواصلات', health:'صحة', education:'تعليم', bills:'فواتير', shopping:'تسوق', entertainment:'ترفيه', other:'أخرى' };

export default function App() {
  const [isAuth, setIsAuth] = useState(false);
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [page, setPage] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [monthlyBalance, setMonthlyBalance] = useState('');
  const [budgets, setBudgets] = useState({});
  const [savingsGoal, setSavingsGoal] = useState('');
  const [savingsSaved, setSavingsSaved] = useState('');
  const [users, setUsers] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [editDate, setEditDate] = useState('');
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
    } catch {}
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    try { 
      const r = await api.post('/auth/login', { username, password }); 
      setIsAuth(true); 
      setUser(r.data.user);
    } catch (err) { 
      setLoginError(err.response?.data?.error || 'خطأ في تسجيل الدخول'); 
    }
  }

  async function loadData() {
    try {
      const [tx, sum, daily, settings, usersList] = await Promise.all([
        api.get('/transactions?limit=100'),
        api.get('/summary'),
        api.get('/charts/daily'),
        api.get('/settings'),
        api.get('/users')
      ]);
      setTransactions(tx.data.transactions);
      setSummary(sum.data);
      setDailyData(daily.data);
      setMonthlyBalance(settings.data.monthly_balance || '');
      setBudgets(settings.data.budgets || {});
      setSavingsGoal(settings.data.savings_goal || '');
      setSavingsSaved(settings.data.savings_saved || '');
      setUsers(usersList.data);
    } catch {}
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, time: new Date() }]);
    setLoading(true);
    try {
      const r = await api.post('/chat', { message: msg });
      setMessages(prev => [...prev, { role: 'bot', content: r.data.message, time: new Date() }]);
      loadData();
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: '❌ حصل خطأ، جرب تاني', time: new Date() }]);
    }
    setLoading(false);
  }

  async function handleDelete(id) {
    if (!confirm('متأكد؟')) return;
    await api.delete(`/transactions/${id}`);
    loadData();
  }

  async function handleUpdateDate() {
    if (!editingTx || !editDate) return;
    try {
      await api.put(`/transactions/${editingTx.id}/date`, { date: editDate });
      setEditingTx(null);
      setEditDate('');
      loadData();
    } catch { alert('حصل خطأ'); }
  }

  async function handleSaveSettings() {
    try {
      await api.put('/settings', { 
        monthly_balance: monthlyBalance,
        budgets: JSON.stringify(budgets),
        savings_goal: savingsGoal,
        savings_saved: savingsSaved
      });
      alert('تم حفظ الإعدادات!');
      loadData();
    } catch { alert('حصل خطأ'); }
  }

  async function handleUpdateUser(userId) {
    try {
      // Update display name
      if (newDisplayName) {
        await api.put(`/users/${userId}`, { displayName: newDisplayName });
      }
      
      // Update password (requires old password)
      if (newPassword) {
        if (!oldPassword) {
          alert('اكتب كلمة المرور القديمة');
          return;
        }
        await api.put(`/users/${userId}/password`, { oldPassword, newPassword });
      }
      
      alert('تم التحديث!');
      setEditingUser(null);
      setNewPassword('');
      setOldPassword('');
      setNewDisplayName('');
      loadData();
    } catch (err) { 
      alert(err.response?.data?.error || 'حصل خطأ'); 
    }
  }

  function updateBudget(category, value) {
    setBudgets(prev => ({ ...prev, [category]: parseFloat(value) || 0 }));
  }

  function startVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('المتصفح مش بيدعم الإدخال الصوتي. جرب Chrome');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      if (event.results[0].isFinal) {
        setIsListening(false);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert('رجاء اسمحي بالوصول للميكروفون');
      }
    };
    
    recognition.onend = () => setIsListening(false);

    recognition.start();
    recognitionRef.current = recognition;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }

  if (!isAuth) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-dark-950 to-dark-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <span className="text-4xl">💰</span>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">مصروفاتي</h1>
          <p className="text-dark-400 mt-2">تتبع مصاريفك بسهولة</p>
        </div>
        <form onSubmit={handleLogin} className="card space-y-4 bg-dark-800/80 backdrop-blur">
          <div>
            <label className="block text-sm text-dark-400 mb-1">اسم المستخدم</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="input" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-1">كلمة المرور</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" />
          </div>
          {loginError && <p className="text-red-400 text-sm text-center">{loginError}</p>}
          <button type="submit" className="btn-primary w-full bg-gradient-to-r from-blue-600 to-purple-600">دخول</button>
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
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">مصروفاتي</h1>
                <p className="text-xs text-dark-400">{user?.displayName || user?.username}</p>
              </div>
            </div>
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
              <button key={item.id} onClick={() => { setPage(item.id); setSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${page === item.id ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-blue-400 border border-blue-500/30' : 'text-dark-300 hover:bg-dark-800'}`}>
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-dark-700">
            <button onClick={() => { api.post('/auth/logout'); setIsAuth(false); setUser(null); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-dark-400 hover:bg-dark-800 hover:text-red-400">
              <FiLogOut className="w-5 h-5" /><span>خروج</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-screen">
        <header className="sticky top-0 z-30 bg-dark-900/80 backdrop-blur border-b border-dark-700 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)}><FiMenu className="w-6 h-6" /></button>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">مصروفاتي</h1>
            <div className="w-6" />
          </div>
        </header>

        <div className="p-4 md:p-6 max-w-4xl mx-auto">
          {/* Chat Page */}
          {page === 'chat' && (
            <div className="flex flex-col h-[calc(100vh-120px)]">
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 px-2">
                {messages.length === 0 && (
                  <div className="text-center text-dark-400 mt-20">
                    <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center">
                      <span className="text-4xl">💬</span>
                    </div>
                    <p className="text-xl font-bold mb-2">أهلاً {user?.displayName || user?.username}!</p>
                    <p className="mb-6">ابعتلي مصروفك وأنا أسجله</p>
                    <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                      {['راتبي 16500', 'سحبت 3000', 'صرفت 150 أكل', 'رصيدي كام؟'].map((ex, i) => (
                        <button key={i} onClick={() => setInput(ex)} className="bg-dark-800 px-3 py-2 rounded-xl text-sm hover:bg-dark-700 transition-all">
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-2' : ''}`}>
                      <div className={`px-4 py-2.5 rounded-2xl whitespace-pre-line ${msg.role === 'user' ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-tr-sm' : 'bg-dark-800 text-dark-100 rounded-tl-sm'}`}>
                        {msg.content}
                      </div>
                      <p className={`text-xs text-dark-500 mt-1 ${msg.role === 'user' ? 'text-left' : 'text-right'}`}>
                        {formatTime(msg.time)}
                      </p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-dark-800 px-4 py-2.5 rounded-2xl rounded-tl-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-dark-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-dark-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}} />
                        <div className="w-2 h-2 bg-dark-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSend} className="flex gap-2 p-2 bg-dark-900/50 rounded-2xl">
                <button type="button" onClick={startVoiceInput} className={`p-3 rounded-xl transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-dark-800 text-dark-400 hover:text-white'}`}>
                  <FiMic className="w-5 h-5" />
                </button>
                <input value={input} onChange={e => setInput(e.target.value)} className="input flex-1 border-0 bg-dark-800" placeholder="اكتب هنا..." disabled={loading} />
                <button type="submit" disabled={loading || !input.trim()} className="p-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white disabled:opacity-50">
                  <FiSend className="w-5 h-5" />
                </button>
              </form>
            </div>
          )}

          {/* Dashboard */}
          {page === 'dashboard' && summary && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">📊 ملخص الشهر</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
                  <p className="text-2xl font-bold text-green-400">{summary.totals.salary || 0}</p>
                  <p className="text-sm text-dark-400">💵 الراتب</p>
                </div>
                <div className="card bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
                  <p className="text-2xl font-bold text-yellow-400">{summary.totals.withdrawals}</p>
                  <p className="text-sm text-dark-400">🏧 سلف</p>
                </div>
                <div className={`card bg-gradient-to-br ${summary.totals.balance >= 0 ? 'from-blue-500/10 to-blue-600/5 border-blue-500/20' : 'from-red-500/10 to-red-600/5 border-red-500/20'}`}>
                  <p className={`text-2xl font-bold ${summary.totals.balance >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{summary.totals.balance}</p>
                  <p className="text-sm text-dark-400">💰 متبقي</p>
                </div>
                <div className="card bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
                  <p className="text-2xl font-bold text-red-400">{summary.totals.expenses}</p>
                  <p className="text-sm text-dark-400">💸 مصروفات</p>
                </div>
              </div>
              <div className="card">
                <h3 className="font-bold mb-3">آخر المعاملات</h3>
                {transactions.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center justify-between py-3 border-b border-dark-700/50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'expense' ? 'bg-red-500/20' : t.type === 'withdrawal' ? 'bg-yellow-500/20' : 'bg-green-500/20'}`}>
                        {t.type === 'expense' ? '💸' : t.type === 'withdrawal' ? '🏧' : '💵'}
                      </div>
                      <div>
                        <p className="text-sm">{t.description}</p>
                        <p className="text-xs text-dark-400">{formatDate(t.source_timestamp)}</p>
                      </div>
                    </div>
                    <p className={`font-bold ${t.type === 'expense' ? 'text-red-400' : t.type === 'withdrawal' ? 'text-yellow-400' : 'text-green-400'}`}>{t.amount} ج.م</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions */}
          {page === 'transactions' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">📋 المعاملات</h2>
              {transactions.length === 0 ? (
                <div className="text-center py-12 text-dark-400">
                  <span className="text-5xl">📭</span>
                  <p className="mt-4">مفيش معاملات</p>
                </div>
              ) : transactions.map(t => (
                <div key={t.id} className="card group">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm">{t.raw_message}</p>
                      <div className="flex gap-2 mt-2 flex-wrap items-center">
                        <span className={`text-xs px-2 py-1 rounded-lg ${t.type === 'expense' ? 'bg-red-500/20 text-red-400' : t.type === 'withdrawal' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                          {t.type === 'expense' ? 'مصروف' : t.type === 'withdrawal' ? 'سحب' : 'راتب'}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400">{categoryNames[t.category]}</span>
                        <button onClick={() => { setEditingTx(t); setEditDate(t.source_timestamp?.slice(0, 10) || ''); }} className="text-xs px-2 py-1 rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 flex items-center gap-1">
                          <FiCalendar className="w-3 h-3" />
                          {formatDate(t.source_timestamp)}
                        </button>
                        {t.withdrawal_purpose && <span className="text-xs px-2 py-1 rounded-lg bg-purple-500/20 text-purple-400">🎯 {t.withdrawal_purpose}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className={`font-bold text-lg ${t.type === 'expense' ? 'text-red-400' : t.type === 'withdrawal' ? 'text-yellow-400' : 'text-green-400'}`}>{t.amount} ج.م</p>
                      <button onClick={() => handleDelete(t.id)} className="p-2 text-dark-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><FiTrash2 /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Edit Date Modal */}
          {editingTx && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setEditingTx(null)}>
              <div className="bg-dark-800 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <h3 className="font-bold text-lg mb-4">📅 تغيير التاريخ</h3>
                <p className="text-sm text-dark-400 mb-4">{editingTx.raw_message}</p>
                <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="input mb-4" />
                <div className="flex gap-2">
                  <button onClick={handleUpdateDate} className="btn-primary flex-1">حفظ</button>
                  <button onClick={() => setEditingTx(null)} className="btn-secondary flex-1">إلغاء</button>
                </div>
              </div>
            </div>
          )}

          {/* Settings */}
          {page === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">⚙️ الإعدادات</h2>
              
              <div className="card space-y-4">
                <h3 className="font-bold">👤 المستخدمين</h3>
                {users.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-dark-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                        <FiUser className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold">{u.display_name}</p>
                        <p className="text-sm text-dark-400">@{u.username}</p>
                      </div>
                    </div>
                    <button onClick={() => { setEditingUser(u.id); setNewDisplayName(u.display_name); }} className="btn-secondary text-sm">
                      <FiEdit2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                
                {editingUser && (
                  <div className="p-4 bg-dark-800 rounded-xl space-y-3">
                    <h4 className="font-bold">تعديل المستخدم</h4>
                    <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} className="input" placeholder="الاسم الجديد" />
                    <div className="border-t border-dark-700 pt-3 mt-3">
                      <p className="text-sm text-dark-400 mb-2">تغيير كلمة المرور:</p>
                      <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} className="input mb-2" placeholder="كلمة المرور القديمة" />
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="input" placeholder="كلمة المرور الجديدة" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateUser(editingUser)} className="btn-primary flex-1">حفظ</button>
                      <button onClick={() => { setEditingUser(null); setNewPassword(''); setOldPassword(''); setNewDisplayName(''); }} className="btn-secondary flex-1">إلغاء</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="card space-y-4">
                <h3 className="font-bold">💵 الراتب</h3>
                <div className="flex gap-2">
                  <input type="number" value={monthlyBalance} onChange={e => setMonthlyBalance(e.target.value)} className="input flex-1" />
                  <button onClick={handleSaveSettings} className="btn-primary">حفظ</button>
                </div>
              </div>

              <div className="card space-y-4">
                <h3 className="font-bold">🎯 ميزانيات</h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(categoryNames).map(([key, name]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-sm w-16">{name}</span>
                      <input type="number" value={budgets[key] || ''} onChange={e => updateBudget(key, e.target.value)} className="input flex-1" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="card space-y-4">
                <h3 className="font-bold">💰هدف التوفير</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-dark-400">الهدف</label>
                    <input type="number" value={savingsGoal} onChange={e => setSavingsGoal(e.target.value)} className="input" />
                  </div>
                  <div>
                    <label className="text-sm text-dark-400">المتوفر</label>
                    <input type="number" value={savingsSaved} onChange={e => setSavingsSaved(e.target.value)} className="input" />
                  </div>
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
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" /><XAxis dataKey="date" stroke="#94a3b8" tickFormatter={v => new Date(v).getDate()} /><YAxis stroke="#94a3b8" /><Tooltip contentStyle={{ background:'#1e293b', border:'1px solid #334155', borderRadius:12 }} /><Bar dataKey="expenses" name="مصروفات" fill="#ef4444" radius={[4,4,0,0]} /><Bar dataKey="withdrawals" name="سلف" fill="#f59e0b" radius={[4,4,0,0]} />
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
