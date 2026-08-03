// Smart Arabic/Egyptian expense analyzer

export function analyzeMessage(text) {
  // Convert Arabic numerals
  const arabicNums = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  let normalized = text;
  for (const [ar, en] of Object.entries(arabicNums)) normalized = normalized.replaceAll(ar, en);

  // Extract amount
  const amountMatch = normalized.match(/[\d,]+\.?\d*/);
  const amount = amountMatch ? parseFloat(amountMatch[0].replace(/,/g, '')) : null;

  // Extract date (يوم + number)
  let transactionDate = null;
  const dateMatch = text.match(/يوم\s*(\d+)/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    if (day >= 1 && day <= 31) {
      const now = new Date();
      transactionDate = new Date(now.getFullYear(), now.getMonth(), day);
      // If the day is in the future, assume last month
      if (transactionDate > now) {
        transactionDate.setMonth(transactionDate.getMonth() - 1);
      }
    }
  }

  // Detect type
  const withdrawalWords = ['سحبت', 'سحب', 'انسحبت', 'من الراتب', 'من حسابي', 'نزل'];
  const salaryWords = ['راتب', 'مرتب', 'المرتب', 'الراتب', 'نزل المرتب', 'نزل الراتب'];
  const isWithdrawal = withdrawalWords.some(w => text.includes(w));
  const isSalary = salaryWords.some(w => text.includes(w));

  // Detect category
  const workWords = ['شغل', 'مكتب', 'عميل', 'مشروع', 'بنزين شغل', 'نت شغل'];
  const homeWords = ['أكل', 'فاكهة', 'خضار', 'لحم', 'دجاج', 'سمك', 'عيش', 'بيت', 'منزل', 'بيتزا', 'برجر', 'مطعم'];
  const transportWords = ['مواصلات', 'بنزين', 'تاكسي', 'أوبر', 'كريم', 'ميكروباص', 'اتوبيس', 'metro', 'مترو'];
  const healthWords = ['علاج', 'دكتور', 'صيدلية', 'عيادة', 'مستشفى'];
  const educationWords = ['مدرسة', 'جامعة', 'دورة', 'كورس', 'كتب'];
  const billsWords = ['فاتورة', 'كهرباء', 'مية', 'غاز', 'نت', 'موبايل', 'إيجار'];
  const shoppingWords = ['اشتريت', 'شراء', 'ملابس', 'جزمة', 'شنطة', 'هدايا'];

  let category = 'other';
  if (workWords.some(w => text.includes(w))) category = 'work';
  else if (homeWords.some(w => text.includes(w))) category = 'home';
  else if (transportWords.some(w => text.includes(w))) category = 'transport';
  else if (healthWords.some(w => text.includes(w))) category = 'health';
  else if (educationWords.some(w => text.includes(w))) category = 'education';
  else if (billsWords.some(w => text.includes(w))) category = 'bills';
  else if (shoppingWords.some(w => text.includes(w))) category = 'shopping';

  // Detect what the withdrawal is for (if mentioned)
  let withdrawalPurpose = null;
  if (isWithdrawal) {
    // Try to extract purpose after "عشان" or "لـ" or "علشان"
    const purposeMatch = text.match(/(?:عشان|علشان|لـ|لل|من أجل)\s*(.+?)(?:\d|$)/);
    if (purposeMatch) {
      withdrawalPurpose = purposeMatch[1].trim();
    }
  }

  // Clean description
  let description = text.replace(/[\d,]+\.?\d*/g, '').replace(/جنيه|ج\.م|من|الراتب|المرتب|يوم\s*\d+/g, '').trim();
  if (description.length > 60) description = description.slice(0, 60);

  // Determine final type
  let type = 'expense';
  if (isSalary) type = 'salary';
  else if (isWithdrawal) type = 'withdrawal';

  return {
    amount,
    type,
    category,
    description: description || text.slice(0, 60),
    withdrawalPurpose,
    transactionDate,
    confidence: amount ? 0.85 : 0.4,
    needsReview: !amount ? 1 : 0
  };
}

