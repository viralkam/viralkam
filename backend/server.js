import http from 'node:http';
import url from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const db = initDatabase();

// Helper to set CORS & JSON headers
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Format video row to frontend structure
function formatVideo(row) {
  if (!row) return null;
  let parsedTags = [];
  try {
    parsedTags = typeof row.tags === 'string' ? JSON.parse(row.tags) : (row.tags || []);
  } catch {
    parsedTags = [];
  }

  let parsedEntities = [];
  try {
    parsedEntities = typeof row.geoEntities === 'string' ? JSON.parse(row.geoEntities) : (row.geoEntities || []);
  } catch {
    parsedEntities = [];
  }

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    duration: row.duration,
    views: Number(row.views || 0),
    likes: Number(row.likes || 0),
    dislikes: Number(row.dislikes || 0),
    rating: Number(row.rating || 95),
    category: row.category,
    tags: parsedTags,
    uploadedAt: row.uploadedAt,
    author: row.author,
    thumbnail: row.thumbnail,
    videoUrl: row.videoUrl,
    hlsUrl: row.hlsUrl || null,
    embedUrl: row.embedUrl || null,
    seoTitle: row.seoTitle || null,
    seoDescription: row.seoDescription || null,
    canonicalUrl: row.canonicalUrl || null,
    aeoSummary: row.aeoSummary || null,
    aeoKeyFacts: row.aeoKeyFacts || null,
    geoEntities: parsedEntities,
    schemaJsonLd: row.schemaJsonLd || null,
    status: row.status,
    createdAt: row.created_at
  };
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  try {
    // 1. Health check
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'online',
        service: 'VIRALKAM.COM API',
        database: 'Cloudflare D1 / SQLite Engine',
        timestamp: new Date().toISOString()
      });
    }

    // 2. GET /api/categories - list categories and video counts
    if (pathname === '/api/categories' && req.method === 'GET') {
      const rows = db.prepare(`
        SELECT category, COUNT(*) as count 
        FROM videos 
        GROUP BY category 
        ORDER BY count DESC
      `).all();

      return sendJson(res, 200, {
        success: true,
        categories: rows.map(r => ({ name: r.category, count: r.count }))
      });
    }

    // 3. GET /api/videos - list & search videos with pagination
    if (pathname === '/api/videos' && req.method === 'GET') {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 24;
      const offset = (page - 1) * limit;
      const search = (query.search || query.q || '').trim();
      const category = (query.category || '').trim();
      const sort = query.sort || 'newest';

      let conditions = [];
      let params = [];

      if (search) {
        conditions.push('(title LIKE ? OR description LIKE ? OR tags LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      if (category) {
        conditions.push('LOWER(category) = LOWER(?)');
        params.push(category);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Sorting
      let orderBy = 'ORDER BY created_at DESC';
      if (sort === 'popular') {
        orderBy = 'ORDER BY likes DESC';
      } else if (sort === 'most_viewed') {
        orderBy = 'ORDER BY views DESC';
      } else if (sort === 'random') {
        orderBy = 'ORDER BY RANDOM()';
      }

      // Count total
      const countStmt = db.prepare(`SELECT COUNT(*) as total FROM videos ${whereClause}`);
      const countResult = countStmt.get(...params);
      const totalVideos = countResult.total;

      // Query page
      const selectStmt = db.prepare(`
        SELECT * FROM videos 
        ${whereClause} 
        ${orderBy} 
        LIMIT ? OFFSET ?
      `);
      const rows = selectStmt.all(...params, limit, offset);

      return sendJson(res, 200, {
        success: true,
        videos: rows.map(formatVideo),
        pagination: {
          page,
          limit,
          totalVideos,
          totalPages: Math.ceil(totalVideos / limit)
        }
      });
    }

    // 4. GET /api/videos/:id - fetch video + increment view count
    if (pathname.startsWith('/api/videos/') && req.method === 'GET' && !pathname.endsWith('/vote')) {
      const id = pathname.replace('/api/videos/', '');
      
      // Increment views
      db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(id);

      const videoRow = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
      if (!videoRow) {
        return sendJson(res, 404, { success: false, message: 'Video not found' });
      }

      return sendJson(res, 200, {
        success: true,
        video: formatVideo(videoRow)
      });
    }

    // 5. POST /api/videos - create new video (Admin Publish)
    if (pathname === '/api/videos' && req.method === 'POST') {
      const data = await parseBody(req);
      if (!data.title) {
        return sendJson(res, 400, { success: false, message: 'Title is required' });
      }

      const id = data.id || `vid-${Date.now()}`;
      const insertStmt = db.prepare(`
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
      `);

      insertStmt.run(
        id,
        data.title,
        data.description || 'Watch video on VIRALKAM.COM',
        data.duration || '03:30',
        Number(data.views || 0),
        Number(data.likes || 10),
        Number(data.dislikes || 0),
        Number(data.rating || 95),
        data.category || 'General',
        JSON.stringify(Array.isArray(data.tags) ? data.tags : (data.tags ? data.tags.split(',') : [])),
        data.uploadedAt || 'Just now',
        data.author || 'VIRALKAM Admin',
        data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
        data.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4',
        data.hlsUrl || null,
        data.embedUrl || null,
        data.seoTitle || null,
        data.seoDescription || null,
        data.canonicalUrl || null,
        data.aeoSummary || null,
        data.aeoKeyFacts || null,
        JSON.stringify(data.geoEntities || []),
        data.schemaJsonLd || null
      );

      const created = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
      return sendJson(res, 201, {
        success: true,
        message: 'Video published successfully',
        video: formatVideo(created)
      });
    }

    // 6. DELETE /api/videos/:id - delete video (Admin)
    if (pathname.startsWith('/api/videos/') && req.method === 'DELETE') {
      const id = pathname.replace('/api/videos/', '');
      const delResult = db.prepare('DELETE FROM videos WHERE id = ?').run(id);
      return sendJson(res, 200, {
        success: true,
        message: `Video ${id} deleted successfully`,
        affected: delResult.changes
      });
    }

    // 7. POST /api/videos/:id/vote - like or dislike
    if (pathname.match(/^\/api\/videos\/[^/]+\/vote$/) && req.method === 'POST') {
      const parts = pathname.split('/');
      const id = parts[3];
      const { type } = await parseBody(req); // 'like' | 'dislike'

      if (type === 'like') {
        db.prepare('UPDATE videos SET likes = likes + 1 WHERE id = ?').run(id);
      } else if (type === 'dislike') {
        db.prepare('UPDATE videos SET dislikes = dislikes + 1 WHERE id = ?').run(id);
      } else {
        return sendJson(res, 400, { success: false, message: 'Invalid vote type' });
      }

      const updated = db.prepare('SELECT likes, dislikes, views FROM videos WHERE id = ?').get(id);
      return sendJson(res, 200, {
        success: true,
        likes: updated.likes,
        dislikes: updated.dislikes
      });
    }

    // 8. POST /api/reports - DMCA / Video removal request
    if (pathname === '/api/reports' && req.method === 'POST') {
      const report = await parseBody(req);
      const insert = db.prepare(`
        INSERT INTO reports (video_id, video_title, reason, email)
        VALUES (?, ?, ?, ?)
      `);
      insert.run(
        report.videoId || 'unknown',
        report.videoTitle || 'N/A',
        report.reason || 'DMCA / Copyright / Request',
        report.email || 'viralkam.com@gmail.com'
      );

      return sendJson(res, 201, {
        success: true,
        message: 'Report received. Our moderation team (viralkam.com@gmail.com) will review within 24 hours.'
      });
    }

    // 9. POST /api/r2/upload-sign - Cloudflare R2 Upload URL generator
    if (pathname === '/api/r2/upload-sign' && req.method === 'POST') {
      const { fileName, fileType } = await parseBody(req);
      const ext = path.extname(fileName || 'video.mp4');
      const uniqueKey = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
      
      // In production Cloudflare Workers with R2, this returns R2 direct URL or presigned URL
      return sendJson(res, 200, {
        success: true,
        uploadKey: uniqueKey,
        publicUrl: `https://vcdn.viralkam.com/${uniqueKey}`,
        message: 'Cloudflare R2 target URL generated'
      });
    }

    // Not found
    sendJson(res, 404, { success: false, message: `Route ${pathname} not found` });

  } catch (err) {
    console.error('[API Server Error]', err);
    sendJson(res, 500, { success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 VIRALKAM.COM Backend Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`💾 Database: SQLite (Cloudflare D1 Compatible Engine)`);
  console.log(`⚡ Endpoints:`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /api/videos`);
  console.log(`   - GET  /api/videos/:id`);
  console.log(`   - POST /api/videos`);
  console.log(`   - POST /api/videos/:id/vote`);
  console.log(`   - POST /api/reports`);
  console.log(`   - GET  /api/categories`);
  console.log(`===============================================`);
});
