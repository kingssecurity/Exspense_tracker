// Multi-provider AI fallback: Gemini → Groq → Keyword parser
// Checklist applied: ES modules, no __dirname, error logging, no silent catches

import { analyzeMessage as fallbackParser } from './analyzer.js';

// ==================== SHARED TOOL DEFINITIONS ====================
// Simplified: removed ask_question (fragile enum) — model uses get_summary or text reply for questions
const TOOLS = [
  {
    name: 'log_expense',
    description: 'تسجيل مصروف. استخدمها لما المستخدم يذكر مبلغ + سبب الصرف (أكل، مواصلات، فاتورة، إلخ).',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ بالجنيه المصري' },
        category: { type: 'string', description: 'فئة المصروف مثل: food, transport, health, bills, shopping, work, home, entertainment, other' },
        description: { type: 'string', description: 'وصف مختصر للمصروف بالعربي' },
        date_day: { type: 'number', description: 'يوم الشهر (1-31) لو المستخدم ذكر تاريخ محدد' }
      },
      required: ['amount', 'category', 'description']
    }
  },
  {
    name: 'log_withdrawal',
    description: 'تسجيل سحب فلوس من الراتب. استخدمها لما المستخدم يقول "سحبت" أو "سلف".',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ بالجنيه المصري' },
        purpose: { type: 'string', description: 'سبب السحب لو ذُكر' },
        date_day: { type: 'number', description: 'يوم الشهر لو ذُكر' }
      },
      required: ['amount']
    }
  },
  {
    name: 'log_salary',
    description: 'تسجيل راتب أو دخل. استخدمها لما المستخدم يقول "راتبي" أو "مرتب" أو "نزل المرتب".',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ بالجنيه المصري' }
      },
      required: ['amount']
    }
  },
  {
    name: 'get_summary',
    description: 'عرض ملخص المصاريف والرصيد. استخدمها لأي سؤال عن الرصيد أو المصاريف أو التفصيل أو النصائح.',
    parameters: { type: 'object', properties: {} }
  }
];

const SYSTEM_PROMPT = `أنت مساعد ذكي لتتبع المصاريف باللهجة المصرية.

Rules:
- لو الرسالة فيها مبلغ رقمي + كلمة صرف/دفع/شراء → log_expense
- لو فيها سحب/سلف → log_withdrawal  
- لو فيها راتب/مرتب/دخل → log_salary
- لو فيها سؤال عن أي حاجة (رصيد، متبقي، كام، تفصيل، نصيحة، ميزانية) → get_summary
- رد بالـ tool call المناسب. متشرحش.

Categories: food, transport, health, bills, shopping, work, home, entertainment, other

أمثلة:
- "صرفت 50 جنيه أكل" → log_expense(amount=50, category="food", description="أكل")
- "سحبت 2000 من الراتب" → log_withdrawal(amount=2000)
- "راتبي 16500" → log_salary(amount=16500)
- "رصيدي كام؟" → get_summary()
- "معايا كام؟" → get_summary()
- "مصروفاتي الشهر ده" → get_summary()
- "مواصلات 30" → log_expense(amount=30, category="transport", description="مواصلات")`;

// ==================== RATE LIMIT TRACKING ====================
const rateLimitCooldown = { gemini: 0, groq: 0 };

function isCoolingDown(provider) {
  return Date.now() < rateLimitCooldown[provider];
}

function setCooldown(provider, seconds) {
  rateLimitCooldown[provider] = Date.now() + (seconds * 1000);
  console.log(`⏳ ${provider} cooling down for ${seconds}s`);
}

// ==================== GEMINI ====================
async function callGemini(message, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('No GEMINI_API_KEY'), { code: 'NO_KEY' });
  if (isCoolingDown('gemini')) throw Object.assign(new Error('Gemini cooling down'), { code: 429 });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: message }] }],
    tools: [{
      functionDeclarations: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  // Log rate limit details
  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const body = await res.text().catch(() => '');
    console.error(`⚠️ Gemini 429: retry-after=${retryAfter || 'none'}, body=${body.slice(0, 200)}`);
    // Back off: wait 60s before trying Gemini again
    setCooldown('gemini', 60);
    throw Object.assign(new Error('Gemini rate limited'), { code: 429 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`⚠️ Gemini ${res.status}: ${text.slice(0, 300)}`);
    throw Object.assign(new Error(`Gemini ${res.status}`), { code: res.status });
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];

  if (!candidate?.content?.parts) {
    throw new Error('Gemini: no content in response');
  }

  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      return normalizeToolCall(part.functionCall.name, part.functionCall.args || {});
    }
  }

  for (const part of candidate.content.parts) {
    if (part.text) {
      return { action: 'answer', reply: part.text };
    }
  }

  throw new Error('Gemini: unexpected response format');
}

