/**
 * Netlify Function: check-readability
 *
 * Queries ChatGPT, Perplexity, and Claude about a company URL,
 * analyzes keyword agreement, and returns results.
 *
 * Environment variables required (set in Netlify dashboard):
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY
 *   PERPLEXITY_API_KEY
 */

// ── Prompt Construction ──────────────────────────────────────────

function buildPrompt(url, keyword) {
  return `I'm looking for a ${keyword} provider. What can you tell me about the company at ${url}? What do they specialize in, and are they a good choice for ${keyword}? Keep your response to 2-3 concise paragraphs.`;
}

function buildInsightPrompt(yoursResponses, competitorResponses, url, competitorUrl, keyword) {
  return `You are an AI readability analyst. I asked three AI platforms about two companies in the "${keyword}" space.

Company A (${url}):
- ChatGPT said: "${yoursResponses.chatgpt}"
- Perplexity said: "${yoursResponses.perplexity}"
- Claude said: "${yoursResponses.claude}"

Company B (${competitorUrl}):
- ChatGPT said: "${competitorResponses.chatgpt}"
- Perplexity said: "${competitorResponses.perplexity}"
- Claude said: "${competitorResponses.claude}"

In 2-3 sentences, compare how confidently and consistently the platforms describe each company. Focus on what makes one more "readable" to AI agents — consistency of description, confidence of language, and strength of association with "${keyword}". Don't use the company URLs, just say "your company" and "the competitor." Be direct and insightful.`;
}

// ── API Callers ──────────────────────────────────────────────────

async function queryOpenAI(url, keyword) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: buildPrompt(url, keyword) }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function queryPerplexity(url, keyword) {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not configured');

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: buildPrompt(url, keyword) }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function queryClaude(url, keyword) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      messages: [{ role: 'user', content: buildPrompt(url, keyword) }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

async function generateInsight(yoursResponses, competitorResponses, url, competitorUrl, keyword) {
  // Use Claude Haiku for the comparison insight — cheapest option
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'Unable to generate comparison insight.';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: buildInsightPrompt(yoursResponses, competitorResponses, url, competitorUrl, keyword),
      }],
    }),
  });

  if (!response.ok) return 'Unable to generate comparison insight.';
  const data = await response.json();
  return data.content[0].text.trim();
}

// ── Analysis ─────────────────────────────────────────────────────

const HEDGING_PHRASES = [
  'limited information',
  'i don\'t have',
  'i\'m not sure',
  'i should note',
  'some confusion',
  'inconsistent',
  'i couldn\'t find',
  'not enough information',
  'i\'d recommend checking',
  'i\'d recommend verifying',
  'i don\'t know',
  'appears to be',
  'seems to be',
  'i was unable',
  'no specific information',
  'couldn\'t verify',
  'difficult to determine',
];

function analyzePlatform(responseText, keyword) {
  const lower = responseText.toLowerCase();
  const kwLower = keyword.toLowerCase();

  // Split keyword into individual words for partial matching
  // e.g. "management consulting" -> check for "management" AND "consulting"
  const kwWords = kwLower.split(/\s+/).filter(w => w.length > 3);
  const wordMatches = kwWords.filter(w => lower.includes(w));
  const mentionsKeyword = wordMatches.length >= Math.ceil(kwWords.length * 0.5) || lower.includes(kwLower);

  // Check for hedging
  const hedgeCount = HEDGING_PHRASES.filter(phrase => lower.includes(phrase)).length;
  const confident = hedgeCount <= 1;

  // Combined: agrees with keyword AND speaks confidently
  const agrees = mentionsKeyword && confident;

  return { mentionsKeyword, confident, hedgeCount, agrees };
}

