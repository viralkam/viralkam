// Cloudflare Serverless Function: GET /api/admin/verify
export async function onRequestGet(context) {
  const { request, env } = context;
  const expectedAdminId = env.ADMIN_EMAIL || 'viralkam.com@gmail.com';
  const authSecret = env.JWT_SECRET || 'vk_secret_key_8348da430a621adc2e77fdb6e3b83243_2026';

  const auth = request.headers.get('Authorization') || '';
  const rawToken = auth.replace(/^Bearer\s+/i, '').trim();
  if (!rawToken) {
    return Response.json({ success: false, valid: false }, { status: 401 });
  }

  const legacyToken = btoa(`${expectedAdminId}:${authSecret}`);
  if (rawToken === legacyToken) {
    return Response.json({ success: true, valid: true });
  }

  try {
    const decoded = atob(rawToken);
    const [email, tsStr, sigHex] = decoded.split(':');
    const ts = parseInt(tsStr, 10);
    if (!email || !ts || !sigHex) {
      return Response.json({ success: false, valid: false }, { status: 401 });
    }

    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - ts > MAX_AGE_MS || ts > Date.now() + 60000) {
      return Response.json({ success: false, valid: false }, { status: 401 });
    }

    if (email.toLowerCase() !== expectedAdminId.toLowerCase()) {
      return Response.json({ success: false, valid: false }, { status: 401 });
    }

    const payload = `${email}:${ts}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(authSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedSigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (sigHex === expectedSigHex) {
      return Response.json({ success: true, valid: true });
    }
  } catch {}

  return Response.json({ success: false, valid: false }, { status: 401 });
}