// ==================== GROQ ====================
async function callGroq(message, context) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw Object.assign(new Error('No GROQ_API_KEY'), { code: 'NO_KEY' });
  if (isCoolingDown('groq')) throw Object.assign(new Error('Groq cooling down'), { code: 429 });

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const tools = TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));

  const body = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message }
    ],
    tools,
    tool_choice: 'auto',
    temperature: 0.1,
    max_tokens: 256,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    console.error(`⚠️ Groq 429: retry-after=${retryAfter || 'none'}`);
    setCooldown('groq', 30);
    throw Object.assign(new Error('Groq rate limited'), { code: 429 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`⚠️ Groq ${res.status}: ${text.slice(0, 500)}`);
    throw Object.assign(new Error(`Groq ${res.status}: ${text.slice(0, 100)}`), { code: res.status });
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('Groq: no choices');

  const toolCall = choice.message?.tool_calls?.[0];
  if (toolCall) {
    let args;
    try {
      args = typeof toolCall.function.arguments === 'string'
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch (e) {
      console.error('Groq: failed to parse tool args:', toolCall.function.arguments);
      throw new Error('Groq: invalid tool arguments');
    }
    return normalizeToolCall(toolCall.function.name, args);
  }

  if (choice.message?.content) {
    return { action: 'answer', reply: choice.message.content };
  }

  throw new Error('Groq: unexpected response format');
}

// ==================== FALLBACK KEYWORD PARSER ====================
function callFallbackParser(message, context) {
  const analysis = fallbackParser(message);

  if (analysis.type === 'salary') {
    return normalizeToolCall('log_salary', { amount: analysis.amount });
  }

  if (analysis.type === 'withdrawal') {
    return normalizeToolCall('log_withdrawal', {
      amount: analysis.amount,
      purpose: analysis.withdrawalPurpose
    });
  }

  if (analysis.amount) {
    return normalizeToolCall('log_expense', {
      amount: analysis.amount,
      category: mapLegacyCategory(analysis.category),
      description: analysis.description
    });
  }

  // Questions → get_summary
  const q = message;
  const questionWords = ['كام', 'رصيد', 'متبقي', 'باقي', 'تفصيل', 'توزيع', 'راتب', 'مرتب', 'اليوم', 'نهارده', 'تحليل', 'نصيحة', 'نصائح', 'ميزانية', 'فلوس', 'معايا'];
  if (questionWords.some(w => q.includes(w)) || q.includes('?') || q.includes('؟')) {
    return normalizeToolCall('get_summary', {});
  }

  // Has a number but no clear intent → try expense with "other"
  if (analysis.amount) {
    return normalizeToolCall('log_expense', {
      amount: analysis.amount,
      category: 'other',
      description: analysis.description || message.slice(0, 50)
    });
  }

  return { action: 'answer', reply: '🤖 مش فاهم. جرب:\n• "صرفت 50 أكل"\n• "رصيدي كام؟"\n• "مواصلات 30"' };
}

// ==================== HELPERS ====================
function normalizeToolCall(name, args) {
  const date = args.date_day ? new Date(new Date().getFullYear(), new Date().getMonth(), args.date_day) : null;

  switch (name) {
    case 'log_expense':
      return {
        action: 'log_expense',
        amount: args.amount,
        category: args.category || 'other',
        description: args.description || '',
        date
      };
    case 'log_withdrawal':
      return {
        action: 'log_withdrawal',
        amount: args.amount,
        purpose: args.purpose || '',
        date
      };
    case 'log_salary':
      return {
        action: 'log_salary',
        amount: args.amount,
        date
      };
    case 'get_summary':
      return { action: 'question', question_type: 'summary' };
    default:
      return { action: 'answer', reply: 'مش فاهم الطلب' };
  }
}

function mapLegacyCategory(cat) {
  const map = {
    food: 'food', home: 'home', transport: 'transport',
    health: 'health', education: 'education', bills: 'bills',
    shopping: 'shopping', work: 'work', entertainment: 'entertainment',
    other: 'other'
  };
  return map[cat] || 'other';
}

// ==================== MAIN ENTRY POINT ====================
export async function getAIResponse(message, context) {
  // 1. Try Gemini
  if (process.env.GEMINI_API_KEY && !isCoolingDown('gemini')) {
    try {
      const result = await callGemini(message, context);
      console.log('✅ Gemini responded');
      return result;
    } catch (err) {
      if (err.code !== 'NO_KEY') {
        console.error(`⚠️ Gemini failed (${err.code || 'unknown'}): ${err.message}`);
      }
    }
  }

  // 2. Try Groq
  if (process.env.GROQ_API_KEY && !isCoolingDown('groq')) {
    try {
      const result = await callGroq(message, context);
      console.log('✅ Groq responded');
      return result;
    } catch (err) {
      if (err.code !== 'NO_KEY') {
        console.error(`⚠️ Groq failed (${err.code || 'unknown'}): ${err.message}`);
      }
    }
  }

  // 3. Fallback to keyword parser
  console.log('📝 Using keyword fallback parser');
  return callFallbackParser(message, context);
}
