import { useState, useEffect, useRef } from 'react';
import {
  FiSend, FiHome, FiList, FiBarChart2, FiSettings, FiMenu, FiX,
  FiLogOut, FiEdit2, FiTrash2, FiUser, FiMic, FiCalendar, FiPlus,
  FiChevronLeft, FiAlertCircle, FiRefreshCw
} from 'react-icons/fi';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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
  const [categories, setCategories] = useState([]);
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
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [showCatEditor, setShowCatEditor] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('📦');
  const [catColor, setCatColor] = useState('#64748b');
  const [catKeywords, setCatKeywords] = useState('');
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  const ICONS = ['🍔','🚗','🏠','📱','💊','🛍️','📚','🎮','💼','📦','☕','🎬','✈️','🏋️','💇','🔧','🎁','🐱','👶','💻','🎵','📸','⚽','🎨'];
  const COLORS = ['#f59e0b','#3b82f6','#f97316','#8b5cf6','#ec4899','#10b981','#6366f1','#ef4444','#7c3aed','#64748b','#14b8a6','#e11d48','#0891b2','#84cc16'];

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (isAuth) loadData(); }, [isAuth]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function checkAuth() {
    try { const r = await api.get('/auth/check'); setIsAuth(r.data.isAuthenticated); if (r.data.user) setUser(r.data.user); } catch { setIsAuth(false); }
  }

  async function handleLogin(e) {
    e.preventDefault(); setLoginError('');
    try { const r = await api.post('/auth/login', { username, password }); setIsAuth(true); setUser(r.data.user); }
    catch (err) { setLoginError(err.response?.data?.error || 'خطأ'); }
  }

  async function loadData() {
    setDataLoading(true); setDataError(null);
    const results = await Promise.allSettled([
      api.get('/transactions?limit=200'), api.get('/summary'),
      api.get('/charts/daily'), api.get('/settings'), api.get('/categories'),
    ]);
    const [txR, sumR, dailyR, setR, catR] = results;
    if (txR.status === 'fulfilled') setTransactions(txR.value.data.transactions || []);
    else console.error('Transactions failed:', txR.reason?.response?.status);
    if (sumR.status === 'fulfilled') setSummary(sumR.value.data);
    else console.error('Summary failed:', sumR.reason?.response?.status);
    if (dailyR.status === 'fulfilled') setDailyData(dailyR.value.data || []);
    if (setR.status === 'fulfilled') { const s = setR.value.data; setMonthlyBalance(s.monthly_balance||''); setBudgets(s.budgets||{}); setSavingsGoal(s.savings_goal||''); setSavingsSaved(s.savings_saved||''); }
    if (catR.status === 'fulfilled') setCategories(catR.value.data || []);
    const allFail = results.every(r => r.status === 'rejected');
    if (allFail) setDataError('فشل تحميل البيانات');
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
      setMessages(prev => [...prev, { role: 'bot', content: r.data.message, time: new Date(), type: r.data.type, options: r.data.options }]);
      loadData();
    } catch { setMessages(prev => [...prev, { role: 'bot', content: '❌ حصل خطأ', time: new Date() }]); }
    setLoading(false);
  }

  async function handleQuickOption(catId, catName) {
    // For disambiguation: pick a category from chat options
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      setMessages(prev => [...prev, { role: 'user', content: catName, time: new Date() }]);
      setLoading(true);
      try {
        const r = await api.post('/chat', { message: `${catName} ${lastUserMsg.content}` });
        setMessages(prev => [...prev, { role: 'bot', content: r.data.message, time: new Date() }]);
        loadData();
      } catch { setMessages(prev => [...prev, { role: 'bot', content: '❌ حصل خطأ', time: new Date() }]); }
      setLoading(false);
    }
  }

  async function handleAddExpense() {
    if (!expenseAmount || !selectedCategory) return;
    try {
      await api.post('/transactions', { amount: parseFloat(expenseAmount), category_id: selectedCategory.id, description: expenseDesc || selectedCategory.name, type: 'expense' });
      setShowAddExpense(false); setSelectedCategory(null); setExpenseAmount(''); setExpenseDesc('');
      loadData();
    } catch { alert('حصل خطأ'); }
  }

  async function handleSaveCategory() {
    if (!catName) return alert('اكتبي اسم الفئة');
    const data = { name: catName, icon: catIcon, color: catColor, keywords: catKeywords.split(',').map(k => k.trim()).filter(Boolean) };
    try {
      if (editingCat) { await api.put(`/categories/${editingCat.id}`, data); }
      else { await api.post('/categories', data); }
      setShowCatEditor(false); setEditingCat(null); setCatName(''); setCatKeywords('');
      loadData();
    } catch { alert('حصل خطأ'); }
  }

  async function handleDeleteCategory(id) {
    if (!confirm('المعاملات القديمة هتروح لفئة "أخرى". متأكدة؟')) return;
    try { await api.delete(`/categories/${id}`); loadData(); } catch { alert('حصل خطأ'); }
  }

  async function handleDelete(id) { if (!confirm('متأكد؟')) return; try { await api.delete(`/transactions/${id}`); loadData(); } catch {} }
  async function handleUpdateDate() { if (!editingTx||!editDate) return; try { await api.put(`/transactions/${editingTx.id}/date`,{date:editDate}); setEditingTx(null); loadData(); } catch {} }
  async function handleSaveSettings() { try { await api.put('/settings',{monthly_balance:monthlyBalance,budgets:JSON.stringify(budgets),savings_goal:savingsGoal,savings_saved:savingsSaved}); alert('تم الحفظ!'); loadData(); } catch {} }
  async function handleUpdateProfile() { try { await api.put('/users/profile',{displayName:newDisplayName}); setEditingUser(false); loadData(); } catch {} }
  async function handleChangePassword() { if(!oldPassword||!newPassword) return alert('اكتبي القديم والجديد'); try { await api.put('/users/password',{oldPassword,newPassword}); alert('تم!'); setOldPassword(''); setNewPassword(''); } catch(e) { alert(e.response?.data?.error||'خطأ'); } }
  async function handleChangeUsername() { if(!newUsername||!usernamePassword) return alert('اكتبي البيانات'); try { const r=await api.put('/users/username',{newUsername,currentPassword:usernamePassword}); setUser(p=>({...p,username:r.data.username})); alert('تم!'); setNewUsername(''); setUsernamePassword(''); } catch(e) { alert(e.response?.data?.error||'خطأ'); } }

  function startVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('المتصفح مش بيدعم الصوت');
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const r = new SR(); r.lang = 'ar-EG'; r.continuous = false; r.interimResults = true;
    r.onstart = () => setIsListening(true);
    r.onresult = (e) => { setInput(e.results[0][0].transcript); if (e.results[0].isFinal) setIsListening(false); };
    r.onerror = () => setIsListening(false); r.onend = () => setIsListening(false);
    r.start(); recognitionRef.current = r;
  }

  function fmt(d) { return d ? new Date(d).toLocaleDateString('ar-EG',{day:'numeric',month:'short'}) : ''; }
  function fmtTime(d) { return d ? new Date(d).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : ''; }
  function fmtAmount(n) { return (n||0).toLocaleString('ar-EG'); }

  function groupByDate(txs) {
    const groups = {}; const today = new Date().toISOString().slice(0,10); const yesterday = new Date(Date.now()-86400000).toISOString().slice(0,10);
    txs.forEach(t => { const d = t.source_timestamp?.slice(0,10)||'x'; const l = d===today?'النهارده':d===yesterday?'إمبارح':fmt(d); if(!groups[l])groups[l]=[]; groups[l].push(t); }); return groups;
  }

  // ==================== LOGIN ====================
  if (!isAuth) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{background:'linear-gradient(135deg,#667eea 0%,#764ba2 100%)'}}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur rounded-3xl flex items-center justify-center shadow-2xl"><span className="text-4xl">💰</span></div>
          <h1 className="text-3xl font-bold text-white">Moza</h1>
          <p className="text-white/70 mt-1">تتبع مصاريفك بسهولة</p>
        </div>
        <form onSubmit={handleLogin} className="bg-white rounded-3xl p-6 shadow-2xl space-y-4">
          <div><label className="block text-sm text-slate-500 mb-1.5 font-medium">اسم المستخدم</label><input type="text" value={username} onChange={e=>setUsername(e.target.value)} className="input" autoFocus /></div>
          <div><label className="block text-sm text-slate-500 mb-1.5 font-medium">كلمة المرور</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="input" /></div>
          {loginError && <p className="text-red-500 text-sm text-center font-medium">{loginError}</p>}
          <button type="submit" className="btn-primary w-full">دخول</button>
        </form>
      </div>
    </div>
  );

  if (dataLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-center"><div className="w-12 h-12 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div><p className="text-slate-500">جاري التحميل...</p></div></div>;
  if (dataError) return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4"><div className="text-center card max-w-sm"><FiAlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4"/><p className="text-slate-700 font-bold mb-2">حصل خطأ</p><p className="text-slate-500 text-sm mb-4">{dataError}</p><button onClick={loadData} className="btn-primary"><FiRefreshCw className="w-4 h-4"/> إعادة المحاولة</button></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 px-4 pt-4 pb-6" style={{background:'linear-gradient(135deg,#667eea 0%,#764ba2 100%)'}}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center"><FiUser className="w-5 h-5 text-white"/></div>
            <div><p className="text-white/70 text-xs">أهلاً</p><p className="text-white font-bold">{user?.displayName||user?.username}</p></div>
          </div>
          <button onClick={()=>setSidebarOpen(!sidebarOpen)} className="w-10 h-10 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center"><FiMenu className="w-5 h-5 text-white"/></button>
        </div>
      </header>

      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-50" onClick={()=>setSidebarOpen(false)}/>}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ${sidebarOpen?'translate-x-0':'-translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{background:'linear-gradient(135deg,#667eea,#764ba2)'}}><span className="text-2xl">💰</span></div><div><p className="font-bold text-slate-800">Moza</p><p className="text-xs text-slate-400">@{user?.username}</p></div></div>
            <button onClick={()=>setSidebarOpen(false)}><FiX className="w-5 h-5 text-slate-400"/></button>
          </div>
          <nav className="space-y-1 flex-1">
            {[{id:'home',icon:FiHome,label:'الرئيسية'},{id:'transactions',icon:FiList,label:'المعاملات'},{id:'categories',icon:FiList,label:'الفئات'},{id:'analytics',icon:FiBarChart2,label:'تحليلات'},{id:'settings',icon:FiSettings,label:'الإعدادات'}].map(item=>(
              <button key={item.id} onClick={()=>{setPage(item.id);setSidebarOpen(false);}} className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-right ${page===item.id?'bg-blue-50 text-blue-600 font-semibold':'text-slate-500 hover:bg-slate-50'}`}><item.icon className="w-5 h-5"/><span>{item.label}</span></button>
            ))}
          </nav>
          <button onClick={()=>{api.post('/auth/logout');setIsAuth(false);setUser(null);setSummary(null);}} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-500 hover:bg-red-50"><FiLogOut className="w-5 h-5"/><span>خروج</span></button>
        </div>
      </aside>

      {/* ==================== HOME ==================== */}
      {page==='home' && summary && (
        <div className="px-4 -mt-2 space-y-4 animate-slide-up">
          <div className="card-gradient" style={{background:'linear-gradient(135deg,#667eea,#764ba2)'}}>
            <p className="text-white/70 text-sm mb-1">المتبقي من الراتب</p>
            <p className="text-3xl font-bold text-white mb-4">{fmtAmount(summary.totals.balance)} <span className="text-lg font-normal">ج.م</span></p>
            <div className="flex gap-3">
              <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center"><p className="text-white/60 text-xs">💵 الراتب</p><p className="text-white font-bold text-sm">{fmtAmount(summary.totals.salary)}</p></div>
              <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center"><p className="text-white/60 text-xs">🏧 سلف</p><p className="text-white font-bold text-sm">{fmtAmount(summary.totals.withdrawals)}</p></div>
              <div className="flex-1 bg-white/15 backdrop-blur rounded-xl p-3 text-center"><p className="text-white/60 text-xs">💸 مصروفات</p><p className="text-white font-bold text-sm">{fmtAmount(summary.totals.expenses)}</p></div>
            </div>
          </div>

          {/* Category Quick Add Grid */}
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">اضغط على فئة لتسجيل مصروف</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {categories.map(cat => (
                <button key={cat.id} onClick={()=>{setSelectedCategory(cat);setShowAddExpense(true);}}
                  className="flex flex-col items-center gap-2 p-3 rounded-2xl border-2 border-transparent hover:border-blue-300 transition-all active:scale-95"
                  style={{background: cat.color + '15'}}>
                  <span className="text-2xl">{cat.icon}</span>
                  <span className="text-xs font-medium text-slate-700 text-center leading-tight">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent */}
          <div className="card">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-slate-800">آخر المعاملات</h3><button onClick={()=>setPage('transactions')} className="text-sm text-blue-500 font-medium">عرض الكل</button></div>
            {transactions.length===0 ? <div className="text-center py-8 text-slate-400"><span className="text-4xl block mb-2">📭</span><p>مفيش معاملات لسه</p></div>
            : transactions.slice(0,5).map(t=>(
              <div key={t.id} className="flex items-center gap-3 py-3 border-b border-slate-100 last:border-0">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0" style={{background:(t.cat_color||'#64748b')+'20'}}>{t.cat_icon||'📦'}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{t.description||t.raw_message}</p><p className="text-xs text-slate-400">{fmt(t.source_timestamp)}</p></div>
                <p className={`font-bold text-sm ${t.type==='expense'?'text-red-500':t.type==='withdrawal'?'text-amber-500':'text-green-500'}`}>{t.type==='expense'?'-':'+'}{fmtAmount(t.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== TRANSACTIONS ==================== */}
      {page==='transactions' && (
        <div className="px-4 space-y-4 animate-slide-up">
          <h2 className="text-xl font-bold text-slate-800">المعاملات</h2>
          {transactions.length===0 ? <div className="text-center py-16 text-slate-400"><span className="text-5xl block mb-3">📭</span><p>مفيش معاملات</p></div>
          : Object.entries(groupByDate(transactions)).map(([dateLabel,txs])=>(
            <div key={dateLabel}><p className="text-sm font-semibold text-slate-400 mb-2">{dateLabel}</p>
              <div className="card p-0 divide-y divide-slate-100 overflow-hidden">
                {txs.map(t=>(
                  <div key={t.id} className="flex items-center gap-3 p-4 group">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0" style={{background:(t.cat_color||'#64748b')+'20'}}>{t.cat_icon||'📦'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{t.description||t.raw_message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-400">{fmtTime(t.source_timestamp)}</span>
                        <button onClick={()=>{setEditingTx(t);setEditDate(t.source_timestamp?.slice(0,10)||'');}} className="text-xs text-blue-500 hover:underline flex items-center gap-1"><FiCalendar className="w-3 h-3"/> تغيير التاريخ</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-sm ${t.type==='expense'?'text-red-500':t.type==='withdrawal'?'text-amber-500':'text-green-500'}`}>{t.type==='expense'?'-':'+'}{fmtAmount(t.amount)}</p>
                      <button onClick={()=>handleDelete(t.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><FiTrash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==================== CATEGORIES ==================== */}
      {page==='categories' && (
        <div className="px-4 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-slate-800">الفئات</h2>
            <button onClick={()=>{setEditingCat(null);setCatName('');setCatIcon('📦');setCatColor('#64748b');setCatKeywords('');setShowCatEditor(true);}} className="btn-primary text-sm"><FiPlus className="w-4 h-4"/> إضافة</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {categories.map(cat=>(
              <div key={cat.id} className="card flex items-center gap-3 group">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{background:cat.color+'20'}}>{cat.icon}</div>
                <div className="flex-1 min-w-0"><p className="font-bold text-slate-800 text-sm truncate">{cat.name}</p><p className="text-xs text-slate-400">{JSON.parse(cat.keywords||'[]').slice(0,3).join('، ')}</p></div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={()=>{setEditingCat(cat);setCatName(cat.name);setCatIcon(cat.icon);setCatColor(cat.color);setCatKeywords(JSON.parse(cat.keywords||'[]').join(','));setShowCatEditor(true);}} className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg"><FiEdit2 className="w-3.5 h-3.5"/></button>
                  <button onClick={()=>handleDeleteCategory(cat.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"><FiTrash2 className="w-3.5 h-3.5"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== ANALYTICS ==================== */}
      {page==='analytics' && summary && (
        <div className="px-4 space-y-4 animate-slide-up">
          <h2 className="text-xl font-bold text-slate-800">تحليلات</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="card-gradient" style={{background:'linear-gradient(135deg,#10b981,#059669)'}}><p className="text-white/70 text-xs">الراتب</p><p className="text-2xl font-bold text-white">{fmtAmount(summary.totals.salary)}</p></div>
            <div className="card-gradient" style={{background:'linear-gradient(135deg,#f59e0b,#d97706)'}}><p className="text-white/70 text-xs">المصروفات</p><p className="text-2xl font-bold text-white">{fmtAmount(summary.totals.expenses)}</p></div>
          </div>
          {summary.breakdown.length>0 && (
            <div className="card">
              <h3 className="font-bold text-slate-800 mb-2">توزيع المصاريف</h3>
              <div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={summary.breakdown.map(b=>({name:b.category,value:b.total}))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>{summary.breakdown.map((b,i)=><Cell key={i} fill={b.color||COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={v=>`${fmtAmount(v)} ج.م`} contentStyle={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:16,boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}/></PieChart></ResponsiveContainer></div>
              <div className="grid grid-cols-2 gap-2 mt-2">{summary.breakdown.sort((a,b)=>b.total-a.total).map((b,i)=>{const pct=summary.totals.expenses>0?((b.total/summary.totals.expenses)*100).toFixed(0):0;return(
                <div key={b.category} className="flex items-center gap-2 p-2 rounded-xl" style={{background:(b.color||'#64748b')+'15'}}><span className="text-lg">{b.icon||'📦'}</span><span className="text-xs text-slate-700 truncate flex-1">{b.category}</span><span className="text-xs font-bold text-slate-800">{pct}%</span></div>
              );})}</div>
            </div>
          )}
          {dailyData.length>0 && <div className="card"><h3 className="font-bold text-slate-800 mb-3">المصروفات اليومية</h3><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={(()=>{const g={};dailyData.forEach(d=>{if(!g[d.date])g[d.date]={date:d.date,expenses:0,withdrawals:0};g[d.date][d.type==='expense'?'expenses':'withdrawals']+=d.total;});return Object.values(g);})()}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0"/><XAxis dataKey="date" stroke="#94a3b8" tickFormatter={v=>new Date(v).getDate()} fontSize={12}/><YAxis stroke="#94a3b8" fontSize={12}/><Tooltip contentStyle={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:16}}/><Bar dataKey="expenses" name="مصروفات" fill="#ef4444" radius={[6,6,0,0]}/><Bar dataKey="withdrawals" name="سلف" fill="#f59e0b" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></div>}
        </div>
      )}

      {/* ==================== SETTINGS ==================== */}
      {page==='settings' && (
        <div className="px-4 space-y-4 animate-slide-up">
          <h2 className="text-xl font-bold text-slate-800">الإعدادات</h2>
          <div className="card"><h3 className="font-bold text-slate-800 mb-3">👤 الملف الشخصي</h3>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl mb-3"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white" style={{background:'linear-gradient(135deg,#667eea,#764ba2)'}}><FiUser className="w-6 h-6"/></div><div><p className="font-bold text-slate-800">{user?.displayName}</p><p className="text-sm text-slate-400">@{user?.username}</p></div><button onClick={()=>{setEditingUser(true);setNewDisplayName(user?.displayName||'');}} className="mr-auto p-2 text-slate-400 hover:text-blue-500"><FiEdit2 className="w-4 h-4"/></button></div>
            {editingUser && <div className="space-y-3 p-3 bg-slate-50 rounded-2xl"><input type="text" value={newDisplayName} onChange={e=>setNewDisplayName(e.target.value)} className="input" placeholder="الاسم"/><div className="flex gap-2"><button onClick={handleUpdateProfile} className="btn-primary flex-1 text-sm">حفظ الاسم</button><button onClick={()=>setEditingUser(false)} className="btn-secondary flex-1 text-sm">إلغاء</button></div></div>}
          </div>
          <div className="card"><h3 className="font-bold text-slate-800 mb-1">✏️ تغيير اسم الدخول</h3><p className="text-xs text-slate-400 mb-3">اسم المستخدم لتسجيل الدخول</p>
            <div className="space-y-3"><input type="text" value={newUsername} onChange={e=>setNewUsername(e.target.value.toLowerCase().trim())} className="input" placeholder="اسم الدخول الجديد"/><input type="password" value={usernamePassword} onChange={e=>setUsernamePassword(e.target.value)} className="input" placeholder="كلمة المرور الحالية"/><button onClick={handleChangeUsername} className="btn-primary w-full text-sm">تغيير اسم الدخول</button></div>
          </div>
          <div className="card"><h3 className="font-bold text-slate-800 mb-3">🔐 تغيير كلمة المرور</h3>
            <div className="space-y-3"><input type="password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)} className="input" placeholder="القديمة"/><input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="input" placeholder="الجديدة"/><button onClick={handleChangePassword} className="btn-primary w-full text-sm">تغيير</button></div>
          </div>
          <div className="card"><h3 className="font-bold text-slate-800 mb-3">💵 الراتب الشهري</h3><div className="flex gap-2"><input type="number" value={monthlyBalance} onChange={e=>setMonthlyBalance(e.target.value)} className="input flex-1"/><button onClick={handleSaveSettings} className="btn-primary">حفظ</button></div></div>
          <div className="card"><h3 className="font-bold text-slate-800 mb-3">🎯 ميزانيات</h3><div className="space-y-2">{categories.map(cat=>(<div key={cat.id} className="flex items-center gap-2"><span className="text-sm text-slate-600 w-24">{cat.icon} {cat.name}</span><input type="number" value={budgets[cat.name]||''} onChange={e=>setBudgets(p=>({...p,[cat.name]:parseFloat(e.target.value)||0}))} className="input flex-1 text-sm"/></div>))}</div></div>
          <div className="card"><h3 className="font-bold text-slate-800 mb-3">💰هدف التوفير</h3><div className="grid grid-cols-2 gap-3"><div><label className="text-xs text-slate-400 font-medium">الهدف</label><input type="number" value={savingsGoal} onChange={e=>setSavingsGoal(e.target.value)} className="input"/></div><div><label className="text-xs text-slate-400 font-medium">المتوفر</label><input type="number" value={savingsSaved} onChange={e=>setSavingsSaved(e.target.value)} className="input"/></div></div></div>
        </div>
      )}

      {/* ==================== ADD EXPENSE MODAL ==================== */}
      {showAddExpense && selectedCategory && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={()=>setShowAddExpense(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md animate-slide-up" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{background:selectedCategory.color+'20'}}>{selectedCategory.icon}</div>
              <h3 className="font-bold text-lg text-slate-800">{selectedCategory.name}</h3>
            </div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-400 font-medium">المبلغ (ج.م)</label><input type="number" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)} className="input" placeholder="0" autoFocus/></div>
              <div><label className="text-xs text-slate-400 font-medium">ملاحظة (اختياري)</label><input type="text" value={expenseDesc} onChange={e=>setExpenseDesc(e.target.value)} className="input" placeholder="وصف مختصر"/></div>
              <div className="flex gap-2"><button onClick={handleAddExpense} className="btn-primary flex-1" disabled={!expenseAmount}>تسجيل</button><button onClick={()=>setShowAddExpense(false)} className="btn-secondary flex-1">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== CATEGORY EDITOR MODAL ==================== */}
      {showCatEditor && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={()=>setShowCatEditor(false)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md animate-slide-up" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-800 mb-4">{editingCat ? 'تعديل فئة' : 'إضافة فئة جديدة'}</h3>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-400 font-medium">الاسم</label><input type="text" value={catName} onChange={e=>setCatName(e.target.value)} className="input" placeholder="مثال: فواتير موبايل"/></div>
              <div><label className="text-xs text-slate-400 font-medium">الأيقونة</label><div className="flex flex-wrap gap-2 mt-1">{ICONS.map(ic=>(<button key={ic} onClick={()=>setCatIcon(ic)} className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${catIcon===ic?'ring-2 ring-blue-500 scale-110 bg-blue-50':'bg-slate-50 hover:bg-slate-100'}`}>{ic}</button>))}</div></div>
              <div><label className="text-xs text-slate-400 font-medium">اللون</label><div className="flex flex-wrap gap-2 mt-1">{COLORS.map(c=>(<button key={c} onClick={()=>setCatColor(c)} className={`w-8 h-8 rounded-full transition-all ${catColor===c?'ring-2 ring-offset-2 ring-blue-500 scale-110':''}`} style={{background:c}}/>))}</div></div>
              <div><label className="text-xs text-slate-400 font-medium">كلمات مفتاحية (مفصولة بفاصلة)</label><input type="text" value={catKeywords} onChange={e=>setCatKeywords(e.target.value)} className="input" placeholder="فودافون, اورنج, شحن"/></div>
              <div className="flex gap-2"><button onClick={handleSaveCategory} className="btn-primary flex-1">حفظ</button><button onClick={()=>setShowCatEditor(false)} className="btn-secondary flex-1">إلغاء</button></div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== EDIT DATE MODAL ==================== */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={()=>setEditingTx(null)}>
          <div className="bg-white rounded-t-3xl p-6 w-full max-w-md animate-slide-up" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold text-lg text-slate-800 mb-2">📅 تغيير التاريخ</h3>
            <p className="text-sm text-slate-500 mb-4">{editingTx.raw_message}</p>
            <input type="date" value={editDate} onChange={e=>setEditDate(e.target.value)} className="input mb-4"/>
            <div className="flex gap-2"><button onClick={handleUpdateDate} className="btn-primary flex-1">حفظ</button><button onClick={()=>setEditingTx(null)} className="btn-secondary flex-1">إلغاء</button></div>
          </div>
        </div>
      )}

      {/* ==================== CHAT OVERLAY ==================== */}
      {showChat && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <header className="flex items-center gap-3 p-4 border-b border-slate-100">
            <button onClick={()=>setShowChat(false)} className="p-2 hover:bg-slate-100 rounded-2xl"><FiChevronLeft className="w-5 h-5 text-slate-600"/></button>
            <h2 className="font-bold text-slate-800">الشات</h2>
          </header>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length===0 && <div className="text-center text-slate-400 mt-20"><div className="w-16 h-16 mx-auto mb-4 rounded-3xl flex items-center justify-center" style={{background:'linear-gradient(135deg,#667eea20,#764ba220)'}}><span className="text-3xl">💬</span></div><p className="font-bold text-slate-600 mb-2">ابعتلي مصروفك</p><div className="flex flex-wrap gap-2 justify-center mt-4">{['راتبي 5000','سحبت 1000','مواصلات 50','رصيدي كام؟'].map((ex,i)=>(<button key={i} onClick={()=>setInput(ex)} className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full text-sm hover:bg-slate-200">{ex}</button>))}</div></div>}
            {messages.map((msg,i)=>(
              <div key={i} className={`flex ${msg.role==='user'?'justify-end':'justify-start'}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl whitespace-pre-line text-sm ${msg.role==='user'?'text-white rounded-br-md':'bg-slate-100 text-slate-800 rounded-bl-md'}`} style={msg.role==='user'?{background:'linear-gradient(135deg,#667eea,#764ba2)'}:{}}>
                  {msg.content}
                  {msg.type==='disambiguate' && msg.options && (
                    <div className="flex flex-wrap gap-2 mt-2">{msg.options.map(opt=>(
                      <button key={opt.id} onClick={()=>handleQuickOption(opt.id,opt.name)} className="bg-white/20 px-3 py-1.5 rounded-full text-xs hover:bg-white/30">{opt.icon} {opt.name}</button>
                    ))}</div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-slate-100 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm text-slate-400">بفكر...</div></div>}
            <div ref={chatEndRef}/>
          </div>
          <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-slate-100 bg-white">
            <button type="button" onClick={startVoiceInput} className={`p-3 rounded-2xl transition-all ${isListening?'bg-red-500 text-white animate-pulse':'bg-slate-100 text-slate-400'}`}><FiMic className="w-5 h-5"/></button>
            <input value={input} onChange={e=>setInput(e.target.value)} className="input flex-1" placeholder="اكتب هنا... (مثال: مواصلات 50)" disabled={loading}/>
            <button type="submit" disabled={loading||!input.trim()} className="p-3 rounded-2xl text-white disabled:opacity-40" style={{background:'linear-gradient(135deg,#667eea,#764ba2)'}}><FiSend className="w-5 h-5"/></button>
          </form>
        </div>
      )}

      {/* ==================== BOTTOM NAV ==================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4">
        <div className="bg-white rounded-3xl shadow-lg shadow-black/5 border border-slate-100 flex items-center justify-around py-2 px-4 relative">
          {[{id:'home',icon:FiHome,label:'الرئيسية'},{id:'transactions',icon:FiList,label:'المعاملات'},{id:'analytics',icon:FiBarChart2,label:'تحليلات'},{id:'settings',icon:FiSettings,label:'الإعدادات'}].map(item=>(
            <button key={item.id} onClick={()=>setPage(item.id)} className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-2xl transition-all ${page===item.id?'text-blue-600':'text-slate-400'}`}><item.icon className="w-5 h-5"/><span className="text-[10px]">{item.label}</span></button>
          ))}
          <button onClick={()=>setShowChat(true)} className="absolute -top-6 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full text-white shadow-lg shadow-blue-500/30 flex items-center justify-center" style={{background:'linear-gradient(135deg,#667eea,#764ba2)'}}><FiPlus className="w-6 h-6"/></button>
        </div>
      </nav>
    </div>
  );
}
