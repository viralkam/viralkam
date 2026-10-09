// Cloudflare Serverless Function: GET & POST /api/videos
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = parseInt(url.searchParams.get('limit')) || 24;
  const offset = (page - 1) * limit;
  const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').trim();
  const category = (url.searchParams.get('category') || '').trim();
  const sort = url.searchParams.get('sort') || 'newest';

  // If Cloudflare D1 is bound
  if (env.DB) {
    try {
      let conditions = [];
      let bindings = [];

      if (search) {
        conditions.push('(title LIKE ? OR description LIKE ? OR tags LIKE ?)');
        const qParam = `%${search}%`;
        bindings.push(qParam, qParam, qParam);
      }

      if (category) {
        conditions.push('LOWER(category) = LOWER(?)');
        bindings.push(category);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      let orderBy = 'ORDER BY created_at DESC';
      if (sort === 'popular') orderBy = 'ORDER BY likes DESC';
      else if (sort === 'most_viewed') orderBy = 'ORDER BY views DESC';
      else if (sort === 'random') orderBy = 'ORDER BY RANDOM()';

      const countRow = await env.DB.prepare(`SELECT COUNT(*) as total FROM videos ${where}`).bind(...bindings).first();
      const totalVideos = countRow?.total || 0;

      const { results } = await env.DB.prepare(`
        SELECT * FROM videos 
        ${where} 
        ${orderBy} 
        LIMIT ? OFFSET ?
      `).bind(...bindings, limit, offset).all();

      const videos = (results || []).map(v => {
        let tags = [];
        try { tags = typeof v.tags === 'string' ? JSON.parse(v.tags) : (v.tags || []); } catch {}
        return { ...v, tags };
      });

      return Response.json({
        success: true,
        videos,
        pagination: {
          page,
          limit,
          totalVideos,
          totalPages: Math.ceil(totalVideos / limit)
        }
      });
    } catch (err) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // Fallback if D1 is not yet bound
  return Response.json({
    success: true,
    videos: [],
    message: "Cloudflare D1 binding (env.DB) not found. Please bind D1 database in Cloudflare dashboard."
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json({ success: false, message: "Cloudflare D1 is not bound" }, { status: 500 });
  }

  try {
    const body = await request.json();
    if (!body.title) {
      return Response.json({ success: false, message: "Title is required" }, { status: 400 });
    }

    const id = body.id || `vid-${Date.now()}`;
    await env.DB.prepare(`
      INSERT INTO videos (
        id, title, description, duration, views, likes, dislikes, rating,
        category, tags, uploadedAt, author, thumbnail, videoUrl,
        hlsUrl, embedUrl, seoTitle, seoDescription, canonicalUrl,
        aeoSummary, aeoKeyFacts, geoEntities, schemaJsonLd
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).bind(
      id,
      body.title,
      body.description || 'Watch video on VIRALKAM.COM',
      body.duration || '03:30',
      Number(body.views || 0),
      Number(body.likes || 10),
      Number(body.dislikes || 0),
      Number(body.rating || 95),
      body.category || 'General',
      JSON.stringify(Array.isArray(body.tags) ? body.tags : (body.tags ? body.tags.split(',') : [])),
      body.uploadedAt || 'Just now',
      body.author || 'VIRALKAM Admin',
      body.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
      body.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4',
      body.hlsUrl || null,
      body.embedUrl || null,
      body.seoTitle || null,
      body.seoDescription || null,
      body.canonicalUrl || null,
      body.aeoSummary || null,
      body.aeoKeyFacts || null,
      JSON.stringify(body.geoEntities || []),
      body.schemaJsonLd || null
    ).run();

    const video = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
    return Response.json({ success: true, video }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
