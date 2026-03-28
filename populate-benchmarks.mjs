#!/usr/bin/env node
/**
 * populate-benchmarks.mjs
 *
 * Queries all 4 AI platforms for each titan company in our benchmark list,
 * scores the responses with the same Fact vs Vibe engine used in the free tool,
 * and outputs a JSON constant you can paste into check-readability.mjs.
 *
 * Usage:
 *   OPENAI_API_KEY=... PERPLEXITY_API_KEY=... ANTHROPIC_API_KEY=... GOOGLE_API_KEY=... \
 *   node populate-benchmarks.mjs
 *
 * Or, if you have a .env file:
 *   npm install dotenv && node -e "require('dotenv').config()" populate-benchmarks.mjs
 *
 * Output: benchmark-cache.json (copy into BENCHMARK_CACHE in check-readability.mjs)
 *
 * Rate limits: This makes 4 API calls per titan × ~35 titans = ~140 calls.
 * At free-tier Gemini rates (250/day), this fits in one run.
 * Add a delay between titans to be safe.
 */

import { writeFileSync } from 'fs';

// ── Same prompt as the free tool ────────────────────────────────
function buildPrompt(url, keyword) {
  return `I'm looking for a ${keyword} provider. What can you tell me about the company at ${url}? What do they specialize in, and are they a good choice for ${keyword}? Keep your response to 2-3 concise paragraphs.`;
}

