/**
 * Netlify Function: subscribe-kit
 *
 * Proxies email subscriptions to Kit (ConvertKit) V4 API.
 * Keeps the API key server-side so it's never exposed in client code.
 *
 * Environment variables required (set in Netlify dashboard):
 *   KIT_API_KEY
 *   KIT_FORM_ID              -- default form (Signal Check email gate)
 *   KIT_CONTACT_FORM_ID      -- contact form (triggers Email B)
 *   KIT_AUDIT_FORM_ID        -- audit application form (triggers Email C)
 *
 * Expects POST body:
 *   { email, source? }
 *
 *   source: "signal-check" (default), "contact", or "audit"
 *   Maps to the corresponding KIT_*_FORM_ID env var.
 */

/**
 * Spam detection: catches gibberish names/text from bots.
 * Checks for random capitalization, low vowel ratio, and long no-space runs.
 */
function looksLikeSpam(text) {
  if (!text || text.length < 3) return false;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return false;

  // Check vowel ratio (gibberish has very few vowels)
  const vowels = letters.replace(/[^aeiouAEIOU]/g, '').length;
  const vowelRatio = vowels / letters.length;
  if (vowelRatio < 0.15 && letters.length > 5) return true;

  // Check random capitalization (real names: "Jane Smith", spam: "aSryNGGlEmh")
  const midCaps = letters.slice(1).replace(/[^A-Z]/g, '').length;
  const midCapRatio = midCaps / (letters.length - 1);
  if (midCapRatio > 0.35 && letters.length > 5) return true;

  // Check for very long strings without spaces (real messages have words)
  const longestRun = text.split(/\s+/).reduce((max, w) => Math.max(max, w.length), 0);
  if (longestRun > 20) return true;

  return false;
}

export default async (request) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { email, source, name, message } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Spam check: reject gibberish names or messages
    if (looksLikeSpam(name) || looksLikeSpam(message)) {
      console.warn('Spam blocked (subscribe-kit):', JSON.stringify({ email, name, source }));
      // Return 200 so bots think it worked — no Kit subscriber created
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const apiKey = Netlify.env.get('KIT_API_KEY');

    // Resolve the correct Kit form ID based on source
    let formId;
    switch (source) {
      case 'contact':
        formId = Netlify.env.get('KIT_CONTACT_FORM_ID');
        break;
      case 'audit':
        formId = Netlify.env.get('KIT_AUDIT_FORM_ID');
        break;
      default:
        formId = Netlify.env.get('KIT_FORM_ID');
    }

    if (!apiKey) {
      console.error('Missing KIT_API_KEY environment variable');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Create (or retrieve) the subscriber
    const subResponse = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': apiKey,
      },
      body: JSON.stringify({ email_address: email }),
    });

    const subData = await subResponse.json();

    if (!subResponse.ok) {
      console.error('Kit create subscriber error:', subResponse.status, subData);
      return new Response(JSON.stringify({ error: 'Subscription failed', details: subData }), {
        status: subResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Associate subscriber with the form (for tracking + automations)
    // Skip if no form ID configured for this source
    if (formId) {
      const formResponse = await fetch(`https://api.kit.com/v4/forms/${formId}/subscribers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kit-Api-Key': apiKey,
        },
        body: JSON.stringify({ email_address: email }),
      });

      if (!formResponse.ok) {
        console.warn(`Kit form association warning (source: ${source || 'default'}, formId: ${formId}):`, formResponse.status);
        // Non-fatal -- subscriber was still created
      }
    } else {
      console.warn(`No Kit form ID configured for source: ${source || 'default'}. Subscriber created but not associated with a form.`);
    }

    return new Response(JSON.stringify({ success: true, subscriber: subData }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err) {
    console.error('subscribe-kit error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/api/subscribe-kit',
};
