/**
 * Netlify Function: subscribe-kit
 *
 * Proxies email subscriptions to Kit (ConvertKit) V4 API.
 * Keeps the API key server-side so it's never exposed in client code.
 *
 * Environment variables required (set in Netlify dashboard):
 *   KIT_API_KEY
 *   KIT_FORM_ID
 */

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
    const { email } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Netlify.env.get('KIT_API_KEY');
    const formId = Netlify.env.get('KIT_FORM_ID');

    if (!apiKey || !formId) {
      console.error('Missing KIT_API_KEY or KIT_FORM_ID environment variables');
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
    const formResponse = await fetch(`https://api.kit.com/v4/forms/${formId}/subscribers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kit-Api-Key': apiKey,
      },
      body: JSON.stringify({ email_address: email }),
    });

    if (!formResponse.ok) {
      console.warn('Kit form association warning:', formResponse.status);
      // Non-fatal — subscriber was still created
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