// ── Same scoring engine ─────────────────────────────────────────
const FACT_PATTERNS = [
  /\b(?:founded|established|since|started|launched|formed)\s+(?:in\s+)?\d{4}\b/i,
  /\b\d[\d,]*\+?\s*(?:employees?|staff|team members?|consultants?|professionals?|people|workers)\b/i,
  /\$[\d,.]+\s*(?:M|B|K|million|billion|thousand|revenue|annual)?\b/i,
  /\b\d+(?:\.\d+)?%\s*(?:increase|decrease|growth|reduction|improvement|decline|market share|YoY|year.over.year)\b/i,
  /\b(?:headquartered|based|offices?|locations?)\s+(?:in|across)\s+[A-Z][a-z]{2,}/,
  /\b(?:recognized|awarded|named|ranked|listed)\s+(?:by|as|in|on)\s+[A-Z][a-z]/,
  /\b(?:Fortune\s+\d+|Inc\.\s+\d+|Forbes|Harvard Business Review|Consulting Magazine|Gartner|Forrester|G2|Clutch)\b/,
  /\[\d+\]/,
  /\b(?:clients?\s+include|serving|worked with|partnered with|notable\s+clients?)\s+[A-Z]/,
  /\b(?:ranked?\s+#?\d|top\s+\d+|rated\s+\d)/i,
  /\b(?:CEO|founder|president|partner|director|managing\s+partner)\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
  /\b(?:in|since|as of|circa)\s+(?:19|20)\d{2}\b/i,
  /\b\d+\s+(?:offices?|locations?|branches|cities|countries)\b/i,
];

const VIBE_PHRASES = [
  'limited information', "i don't have", "i'm not sure",
  'i should note', "i couldn't find", 'not enough information',
  "i'd recommend checking", "i'd recommend verifying",
  "i don't know", 'i was unable', 'no specific information',
  "couldn't verify", 'difficult to determine',
  "i cannot browse", "i can't browse", "i don't have access",
  'unable to access', 'cannot access', "i'm unable to",
  'well-known', 'well-established', 'highly regarded', 'highly reputable',
  'industry leader', 'leading provider', 'leading firm',
  'premier', 'renowned', 'prestigious',
  'appears to be', 'seems to be', 'may be', 'might be',
  "it's possible", 'could be', 'likely',
  "i'd encourage verifying", 'check their website',
  'verify directly', 'for the most current', 'for the most accurate',
  'recommend reaching out', 'contact them directly',
];

function scoreFactsVsVibes(responseText) {
  const lower = responseText.toLowerCase();
  const original = responseText;
  let factCount = 0;
  const factMatches = [];
  for (const pattern of FACT_PATTERNS) {
    const matches = original.match(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')));
    if (matches) {
      for (const m of matches) {
        factMatches.push(m.trim().substring(0, 60));
        factCount++;
      }
    }
  }
  let vibeCount = 0;
  const vibeMatches = [];
  for (const phrase of VIBE_PHRASES) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      vibeCount++;
      vibeMatches.push(phrase);
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }
  const score = (factCount * 2) - (vibeCount * 2);
  return { facts: factCount, vibes: vibeCount, score, factMatches: [...new Set(factMatches)].slice(0, 8), vibeMatches: [...new Set(vibeMatches)].slice(0, 8) };
}

function scoreAllPlatforms(responses) {
  const platforms = {};
  for (const [name, text] of Object.entries(responses)) {
    platforms[name] = scoreFactsVsVibes(text);
  }
  const totalScore = Object.values(platforms).reduce((sum, p) => sum + p.score, 0);
  const totalFacts = Object.values(platforms).reduce((sum, p) => sum + p.facts, 0);
  const totalVibes = Object.values(platforms).reduce((sum, p) => sum + p.vibes, 0);
  return { platforms, totalScore, totalFacts, totalVibes };
}

// ── API Callers ─────────────────────────────────────────────────
async function queryOpenAI(url, keyword) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: buildPrompt(url, keyword) }], max_tokens: 500, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function queryPerplexity(url, keyword) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: buildPrompt(url, keyword) }], max_tokens: 500, temperature: 0.7 }),
  });
  if (!res.ok) throw new Error(`Perplexity ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function queryClaude(url, keyword) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: buildPrompt(url, keyword) }] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  return data.content[0].text.trim();
}

async function queryGemini(url, keyword) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(url, keyword) }] }], generationConfig: { maxOutputTokens: 500, temperature: 0.7 } }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text.trim();
}

// ── Titans list (same as INDUSTRY_BENCHMARKS in check-readability.mjs) ──
const TITANS = [
  { titan: 'cargill.com', keyword: 'agriculture', category: 'Agriculture & Farming' },
  { titan: 'exxonmobil.com', keyword: 'energy', category: 'Mining & Energy' },
  { titan: 'bechtel.com', keyword: 'construction', category: 'Construction & Engineering' },
  { titan: 'nestle.com', keyword: 'food and beverage', category: 'Food & Beverage' },
  { titan: 'nike.com', keyword: 'fashion and apparel', category: 'Fashion & Apparel' },
  { titan: 'nytimes.com', keyword: 'publishing', category: 'Publishing & Media' },
  { titan: 'pfizer.com', keyword: 'pharmaceuticals', category: 'Pharmaceuticals & Life Sciences' },
  { titan: 'caterpillar.com', keyword: 'industrial manufacturing', category: 'Industrial Manufacturing' },
  { titan: 'apple.com', keyword: 'technology', category: 'Technology & Electronics' },
  { titan: 'pg.com', keyword: 'consumer products', category: 'Consumer Products' },
  { titan: 'ups.com', keyword: 'logistics', category: 'Transportation & Logistics' },
  { titan: 'verizon.com', keyword: 'telecommunications', category: 'Telecommunications' },
  { titan: 'nexteraenergy.com', keyword: 'utilities', category: 'Utilities & Clean Energy' },
  { titan: 'mckesson.com', keyword: 'wholesale distribution', category: 'Wholesale & Distribution' },
  { titan: 'amazon.com', keyword: 'retail', category: 'Retail & eCommerce' },
  { titan: 'jpmorgan.com', keyword: 'banking', category: 'Banking & Financial Services' },
  { titan: 'statefarm.com', keyword: 'insurance', category: 'Insurance' },
  { titan: 'cbre.com', keyword: 'real estate', category: 'Real Estate' },
  { titan: 'blackrock.com', keyword: 'investment management', category: 'Investment & Asset Management' },
  { titan: 'marriott.com', keyword: 'hospitality', category: 'Hospitality & Travel' },
  { titan: 'salesforce.com', keyword: 'enterprise software', category: 'Software & SaaS' },
  { titan: 'mckinsey.com', keyword: 'management consulting', category: 'Management Consulting' },
  { titan: 'wpp.com', keyword: 'advertising', category: 'Marketing & Advertising' },
  { titan: 'deloitte.com', keyword: 'accounting', category: 'Accounting & Tax' },
  { titan: 'kirkland.com', keyword: 'law firm', category: 'Legal Services' },
  { titan: 'mayoclinic.org', keyword: 'healthcare', category: 'Healthcare' },
  { titan: 'harvard.edu', keyword: 'education', category: 'Education & Training' },
  { titan: 'gensler.com', keyword: 'architecture', category: 'Architecture & Design' },
  { titan: 'crowdstrike.com', keyword: 'cybersecurity', category: 'Cybersecurity & IT Services' },
  { titan: 'redcross.org', keyword: 'nonprofit', category: 'Nonprofit & Social Services' },
  { titan: 'disney.com', keyword: 'entertainment', category: 'Entertainment & Recreation' },
  { titan: 'wm.com', keyword: 'environmental services', category: 'Environmental Services' },
  { titan: 'gsa.gov', keyword: 'government services', category: 'Government & Public Sector' },
  { titan: 'accenture.com', keyword: 'professional services', category: 'Professional Services' },
  { titan: 'adeccogroup.com', keyword: 'staffing', category: 'Business Services & Staffing' },
  { titan: 'regiscorp.com', keyword: 'personal services', category: 'Personal Services' },
];

// ── Main ────────────────────────────────────────────────────────
async function main() {
  // Validate env vars
  const required = ['OPENAI_API_KEY', 'PERPLEXITY_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_API_KEY'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error('Missing environment variables:', missing.join(', '));
    process.exit(1);
  }

  const cache = {};
  let successes = 0;
  let failures = 0;

  for (let i = 0; i < TITANS.length; i++) {
    const t = TITANS[i];
    console.log(`[${i + 1}/${TITANS.length}] Querying ${t.titanName || t.titan} (${t.category})...`);

    try {
      const [chatgpt, perplexity, claude, gemini] = await Promise.allSettled([
        queryOpenAI(t.titan, t.keyword),
        queryPerplexity(t.titan, t.keyword),
        queryClaude(t.titan, t.keyword),
        queryGemini(t.titan, t.keyword),
      ]);

      const responses = {
        chatgpt: chatgpt.status === 'fulfilled' ? chatgpt.value : '',
        perplexity: perplexity.status === 'fulfilled' ? perplexity.value : '',
        claude: claude.status === 'fulfilled' ? claude.value : '',
        gemini: gemini.status === 'fulfilled' ? gemini.value : '',
      };

      const scoring = scoreAllPlatforms(responses);
      cache[t.titan] = scoring;
      console.log(`  → Score: ${scoring.totalScore} (${scoring.totalFacts} facts, ${scoring.totalVibes} vibes)`);
      successes++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      failures++;
    }

    // Rate limiting: 2 second delay between titans
    if (i < TITANS.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Write output
  writeFileSync('benchmark-cache.json', JSON.stringify(cache, null, 2));
  console.log(`\nDone. ${successes} succeeded, ${failures} failed.`);
  console.log('Output: benchmark-cache.json');
  console.log('\nTo use: Copy the JSON contents into the BENCHMARK_CACHE constant in check-readability.mjs');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
