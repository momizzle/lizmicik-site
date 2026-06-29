/**
 * Signal Check v2 — shared scoring module.
 * Multi-run consistency + 0-100 normalization across three framework dimensions:
 *   Recognition (FIND) · Accuracy (UNDERSTAND) · Consistency (TRUST)
 * Self-contained so it can be imported by the live function and any batch runner.
 * (Fact/vibe patterns are intentionally duplicated from signal-check.mjs for now;
 *  consolidate into this module when the legacy display is retired.)
 */

// ── CONFIG — every tunable in one place ──────────────────────────
export const CONFIG = {
  RUNS: 3,
  weights:     { recognition: 0.30, accuracy: 0.35, consistency: 0.35 },
  within:      { factRecurrence: 0.5, agreeStability: 0.5 },
  consistency: { within: 0.5, across: 0.5 },
  accuracy:    { agree: 0.6, specificity: 0.4 },
  noFactsFloor: 0.3,
  epsilon: 1,
  recogThreshold: 0.5,   // model "recognizes" you if <50% of runs hit a non-recognition phrase
  agreeThreshold: 0.5,   // model "agrees" if it associates you with the keyword in >=50% of runs
  // Bands are PLACEHOLDER until the calibration batch sets them empirically.
  bands: [
    { min: 80, key: 'strong',       label: 'AI sees you clearly' },
    { min: 60, key: 'moderate',     label: 'Mostly legible — gaps to close' },
    { min: 40, key: 'inconsistent', label: 'Inconsistent — AI is guessing' },
    { min: 20, key: 'weak',         label: 'Largely invisible or wrong' },
    { min: 0,  key: 'invisible',    label: 'Effectively invisible to AI' },
  ],
};

export const MODEL_LABELS = { chatgpt: 'ChatGPT', perplexity: 'Perplexity', claude: 'Claude', gemini: 'Google AI' };

// ── Pattern banks ────────────────────────────────────────────────
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
  "limited information","i don't have","i'm not sure","i should note","i couldn't find",
  "not enough information","i'd recommend checking","i'd recommend verifying","i don't know",
  "i was unable","no specific information","couldn't verify","difficult to determine",
  "i cannot browse","i can't browse","i don't have access","unable to access","cannot access","i'm unable to",
  "well-known","well-established","highly regarded","highly reputable","industry leader",
  "leading provider","leading firm","premier","renowned","prestigious",
  "appears to be","seems to be","may be","might be","it's possible","could be","likely",
  "i'd encourage verifying","check their website","verify directly","for the most current",
  "for the most accurate","recommend reaching out","contact them directly",
];

// Subset that signals the model can't actually find/identify you (drives Recognition).
const NON_RECOGNITION_PHRASES = [
  "limited information","i don't have","i couldn't find","not enough information","i don't know",
  "i was unable","no specific information","couldn't verify","difficult to determine",
  "i cannot browse","i can't browse","i don't have access","unable to access","cannot access","i'm unable to",
];

const HEDGING_PHRASES = [
  "limited information","i don't have","i'm not sure","i should note","some confusion","inconsistent",
  "i couldn't find","not enough information","i'd recommend checking","i'd recommend verifying",
  "i don't know","appears to be","seems to be","i was unable","no specific information",
  "couldn't verify","difficult to determine",
];

// ── Primitives ───────────────────────────────────────────────────
export function scoreFactsVsVibes(responseText) {
  const text = responseText || '';
  const lower = text.toLowerCase();
  let factCount = 0; const factMatches = [];
  for (const pattern of FACT_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    const matches = text.match(new RegExp(pattern.source, flags));
    if (matches) for (const m of matches) { factMatches.push(m.trim().substring(0, 60)); factCount++; }
  }
  let vibeCount = 0;
  for (const phrase of VIBE_PHRASES) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) { vibeCount++; idx = lower.indexOf(phrase, idx + phrase.length); }
  }
  return { facts: factCount, vibes: vibeCount, factMatches: [...new Set(factMatches)].slice(0, 8) };
}

export function analyzePlatform(responseText, keyword) {
  const lower = (responseText || '').toLowerCase();
  const kwLower = (keyword || '').toLowerCase();
  const kwWords = kwLower.split(/\s+/).filter(w => w.length > 3);
  const wordMatches = kwWords.filter(w => lower.includes(w));
  const mentionsKeyword = (kwWords.length > 0 && wordMatches.length >= Math.ceil(kwWords.length * 0.5)) || lower.includes(kwLower);
  const hedgeCount = HEDGING_PHRASES.filter(p => lower.includes(p)).length;
  const confident = hedgeCount <= 1;
  return { mentionsKeyword, confident, agrees: mentionsKeyword && confident };
}

function containsNonRecognition(text) {
  const lower = (text || '').toLowerCase();
  return NON_RECOGNITION_PHRASES.some(p => lower.includes(p));
}

