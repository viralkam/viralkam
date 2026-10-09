// Cloudflare Serverless Function: POST /api/videos/:id/vote
export async function onRequestPost(context) {
  const { params, request, env } = context;
  const id = params.id;

  if (!env.DB) {
    return Response.json({ success: false, message: "Cloudflare D1 is not bound" }, { status: 500 });
  }

  try {
    const { type } = await request.json();
    if (type === 'like') {
      await env.DB.prepare('UPDATE videos SET likes = likes + 1 WHERE id = ?').bind(id).run();
    } else if (type === 'dislike') {
      await env.DB.prepare('UPDATE videos SET dislikes = dislikes + 1 WHERE id = ?').bind(id).run();
    } else {
      return Response.json({ success: false, message: "Invalid vote type" }, { status: 400 });
    }

    const updated = await env.DB.prepare('SELECT likes, dislikes, views FROM videos WHERE id = ?').bind(id).first();
    return Response.json({ success: true, likes: updated.likes, dislikes: updated.dislikes });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
