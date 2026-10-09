/**
 * Cloudflare Worker API for VIRALKAM.COM
 * Native Edge implementation with Cloudflare D1 (SQL Database) & Cloudflare R2 (Object Storage)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Helper to send JSON
    const json = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: corsHeaders
      });
    };

    try {
      // 1. Health check
      if (pathname === '/api/health') {
        return json({
          status: 'online',
          edge: 'Cloudflare Worker',
          colo: request.cf?.colo || 'Local',
          country: request.cf?.country || 'Global',
          database: 'Cloudflare D1',
          storage: 'Cloudflare R2',
          timestamp: new Date().toISOString()
        });
      }

      // 2. GET /api/categories
      if (pathname === '/api/categories' && method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT category, COUNT(*) as count 
          FROM videos 
          GROUP BY category 
          ORDER BY count DESC
        `).all();

        return json({
          success: true,
          categories: results.map(r => ({ name: r.category, count: r.count }))
        });
      }

      // 3. GET /api/videos (with search, category, sorting, pagination)
      if (pathname === '/api/videos' && method === 'GET') {
        const params = url.searchParams;
        const page = parseInt(params.get('page')) || 1;
        const limit = parseInt(params.get('limit')) || 24;
        const offset = (page - 1) * limit;
        const search = (params.get('search') || params.get('q') || '').trim();
        const category = (params.get('category') || '').trim();
        const sort = params.get('sort') || 'newest';

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

        // Count total
        const countQuery = await env.DB.prepare(`SELECT COUNT(*) as total FROM videos ${where}`).bind(...bindings).first();
        const totalVideos = countQuery?.total || 0;

        // Fetch paginated
        const { results } = await env.DB.prepare(`
          SELECT * FROM videos 
          ${where} 
          ${orderBy} 
          LIMIT ? OFFSET ?
        `).bind(...bindings, limit, offset).all();

        // Format tags & geo
        const formattedVideos = results.map(v => {
          let tags = [];
          try { tags = typeof v.tags === 'string' ? JSON.parse(v.tags) : (v.tags || []); } catch {}
          let geo = [];
          try { geo = typeof v.geoEntities === 'string' ? JSON.parse(v.geoEntities) : (v.geoEntities || []); } catch {}
          return {
            ...v,
            tags,
            geoEntities: geo
          };
        });

        return json({
          success: true,
          videos: formattedVideos,
          pagination: {
            page,
            limit,
            totalVideos,
            totalPages: Math.ceil(totalVideos / limit)
          }
        });
      }

      // 4. GET /api/videos/:id (fetch + increment view count)
      if (pathname.startsWith('/api/videos/') && method === 'GET' && !pathname.endsWith('/vote')) {
        const id = pathname.replace('/api/videos/', '');

        // Increment views atomically
        await env.DB.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').bind(id).run();

        const video = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        if (!video) {
          return json({ success: false, message: 'Video not found' }, 404);
        }

        let tags = [];
        try { tags = typeof video.tags === 'string' ? JSON.parse(video.tags) : (video.tags || []); } catch {}

        return json({
          success: true,
          video: {
            ...video,
            tags
          }
        });
      }

      // 5. POST /api/videos (Publish new video)
      if (pathname === '/api/videos' && method === 'POST') {
        const body = await request.json();
        if (!body.title) {
          return json({ success: false, message: 'Title is required' }, 400);
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

        const created = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        return json({ success: true, message: 'Video published to Cloudflare D1', video: created }, 201);
      }

      // 6. DELETE /api/videos/:id
      if (pathname.startsWith('/api/videos/') && method === 'DELETE') {
        const id = pathname.replace('/api/videos/', '');
        await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
        return json({ success: true, message: `Video ${id} removed` });
      }

      // 7. POST /api/videos/:id/vote
      if (pathname.match(/^\/api\/videos\/[^/]+\/vote$/) && method === 'POST') {
        const parts = pathname.split('/');
        const id = parts[3];
        const { type } = await request.json();

        if (type === 'like') {
          await env.DB.prepare('UPDATE videos SET likes = likes + 1 WHERE id = ?').bind(id).run();
        } else if (type === 'dislike') {
          await env.DB.prepare('UPDATE videos SET dislikes = dislikes + 1 WHERE id = ?').bind(id).run();
        } else {
          return json({ success: false, message: 'Invalid vote type' }, 400);
        }

        const updated = await env.DB.prepare('SELECT likes, dislikes, views FROM videos WHERE id = ?').bind(id).first();
        return json({ success: true, likes: updated.likes, dislikes: updated.dislikes });
      }

      // 8. POST /api/reports (DMCA / Removal Requests)
      if (pathname === '/api/reports' && method === 'POST') {
        const rep = await request.json();
        await env.DB.prepare(`
          INSERT INTO reports (video_id, video_title, reason, email)
          VALUES (?, ?, ?, ?)
        `).bind(
          rep.videoId || 'unknown',
          rep.videoTitle || 'N/A',
          rep.reason || 'DMCA / Copyright',
          rep.email || 'viralkam.com@gmail.com'
        ).run();

        return json({
          success: true,
          message: 'Report received. Our moderation team (viralkam.com@gmail.com) will review within 24 hours.'
        }, 201);
      }

      // 9. POST /api/r2/upload (Cloudflare R2 Direct Upload & Storage)
      if (pathname === '/api/r2/upload' && method === 'POST') {
        const filename = request.headers.get('X-File-Name') || `upload-${Date.now()}.mp4`;
        const contentType = request.headers.get('Content-Type') || 'video/mp4';
        const fileKey = `videos/${Date.now()}-${filename}`;

        // Stream into Cloudflare R2 Bucket
        await env.BUCKET.put(fileKey, request.body, {
          httpMetadata: { contentType }
        });

        const publicUrl = `https://vcdn.viralkam.com/${fileKey}`;
        return json({
          success: true,
          key: fileKey,
          url: publicUrl,
          message: 'Uploaded successfully to Cloudflare R2'
        });
      }

      return json({ success: false, message: 'Not found' }, 404);

    } catch (err) {
      return json({ success: false, error: err.message }, 500);
    }
  }
};
