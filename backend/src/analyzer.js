// Smart Arabic/Egyptian expense analyzer with AI insights

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
      if (transactionDate > now) transactionDate.setMonth(transactionDate.getMonth() - 1);
    }
  }

  // Detect type
  const withdrawalWords = ['سحبت', 'سحب', 'انسحبت', 'من الراتب', 'من حسابي', 'نزل'];
  const salaryWords = ['راتب', 'مرتب', 'المرتب', 'الراتب', 'نزل المرتب', 'نزل الراتب'];
  const isWithdrawal = withdrawalWords.some(w => text.includes(w));
  const isSalary = salaryWords.some(w => text.includes(w));

  // Detect category with more keywords
  const categoryKeywords = {
    work: ['شغل', 'مكتب', 'عميل', 'مشروع', 'بنزين شغل', 'نت شغل', 'شركة'],
    home: ['أكل', 'فاكهة', 'خضار', 'لحم', 'دجاج', 'سمك', 'عيش', 'بيت', 'منزل', 'بيتزا', 'برجر', 'مطعم', 'كافيه', 'قهوة', 'شاي'],
    transport: ['مواصلات', 'بنزين', 'تاكسي', 'أوبر', 'كريم', 'ميكروباص', 'اتوبيس', 'metro', 'مترو', 'موقف'],
    health: ['علاج', 'دكتور', 'صيدلية', 'عيادة', 'مستشفى', 'تحاليل', 'أشعة'],
    education: ['مدرسة', 'جامعة', 'دورة', 'كورس', 'كتب', 'مذاكرة', 'دروس'],
    bills: ['فاتورة', 'كهرباء', 'مية', 'غاز', 'نت', 'موبايل', 'إيجار', 'صيانة'],
    shopping: ['اشتريت', 'شراء', 'ملابس', 'جزمة', 'شنطة', 'هدايا', 'محل', 'أونلاين'],
    entertainment: ['سينما', 'فيلم', 'لعبة', 'خروج', 'فسح', 'رحلة'],
    savings: ['وفرت', 'ادخرت', 'توفير', 'ادخار']
  };

  let category = 'other';
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(w => text.includes(w))) { category = cat; break; }
  }

  // Detect withdrawal purpose
  let withdrawalPurpose = null;
  if (isWithdrawal) {
    const purposeMatch = text.match(/(?:عشان|علشان|لـ|لل|من أجل)\s*(.+?)(?:\d|$)/);
    if (purposeMatch) withdrawalPurpose = purposeMatch[1].trim();
  }

  // Clean description
  let description = text.replace(/[\d,]+\.?\d*/g, '').replace(/جنيه|ج\.م|من|الراتب|المرتب|يوم\s*\d+/g, '').trim();
  if (description.length > 60) description = description.slice(0, 60);

  let type = 'expense';
  if (isSalary) type = 'salary';
  else if (isWithdrawal) type = 'withdrawal';

  return {
    amount, type, category,
    description: description || text.slice(0, 60),
    withdrawalPurpose, transactionDate,
    confidence: amount ? 0.85 : 0.4,
    needsReview: !amount ? 1 : 0
  };
}