// ── Helpers ──────────────────────────────────────────────────────
const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const round1 = n => Math.round(n * 10) / 10;

function factRecurrence(scoredRuns, n) {
  const counts = new Map();
  for (const s of scoredRuns) {
    const uniq = new Set(s.factMatches.map(f => f.toLowerCase().trim()));
    for (const f of uniq) counts.set(f, (counts.get(f) || 0) + 1);
  }
  if (counts.size === 0) return CONFIG.noFactsFloor;
  let sum = 0; for (const c of counts.values()) sum += c / n;
  return sum / counts.size;
}

export function bandFor(score) {
  for (const b of CONFIG.bands) if (score >= b.min) return { key: b.key, label: b.label, min: b.min };
  return { key: 'invisible', label: CONFIG.bands[CONFIG.bands.length - 1].label, min: 0 };
}

function listNames(models) {
  const names = models.map(m => m.name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function headlineFinding(avail, keyword, dims) {
  const unrec = avail.filter(p => !p.recognized);
  if (unrec.length > 0)
    return `${unrec.length} of ${avail.length} AI models couldn't confidently identify what you do as a "${keyword}" provider.`;
  const agree = avail.filter(p => p.agrees), disagree = avail.filter(p => !p.agrees);
  if (disagree.length > 0 && agree.length > 0)
    return `${listNames(agree)} place you in "${keyword}", but ${listNames(disagree)} ${disagree.length > 1 ? "aren't" : "isn't"} sure.`;
  if (dims.consistency < 50)
    return `The AI models recognize you, but their answers shift from run to run — your story isn't landing consistently.`;
  if (dims.accuracy < 55)
    return `All models recognize you, but lean on generalities over verifiable facts.`;
  return `The AI models consistently and confidently describe you as a "${keyword}" provider.`;
}

// ── Main entry point ─────────────────────────────────────────────
// runsByModel: { chatgpt:[t1,t2,t3], perplexity:[...], claude:[...], gemini:[...] }
// (arrays hold ONLY successful run texts; a failed model passes [] and is excluded.)
export function scoreCompany(runsByModel, keyword) {
  const ids = Object.keys(MODEL_LABELS);
  const perModel = [];
  for (const m of ids) {
    const runs = (runsByModel[m] || []).filter(t => typeof t === 'string' && t.trim().length > 0);
    if (runs.length === 0) { perModel.push({ id: m, name: MODEL_LABELS[m], available: false }); continue; }
    const scored = runs.map(scoreFactsVsVibes);
    const facts = mean(scored.map(s => s.facts));
    const vibes = mean(scored.map(s => s.vibes));
    const agreeRate = mean(runs.map(t => analyzePlatform(t, keyword).agrees ? 1 : 0));
    const nonRecogFrac = runs.filter(containsNonRecognition).length / runs.length;
    const fr = factRecurrence(scored, runs.length);
    const withinModel = 100 * (CONFIG.within.factRecurrence * fr + CONFIG.within.agreeStability * agreeRate);
    const specificity = (facts + vibes) === 0 ? CONFIG.noFactsFloor : facts / (facts + vibes + CONFIG.epsilon);
    perModel.push({
      id: m, name: MODEL_LABELS[m], available: true, runs: runs.length,
      facts: round1(facts), vibes: round1(vibes), agreeRate, nonRecogFrac,
      factRecurrence: round1(fr), withinModel, specificity,
      recognized: nonRecogFrac < CONFIG.recogThreshold, agrees: agreeRate >= CONFIG.agreeThreshold,
    });
  }
  const avail = perModel.filter(p => p.available);
  if (avail.length === 0)
    return { overall: 0, band: bandFor(0), dimensions: { recognition: 0, accuracy: 0, consistency: 0 },
             headlineFinding: 'No AI models could be reached. Try again in a moment.', perModel, availableModels: 0 };

  const recognition = Math.round(mean(avail.map(p => 100 * (1 - Math.min(1, p.nonRecogFrac)))));
  const accuracy = Math.round(mean(avail.map(p => 100 * (CONFIG.accuracy.agree * p.agreeRate + CONFIG.accuracy.specificity * p.specificity))));
  const agreementCount = avail.filter(p => p.agrees).length;
  const acrossModel = 100 * agreementCount / avail.length;
  const withinMean = mean(avail.map(p => p.withinModel));
  const consistency = Math.round(CONFIG.consistency.within * withinMean + CONFIG.consistency.across * acrossModel);
  const dimensions = { recognition, accuracy, consistency };
  const overall = Math.round(CONFIG.weights.recognition * recognition + CONFIG.weights.accuracy * accuracy + CONFIG.weights.consistency * consistency);
  return { overall, band: bandFor(overall), dimensions, headlineFinding: headlineFinding(avail, keyword, dimensions), perModel, availableModels: avail.length };
}
