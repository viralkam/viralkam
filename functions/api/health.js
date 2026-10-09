// Cloudflare Serverless Function: GET /api/health
export async function onRequestGet(context) {
  const { request, env } = context;

  return Response.json({
    status: 'online',
    platform: 'Cloudflare Pages & Workers (100% Serverless)',
    colo: request.cf?.colo || 'Cloudflare Edge',
    country: request.cf?.country || 'Global',
    database: env.DB ? 'Cloudflare D1 (Connected)' : 'Cloudflare D1 (Pending Binding)',
    storage: env.BUCKET ? 'Cloudflare R2 (Connected)' : 'Cloudflare R2 (Pending Binding)',
    timestamp: new Date().toISOString()
  });
}