function analyzeLevel(responses, keyword) {
  const platforms = {
    chatgpt: analyzePlatform(responses.chatgpt, keyword),
    perplexity: analyzePlatform(responses.perplexity, keyword),
    claude: analyzePlatform(responses.claude, keyword),
  };

  const agreementCount = Object.values(platforms).filter(p => p.agrees).length;

  let level;
  if (agreementCount >= 3) level = 'HIGH';
  else if (agreementCount >= 2) level = 'MEDIUM';
  else level = 'LOW';

  return { level, agreementCount, platforms };
}

// ── Simple Rate Limiting ─────────────────────────────────────────
// In-memory rate limit (resets on cold start, ~10min idle)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3; // max 3 checks per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── Handler ──────────────────────────────────────────────────────

export default async (req, context) => {
  // CORS headers (same-origin, but just in case)
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers,
    });
  }

  // Rate limit
  const clientIp = context.ip || req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({
      error: 'Too many requests. Please wait a minute and try again.',
    }), { status: 429, headers });
  }

  try {
    const body = await req.json();
    const { url, keyword, competitorUrl } = body;

    if (!url || !keyword) {
      return new Response(JSON.stringify({ error: 'URL and keyword are required.' }), {
        status: 400, headers,
      });
    }

    // Clean URL
    const cleanUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // ── Phase 1: Query all 3 AIs for the user's company ──
    const [chatgptResult, perplexityResult, claudeResult] = await Promise.allSettled([
      queryOpenAI(cleanUrl, keyword),
      queryPerplexity(cleanUrl, keyword),
      queryClaude(cleanUrl, keyword),
    ]);

    const yours = {
      chatgpt: chatgptResult.status === 'fulfilled'
        ? chatgptResult.value
        : `We couldn't reach ChatGPT right now. This sometimes happens during high-traffic periods. Your Perplexity and Claude results are still valid.`,
      perplexity: perplexityResult.status === 'fulfilled'
        ? perplexityResult.value
        : `We couldn't reach Perplexity right now. This sometimes happens during high-traffic periods. Your ChatGPT and Claude results are still valid.`,
      claude: claudeResult.status === 'fulfilled'
        ? claudeResult.value
        : `We couldn't reach Claude right now. This sometimes happens during high-traffic periods. Your ChatGPT and Perplexity results are still valid.`,
    };

    // Track which platforms actually responded
    const platformsResponded = {
      chatgpt: chatgptResult.status === 'fulfilled',
      perplexity: perplexityResult.status === 'fulfilled',
      claude: claudeResult.status === 'fulfilled',
    };

    // ── Phase 2: Analyze readability level ──
    const analysis = analyzeLevel(yours, keyword);

    // ── Phase 3: If competitor provided, query for them too ──
    let competitor = null;
    let insight = null;

    if (competitorUrl) {
      const cleanCompUrl = competitorUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const [cChatgpt, cPerplexity, cClaude] = await Promise.allSettled([
        queryOpenAI(cleanCompUrl, keyword),
        queryPerplexity(cleanCompUrl, keyword),
        queryClaude(cleanCompUrl, keyword),
      ]);

      competitor = {
        chatgpt: cChatgpt.status === 'fulfilled'
          ? cChatgpt.value
          : 'Unable to query ChatGPT for this competitor at this time.',
        perplexity: cPerplexity.status === 'fulfilled'
          ? cPerplexity.value
          : 'Unable to query Perplexity for this competitor at this time.',
        claude: cClaude.status === 'fulfilled'
          ? cClaude.value
          : 'Unable to query Claude for this competitor at this time.',
      };

      // Generate comparison insight using Claude Haiku
      insight = await generateInsight(yours, competitor, cleanUrl, cleanCompUrl, keyword);
    }

    return new Response(JSON.stringify({
      yours,
      analysis,
      competitor,
      insight,
      platformsResponded,
    }), { status: 200, headers });

  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({
      error: 'Something went wrong. Please try again.',
      detail: err.message,
    }), { status: 500, headers });
  }
};

// Netlify Functions v2 config
export const config = {
  path: '/api/check-readability',
};
