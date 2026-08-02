// Smart Arabic/Egyptian expense analyzer

export function analyzeMessage(text) {
  // Convert Arabic numerals
  const arabicNums = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  let normalized = text;
  for (const [ar, en] of Object.entries(arabicNums)) normalized = normalized.replaceAll(ar, en);

  // Extract amount
  const amountMatch = normalized.match(/[\d,]+\.?\d*/);
  const amount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : null;

  // Detect type
  const withdrawalWords = ['سحبت', 'سحب', 'انسحبت', 'من الراتب', 'من حسابي', 'نزل'];
  const isWithdrawal = withdrawalWords.some(w => text.includes(w));

  // Detect category
  const workWords = ['شغل', 'مكتب', 'عميل', 'مشروع', 'بنزين شغل', 'نت شغل', 'شغل'];
  const homeWords = ['أكل', 'فاكهة', 'خضار', 'لحم', 'دجاج', 'سمك', 'عيش', 'بيت', 'منزل'];
  const transportWords = ['مواصلات', 'بنزين', 'تاكسي', 'أوبر', 'كريم', 'ميكروباص', 'اتوبيس'];
  const healthWords = ['علاج', 'دكتور', 'صيدلية', 'عيادة', 'مستشفى'];
  const educationWords = ['مدرسة', 'جامعة', 'دورة', 'كورس', 'كتب'];
  const billsWords = ['فاتورة', 'كهرباء', 'مية', 'غاز', 'نت', 'موبايل', 'إيجار'];
  const shoppingWords = ['اشتريت', 'شراء', 'ملابس', 'جزمة', 'شنطة'];

  let category = 'other';
  if (workWords.some(w => text.includes(w))) category = 'work';
  else if (homeWords.some(w => text.includes(w))) category = 'home';
  else if (transportWords.some(w => text.includes(w))) category = 'transport';
  else if (healthWords.some(w => text.includes(w))) category = 'health';
  else if (educationWords.some(w => text.includes(w))) category = 'education';
  else if (billsWords.some(w => text.includes(w))) category = 'bills';
  else if (shoppingWords.some(w => text.includes(w))) category = 'shopping';

  // Clean description
  let description = text.replace(/[\d,]+\.?\d*/g, '').replace(/جنيه|ج\.م|من|الراتب/g, '').trim();
  if (description.length > 60) description = description.slice(0, 60);

  return {
    amount,
    type: isWithdrawal ? 'withdrawal' : 'expense',
    category,
    description: description || text.slice(0, 60),
    confidence: amount ? 0.85 : 0.4,
    needsReview: !amount ? 1 : 0
  };
}

export function getSmartAnswer(question, transactions) {
  const q = question.toLowerCase();
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  
  const monthTx = transactions.filter(t => t.month_key === thisMonth);
  const totalExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const totalWithdrawals = monthTx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const balance = totalWithdrawals - totalExpenses;

  // Category stats
  const byCategory = {};
  monthTx.filter(t => t.type === 'expense').forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount || 0);
  });

  const categoryNames = {
    work: 'الشغل', home: 'البيت', transport: 'المواصلات', 
    health: 'الصحة', education: 'التعليم', bills: 'الفواتير', shopping: 'التسوق', other: 'أخرى'
  };

  // Answer different questions
  if (q.includes('رصيد') || q.includes('متبقي') || q.includes('باقي')) {
    return `💰 رصيدك الحالي: ${balance} ج.م\n🏧 المسحوب: ${totalWithdrawals} ج.م\n💸 المصروف: ${totalExpenses} ج.م`;
  }
  
  if (q.includes('مصروف') && (q.includes('كام') || q.includes('قد ايه') || q.includes('إجمالي'))) {
    return `💸 إجمالي مصروفات الشهر: ${totalExpenses} ج.م`;
  }

  if (q.includes('سحب') && (q.includes('كام') || q.includes('قد ايه'))) {
    return `🏧 إجمالي المسحوبات: ${totalWithdrawals} ج.م`;
  }

  if (q.includes('أكتر') || q.includes('اكثر') || q.includes('أعلى') || q.includes('اقوى')) {
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return '📭 مفيش مصروفات الشهر ده';
    const top = sorted[0];
    return `📊 أكتر فئة مصروف: ${categoryNames[top[0]] || top[0]} بـ ${top[1]} ج.م`;
  }

  if (q.includes('تفصيل') || q.includes('تفاصيل') || q.includes('توزيع')) {
    if (Object.keys(byCategory).length === 0) return '📭 مفيش مصروفات الشهر ده';
    let msg = '📊 تفصيل مصروفات الشهر:\n\n';
    for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      msg += `• ${categoryNames[cat] || cat}: ${total} ج.م\n`;
    }
    return msg;
  }

  if (q.includes('عدد') || q.includes('معاملات')) {
    return `📋 عدد معاملات الشهر: ${monthTx.length} معاملة`;
  }

  if (q.includes('اليوم') || q.includes('نهارده')) {
    const today = now.toISOString().slice(0, 10);
    const todayTx = monthTx.filter(t => t.source_timestamp?.startsWith(today));
    if (todayTx.length === 0) return '📭 مفيش مصروفات النهارده';
    let msg = `📋 مصروفات النهارده (${todayTx.length}):\n\n`;
    let total = 0;
    for (const t of todayTx) {
      msg += `${t.type === 'expense' ? '💸' : '🏧'} ${t.amount} ج.م - ${t.description}\n`;
      total += t.amount || 0;
    }
    msg += `\n💰 الإجمالي: ${total} ج.م`;
    return msg;
  }

  // Default answer
  return `🤖 ممكن أساعدك في:\n• "رصيدي كام؟"\n• "مصروفات الشهر"\n• "أكتر فئة مصروف"\n• "تفصيل المصاريف"\n• "مصروفات النهارده"\n• "عدد المعاملات"`;
}
