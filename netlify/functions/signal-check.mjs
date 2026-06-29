/**
 * Netlify Function: signal-check
 *
 * Queries ChatGPT, Perplexity, Claude, and Gemini about a company URL,
 * analyzes keyword agreement, and returns results.
 *
 * Environment variables required (set in Netlify dashboard):
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY
 *   PERPLEXITY_API_KEY
 *   GOOGLE_API_KEY
 */

// ── Prompt Construction ──────────────────────────────────────────
import { scoreCompany, CONFIG } from './lib/scoring.mjs';

function buildPrompt(url, keyword) {
  return `I'm looking for a ${keyword} provider. What can you tell me about the company at ${url}? What do they specialize in, and are they a good choice for ${keyword}? Keep your response to 2-3 concise paragraphs.`;
}

function buildInsightPrompt(yoursResponses, competitorResponses, url, competitorUrl, keyword) {
  return `You are an AI readability analyst. I asked four AI platforms about two companies in the "${keyword}" space.

Company A (${url}):
- ChatGPT said: "${yoursResponses.chatgpt}"
- Perplexity said: "${yoursResponses.perplexity}"
- Claude said: "${yoursResponses.claude}"
- Google Gemini said: "${yoursResponses.gemini}"

Company B (${competitorUrl}):
- ChatGPT said: "${competitorResponses.chatgpt}"
- Perplexity said: "${competitorResponses.perplexity}"
- Claude said: "${competitorResponses.claude}"
- Google Gemini said: "${competitorResponses.gemini}"

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
      model: 'claude-sonnet-4-6',
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

async function queryGemini(url, keyword) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(url, keyword) }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function generateInsight(yoursResponses, competitorResponses, url, competitorUrl, keyword) {
  // Use Claude Haiku for the comparison insight — internal analysis, not representing model knowledge
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
      model: 'claude-haiku-4-5-20251001',
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

// ── Industry Benchmark System ────────────────────────────────────
// Maps SIC divisions into ~30 practical categories, each with a
// recognizable titan whose AI responses will be fact-rich.
// Keywords are lowercase fragments used for auto-matching.
//
// Architecture: Benchmark data is PRE-CACHED (run once, store as JSON).
// The free tool returns the matched category + cached titan scores
// alongside the user's live scores.

const INDUSTRY_BENCHMARKS = [
  // ── Agriculture, Forestry, Fishing (SIC 01-09) ──
  { category: 'Agriculture & Farming', titan: 'cargill.com', titanName: 'Cargill',
    keywords: ['agriculture', 'farming', 'crop', 'livestock', 'agribusiness', 'dairy', 'poultry', 'horticulture', 'forestry', 'timber', 'fishing', 'aquaculture', 'ranch', 'grain', 'seed', 'fertilizer', 'agri', 'agtech', 'precision agriculture', 'organic farming', 'vineyard', 'viticulture', 'greenhouse', 'farm-to-table', 'commodity trading', 'feed mill', 'agricultural cooperative', 'farm equipment', 'agronomist', 'soil management', 'irrigation', 'pesticide', 'cattle', 'swine', 'soybean', 'cotton', 'sugarcane', 'hemp', 'nursery', 'floriculture', 'apiary', 'mushroom farm', 'vertical farming'] },

  // ── Mining (SIC 10-14) ──
  { category: 'Mining & Energy', titan: 'exxonmobil.com', titanName: 'ExxonMobil',
    keywords: ['mining', 'oil', 'gas', 'petroleum', 'energy', 'drilling', 'extraction', 'coal', 'mineral', 'quarry', 'natural gas', 'fracking', 'refinery', 'upstream', 'midstream', 'downstream', 'oilfield', 'oil rig', 'pipeline', 'lng', 'fossil fuel', 'hydrocarbon', 'ore', 'copper mining', 'gold mining', 'lithium', 'rare earth', 'shale', 'energy trading', 'fuel production', 'mineral exploration', 'geologist', 'mining engineer', 'petrochem', 'wellhead', 'subsurface', 'offshore drilling', 'seismic', 'energy infrastructure'] },

  // ── Construction (SIC 15-17) ──
  { category: 'Construction & Engineering', titan: 'bechtel.com', titanName: 'Bechtel',
    keywords: ['construction', 'general contractor', 'building', 'engineering', 'civil engineering', 'heavy construction', 'renovation', 'infrastructure', 'plumbing', 'electrical contractor', 'hvac', 'roofing', 'paving', 'subcontractor', 'construction management', 'construction estimator', 'site safety', 'concrete', 'demolition', 'earthwork', 'excavation', 'scaffolding', 'drywall', 'structural steel', 'construction superintendent', 'building permit', 'code compliance', 'commercial construction', 'residential construction', 'construction bid', 'mason', 'carpentry', 'contech'] },

  // ── Manufacturing — Food & Beverage (SIC 20-21) ──
  { category: 'Food & Beverage', titan: 'nestle.com', titanName: 'Nestlé',
    keywords: ['food', 'beverage', 'restaurant', 'catering', 'bakery', 'brewery', 'winery', 'distillery', 'snack', 'meat processing', 'food manufacturing', 'packaged food', 'confectionery', 'dairy processing', 'food service', 'food safety', 'food scientist', 'food truck', 'quick service restaurant', 'qsr', 'fast casual', 'bar', 'pub', 'coffee shop', 'cafe', 'food tech', 'ghost kitchen', 'meal kit', 'frozen food', 'canned food', 'organic food', 'gluten free', 'vegan food', 'food franchise', 'nutrition', 'sommelier', 'mixology', 'food packaging'] },

  // ── Manufacturing — Textiles, Apparel (SIC 22-23) ──
  { category: 'Fashion & Apparel', titan: 'nike.com', titanName: 'Nike',
    keywords: ['fashion', 'apparel', 'clothing', 'textile', 'garment', 'footwear', 'accessories', 'luxury fashion', 'sportswear', 'athleisure', 'fashion design', 'fashion label', 'clothing brand', 'clothing line', 'fashion retail', 'fast fashion', 'sustainable fashion', 'haute couture', 'ready-to-wear', 'denim', 'outerwear', 'lingerie', 'swimwear', 'activewear', 'fashion wholesale', 'fashion buyer', 'trend forecasting', 'pattern making', 'fashion show', 'jewelry', 'handbag', 'eyewear', 'fashion ecommerce'] },

  // ── Manufacturing — Wood, Paper, Printing (SIC 24-27) ──
  { category: 'Publishing & Media', titan: 'nytimes.com', titanName: 'The New York Times',
    keywords: ['publishing', 'media', 'printing', 'newspaper', 'magazine', 'book publisher', 'digital media', 'content publisher', 'journalism', 'packaging', 'news outlet', 'editorial', 'reporter', 'journalist', 'editor', 'press', 'news agency', 'media company', 'podcast network', 'newsletter platform', 'media production', 'investigative journalism', 'paywall', 'subscription media', 'print media', 'broadcast media', 'news desk', 'wire service', 'literary agent', 'book distributor', 'media relations', 'press release'] },

  // ── Manufacturing — Chemicals, Pharma (SIC 28-29) ──
  { category: 'Pharmaceuticals & Life Sciences', titan: 'pfizer.com', titanName: 'Pfizer',
    keywords: ['pharmaceutical', 'pharma', 'biotech', 'biotechnology', 'life sciences', 'drug', 'clinical', 'medical device', 'chemical', 'specialty chemical', 'lab', 'genomics', 'therapeutic', 'clinical trial', 'drug development', 'drug discovery', 'fda', 'drug manufacturing', 'generic drug', 'biologic', 'biosimilar', 'vaccine', 'pharmacist', 'pharmacology', 'toxicology', 'regulatory affairs', 'cro', 'contract research', 'pharmaceutical sales', 'med device', 'diagnostic', 'molecular biology', 'proteomics', 'nutraceutical', 'healthtech'] },

  // ── Manufacturing — Rubber, Plastics, Stone, Metals (SIC 30-34) ──
  { category: 'Industrial Manufacturing', titan: 'caterpillar.com', titanName: 'Caterpillar',
    keywords: ['manufacturing', 'industrial', 'plastics', 'rubber', 'metals', 'steel', 'aluminum', 'fabrication', 'machining', 'foundry', 'forging', 'metal stamping', 'tooling', 'factory', 'production line', 'assembly line', 'cnc', 'injection molding', 'die casting', 'sheet metal', 'precision manufacturing', 'additive manufacturing', '3d printing', 'quality control', 'lean manufacturing', 'six sigma', 'oem', 'contract manufacturing', 'industrial automation', 'robotics', 'manufacturing engineer', 'plant manager', 'iso 9001', 'aerospace manufacturing', 'automotive manufacturing', 'composite materials'] },

  // ── Manufacturing — Electronics, Instruments (SIC 35-38) ──
  { category: 'Technology & Electronics', titan: 'apple.com', titanName: 'Apple',
    keywords: ['electronics', 'semiconductor', 'computer hardware', 'components', 'instruments', 'measurement', 'optics', 'sensor', 'chip', 'circuit board', 'chipmaker', 'processor', 'microcontroller', 'embedded systems', 'pcb', 'display technology', 'led', 'lcd', 'wearable technology', 'smart device', 'iot', 'internet of things', 'consumer electronics', 'electronic component', 'circuit design', 'fpga', 'asic', 'wafer', 'fab', 'lidar', 'radar', 'robotics hardware'] },

  // ── Manufacturing — Misc (SIC 39) ──
  { category: 'Consumer Products', titan: 'pg.com', titanName: 'Procter & Gamble',
    keywords: ['consumer products', 'consumer goods', 'cpg', 'household products', 'personal care', 'cosmetics', 'beauty', 'skincare', 'toys', 'sporting goods', 'fmcg', 'home care', 'cleaning products', 'toiletries', 'fragrance', 'haircare', 'oral care', 'baby products', 'pet products', 'pet food', 'brand management', 'product innovation', 'consumer marketing', 'retail promotion', 'merchandising', 'consumer insight', 'product packaging', 'dtc', 'direct to consumer'] },

  // ── Transportation (SIC 40-42) ──
  { category: 'Transportation & Logistics', titan: 'ups.com', titanName: 'UPS',
    keywords: ['transportation', 'logistics', 'shipping', 'freight', 'trucking', 'railroad', 'airline', 'aviation', 'maritime', 'supply chain', 'warehousing', 'distribution', 'courier', '3pl', 'fulfillment', 'last mile', 'last-mile delivery', 'cargo', 'fleet management', 'freight broker', 'customs broker', 'cold chain', 'intermodal', 'drayage', 'ltl', 'ftl', 'parcel', 'ocean freight', 'air freight', 'truck driver', 'route optimization', 'logistics software', 'supply chain management', 'port', 'terminal', 'rail freight', 'logistics provider'] },

  // ── Communications (SIC 48) ──
  { category: 'Telecommunications', titan: 'verizon.com', titanName: 'Verizon',
    keywords: ['telecom', 'telecommunications', 'wireless', 'broadband', 'internet service', 'isp', 'cable', 'fiber', 'cellular', '5g', 'satellite', 'fiber optic', 'network infrastructure', 'telecom provider', 'mobile network', 'cell tower', 'spectrum', 'voip', 'unified communications', 'network engineer', 'telecom equipment', 'network operations', 'data transmission', 'bandwidth', 'latency', 'connectivity', 'telecom tower', 'communication technology'] },

  // ── Utilities (SIC 49) ──
  { category: 'Utilities & Clean Energy', titan: 'nexteraenergy.com', titanName: 'NextEra Energy',
    keywords: ['utility', 'utilities', 'electric', 'power', 'water utility', 'sanitary', 'renewable energy', 'solar', 'wind energy', 'clean energy', 'grid', 'solar panel', 'wind turbine', 'hydroelectric', 'geothermal', 'biomass', 'energy storage', 'battery storage', 'microgrid', 'smart grid', 'energy efficiency', 'energy management', 'cleantech', 'power distribution', 'energy transition', 'electric vehicle charging', 'ev charging', 'utility rate', 'meter', 'energy audit', 'net metering', 'carbon neutral', 'power plant'] },

  // ── Wholesale Trade (SIC 50-51) ──
  { category: 'Wholesale & Distribution', titan: 'mckesson.com', titanName: 'McKesson',
    keywords: ['wholesale', 'distributor', 'distribution', 'import', 'export', 'trade', 'bulk', 'b2b supplier', 'wholesale distributor', 'wholesale supplier', 'import export', 'trade company', 'medical supplier', 'pharmaceutical distributor', 'industrial supplier', 'janitorial supplier', 'wholesale buyer', 'distribution network', 'order fulfillment', 'wholesale marketplace', 'building materials distributor', 'wholesale pricing', 'reseller', 'dealer'] },

  // ── Retail Trade (SIC 52-59) ──
  { category: 'Retail & eCommerce', titan: 'amazon.com', titanName: 'Amazon',
    keywords: ['retail', 'ecommerce', 'e-commerce', 'online store', 'shop', 'department store', 'grocery', 'supermarket', 'convenience', 'auto dealer', 'dealership', 'home improvement', 'pharmacy', 'drugstore', 'franchise', 'franchisee', 'franchisor', 'franchise opportunities', 'retail chain', 'retail franchise', 'brick and mortar', 'point of sale', 'pos', 'omnichannel', 'marketplace seller', 'amazon seller', 'shopify', 'retail technology', 'checkout', 'retail analytics', 'inventory management', 'loss prevention', 'visual merchandising', 'retail store', 'shopping center', 'mall', 'outlet', 'retail brand'] },

  // ── Finance — Banking (SIC 60-61) ──
  { category: 'Banking & Financial Services', titan: 'jpmorgan.com', titanName: 'JPMorgan Chase',
    keywords: ['bank', 'banking', 'financial services', 'credit union', 'lending', 'mortgage', 'loan', 'fintech', 'payment', 'wealth management', 'private equity', 'venture capital', 'investment banking', 'credit', 'deposit', 'checking account', 'savings account', 'commercial bank', 'community bank', 'digital banking', 'neobank', 'payment processor', 'payment gateway', 'merchant services', 'credit card', 'debit card', 'financial institution', 'banker', 'loan officer', 'financial regulation', 'compliance officer', 'anti money laundering', 'aml', 'kyc'] },

  // ── Finance — Insurance (SIC 63-64) ──
  { category: 'Insurance', titan: 'statefarm.com', titanName: 'State Farm',
    keywords: ['insurance', 'insurer', 'underwriting', 'risk management', 'actuarial', 'life insurance', 'health insurance', 'property insurance', 'casualty', 'reinsurance', 'claims', 'insurance agent', 'insurance broker', 'insurance company', 'auto insurance', 'homeowners insurance', 'commercial insurance', 'liability insurance', 'workers compensation', 'insurance adjuster', 'claims adjuster', 'insurance underwriter', 'insurtech', 'insurance carrier', 'policy', 'premium', 'deductible', 'insurance coverage', 'cyber insurance', 'professional liability', 'errors and omissions'] },

  // ── Finance — Real Estate (SIC 65) ──
  { category: 'Real Estate', titan: 'cbre.com', titanName: 'CBRE',
    keywords: ['real estate', 'property management', 'commercial real estate', 'residential', 'brokerage', 'realty', 'mortgage broker', 'reit', 'leasing', 'appraisal', 'property development', 'real estate agent', 'realtor', 'real estate broker', 'real estate investor', 'property developer', 'land development', 'property appraiser', 'commercial property', 'commercial lease', 'tenant', 'landlord', 'proptech', 'property technology', 'mls', 'multiple listing', 'real estate investment', 'real estate marketing', 'cre', 'multifamily', 'self storage', 'industrial real estate'] },

  // ── Finance — Investment, Holding (SIC 67) ──
  { category: 'Investment & Asset Management', titan: 'blackrock.com', titanName: 'BlackRock',
    keywords: ['investment', 'asset management', 'hedge fund', 'portfolio', 'fund manager', 'trust', 'holding company', 'family office', 'mutual fund', 'etf', 'exchange traded fund', 'investment advisor', 'ria', 'registered investment advisor', 'investment strategy', 'asset allocation', 'portfolio management', 'securities', 'investment firm', 'investment management', 'fixed income', 'equities', 'alternative investments', 'private credit', 'endowment', 'pension fund', 'sovereign wealth', 'fiduciary'] },

  // ── Services — Hotels, Lodging (SIC 70) ──
  { category: 'Hospitality & Travel', titan: 'marriott.com', titanName: 'Marriott',
    keywords: ['hotel', 'hospitality', 'travel', 'tourism', 'resort', 'lodging', 'vacation', 'cruise', 'bed and breakfast', 'event venue', 'motel', 'hostel', 'inn', 'accommodation', 'hotel management', 'concierge', 'front desk', 'housekeeping', 'travel agency', 'tour operator', 'destination marketing', 'convention center', 'banquet hall', 'wedding venue', 'vacation rental', 'airbnb host', 'hotel chain', 'hospitality management', 'guest experience', 'hospitality franchise', 'casino', 'hospitality technology'] },

  // ── Services — Personal (SIC 72) ──
  { category: 'Personal Services', titan: 'regiscorp.com', titanName: 'Regis Corporation',
    keywords: ['laundry', 'dry cleaning', 'salon', 'barber', 'spa', 'funeral', 'photography studio', 'tattoo', 'personal service', 'hair salon', 'nail salon', 'beauty salon', 'massage therapy', 'esthetician', 'cosmetologist', 'hair stylist', 'pet grooming', 'dog grooming', 'wedding planner', 'event planner', 'tailor', 'alterations', 'cleaning service', 'maid service', 'moving company', 'storage facility', 'auto detailing', 'car wash', 'locksmith'] },

  // ── Services — Business Services (SIC 73) ──
  { category: 'Business Services & Staffing', titan: 'adeccogroup.com', titanName: 'Adecco',
    keywords: ['staffing', 'recruiting', 'temp agency', 'janitorial', 'security service', 'pest control', 'facility management', 'copy center', 'printing service', 'mailing service', 'staffing agency', 'recruitment agency', 'headhunter', 'executive search', 'hr outsourcing', 'peo', 'professional employer organization', 'talent acquisition', 'workforce management', 'office supplies', 'document management', 'shredding service', 'background check', 'drug testing', 'coworking', 'virtual office', 'answering service', 'call center', 'bpo', 'business process outsourcing'] },

  // ── Services — IT & Software (SIC 737) ──
  { category: 'Software & SaaS', titan: 'salesforce.com', titanName: 'Salesforce',
    keywords: ['software', 'saas', 'cloud', 'platform', 'app', 'mobile app', 'enterprise software', 'erp', 'crm', 'devops', 'api', 'data platform', 'analytics platform', 'ai platform', 'machine learning', 'software development', 'software company', 'software engineer', 'developer tools', 'low code', 'no code', 'cloud computing', 'cloud native', 'microservices', 'data analytics', 'business intelligence', 'bi tool', 'project management software', 'collaboration software', 'hr software', 'hris', 'accounting software', 'martech', 'customer success', 'helpdesk software', 'ticketing system', 'automation platform', 'workflow automation', 'fintech software'] },

  // ── Services — Consulting & Professional (SIC 87) ──
  { category: 'Management Consulting', titan: 'mckinsey.com', titanName: 'McKinsey',
    keywords: ['consulting', 'management consulting', 'strategy consulting', 'business consulting', 'advisory', 'transformation', 'change management', 'organizational', 'consulting firm', 'consultant', 'management consultant', 'strategy consultant', 'business advisor', 'business advisory', 'operational consulting', 'operations consulting', 'strategic planning', 'business strategy', 'organizational design', 'management advisory', 'consulting engagement', 'due diligence', 'restructuring', 'turnaround consulting', 'technology consulting', 'digital transformation consulting'] },

  // ── Services — Marketing & Advertising (SIC 731) ──
  { category: 'Marketing & Advertising', titan: 'wpp.com', titanName: 'WPP',
    keywords: ['marketing', 'advertising', 'digital marketing', 'seo', 'ppc', 'social media marketing', 'branding', 'creative agency', 'media agency', 'pr agency', 'public relations', 'content marketing', 'influencer', 'ad agency', 'advertising agency', 'marketing agency', 'marketing firm', 'growth marketing', 'performance marketing', 'email marketing', 'marketing automation', 'demand generation', 'lead generation', 'market research', 'brand strategy', 'copywriting', 'copywriter', 'graphic design agency', 'web design agency', 'digital agency', 'media buying', 'programmatic advertising', 'affiliate marketing', 'influencer marketing', 'video production', 'marketing analytics', 'conversion optimization', 'cro agency'] },

  // ── Services — Accounting & Tax (SIC 872) ──
  { category: 'Accounting & Tax', titan: 'deloitte.com', titanName: 'Deloitte',
    keywords: ['accounting', 'tax', 'audit', 'bookkeeping', 'cpa', 'financial advisory', 'assurance', 'tax preparation', 'payroll', 'accountant', 'tax accountant', 'certified public accountant', 'accounting firm', 'tax advisor', 'tax consultant', 'tax planning', 'tax filing', 'tax return', 'financial reporting', 'financial statement', 'general ledger', 'gaap', 'ifrs', 'forensic accounting', 'cost accounting', 'management accounting', 'controller', 'cfo services', 'fractional cfo', 'audit firm', 'tax compliance', 'corporate tax', 'estate tax', 'tax strategy'] },

  // ── Services — Legal (SIC 81) ──
  { category: 'Legal Services', titan: 'kirkland.com', titanName: 'Kirkland & Ellis',
    keywords: ['law firm', 'legal', 'attorney', 'lawyer', 'litigation', 'corporate law', 'intellectual property', 'patent', 'immigration law', 'family law', 'estate planning', 'compliance', 'legal services', 'legal counsel', 'paralegal', 'ip law', 'trademark', 'copyright', 'employment law', 'labor law', 'real estate law', 'criminal defense', 'personal injury', 'medical malpractice', 'class action', 'contract law', 'mergers and acquisitions', 'securities law', 'tax law', 'environmental law', 'bankruptcy law', 'legal tech', 'legaltech', 'dispute resolution', 'arbitration', 'mediation'] },

  // ── Services — Healthcare (SIC 80) ──
  { category: 'Healthcare', titan: 'mayoclinic.org', titanName: 'Mayo Clinic',
    keywords: ['healthcare', 'health care', 'hospital', 'medical', 'clinic', 'physician', 'dental', 'dentist', 'optometry', 'chiropractic', 'physical therapy', 'mental health', 'behavioral health', 'nursing', 'home health', 'telemedicine', 'telehealth', 'doctor', 'surgeon', 'nurse practitioner', 'urgent care', 'primary care', 'specialist', 'orthopedic', 'cardiology', 'oncology', 'dermatology', 'pediatrics', 'ob gyn', 'radiology', 'pathology', 'anesthesiology', 'orthodontist', 'oral surgeon', 'optometrist', 'ophthalmologist', 'podiatrist', 'physical therapist', 'occupational therapy', 'speech therapy', 'assisted living', 'skilled nursing', 'hospice', 'ambulatory', 'outpatient', 'medical practice', 'healthcare system', 'patient care', 'ehr', 'electronic health record'] },

  // ── Services — Education (SIC 82) ──
  { category: 'Education & Training', titan: 'harvard.edu', titanName: 'Harvard University',
    keywords: ['education', 'school', 'university', 'college', 'training', 'e-learning', 'edtech', 'tutoring', 'curriculum', 'certification', 'online course', 'vocational', 'k-12', 'teacher', 'instructor', 'professor', 'academic', 'higher education', 'continuing education', 'professional development', 'learning management', 'lms', 'online learning', 'distance learning', 'charter school', 'private school', 'preschool', 'daycare', 'childcare', 'montessori', 'stem education', 'corporate training', 'leadership training', 'bootcamp', 'coding bootcamp', 'test prep', 'educational publisher', 'student services'] },

  // ── Services — Engineering & Architecture (SIC 871) ──
  { category: 'Architecture & Design', titan: 'gensler.com', titanName: 'Gensler',
    keywords: ['architecture', 'architect', 'interior design', 'landscape', 'urban planning', 'structural engineering', 'architectural firm', 'architecture firm', 'interior designer', 'landscape architect', 'landscape design', 'urban design', 'space planning', 'architectural rendering', 'building design', 'sustainable architecture', 'green building', 'leed', 'architectural engineering', 'design-build', 'master planning', 'historic preservation', 'commercial architecture', 'residential architecture', 'retail design', 'workplace design', 'hospitality design'] },

  // ── Services — Cybersecurity & IT Services ──
  { category: 'Cybersecurity & IT Services', titan: 'crowdstrike.com', titanName: 'CrowdStrike',
    keywords: ['cybersecurity', 'it services', 'managed services', 'msp', 'it consulting', 'network', 'cloud services', 'data center', 'infosec', 'penetration testing', 'soc', 'cyber security', 'information security', 'managed service provider', 'it support', 'help desk', 'network security', 'endpoint security', 'vulnerability assessment', 'threat detection', 'incident response', 'siem', 'security compliance', 'security audit', 'it infrastructure', 'it outsourcing', 'disaster recovery', 'backup services', 'it managed services', 'security operations center', 'zero trust', 'identity management'] },

  // ── Services — Nonprofit & Social (SIC 83-84) ──
  { category: 'Nonprofit & Social Services', titan: 'redcross.org', titanName: 'American Red Cross',
    keywords: ['nonprofit', 'non-profit', 'ngo', 'charity', 'foundation', 'social service', 'community', 'advocacy', 'humanitarian', 'charitable organization', 'philanthropy', 'fundraising', 'grant writing', 'donor relations', 'volunteer', 'community outreach', 'social impact', 'mission driven', 'program management', 'nonprofit management', 'social welfare', 'disaster relief', 'community development', 'youth services', 'food bank', 'shelter', 'social enterprise', 'impact investing'] },

  // ── Services — Entertainment & Recreation (SIC 78-79) ──
  { category: 'Entertainment & Recreation', titan: 'disney.com', titanName: 'Disney',
    keywords: ['entertainment', 'recreation', 'film', 'movie', 'music', 'gaming', 'video game', 'esports', 'theater', 'sports', 'fitness', 'gym', 'amusement', 'theme park', 'film production', 'movie studio', 'music production', 'record label', 'streaming', 'streaming service', 'live events', 'concert', 'performing arts', 'sports team', 'sports league', 'fitness center', 'health club', 'yoga studio', 'martial arts', 'bowling', 'golf course', 'ski resort', 'game developer', 'game studio', 'animation', 'vfx', 'special effects', 'talent agency'] },

  // ── Services — Environmental & Sustainability ──
  { category: 'Environmental Services', titan: 'wm.com', titanName: 'Waste Management',
    keywords: ['environmental', 'waste', 'recycling', 'sustainability', 'remediation', 'water treatment', 'pollution', 'green', 'carbon', 'esg', 'waste management', 'waste disposal', 'hazardous waste', 'landfill', 'composting', 'environmental consulting', 'environmental engineer', 'environmental remediation', 'environmental monitoring', 'pollution control', 'air quality', 'soil testing', 'brownfield', 'environmental compliance', 'environmental impact', 'stormwater', 'wastewater', 'environmental assessment', 'carbon offset', 'carbon credit', 'circular economy', 'waste reduction'] },

  // ── Public Administration (SIC 91-97) ──
  { category: 'Government & Public Sector', titan: 'gsa.gov', titanName: 'GSA',
    keywords: ['government', 'public sector', 'federal', 'municipal', 'state agency', 'defense', 'military', 'govtech', 'civic', 'government agency', 'government contractor', 'public administration', 'public policy', 'regulation', 'public safety', 'law enforcement', 'first responder', 'fire department', 'public works', 'transportation authority', 'public health', 'government technology', 'civic technology', 'public procurement', 'government services', 'city planning', 'county', 'federal agency'] },

  // ── Catch-all: General B2B Services ──
  { category: 'Professional Services', titan: 'accenture.com', titanName: 'Accenture',
    keywords: ['professional services', 'outsourcing', 'process improvement', 'operations', 'project management', 'procurement', 'shared services', 'service delivery', 'business operations', 'supply chain consulting', 'procurement services', 'project management office', 'pmo', 'quality management', 'business analysis', 'business analyst', 'enterprise solutions', 'digital transformation', 'technology implementation', 'systems integrator', 'service provider'] },
];

/**
 * Match a user's keyword to the best industry benchmark category.
 * Returns { category, titan, titanName } or null if no match.
 * Uses longest-match-wins to prefer specific matches over generic ones.
 */
function matchIndustry(keyword) {
  const kw = keyword.toLowerCase();
  let bestMatch = null;
  let bestLength = 0;

  for (const bench of INDUSTRY_BENCHMARKS) {
    for (const fragment of bench.keywords) {
      if (kw.includes(fragment) || fragment.includes(kw)) {
        if (fragment.length > bestLength) {
          bestLength = fragment.length;
          bestMatch = bench;
        }
      }
    }
  }

  return bestMatch
    ? { category: bestMatch.category, titan: bestMatch.titan, titanName: bestMatch.titanName }
    : null;
}

// ── Pre-cached Benchmark Data ───────────────────────────────────
// Generated by populate-benchmarks.mjs on 2026-03-27.
// To refresh: run `node populate-benchmarks.mjs` with API keys, then
// redeploy with the updated benchmark-cache.json.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __benchFilename = fileURLToPath(import.meta.url);
const __benchDirname = dirname(__benchFilename);

let BENCHMARK_CACHE = {};
try {
  BENCHMARK_CACHE = JSON.parse(readFileSync(join(__benchDirname, 'benchmark-cache.json'), 'utf8'));
} catch (e) {
  console.warn('benchmark-cache.json not found or invalid — benchmarks will be unavailable');
}

// ── Fact vs Vibe Scoring ─────────────────────────────────────────
// +2 per verifiable fact, -2 per vibe signal

const FACT_PATTERNS = [
  // Founding / establishment year
  /\b(?:founded|established|since|started|launched|formed)\s+(?:in\s+)?\d{4}\b/i,
  // Employee / team size
  /\b\d[\d,]*\+?\s*(?:employees?|staff|team members?|consultants?|professionals?|people|workers)\b/i,
  // Dollar amounts / revenue
  /\$[\d,.]+\s*(?:M|B|K|million|billion|thousand|revenue|annual)?\b/i,
  // Percentage with context
  /\b\d+(?:\.\d+)?%\s*(?:increase|decrease|growth|reduction|improvement|decline|market share|YoY|year.over.year)\b/i,
  // Specific office locations (city names after location words)
  /\b(?:headquartered|based|offices?|locations?)\s+(?:in|across)\s+[A-Z][a-z]{2,}/,
  // Named awards / recognition with source
  /\b(?:recognized|awarded|named|ranked|listed)\s+(?:by|as|in|on)\s+[A-Z][a-z]/,
  // Specific publications / rankings
  /\b(?:Fortune\s+\d+|Inc\.\s+\d+|Forbes|Harvard Business Review|Consulting Magazine|Gartner|Forrester|G2|Clutch)\b/,
  // Citation markers (Perplexity-style)
  /\[\d+\]/,
  // Named clients or partners
  /\b(?:clients?\s+include|serving|worked with|partnered with|notable\s+clients?)\s+[A-Z]/,
  // Specific rankings / ratings
  /\b(?:ranked?\s+#?\d|top\s+\d+|rated\s+\d)/i,
  // Named people with titles
  /\b(?:CEO|founder|president|partner|director|managing\s+partner)\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
  // Specific year references in context (not just "in 2024" but meaningful dates)
  /\b(?:in|since|as of|circa)\s+(?:19|20)\d{2}\b/i,
  // Number of offices/locations
  /\b\d+\s+(?:offices?|locations?|branches|cities|countries)\b/i,
];

const VIBE_PHRASES = [
  // Hedging / uncertainty (expanded from original HEDGING_PHRASES)
  'limited information', 'i don\'t have', 'i\'m not sure',
  'i should note', 'i couldn\'t find', 'not enough information',
  'i\'d recommend checking', 'i\'d recommend verifying',
  'i don\'t know', 'i was unable', 'no specific information',
  'couldn\'t verify', 'difficult to determine',
  'i cannot browse', 'i can\'t browse', 'i don\'t have access',
  'unable to access', 'cannot access', 'i\'m unable to',
  // Generic superlatives without evidence
  'well-known', 'well-established', 'highly regarded', 'highly reputable',
  'industry leader', 'leading provider', 'leading firm',
  'premier', 'renowned', 'prestigious',
  // Vague hedges
  'appears to be', 'seems to be', 'may be', 'might be',
  'it\'s possible', 'could be', 'likely',
  // Disclaimers
  'i\'d encourage verifying', 'check their website',
  'verify directly', 'for the most current', 'for the most accurate',
  'recommend reaching out', 'contact them directly',
];

function scoreFactsVsVibes(responseText) {
  const lower = responseText.toLowerCase();
  const original = responseText;

  // Count facts — use Set to avoid double-counting overlapping patterns
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

  // Count vibes
  let vibeCount = 0;
  const vibeMatches = [];
  for (const phrase of VIBE_PHRASES) {
    // Count each occurrence
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      vibeCount++;
      vibeMatches.push(phrase);
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }

  const score = (factCount * 2) - (vibeCount * 2);

  return {
    facts: factCount,
    vibes: vibeCount,
    score,
    factMatches: [...new Set(factMatches)].slice(0, 8),
    vibeMatches: [...new Set(vibeMatches)].slice(0, 8),
  };
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

// ── Keyword Agreement Analysis (legacy, kept as secondary signal) ─
const HEDGING_PHRASES = [
  'limited information', 'i don\'t have', 'i\'m not sure',
  'i should note', 'some confusion', 'inconsistent',
  'i couldn\'t find', 'not enough information',
  'i\'d recommend checking', 'i\'d recommend verifying',
  'i don\'t know', 'appears to be', 'seems to be',
  'i was unable', 'no specific information',
  'couldn\'t verify', 'difficult to determine',
];

function analyzePlatform(responseText, keyword) {
  const lower = responseText.toLowerCase();
  const kwLower = keyword.toLowerCase();

  // Split keyword into individual words for partial matching
  const kwWords = kwLower.split(/\s+/).filter(w => w.length > 3);
  const wordMatches = kwWords.filter(w => lower.includes(w));
  const mentionsKeyword = wordMatches.length >= Math.ceil(kwWords.length * 0.5) || lower.includes(kwLower);

  // Check for hedging
  const hedgeCount = HEDGING_PHRASES.filter(phrase => lower.includes(phrase)).length;
  const confident = hedgeCount <= 1;

  const agrees = mentionsKeyword && confident;

  return { mentionsKeyword, confident, hedgeCount, agrees };
}

function analyzeLevel(responses, keyword) {
  const platforms = {
    chatgpt: analyzePlatform(responses.chatgpt, keyword),
    perplexity: analyzePlatform(responses.perplexity, keyword),
    claude: analyzePlatform(responses.claude, keyword),
    gemini: analyzePlatform(responses.gemini, keyword),
  };

  const agreementCount = Object.values(platforms).filter(p => p.agrees).length;

  let level;
  if (agreementCount >= 4) level = 'HIGH';
  else if (agreementCount >= 3) level = 'MEDIUM';
  else level = 'LOW';

  return { level, agreementCount, platforms };
}

// ── Simple Rate Limiting ─────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 3;

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

    // ── Input Capture (market intelligence) ──────────────────────
    // Structured log — Netlify captures all function logs.
    // Export from Netlify dashboard > Functions > Logs, or use
    // `netlify functions:log check-readability` in CLI.
    console.log(JSON.stringify({
      _event: 'readability_check',
      ts: new Date().toISOString(),
      url: cleanUrl,
      keyword,
      competitorUrl: competitorUrl || null,
      ip: clientIp,
    }));

    // ── Phase 1: Query all 4 AIs RUNS times each (multi-run consistency) ──
    const RUNS = CONFIG.RUNS;
    const withTimeout = (p, ms) => Promise.race([
      p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
    const runMany = (fn) => Promise.allSettled(
      Array.from({ length: RUNS }, () => withTimeout(fn(cleanUrl, keyword), 20000))
    );

    const [cgRuns, pxRuns, clRuns, gmRuns] = await Promise.all([
      runMany(queryOpenAI), runMany(queryPerplexity), runMany(queryClaude), runMany(queryGemini),
    ]);
    const okTexts = (arr) => arr.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const runsByModel = {
      chatgpt: okTexts(cgRuns), perplexity: okTexts(pxRuns),
      claude: okTexts(clRuns), gemini: okTexts(gmRuns),
    };
    // Multi-run robustness: show the REPRESENTATIVE run per model (median fact-vs-vibe score),
    // so the displayed answer is the typical one across tries, not a lucky/unlucky single draw.
    const representativeOf = (arr) => {
      const ok = arr.filter((r) => r.status === 'fulfilled');
      if (ok.length === 0) return arr[0] || { status: 'rejected', reason: new Error('no runs') };
      const ranked = ok
        .map((r) => { const sc = scoreFactsVsVibes(r.value); return { r, score: sc.facts - sc.vibes }; })
        .sort((a, b) => a.score - b.score);
      return ranked[Math.floor((ranked.length - 1) / 2)].r; // median run
    };
    const chatgptResult = representativeOf(cgRuns);
    const perplexityResult = representativeOf(pxRuns);
    const claudeResult = representativeOf(clRuns);
    const geminiResult = representativeOf(gmRuns);

    // Log errors server-side for debugging
    if (chatgptResult.status === 'rejected') {
      console.error('ChatGPT FAILED:', chatgptResult.reason?.message || chatgptResult.reason);
    }
    if (perplexityResult.status === 'rejected') {
      console.error('Perplexity FAILED:', perplexityResult.reason?.message || perplexityResult.reason);
    }
    if (claudeResult.status === 'rejected') {
      console.error('Claude FAILED:', claudeResult.reason?.message || claudeResult.reason);
    }
    if (geminiResult.status === 'rejected') {
      console.error('Gemini FAILED:', geminiResult.reason?.message || geminiResult.reason);
    }

    const yours = {
      chatgpt: chatgptResult.status === 'fulfilled'
        ? chatgptResult.value
        : `We couldn't reach ChatGPT right now. This sometimes happens during high-traffic periods. Your other results are still valid.`,
      perplexity: perplexityResult.status === 'fulfilled'
        ? perplexityResult.value
        : `We couldn't reach Perplexity right now. This sometimes happens during high-traffic periods. Your other results are still valid.`,
      claude: claudeResult.status === 'fulfilled'
        ? claudeResult.value
        : `We couldn't reach Claude right now. This sometimes happens during high-traffic periods. Your other results are still valid.`,
      gemini: geminiResult.status === 'fulfilled'
        ? geminiResult.value
        : `We couldn't reach Google Gemini right now. This sometimes happens during high-traffic periods. Your other results are still valid.`,
    };

    // Track which platforms actually responded
    const platformsResponded = {
      chatgpt: chatgptResult.status === 'fulfilled',
      perplexity: perplexityResult.status === 'fulfilled',
      claude: claudeResult.status === 'fulfilled',
      gemini: geminiResult.status === 'fulfilled',
    };

    // ── Phase 2: Analyze readability level + fact/vibe scoring ──
    const analysis = analyzeLevel(yours, keyword);
    const scoring = scoreAllPlatforms(yours);

    // ── Phase 3: Industry benchmark matching ────────────────────
    const industryMatch = matchIndustry(keyword);
    let benchmark = null;

    if (industryMatch) {
      // Check if we have pre-cached benchmark data for this titan
      const cachedData = BENCHMARK_CACHE[industryMatch.titan];
      if (cachedData) {
        benchmark = {
          category: industryMatch.category,
          titan: industryMatch.titan,
          titanName: industryMatch.titanName,
          scoring: cachedData,
        };
      } else {
        // No cached data yet — return the match info so the front-end
        // can still show the category name and a "benchmark coming soon" state
        benchmark = {
          category: industryMatch.category,
          titan: industryMatch.titan,
          titanName: industryMatch.titanName,
          scoring: null,
        };
      }
    }

    // ── Phase 4: If competitor provided, query for them too ──
    // (kept as secondary feature — users can still manually compare)
    let competitor = null;
    let competitorScoring = null;
    let insight = null;

    if (competitorUrl) {
      const cleanCompUrl = competitorUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

      const [cChatgpt, cPerplexity, cClaude, cGemini] = await Promise.allSettled([
        queryOpenAI(cleanCompUrl, keyword),
        queryPerplexity(cleanCompUrl, keyword),
        queryClaude(cleanCompUrl, keyword),
        queryGemini(cleanCompUrl, keyword),
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
        gemini: cGemini.status === 'fulfilled'
          ? cGemini.value
          : 'Unable to query Google Gemini for this competitor at this time.',
      };

      competitorScoring = scoreAllPlatforms(competitor);

      // Generate comparison insight using Claude Haiku
      insight = await generateInsight(yours, competitor, cleanUrl, cleanCompUrl, keyword);
    }

    // ── v2 scoring: multi-run dimensions (Recognition / Accuracy / Consistency) ──
    const v2 = scoreCompany(runsByModel, keyword);

    return new Response(JSON.stringify({
      yours,
      analysis,
      scoring,
      benchmark,
      competitor,
      competitorScoring,
      insight,
      platformsResponded,
      // v2 fields (new scoring)
      overall: v2.overall,
      band: v2.band,
      dimensions: v2.dimensions,
      headlineFinding: v2.headlineFinding,
      perModel: v2.perModel,
      availableModels: v2.availableModels,
    }), { status: 200, headers });

  } catch (err) {
    console.error('Function error:', err);
    return new Response(JSON.stringify({
      error: 'Something went wrong. Please try again.',
    }), { status: 500, headers });
  }
};

// Netlify Functions v2 config
export const config = {
  path: '/api/signal-check',
};