export function getSmartAnswer(question, transactions, settings) {
  const q = question.toLowerCase();
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  
  const monthTx = transactions.filter(t => t.month_key === thisMonth);
  const totalExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const totalWithdrawals = monthTx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const totalSalary = monthTx.filter(t => t.type === 'salary').reduce((s, t) => s + (t.amount || 0), 0);
  const monthlyBalance = parseFloat(settings?.monthly_balance || '0');
  const balance = (totalSalary + monthlyBalance) - totalExpenses;

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
  if (q.includes('رصيد') || q.includes('متبقي') || q.includes('باقي') || q.includes('فلوس') || q.includes('كام فلوس')) {
    return `💰 *رصيدك الحالي*\n\n` +
           `💵 الراتب/الدخل: ${totalSalary + monthlyBalance} ج.م\n` +
           `💸 المصروفات: ${totalExpenses} ج.م\n` +
           `🏧 المسحوبات: ${totalWithdrawals} ج.م\n` +
           `━━━━━━━━━━━━\n` +
           `✨ المتبقي: ${balance} ج.م`;
  }
  
  if (q.includes('مصروف') && (q.includes('كام') || q.includes('قد ايه') || q.includes('إجمالي'))) {
    return `💸 إجمالي مصروفات الشهر: ${totalExpenses} ج.م`;
  }

  if (q.includes('سحب') && (q.includes('كام') || q.includes('قد ايه'))) {
    return `🏧 إجمالي المسحوبات: ${totalWithdrawals} ج.م`;
  }

  if (q.includes('راتب') || q.includes('مرتب') || q.includes('دخل')) {
    return `💵 الراتب/الدخل هذا الشهر: ${totalSalary + monthlyBalance} ج.م`;
  }

  if (q.includes('أكتر') || q.includes('اكثر') || q.includes('أعلى') || q.includes('اقوى')) {
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return '📭 مفيش مصروفات الشهر ده';
    const top = sorted[0];
    return `📊 أكتر فئة مصروف: ${categoryNames[top[0]] || top[0]} بـ ${top[1]} ج.م`;
  }

  if (q.includes('تفصيل') || q.includes('تفاصيل') || q.includes('توزيع')) {
    if (Object.keys(byCategory).length === 0) return '📭 مفيش مصروفات الشهر ده';
    let msg = '📊 *تفصيل مصروفات الشهر:*\n\n';
    for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      const percentage = totalExpenses > 0 ? ((total / totalExpenses) * 100).toFixed(1) : 0;
      msg += `• ${categoryNames[cat] || cat}: ${total} ج.م (${percentage}%)\n`;
    }
    return msg;
  }

  if (q.includes('عدد') || q.includes('معاملات')) {
    return `📋 عدد معاملات الشهر: ${monthTx.length} معاملة\n• مصروفات: ${monthTx.filter(t => t.type === 'expense').length}\n• سحوبات: ${monthTx.filter(t => t.type === 'withdrawal').length}\n• رواتب: ${monthTx.filter(t => t.type === 'salary').length}`;
  }

  if (q.includes('اليوم') || q.includes('نهارده')) {
    const today = now.toISOString().slice(0, 10);
    const todayTx = monthTx.filter(t => t.source_timestamp?.startsWith(today));
    if (todayTx.length === 0) return '📭 مفيش معاملات النهارده';
    let msg = `📋 *معاملات النهارده (${todayTx.length}):*\n\n`;
    let total = 0;
    for (const t of todayTx) {
      const emoji = t.type === 'expense' ? '💸' : t.type === 'withdrawal' ? '🏧' : '💵';
      msg += `${emoji} ${t.amount} ج.م - ${t.description}\n`;
      if (t.type === 'expense') total += t.amount || 0;
    }
    msg += `\n💰 إجمالي المصروف: ${total} ج.م`;
    return msg;
  }

  if (q.includes('سحب') && (q.includes('ليه') || q.includes('عشان') || q.includes('إيه'))) {
    const withdrawals = monthTx.filter(t => t.type === 'withdrawal');
    if (withdrawals.length === 0) return '📭 مفيش سحوبات الشهر ده';
    let msg = '🏧 *السحوبات هذا الشهر:*\n\n';
    for (const t of withdrawals) {
      msg += `• ${t.amount} ج.م`;
      if (t.withdrawal_purpose) msg += ` - ${t.withdrawal_purpose}`;
      msg += '\n';
    }
    return msg;
  }

  // Default answer
  return `🤖 *أقدر أساعدك في:*\n\n` +
         `• "رصيدي كام؟" أو "متبقي كام؟"\n` +
         `• "مصروفات الشهر"\n` +
         `• "أكتر فئة مصروف"\n` +
         `• "تفصيل المصاريف"\n` +
         `• "مصروفات النهارده"\n` +
         `• "عدد المعاملات"\n` +
         `• "راتبي كام؟"\n` +
         `• "سحبت ليه؟"\n\n` +
         `💡 *أمثلة للتسجيل:*\n` +
         `• "راتبي 10000"\n` +
         `• "صرفت 150 جنيه أكل"\n` +
         `• "سحبت 2000 من الراتب عشان مصاريف البيت"\n` +
         `• "صرفت 200 جنيه يوم 7 أكل" (لتسجيل مصروف بتاريخ معين)`;
}