export function getSmartAnswer(question, transactions, settings, user) {
  const q = question.toLowerCase();
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  
  const monthTx = transactions.filter(t => t.month_key === thisMonth);
  const lastMonthTx = transactions.filter(t => t.month_key === lastMonth);
  
  const totalExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const totalWithdrawals = monthTx.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (t.amount || 0), 0);
  const totalSalary = monthTx.filter(t => t.type === 'salary').reduce((s, t) => s + (t.amount || 0), 0);
  const monthlyBalance = parseFloat(settings?.monthly_balance || '0');
  const balance = (totalSalary + monthlyBalance) - totalWithdrawals;

  const lastMonthExpenses = lastMonthTx.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);

  // Category stats
  const byCategory = {};
  monthTx.filter(t => t.type === 'expense').forEach(t => {
    byCategory[t.category] = (byCategory[t.category] || 0) + (t.amount || 0);
  });

  const categoryNames = {
    work: 'الشغل', home: 'البيت', transport: 'المواصلات', 
    health: 'الصحة', education: 'التعليم', bills: 'الفواتير', 
    shopping: 'التسوق', entertainment: 'الترفيه', savings: 'التوفير', other: 'أخرى'
  };

  // AI Insights
  if (q.includes('تحليل') || q.includes('أنماط') || q.includes('نصيحة') || q.includes('نصائح') || q.includes('اقتراح')) {
    let insights = '🧠 *تحليل ذكي لمصاريفك:*\n\n';
    
    // Compare with last month
    if (lastMonthExpenses > 0) {
      const change = ((totalExpenses - lastMonthExpenses) / lastMonthExpenses * 100).toFixed(1);
      if (totalExpenses > lastMonthExpenses) {
        insights += `⚠️ مصاريفك زادت ${change}% عن الشهر اللي فات\n\n`;
      } else if (totalExpenses < lastMonthExpenses) {
        insights += `✅ مصاريفك قلت ${Math.abs(change)}% عن الشهر اللي فات! ممتاز\n\n`;
      }
    }

    // Top spending category
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
      const [topCat, topTotal] = sorted[0];
      const percentage = totalExpenses > 0 ? ((topTotal / totalExpenses) * 100).toFixed(0) : 0;
      insights += `📊 أكتر فئة مصروف: ${categoryNames[topCat]} (${percentage}%)\n`;
    }

    // Daily average
    const daysInMonth = now.getDate();
    const dailyAvg = daysInMonth > 0 ? (totalExpenses / daysInMonth).toFixed(0) : 0;
    insights += `📈 متوسط الصرف اليومي: ${dailyAvg} ج.م\n`;

    // Projection
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    const projectedTotal = totalExpenses + (parseInt(dailyAvg) * daysLeft);
    insights += `🔮 المتوقع للشهر كله: ${projectedTotal} ج.م\n`;

    // Tips
    insights += '\n💡 *نصائح:*\n';
    if (byCategory.home > monthlyBalance * 0.3) {
      insights += '• مصاريف البيت عالية - حاول تقلل من الأكل بره\n';
    }
    if (byCategory.transport > monthlyBalance * 0.15) {
      insights += '• مواصلاتك كتير - جرب تستخدم مواصلات أرخص\n';
    }
    if (totalExpenses > balance * 0.8) {
      insights += '• قربت تخلص الراتب! خلي بالك من باقي الشهر\n';
    }

    return insights;
  }

  // Budget tracking
  if (q.includes('ميزانية') || q.includes('budget')) {
    const budgets = settings?.budgets || {};
    let msg = '🎯 *تتبع الميزانيات:*\n\n';
    
    for (const [cat, budget] of Object.entries(budgets)) {
      const spent = byCategory[cat] || 0;
      const percentage = budget > 0 ? ((spent / budget) * 100).toFixed(0) : 0;
      const remaining = budget - spent;
      const status = percentage >= 100 ? '🔴' : percentage >= 80 ? '🟡' : '🟢';
      msg += `${status} ${categoryNames[cat]}: ${spent}/${budget} ج.م (${percentage}%)\n`;
      if (remaining > 0) msg += `   متبقي: ${remaining} ج.م\n`;
      else msg += `   زايد: ${Math.abs(remaining)} ج.م!\n`;
    }
    
    if (Object.keys(budgets).length === 0) {
      msg += 'مفيش ميزانيات محددة\n💡 حدد ميزانيات من الإعدادات';
    }
    
    return msg;
  }

  // Savings goals
  if (q.includes('هدف') || q.includes('توفير') || q.includes('ادخار') || q.includes('saving')) {
    const goal = parseFloat(settings?.savings_goal || '0');
    const saved = parseFloat(settings?.savings_saved || '0');
    
    if (goal > 0) {
      const percentage = ((saved / goal) * 100).toFixed(0);
      const remaining = goal - saved;
      return `🎯 *هدف التوفير*\n\n` +
             `💰 الهدف: ${goal} ج.م\n` +
             `💵 المتوفر: ${saved} ج.م (${percentage}%)\n` +
             `━━━━━━━━━━━━\n` +
             `✨ محتاج كمان: ${remaining} ج.م\n\n` +
             `${percentage >= 100 ? '🎉 مبروك! وصلت لهدفك!' : `📈 كمل كده وهتوصل!`}`;
    }
    
    return '🎯 مفيشهدف توفير محدد\n💡 حددهدف من الإعدادات';
  }

  // Original features
  if (q.includes('رصيد') || q.includes('متبقي') || q.includes('باقي') || q.includes('فلوس')) {
    return `💰 *رصيدك ${user?.displayName || ''}*\n\n` +
           `💵 الراتب: ${totalSalary + monthlyBalance} ج.م\n` +
           `🏧 السحوبات (سلف): ${totalWithdrawals} ج.م\n` +
           `━━━━━━━━━━━━\n` +
           `✨ المتبقي من الراتب: ${balance} ج.م\n\n` +
           `💸 المصروفات (منفصلة): ${totalExpenses} ج.م`;
  }
  
  if (q.includes('مصروف') && (q.includes('كام') || q.includes('قد ايه') || q.includes('إجمالي'))) {
    return `💸 إجمالي مصروفات الشهر: ${totalExpenses} ج.م`;
  }

  if (q.includes('سحب') && (q.includes('كام') || q.includes('قد ايه'))) {
    return `🏧 إجمالي السحوبات: ${totalWithdrawals} ج.م`;
  }

  if (q.includes('راتب') || q.includes('مرتب')) {
    return `💵 الراتب: ${totalSalary + monthlyBalance} ج.م`;
  }

  if (q.includes('أكتر') || q.includes('اكثر')) {
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return '📭 مفيش مصروفات';
    const [topCat, topTotal] = sorted[0];
    return `📊 أكتر فئة: ${categoryNames[topCat]} بـ ${topTotal} ج.م`;
  }

  if (q.includes('تفصيل') || q.includes('تفاصيل')) {
    if (Object.keys(byCategory).length === 0) return '📭 مفيش مصروفات';
    let msg = '📊 *تفصيل المصاريف:*\n\n';
    for (const [cat, total] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      const pct = totalExpenses > 0 ? ((total / totalExpenses) * 100).toFixed(0) : 0;
      msg += `• ${categoryNames[cat]}: ${total} ج.م (${pct}%)\n`;
    }
    return msg;
  }

  if (q.includes('عدد') || q.includes('معاملات')) {
    return `📋 المعاملات: ${monthTx.length}\n• مصروفات: ${monthTx.filter(t => t.type === 'expense').length}\n• سحوبات: ${monthTx.filter(t => t.type === 'withdrawal').length}\n• رواتب: ${monthTx.filter(t => t.type === 'salary').length}`;
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
      total += t.amount || 0;
    }
    msg += `\n💰 الإجمالي: ${total} ج.م`;
    return msg;
  }

  // Default help
  return `🤖 *أقدر أساعدك في:*\n\n` +
         `💰 *الرصيد:*\n• "رصيدي كام؟"\n• "راتبي كام؟"\n\n` +
         `📊 *التحليلات:*\n• "تفصيل المصاريف"\n• "أكتر فئة مصروف"\n• "مصروفات النهارده"\n\n` +
         `🧠 *ذكاء اصطناعي:*\n• "تحليل" أو "نصائح"\n• "ميزانية"\n• "هدف توفير"\n\n` +
         `💡 *أمثلة للتسجيل:*\n• "راتبي 16500"\n• "سحبت 3000 من الراتب"\n• "صرفت 150 جنيه أكل"\n• "صرفت 200 يوم 7 أكل"`;
}
