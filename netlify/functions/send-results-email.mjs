/**
 * Netlify Function: send-results-email
 *
 * Sends the personalized AI signal check results email via Resend.
 * Called client-side after email gate submission, alongside Kit subscription.
 *
 * Environment variables required (set in Netlify dashboard):
 *   RESEND_API_KEY
 *
 * Expects POST body:
 *   { email, url, keyword, scoring, responses, benchmark }
 */

function buildEmailHtml({ url, keyword, scoring, responses, benchmark }) {
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const totalScore = scoring.totalScore;
  const totalFacts = scoring.totalFacts;
  const totalVibes = scoring.totalVibes;

  // Score interpretation
  let scoreColor, scoreLabel, scoreSummary;
  if (totalFacts === 0) {
    scoreColor = '#c53030';
    scoreLabel = 'No Facts Found';
    scoreSummary = 'Across all four AI platforms, not a single verifiable fact was cited about your business. Every response was generated from vibes: plausible-sounding descriptions with nothing behind them.';
  } else if (totalScore < 0) {
    scoreColor = '#c53030';
    scoreLabel = 'More Vibes Than Facts';
    scoreSummary = 'AI agents produced more hedges than facts about your business. The dominant signal is uncertainty, which means AI agents are unlikely to recommend you confidently.';
  } else if (totalFacts <= 4) {
    scoreColor = '#B07D4F';
    scoreLabel = 'Thin Coverage';
    scoreSummary = 'AI agents found a few facts about your business, but the coverage is thin and inconsistent across platforms. Some know more than others.';
  } else {
    scoreColor = '#2f855a';
    scoreLabel = 'Solid Foundation';
    scoreSummary = 'AI agents can cite real facts about your business. But are they citing the right facts? The ones that win recommendations?';
  }

  // Platform names for display
  const platformNames = {
    chatgpt: 'ChatGPT',
    perplexity: 'Perplexity',
    claude: 'Claude',
    gemini: 'Google Gemini'
  };

  // Build per-platform score rows
  const platformRows = ['chatgpt', 'perplexity', 'claude', 'gemini'].map(p => {
    const pScore = scoring.platforms[p];
    const barColor = pScore.score > 0 ? '#2f855a' : pScore.score < 0 ? '#c53030' : '#6b7280';
    return `
      <tr>
        <td style="padding: 12px 16px; font-weight: 600; color: #2C3038; border-bottom: 1px solid #f0ece6;">${platformNames[p]}</td>
        <td style="padding: 12px 16px; text-align: center; color: #2f855a; border-bottom: 1px solid #f0ece6;">${pScore.facts}</td>
        <td style="padding: 12px 16px; text-align: center; color: #c53030; border-bottom: 1px solid #f0ece6;">${pScore.vibes}</td>
        <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: ${barColor}; border-bottom: 1px solid #f0ece6;">${pScore.score > 0 ? '+' : ''}${pScore.score}</td>
      </tr>`;
  }).join('');

  // Build benchmark section if available
  let benchmarkHtml = '';
  if (benchmark && benchmark.titanName) {
    const titanScore = benchmark.scoring ? benchmark.scoring.totalScore : null;
    if (titanScore !== null) {
      const gap = titanScore - totalScore;
      benchmarkHtml = `
        <div style="background: #FAF8F5; border: 1px solid #f0ece6; border-radius: 8px; padding: 24px; margin: 24px 0;">
          <h2 style="font-family: 'Lora', Georgia, serif; font-size: 20px; color: #2C3038; margin: 0 0 8px;">Industry Benchmark: ${benchmark.category}</h2>
          <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">Compared against ${benchmark.titanName}, a top-performing company in your industry.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Inter', sans-serif; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #2C3038;">${displayUrl}</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 700; color: ${totalScore >= 0 ? '#2f855a' : '#c53030'};">${totalScore > 0 ? '+' : ''}${totalScore}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #2C3038;">${benchmark.titanName}</td>
              <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #2f855a;">+${titanScore}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0 0; color: #c53030; font-weight: 600; border-top: 1px solid #f0ece6;">Gap</td>
              <td style="padding: 12px 0 0; text-align: right; font-weight: 700; color: #c53030; border-top: 1px solid #f0ece6;">${gap} points</td>
            </tr>
          </table>
        </div>`;
    }
  }

  // Build raw response sections
  const responseBlocks = ['chatgpt', 'perplexity', 'claude', 'gemini'].map(p => {
    const text = responses[p] || 'No response available.';
    const pScore = scoring.platforms[p];
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    return `
      <div style="margin: 20px 0; border: 1px solid #f0ece6; border-radius: 8px; overflow: hidden;">
        <div style="background: #2C3038; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #ffffff; font-weight: 600; font-size: 14px;">${platformNames[p]}</span>
          <span style="color: ${pScore.score >= 0 ? '#6dd492' : '#f98080'}; font-size: 13px; font-weight: 500;">${pScore.facts} facts, ${pScore.vibes} vibes (${pScore.score > 0 ? '+' : ''}${pScore.score})</span>
        </div>
        <div style="padding: 16px; background: #ffffff; font-size: 14px; line-height: 1.7; color: #374151;">
          ${escaped}
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your AI Signal Score</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f3ef; font-family: 'Inter', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;">
  <div style="max-width: 640px; margin: 0 auto; padding: 32px 16px;">

    <!-- Header -->
    <div style="text-align: center; padding: 24px 0 32px;">
      <p style="font-family: 'Lora', Georgia, serif; font-size: 16px; color: #B07D4F; margin: 0; letter-spacing: 0.02em;">Liz Micik</p>
    </div>

    <!-- Main card -->
    <div style="background: #ffffff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden;">

      <!-- Score header -->
      <div style="background: #B07D4F; padding: 32px 32px 24px; text-align: center;">
        <h1 style="font-family: 'Lora', Georgia, serif; font-size: 24px; color: #ffffff; margin: 0 0 4px;">Your AI Signal Score</h1>
        <p style="font-size: 14px; color: #9ca3af; margin: 0;">${displayUrl} &middot; "${keyword}"</p>
      </div>

      <div style="padding: 32px;">

        <!-- Total score -->
        <div style="text-align: center; margin: 0 0 24px;">
          <div style="font-size: 48px; font-weight: 700; color: ${scoreColor}; line-height: 1;">${totalScore > 0 ? '+' : ''}${totalScore}</div>
          <div style="font-size: 14px; font-weight: 600; color: ${scoreColor}; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 0.05em;">${scoreLabel}</div>
        </div>

        <p style="font-size: 15px; color: #374151; line-height: 1.7; margin: 0 0 24px;">${scoreSummary}</p>

        <!-- Platform breakdown table -->
        <table width="100%" cellpadding="0" cellspacing="0" style="font-family: 'Inter', sans-serif; font-size: 14px; border-collapse: collapse;">
          <thead>
            <tr style="background: #FAF8F5;">
              <th style="padding: 10px 16px; text-align: left; font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Platform</th>
              <th style="padding: 10px 16px; text-align: center; font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Facts</th>
              <th style="padding: 10px 16px; text-align: center; font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Vibes</th>
              <th style="padding: 10px 16px; text-align: center; font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Score</th>
            </tr>
          </thead>
          <tbody>
            ${platformRows}
          </tbody>
          <tfoot>
            <tr style="background: #FAF8F5;">
              <td style="padding: 12px 16px; font-weight: 700; color: #2C3038;">Total</td>
              <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #2f855a;">${totalFacts}</td>
              <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: #c53030;">${totalVibes}</td>
              <td style="padding: 12px 16px; text-align: center; font-weight: 700; color: ${totalScore >= 0 ? '#2f855a' : '#c53030'};">${totalScore > 0 ? '+' : ''}${totalScore}</td>
            </tr>
          </tfoot>
        </table>

        ${benchmarkHtml}

        <!-- Divider -->
        <hr style="border: none; border-top: 1px solid #f0ece6; margin: 32px 0;">

        <!-- Raw responses header -->
        <h2 style="font-family: 'Lora', Georgia, serif; font-size: 20px; color: #2C3038; margin: 0 0 8px;">What Each AI Actually Said</h2>
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 16px;">We asked each platform: "I'm looking for a ${keyword.replace(/&/g, '&amp;').replace(/</g, '&lt;')} provider. What can you tell me about ${displayUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;')}?"</p>

        ${responseBlocks}

        <!-- Divider -->
        <hr style="border: none; border-top: 1px solid #f0ece6; margin: 32px 0;">

        <!-- CTA -->
        <div style="text-align: center; padding: 8px 0 16px;">
          <h2 style="font-family: 'Lora', Georgia, serif; font-size: 20px; color: #2C3038; margin: 0 0 8px;">Want to improve this score?</h2>
          <p style="font-size: 14px; color: #6b7280; margin: 0 0 20px; line-height: 1.6;">The Agent Readiness Audit evaluates your site across 30 dimensions and shows you exactly what to fix. You get a step-by-step improvement roadmap including quick wins.</p>
          <a href="https://lizmicik.com/audit.html" style="display: inline-block; background: #B07D4F; color: #ffffff; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 6px; text-decoration: none;">Get My Readiness Audit</a>
        </div>

      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 24px 0; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0 0 4px;">Liz Micik &middot; AI Readiness &amp; Agent Strategy</p>
      <p style="margin: 0;"><a href="https://lizmicik.com" style="color: #B07D4F; text-decoration: none;">lizmicik.com</a></p>
    </div>

  </div>
</body>
</html>`;
}

export default async (request) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers,
    });
  }

  try {
    const body = await request.json();
    const { email, url, keyword, scoring, responses, benchmark } = body;

    if (!email || !url || !keyword || !scoring || !responses) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers,
      });
    }

    const apiKey = Netlify.env.get('RESEND_API_KEY');
    if (!apiKey) {
      console.error('Missing RESEND_API_KEY environment variable');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500, headers,
      });
    }

    const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const html = buildEmailHtml({ url, keyword, scoring, responses, benchmark });

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Liz Micik <info@lizmicik.com>',
        to: [email],
        subject: `Your AI Signal Score: ${displayUrl}`,
        html: html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend API error:', resendResponse.status, resendData);
      return new Response(JSON.stringify({ error: 'Email delivery failed', details: resendData }), {
        status: resendResponse.status, headers,
      });
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200, headers,
    });

  } catch (err) {
    console.error('send-results-email error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers,
    });
  }
};

export const config = {
  path: '/api/send-results-email',
};
