// Cloudflare Serverless Function: GET /api/categories
export async function onRequestGet(context) {
  const { env } = context;

  if (env.DB) {
    try {
      const { results } = await env.DB.prepare(`
        SELECT category, COUNT(*) as count 
        FROM videos 
        GROUP BY category 
        ORDER BY count DESC
      `).all();

      return Response.json({
        success: true,
        categories: (results || []).map(r => ({ name: r.category, count: r.count }))
      });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return Response.json({
    success: true,
    categories: [
      { name: "Nature", count: 12 },
      { name: "Tech", count: 12 },
      { name: "Action", count: 12 },
      { name: "Cinema", count: 12 },
      { name: "Music", count: 12 },
      { name: "Travel", count: 12 }
    ]
  });
}
