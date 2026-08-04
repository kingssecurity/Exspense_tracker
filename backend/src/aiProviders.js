// Multi-provider AI fallback: Gemini → Groq → Keyword parser
// Each provider returns the same shape so the caller doesn't care which one answered.

import { analyzeMessage as fallbackParser } from './analyzer.js';

// ==================== SHARED TOOL DEFINITIONS ====================
const TOOLS = [
  {
    name: 'log_expense',
    description: 'تسجيل مصروف (صرفت، دفعت، اشتريت)',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ بالجنيه' },
        category: { type: 'string', enum: ['food','transport','health','bills','shopping','work','home','entertainment','other'], description: 'فئة المصروف' },
        description: { type: 'string', description: 'وصف مختصر' },
        date_day: { type: 'number', description: 'يوم الشهر (1-31) لو ذُكر' }
      },
      required: ['amount', 'category', 'description']
    }
  },
  {
    name: 'log_withdrawal',
    description: 'تسجيل سحب فلوس من الراتب (سحبت)',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ بالجنيه' },
        purpose: { type: 'string', description: 'سبب السحب لو ذُكر' },
        date_day: { type: 'number', description: 'يوم الشهر لو ذُكر' }
      },
      required: ['amount']
    }
  },
  {
    name: 'log_salary',
    description: 'تسجيل راتب أو دخل',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'المبلغ بالجنيه' }
      },
      required: ['amount']
    }
  },
  {
    name: 'get_summary',
    description: 'عرض ملخص المصاريف والرصيد',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'ask_question',
    description: 'الرد على سؤال عن المصاريف أو الرصيد',
    parameters: {
      type: 'object',
      properties: {
        question_type: { type: 'string', enum: ['balance','expenses','salary','withdrawals','breakdown','daily','tips','comparison'] }
      },
      required: ['question_type']
    }
  }
];

const SYSTEM_PROMPT = `أنت مساعد ذكي لتتبع المصاريف باللهجة المصرية.

 Rules:
 - لو الرسالة فيها مبلغ رقمي + كلمة صرف/دفع/شراء → log_expense
 - لو فيها سحب/سلف → log_withdrawal
 - لو فيها راتب/مرتب/دخل → log_salary
 - لو فيها سؤال (كام، رصيد، متبقي، تفصيل، نصيحة) → ask_question
 - لو مفيش مبلغ واضح ومفيش سؤال → ask_question مع question_type: "general"
 - رد بالـ tool call المناسب. متشرحش.

 Categories: food, transport, health, bills, shopping, work, home, entertainment, other`;

// ==================== GEMINI ====================
async function callGemini(message, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('No GEMINI_API_KEY');

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
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 429) {
    const err = new Error('Gemini rate limited (429)');
    err.provider = 'gemini';
    err.code = 429;
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
    err.provider = 'gemini';
    err.code = res.status;
    throw err;
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];

  if (!candidate?.content?.parts) {
    throw new Error('Gemini returned no content');
  }

  // Check for function call
  for (const part of candidate.content.parts) {
    if (part.functionCall) {
      return normalizeToolCall(part.functionCall.name, part.functionCall.args || {});
    }
  }

  // Check for text response
  for (const part of candidate.content.parts) {
    if (part.text) {
      return { action: 'answer', reply: part.text };
    }
  }

  throw new Error('Gemini returned unexpected format');
}

// ==================== GROQ ====================
async function callGroq(message, context) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('No GROQ_API_KEY');

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  // Convert tools to OpenAI format
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
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 429) {
    const err = new Error('Groq rate limited (429)');
    err.provider = 'groq';
    err.code = 429;
    throw err;
  }

  if (!res.status === 401) {
    const err = new Error('Groq auth failed (401)');
    err.provider = 'groq';
    err.code = 401;
    throw err;
  }

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Groq API error ${res.status}: ${text.slice(0, 200)}`);
    err.provider = 'groq';
    err.code = res.status;
    throw err;
  }

  const data = await res.json();
  const choice = data.choices?.[0];

  if (!choice) throw new Error('Groq returned no choices');

  // Check for tool call
  const toolCall = choice.message?.tool_calls?.[0];
  if (toolCall) {
    const args = typeof toolCall.function.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    return normalizeToolCall(toolCall.function.name, args);
  }

  // Check for text response
  if (choice.message?.content) {
    return { action: 'answer', reply: choice.message.content };
  }

  throw new Error('Groq returned unexpected format');
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

  // Check for questions
  const q = message;
  if (q.includes('رصيد') || q.includes('متبقي') || q.includes('باقي')) {
    return normalizeToolCall('ask_question', { question_type: 'balance' });
  }
  if (q.includes('مصروف') && (q.includes('كام') || q.includes('إجمالي'))) {
    return normalizeToolCall('ask_question', { question_type: 'expenses' });
  }
  if (q.includes('تفصيل') || q.includes('توزيع')) {
    return normalizeToolCall('ask_question', { question_type: 'breakdown' });
  }
  if (q.includes('راتب') || q.includes('مرتب')) {
    return normalizeToolCall('ask_question', { question_type: 'salary' });
  }
  if (q.includes('اليوم') || q.includes('نهارده')) {
    return normalizeToolCall('ask_question', { question_type: 'daily' });
  }
  if (q.includes('تحليل') || q.includes('نصيحة') || q.includes('نصائح')) {
    return normalizeToolCall('ask_question', { question_type: 'tips' });
  }

  // Default: try to log as expense if there's a number
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
    case 'ask_question':
      return {
        action: 'question',
        question_type: args.question_type || 'balance'
      };
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
  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await callGemini(message, context);
      console.log('✅ Gemini responded');
      return result;
    } catch (err) {
      console.error(`⚠️ Gemini failed (${err.code || 'unknown'}):`, err.message);
    }
  }

  // 2. Try Groq
  if (process.env.GROQ_API_KEY) {
    try {
      const result = await callGroq(message, context);
      console.log('✅ Groq responded');
      return result;
    } catch (err) {
      console.error(`⚠️ Groq failed (${err.code || 'unknown'}):`, err.message);
    }
  }

  // 3. Fallback to keyword parser
  console.log('📝 Using keyword fallback parser');
  return callFallbackParser(message, context);
}
