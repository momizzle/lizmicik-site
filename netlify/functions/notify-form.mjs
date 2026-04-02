/**
 * Netlify Function: notify-form
 *
 * Sends Liz a notification email via Resend when someone submits
 * the contact form or audit application form.
 *
 * Environment variables required (set in Netlify dashboard):
 *   RESEND_API_KEY
 *
 * Expects POST body:
 *   { source, name, email, ...fields }
 *
 *   source: "contact" or "audit"
 *   Additional fields depend on form type.
 */

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
    const { source, name, email } = body;

    if (!source || !email) {
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

    let subject, html;

    if (source === 'contact') {
      const message = body.message || '(no message)';
      subject = `New contact form: ${name || email}`;
      html = buildContactEmail({ name, email, message });
    } else if (source === 'audit') {
      subject = `New audit application: ${name || email}`;
      html = buildAuditEmail({
        name,
        email,
        website: body.website || '',
        companySize: body.companySize || '',
        aboutBusiness: body.aboutBusiness || '',
        howFound: body.howFound || '',
      });
    } else {
      return new Response(JSON.stringify({ error: 'Invalid source' }), {
        status: 400, headers,
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'Liz Micik <info@lizmicik.com>',
        to: ['info@lizmicik.com'],
        subject,
        html,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend notify error:', resendResponse.status, resendData);
      return new Response(JSON.stringify({ error: 'Notification failed', details: resendData }), {
        status: resendResponse.status, headers,
      });
    }

    // Log for Netlify function logs (market intelligence)
    console.log(JSON.stringify({
      _event: 'form_notification',
      ts: new Date().toISOString(),
      source,
      email,
      name: name || null,
    }));

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers,
    });

  } catch (err) {
    console.error('notify-form error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

function buildContactEmail({ name, email, message }) {
  const escapedMessage = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0; padding:24px; background:#f5f3ef; font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;">
<div style="max-width:560px; margin:0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
  <h2 style="font-family:Lora,Georgia,serif; color:#2C3038; margin:0 0 4px; font-size:20px;">New Contact Form Submission</h2>
  <p style="color:#6b7280; font-size:13px; margin:0 0 24px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <table style="width:100%; font-size:14px; border-collapse:collapse;">
    <tr><td style="padding:8px 12px; font-weight:600; color:#374151; width:80px; vertical-align:top;">Name</td><td style="padding:8px 12px; color:#2C3038;">${name || '(not provided)'}</td></tr>
    <tr style="background:#FAF8F5;"><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">Email</td><td style="padding:8px 12px;"><a href="mailto:${email}" style="color:#018799;">${email}</a></td></tr>
    <tr><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">Message</td><td style="padding:8px 12px; color:#2C3038; line-height:1.6;">${escapedMessage}</td></tr>
  </table>
  <hr style="border:none; border-top:1px solid #f0ece6; margin:24px 0 16px;">
  <p style="font-size:12px; color:#9ca3af; margin:0;">This person has been added to Kit (contact form). Email B should trigger automatically.</p>
</div>
</body></html>`;
}

function buildAuditEmail({ name, email, website, companySize, aboutBusiness, howFound }) {
  const escapedAbout = (aboutBusiness || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0; padding:24px; background:#f5f3ef; font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;">
<div style="max-width:560px; margin:0 auto; background:#fff; border-radius:8px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
  <h2 style="font-family:Lora,Georgia,serif; color:#2C3038; margin:0 0 4px; font-size:20px;">New Audit Application</h2>
  <p style="color:#6b7280; font-size:13px; margin:0 0 24px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <table style="width:100%; font-size:14px; border-collapse:collapse;">
    <tr><td style="padding:8px 12px; font-weight:600; color:#374151; width:100px; vertical-align:top;">Name</td><td style="padding:8px 12px; color:#2C3038;">${name || '(not provided)'}</td></tr>
    <tr style="background:#FAF8F5;"><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">Email</td><td style="padding:8px 12px;"><a href="mailto:${email}" style="color:#018799;">${email}</a></td></tr>
    <tr><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">Website</td><td style="padding:8px 12px;"><a href="${website}" style="color:#018799;" target="_blank">${website || '(not provided)'}</a></td></tr>
    <tr style="background:#FAF8F5;"><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">Company Size</td><td style="padding:8px 12px; color:#2C3038;">${companySize || '(not selected)'}</td></tr>
    <tr><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">About</td><td style="padding:8px 12px; color:#2C3038; line-height:1.6;">${escapedAbout || '(not provided)'}</td></tr>
    <tr style="background:#FAF8F5;"><td style="padding:8px 12px; font-weight:600; color:#374151; vertical-align:top;">How Found</td><td style="padding:8px 12px; color:#2C3038;">${howFound || '(not provided)'}</td></tr>
  </table>
  <hr style="border:none; border-top:1px solid #f0ece6; margin:24px 0 16px;">
  <p style="font-size:12px; color:#9ca3af; margin:0;">This person has been added to Kit (audit form). Email C should trigger automatically. You have 24 hours to send scoping questions.</p>
</div>
</body></html>`;
}

export const config = {
  path: '/api/notify-form',
};
