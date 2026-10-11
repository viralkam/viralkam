// Cloudflare Serverless Function: POST /api/admin/login
export async function onRequestPost(context) {
  const { request, env } = context;
  const expectedAdminId = env.ADMIN_EMAIL || 'admin@yourdomain.com';
  const expectedAdminPass = env.ADMIN_PASS || 'ChangeMeInProduction';
  const authSecret = env.JWT_SECRET || 'random_functions_jwt_secret_key_min_32_chars';

  const body = await request.json().catch(() => ({}));
  const reqId = (body.id || body.email || body.username || '').trim().toLowerCase();
  const reqPass = (body.password || body.pass || '').trim();

  if (reqId === expectedAdminId.toLowerCase() && reqPass === expectedAdminPass) {
    const timestamp = Date.now();
    const payload = `${expectedAdminId}:${timestamp}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(authSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    const token = btoa(`${expectedAdminId}:${timestamp}:${sigHex}`);

    return Response.json({
      success: true,
      token,
      email: expectedAdminId,
      message: 'Authenticated successfully'
    });
  }

  return Response.json({
    success: false,
    message: 'Invalid Admin ID or Password'
  }, { status: 401 });
}
