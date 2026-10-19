import http from 'node:http';
import url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env and .env.local (Node.js 20+ native support)
if (typeof process.loadEnvFile === 'function') {
  const envCandidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '.env')
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        process.loadEnvFile(envPath);
      } catch {}
    }
  }
}

import { initDatabase } from './seed.js';

const PORT = process.env.PORT || 5000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@localhost.local';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'local_development_jwt_secret_32_chars_min';
const CDN_DOMAIN = process.env.CDN_DOMAIN || 'vcdn.viralkam.com';
const SITE_NAME = process.env.SITE_NAME || 'VIRALKAM';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact@yourdomain.com';

// Token generation & verification helpers
function createSignedToken(email, secret) {
  const timestamp = Date.now();
  const payload = `${email}:${timestamp}`;
  const sigHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${email}:${timestamp}:${sigHex}`).toString('base64');
}

function verifyAdminToken(req, expectedEmail, secret) {
  const auth = req.headers['authorization'] || '';
  const rawToken = auth.replace(/^Bearer\s+/i, '').trim();
  if (!rawToken) return false;

  const legacyToken = Buffer.from(`${expectedEmail}:${secret}`).toString('base64');
  if (rawToken === legacyToken) return true;

  try {
    const decoded = Buffer.from(rawToken, 'base64').toString('utf8');
    const [email, tsStr, sigHex] = decoded.split(':');
    const ts = parseInt(tsStr, 10);
    if (!email || !ts || !sigHex) return false;

    const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - ts > MAX_AGE_MS || ts > Date.now() + 60000) return false;
    if (email.toLowerCase() !== expectedEmail.toLowerCase()) return false;

    const expectedSig = crypto.createHmac('sha256', secret).update(`${email}:${ts}`).digest('hex');
    return sigHex === expectedSig;
  } catch {
    return false;
  }
}

const db = initDatabase();

// Ensure database columns for upgraded admin features
try { db.exec("ALTER TABLE videos ADD COLUMN privacy TEXT DEFAULT 'public'"); } catch {}
try { db.exec("ALTER TABLE videos ADD COLUMN initial_views INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE videos ADD COLUMN initial_likes INTEGER DEFAULT 0"); } catch {}
try { db.exec("INSERT OR IGNORE INTO categories (name, slug) VALUES ('General', 'general')"); } catch {}

// Helper to set CORS & JSON headers
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name'
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

  const cleanDisplayTitle = (rawTitle) => {
    let t = (rawTitle || '').trim();
    if (t.startsWith('http://') || t.startsWith('https://')) {
      try {
        const cleanUrl = t.replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
        const parts = cleanUrl.split('/');
        const lastPart = parts[parts.length - 1] || '';
        const withoutExt = decodeURIComponent(lastPart).replace(/\.[a-zA-Z0-9]+$/, '');
        const readable = withoutExt.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
        if (readable && readable.length > 2) return readable;
      } catch {}
    }
    return t || 'Untitled Video';
  };

  const privacy = row.privacy || (row.status === 'private' ? 'private' : 'public');
  const cleanUrl = (row.videoUrl || row.title || '').replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');

  return {
    id: row.id,
    title: cleanDisplayTitle(row.title),
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
    videoUrl: cleanUrl,
    hlsUrl: row.hlsUrl || null,
    embedUrl: row.embedUrl || null,
    seoTitle: row.seoTitle || null,
    seoDescription: row.seoDescription || null,
    canonicalUrl: row.canonicalUrl || null,
    aeoSummary: row.aeoSummary || null,
    aeoKeyFacts: row.aeoKeyFacts || null,
    geoEntities: parsedEntities,
    schemaJsonLd: row.schemaJsonLd || null,
    status: row.status || (privacy === 'private' ? 'private' : 'published'),
    privacy: privacy,
    initial_views: Number(row.initial_views || 0),
    initial_likes: Number(row.initial_likes || 0),
    createdAt: row.created_at
  };
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-File-Name'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.query;

  try {
    // Static file serving for uploads (videos, thumbnails)
    if (pathname.startsWith('/uploads/') && req.method === 'GET') {
      const safeFilename = path.basename(pathname);
      const filePath = path.join(__dirname, 'uploads', safeFilename);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
        return res.end('File not found');
      }

      const stat = fs.statSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp'
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }

    // 0. POST /api/admin/login
    if (pathname === '/api/admin/login' && req.method === 'POST') {
      const body = await parseBody(req);
      const reqId = (body.id || body.email || body.username || '').trim().toLowerCase();
      const reqPass = (body.password || body.pass || '').trim();

      if (reqId === ADMIN_EMAIL.toLowerCase() && reqPass === ADMIN_PASS) {
        const token = createSignedToken(ADMIN_EMAIL, JWT_SECRET);
        return sendJson(res, 200, {
          success: true,
          token,
          email: ADMIN_EMAIL,
          message: 'Authenticated successfully'
        });
      }
      return sendJson(res, 401, {
        success: false,
        message: 'Invalid Admin ID or Password'
      });
    }

    // 0.1 GET /api/admin/verify
    if (pathname === '/api/admin/verify' && req.method === 'GET') {
      const isValid = verifyAdminToken(req, ADMIN_EMAIL, JWT_SECRET);
      if (isValid) {
        return sendJson(res, 200, { success: true, valid: true });
      }
      return sendJson(res, 401, { success: false, valid: false });
    }

    // 0.2 GET /api/admin/stats - real summary values from database
    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      const totalVideosRow = db.prepare('SELECT COUNT(*) as total FROM videos').get();
      const totalViewsRow = db.prepare('SELECT COALESCE(SUM(views), 0) as total FROM videos').get();
      const totalCategoriesRow = db.prepare('SELECT COUNT(*) as total FROM categories').get();
      
      const recentRows = db.prepare(`
        SELECT * FROM videos 
        ORDER BY created_at DESC 
        LIMIT 6
      `).all();

      return sendJson(res, 200, {
        success: true,
        stats: {
          totalVideos: totalVideosRow ? totalVideosRow.total : 0,
          totalViews: totalViewsRow ? totalViewsRow.total : 0,
          totalCategories: totalCategoriesRow ? totalCategoriesRow.total : 0,
          recentVideos: recentRows.map(formatVideo)
        }
      });
    }

    // 1. Health check
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'online',
        service: `${SITE_NAME} API`,
        database: 'Cloudflare D1 / SQLite Engine',
        timestamp: new Date().toISOString()
      });
    }

    // 2. GET /api/categories - list all categories with real video counts
    if (pathname === '/api/categories' && req.method === 'GET') {
      const rows = db.prepare(`
        SELECT c.id, c.name, c.slug, COUNT(v.id) as count 
        FROM categories c 
        LEFT JOIN videos v ON LOWER(v.category) = LOWER(c.name) 
        GROUP BY c.id, c.name, c.slug 
        ORDER BY c.name ASC
      `).all();

      return sendJson(res, 200, {
        success: true,
        categories: rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, count: r.count }))
      });
    }

    // 2.1 POST /api/categories - add new category
    if (pathname === '/api/categories' && req.method === 'POST') {
      const body = await parseBody(req);
      const name = (body.name || '').trim();
      if (!name) {
        return sendJson(res, 400, { success: false, message: 'Category name is required' });
      }
      const slug = (body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
      
      try {
        const insert = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
        const result = insert.run(name, slug);
        return sendJson(res, 201, {
          success: true,
          category: { id: Number(result.lastInsertRowid), name, slug, count: 0 },
          message: 'Category added successfully'
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, message: 'Category name already exists' });
      }
    }

    // 2.2 PUT /api/categories/:id - edit category name
    if (pathname.startsWith('/api/categories/') && req.method === 'PUT') {
      const id = parseInt(pathname.replace('/api/categories/', ''), 10);
      const body = await parseBody(req);
      const newName = (body.name || '').trim();
      if (!newName) {
        return sendJson(res, 400, { success: false, message: 'Category name is required' });
      }

      const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      if (!existing) {
        return sendJson(res, 404, { success: false, message: 'Category not found' });
      }

      const slug = (body.slug || newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
      
      db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(newName, slug, id);
      // Sync all existing videos assigned to the old category name
      db.prepare('UPDATE videos SET category = ? WHERE LOWER(category) = LOWER(?)').run(newName, existing.name);

      return sendJson(res, 200, {
        success: true,
        category: { id, name: newName, slug },
        message: 'Category updated successfully'
      });
    }

    // 2.3 DELETE /api/categories/:id - delete category safely (reassigns videos to General)
    if (pathname.startsWith('/api/categories/') && req.method === 'DELETE') {
      const id = parseInt(pathname.replace('/api/categories/', ''), 10);
      const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
      if (!existing) {
        return sendJson(res, 404, { success: false, message: 'Category not found' });
      }

      // Ensure "General" category exists
      db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)').run('General', 'general');

      // Reassign videos from deleted category to 'General' to prevent loss
      db.prepare("UPDATE videos SET category = 'General' WHERE LOWER(category) = LOWER(?)").run(existing.name);

      db.prepare('DELETE FROM categories WHERE id = ?').run(id);

      return sendJson(res, 200, {
        success: true,
        message: `Category "${existing.name}" deleted. Any assigned videos were safely moved to "General".`
      });
    }

    // 3. GET /api/videos - list & search videos with pagination & backend privacy enforcement
    if (pathname === '/api/videos' && req.method === 'GET') {
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 24;
      const offset = (page - 1) * limit;
      const search = (query.search || query.q || '').trim();
      const category = (query.category || '').trim();
      const statusFilter = (query.status || query.privacy || '').trim().toLowerCase();
      const sort = query.sort || 'newest';

      const isAdmin = verifyAdminToken(req, ADMIN_EMAIL, JWT_SECRET);

      let conditions = [];
      let params = [];

      // Privacy enforcement: non-admin requests ONLY get public videos (NULL safe via COALESCE)
      if (!isAdmin) {
        conditions.push("(COALESCE(privacy, 'public') != 'private' AND COALESCE(status, 'published') != 'private')");
      } else if (statusFilter === 'public') {
        conditions.push("(COALESCE(privacy, 'public') != 'private' AND COALESCE(status, 'published') != 'private')");
      } else if (statusFilter === 'private') {
        conditions.push("(COALESCE(privacy, 'public') = 'private' OR COALESCE(status, 'published') = 'private')");
      }

      if (search) {
        conditions.push('(title LIKE ? OR description LIKE ? OR tags LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      if (category && category.toLowerCase() !== 'all' && category.toLowerCase() !== 'all categories') {
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
      } else if (sort === 'longest') {
        orderBy = 'ORDER BY duration DESC';
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

    // 3.1 POST /api/videos/bulk-delete - bulk deletion
    if (pathname === '/api/videos/bulk-delete' && req.method === 'POST') {
      const body = await parseBody(req);
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (ids.length === 0) {
        return sendJson(res, 400, { success: false, message: 'No video IDs provided' });
      }

      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).run(...ids);

      return sendJson(res, 200, {
        success: true,
        message: `Successfully deleted ${result.changes} video(s)`,
        affected: result.changes
      });
    }

    // 4. GET /api/videos/:id - fetch video + check privacy
    if (pathname.startsWith('/api/videos/') && req.method === 'GET' && !pathname.endsWith('/vote')) {
      const id = pathname.replace('/api/videos/', '');
      const videoRow = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
      if (!videoRow) {
        return sendJson(res, 404, { success: false, message: 'Video not found' });
      }

      const isPrivate = videoRow.privacy === 'private' || videoRow.status === 'private';
      const isAdmin = verifyAdminToken(req, ADMIN_EMAIL, JWT_SECRET);

      // Backend privacy restriction
      if (isPrivate && !isAdmin) {
        return sendJson(res, 403, { success: false, message: 'This video is private. Access restricted.' });
      }

      // Increment views for public visitors
      if (!isAdmin) {
        db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(id);
        videoRow.views = (videoRow.views || 0) + 1;
      }

      return sendJson(res, 200, {
        success: true,
        video: formatVideo(videoRow)
      });
    }

    // 4.1 PUT /api/videos/:id - edit video details
    if (pathname.startsWith('/api/videos/') && req.method === 'PUT') {
      const id = pathname.replace('/api/videos/', '');
      const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
      if (!existing) {
        return sendJson(res, 404, { success: false, message: 'Video not found' });
      }

      const data = await parseBody(req);
      const privacy = (data.privacy || (data.status === 'private' ? 'private' : (existing.privacy || 'public'))).toLowerCase();
      const status = privacy === 'private' ? 'private' : 'published';

      const toSqlString = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      };

      // Keep initial views and likes separate from actual engagement tracking
      const initialViews = data.initial_views !== undefined 
        ? Number(data.initial_views) 
        : (data.initialViews !== undefined ? Number(data.initialViews) : Number(existing.initial_views || 0));
      
      const initialLikes = data.initial_likes !== undefined 
        ? Number(data.initial_likes) 
        : (data.initialLikes !== undefined ? Number(data.initialLikes) : Number(existing.initial_likes || 0));

      const updateStmt = db.prepare(`
        UPDATE videos SET
          title = ?,
          description = ?,
          duration = ?,
          category = ?,
          tags = ?,
          thumbnail = ?,
          videoUrl = ?,
          privacy = ?,
          status = ?,
          initial_views = ?,
          initial_likes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      updateStmt.run(
        data.title !== undefined ? data.title : existing.title,
        data.description !== undefined ? data.description : existing.description,
        data.duration !== undefined ? data.duration : existing.duration,
        data.category !== undefined ? data.category : existing.category,
        toSqlString(data.tags !== undefined ? data.tags : existing.tags),
        data.thumbnail !== undefined ? data.thumbnail : existing.thumbnail,
        data.videoUrl !== undefined ? data.videoUrl : existing.videoUrl,
        privacy,
        status,
        initialViews,
        initialLikes,
        id
      );

      const updated = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
      return sendJson(res, 200, {
        success: true,
        message: 'Video updated successfully',
        video: formatVideo(updated)
      });
    }

    // 5. POST /api/videos - create new video (Admin Publish)
    if (pathname === '/api/videos' && req.method === 'POST') {
      const data = await parseBody(req);
      if (!data.title) {
        return sendJson(res, 400, { success: false, message: 'Title is required' });
      }

      const id = data.id || `vid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const privacy = (data.privacy || (data.status === 'private' ? 'private' : 'public')).toLowerCase();
      const status = privacy === 'private' ? 'private' : 'published';

      const initialViews = Number(data.initial_views ?? data.initialViews ?? 0);
      const initialLikes = Number(data.initial_likes ?? data.initialLikes ?? 0);

      const insertStmt = db.prepare(`
        INSERT INTO videos (
          id, title, description, duration, views, likes, dislikes, rating,
          category, tags, uploadedAt, author, thumbnail, videoUrl,
          hlsUrl, embedUrl, seoTitle, seoDescription, canonicalUrl,
          aeoSummary, aeoKeyFacts, geoEntities, schemaJsonLd,
          status, privacy, initial_views, initial_likes
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `);

      const toSqlString = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      };

      insertStmt.run(
        id,
        data.title,
        data.description || 'Watch video on VIRALKAM.COM',
        data.duration || '03:30',
        initialViews,
        initialLikes,
        Number(data.dislikes || 0),
        Number(data.rating || 95),
        data.category || 'General',
        toSqlString(data.tags || []),
        data.uploadedAt || 'Just now',
        data.author || 'VIRALKAM Admin',
        data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
        data.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4',
        data.hlsUrl || null,
        data.embedUrl || null,
        data.seoTitle || null,
        data.seoDescription || null,
        data.canonicalUrl || null,
        toSqlString(data.aeoSummary),
        toSqlString(data.aeoKeyFacts),
        toSqlString(data.geoEntities || []),
        toSqlString(data.schemaJsonLd),
        status,
        privacy,
        initialViews,
        initialLikes
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
        report.email || CONTACT_EMAIL
      );

      return sendJson(res, 201, {
        success: true,
        message: `Report received. Our moderation team (${CONTACT_EMAIL}) will review within 24 hours.`
      });
    }

    // 9. POST /api/upload - Local disk storage for video files & thumbnails
    if (pathname === '/api/upload' && req.method === 'POST') {
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const rawFileName = req.headers['x-file-name'] || `file-${Date.now()}`;
      const decoded = decodeURIComponent(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const safeFilename = `${Date.now()}-${decoded}`;
      const targetPath = path.join(uploadsDir, safeFilename);

      const writeStream = fs.createWriteStream(targetPath);
      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const stats = fs.statSync(targetPath);
        const host = req.headers.host || `localhost:${PORT}`;
        const fileUrl = `http://${host}/uploads/${safeFilename}`;
        return sendJson(res, 201, {
          success: true,
          url: fileUrl,
          fileName: safeFilename,
          size: stats.size,
          message: 'File uploaded successfully'
        });
      });

      writeStream.on('error', (err) => {
        return sendJson(res, 500, { success: false, error: err.message });
      });
      return;
    }

    // 10. POST /api/r2/upload-sign - Cloudflare R2 Upload URL generator
    if (pathname === '/api/r2/upload-sign' && req.method === 'POST') {
      const { fileName } = await parseBody(req);
      const ext = path.extname(fileName || 'video.mp4');
      const uniqueKey = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
      
      return sendJson(res, 200, {
        success: true,
        uploadKey: uniqueKey,
        publicUrl: `https://${CDN_DOMAIN}/${uniqueKey}`,
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
  console.log(`🚀 ${SITE_NAME} Backend Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`💾 Database: SQLite (Cloudflare D1 Compatible Engine)`);
  console.log(`⚡ Endpoints:`);
  console.log(`   - POST /api/admin/login`);
  console.log(`   - GET  /api/admin/verify`);
  console.log(`   - GET  /api/health`);
  console.log(`   - GET  /api/videos`);
  console.log(`   - GET  /api/videos/:id`);
  console.log(`   - POST /api/videos`);
  console.log(`   - POST /api/videos/:id/vote`);
  console.log(`   - POST /api/reports`);
  console.log(`   - GET  /api/categories`);
  console.log(`===============================================`);
});