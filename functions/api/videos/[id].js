// Cloudflare Serverless Function: GET & DELETE /api/videos/:id
export async function onRequestGet(context) {
  const { params, env } = context;
  const id = params.id;

  if (!env.DB) {
    return Response.json({ success: false, message: "Cloudflare D1 is not bound" }, { status: 500 });
  }

  try {
    // Atomically increment view count
    await env.DB.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').bind(id).run();

    const video = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
    if (!video) {
      return Response.json({ success: false, message: "Video not found" }, { status: 404 });
    }

    let tags = [];
    try { tags = typeof video.tags === 'string' ? JSON.parse(video.tags) : (video.tags || []); } catch {}

    return Response.json({
      success: true,
      video: { ...video, tags }
    });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function onRequestDelete(context) {
  const { params, env } = context;
  const id = params.id;

  if (!env.DB) {
    return Response.json({ success: false, message: "Cloudflare D1 is not bound" }, { status: 500 });
  }

  try {
    await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
    return Response.json({ success: true, message: `Video ${id} removed` });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
