/**
 * Cloudflare Worker API for VIRALKAM.COM
 * Native Edge implementation with Cloudflare D1 (SQL Database) & Cloudflare R2 (Object Storage)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // Serve Frontend Static Assets if not an /api route (with SPA fallback)
    if (!pathname.startsWith('/api') && env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 404) {
        return env.ASSETS.fetch(new Request(new URL('/', request.url), request));
      }
      return assetRes;
    }

    // Security & CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
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
      // Admin Credentials from Cloudflare Environment Vars / Secrets
      const expectedAdminId = env.ADMIN_EMAIL || 'viralkam.com@gmail.com';
      const expectedAdminPass = env.ADMIN_PASS || 'Viralkam.com@gmail.comR85';
      const authSecret = env.JWT_SECRET || 'vk_secret_key_8348da430a621adc2e77fdb6e3b83243_2026';

      // Anti-Replay Attack: Generate HMAC-SHA256 signed token with timestamp
      const createSignedToken = async (email, secret) => {
        const timestamp = Date.now();
        const payload = `${email}:${timestamp}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
        const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        return btoa(`${email}:${timestamp}:${sigHex}`);
      };

      // Anti-Replay Attack: Verify token signature + enforce 30-day max expiration window
      const verifyAdminToken = async (req) => {
        const auth = req.headers.get('Authorization') || '';
        const rawToken = auth.replace(/^Bearer\s+/i, '').trim();
        if (!rawToken) return false;

        // Allow legacy token for active browser sessions
        const legacyToken = btoa(`${expectedAdminId}:${authSecret}`);
        if (rawToken === legacyToken) {
          return true;
        }

        try {
          const decoded = atob(rawToken);
          const [email, tsStr, sigHex] = decoded.split(':');
          const ts = parseInt(tsStr, 10);
          if (!email || !ts || !sigHex) return false;

          // Reject if token is older than 30 days (Replay Attack Prevention)
          const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
          if (Date.now() - ts > MAX_AGE_MS || ts > Date.now() + 60000) {
            return false;
          }

          if (email.toLowerCase() !== expectedAdminId.toLowerCase()) return false;

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
          return sigHex === expectedSigHex;
        } catch {
          return false;
        }
      };

      // 0. POST /api/admin/login
      if (pathname === '/api/admin/login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const reqId = (body.id || body.email || body.username || '').trim().toLowerCase();
        const reqPass = (body.password || body.pass || '').trim();

        if (reqId === expectedAdminId.toLowerCase() && reqPass === expectedAdminPass) {
          const token = await createSignedToken(expectedAdminId, authSecret);
          return json({
            success: true,
            token,
            email: expectedAdminId,
            message: 'Authenticated successfully with HMAC security'
          });
        }
        return json({
          success: false,
          message: 'Invalid Admin ID or Password'
        }, 401);
      }

      // 0.1 GET /api/admin/verify
      if (pathname === '/api/admin/verify' && method === 'GET') {
        const isValid = await verifyAdminToken(request);
        if (isValid) {
          return json({ success: true, valid: true });
        }
        return json({ success: false, valid: false }, 401);
      }

      // 0.2 GET /api/admin/stats
      if (pathname === '/api/admin/stats' && method === 'GET') {
        const totalVideos = (await env.DB.prepare('SELECT COUNT(*) as total FROM videos').first())?.total || 0;
        const totalViews = (await env.DB.prepare('SELECT COALESCE(SUM(views), 0) as total FROM videos').first())?.total || 0;
        const totalCategories = (await env.DB.prepare('SELECT COUNT(*) as total FROM categories').first())?.total || 0;
        
        const { results: recentRows } = await env.DB.prepare(`
          SELECT * FROM videos 
          ORDER BY created_at DESC 
          LIMIT 6
        `).all();

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

        const formattedRecent = (recentRows || []).map(v => {
          let tags = [];
          try { tags = typeof v.tags === 'string' ? JSON.parse(v.tags) : (v.tags || []); } catch {}
          const cleanUrl = (v.videoUrl || v.title || '').replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
          return {
            ...v,
            title: cleanDisplayTitle(v.title),
            videoUrl: cleanUrl,
            tags,
            privacy: v.privacy || (v.status === 'private' ? 'private' : 'public')
          };
        });

        return json({
          success: true,
          stats: {
            totalVideos,
            totalViews,
            totalCategories,
            recentVideos: formattedRecent
          }
        });
      }

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
          SELECT c.id, c.name, c.slug, COUNT(v.id) as count 
          FROM categories c 
          LEFT JOIN videos v ON LOWER(v.category) = LOWER(c.name) 
          GROUP BY c.id, c.name, c.slug 
          ORDER BY c.name ASC
        `).all();

        return json({
          success: true,
          categories: (results || []).map(r => ({ id: r.id, name: r.name, slug: r.slug, count: r.count }))
        });
      }

      // 2.1 POST /api/categories
      if (pathname === '/api/categories' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const name = (body.name || '').trim();
        if (!name) return json({ success: false, message: 'Category name is required' }, 400);
        const slug = (body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        
        try {
          const res = await env.DB.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').bind(name, slug).run();
          return json({
            success: true,
            category: { id: res.meta?.last_row_id || Date.now(), name, slug, count: 0 },
            message: 'Category created'
          }, 201);
        } catch {
          return json({ success: false, message: 'Category already exists' }, 400);
        }
      }

      // 2.2 PUT /api/categories/:id
      if (pathname.startsWith('/api/categories/') && method === 'PUT') {
        const id = parseInt(pathname.replace('/api/categories/', ''), 10);
        const body = await request.json().catch(() => ({}));
        const newName = (body.name || '').trim();
        if (!newName) return json({ success: false, message: 'Category name is required' }, 400);

        const existing = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
        if (!existing) return json({ success: false, message: 'Category not found' }, 404);

        const slug = (body.slug || newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        await env.DB.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').bind(newName, slug, id).run();
        await env.DB.prepare('UPDATE videos SET category = ? WHERE LOWER(category) = LOWER(?)').bind(newName, existing.name).run();

        return json({ success: true, category: { id, name: newName, slug } });
      }

      // 2.3 DELETE /api/categories/:id
      if (pathname.startsWith('/api/categories/') && method === 'DELETE') {
        const id = parseInt(pathname.replace('/api/categories/', ''), 10);
        const existing = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
        if (!existing) return json({ success: false, message: 'Category not found' }, 404);

        // Ensure General exists and reassign
        await env.DB.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)').bind('General', 'general').run();
        await env.DB.prepare("UPDATE videos SET category = 'General' WHERE LOWER(category) = LOWER(?)").bind(existing.name).run();
        await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();

        return json({ success: true, message: `Category ${existing.name} removed and videos reassigned to General` });
      }

      // 3. GET /api/videos (with search, category, privacy, sorting, pagination)
      if (pathname === '/api/videos' && method === 'GET') {
        const params = url.searchParams;
        const page = Math.max(1, parseInt(params.get('page')) || 1);
        const rawLimit = parseInt(params.get('limit')) || 24;
        const limit = Math.min(Math.max(1, rawLimit), 100);
        const offset = (page - 1) * limit;
        const search = (params.get('search') || params.get('q') || '').trim().slice(0, 100);
        const category = (params.get('category') || '').trim().slice(0, 50);
        const statusFilter = (params.get('status') || params.get('privacy') || '').trim().toLowerCase();
        const sort = params.get('sort') || 'newest';

        const isAdmin = await verifyAdminToken(request);

        // Auto-heal table columns and null values in Cloudflare D1
        try {
          await env.DB.prepare("ALTER TABLE videos ADD COLUMN privacy TEXT DEFAULT 'public'").run().catch(() => {});
          await env.DB.prepare("UPDATE videos SET privacy = 'public' WHERE privacy IS NULL OR privacy = ''").run().catch(() => {});
          await env.DB.prepare("UPDATE videos SET status = 'published' WHERE status IS NULL OR status = ''").run().catch(() => {});
        } catch {}

        let conditions = [];
        let bindings = [];

        // Privacy backend enforcement with NULL safety via COALESCE
        if (!isAdmin) {
          conditions.push("(COALESCE(privacy, 'public') != 'private' AND COALESCE(status, 'published') != 'private')");
        } else if (statusFilter === 'public') {
          conditions.push("(COALESCE(privacy, 'public') != 'private' AND COALESCE(status, 'published') != 'private')");
        } else if (statusFilter === 'private') {
          conditions.push("(COALESCE(privacy, 'public') = 'private' OR COALESCE(status, 'published') = 'private')");
        }

        if (search) {
          conditions.push('(title LIKE ? OR description LIKE ? OR tags LIKE ?)');
          const qParam = `%${search}%`;
          bindings.push(qParam, qParam, qParam);
        }

        if (category && category.toLowerCase() !== 'all' && category.toLowerCase() !== 'all categories') {
          conditions.push('LOWER(category) = LOWER(?)');
          bindings.push(category);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        let orderBy = 'ORDER BY created_at DESC';
        if (sort === 'popular') orderBy = 'ORDER BY likes DESC';
        else if (sort === 'most_viewed') orderBy = 'ORDER BY views DESC';
        else if (sort === 'longest') orderBy = 'ORDER BY duration DESC';
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

        // Helper to format clean human-readable title if URL path was entered as title
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

        // Format tags & geo
        const formattedVideos = results.map(v => {
          let tags = [];
          try { tags = typeof v.tags === 'string' ? JSON.parse(v.tags) : (v.tags || []); } catch {}
          let geo = [];
          try { geo = typeof v.geoEntities === 'string' ? JSON.parse(v.geoEntities) : (v.geoEntities || []); } catch {}
          const privacy = v.privacy || (v.status === 'private' ? 'private' : 'public');
          const cleanUrl = (v.videoUrl || v.title || '').replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
          return {
            ...v,
            title: cleanDisplayTitle(v.title),
            videoUrl: cleanUrl,
            tags,
            geoEntities: geo,
            privacy,
            status: v.status || (privacy === 'private' ? 'private' : 'published'),
            initial_views: Number(v.initial_views || 0),
            initial_likes: Number(v.initial_likes || 0)
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

      // 3.1 POST /api/videos/bulk-delete
      if (pathname === '/api/videos/bulk-delete' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return json({ success: false, message: 'No IDs provided' }, 400);

        for (const id of ids) {
          await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
        }

        return json({ success: true, message: `Deleted ${ids.length} videos` });
      }

      // 4. GET /api/videos/:id (fetch + increment view count)
      if (pathname.startsWith('/api/videos/') && method === 'GET' && !pathname.endsWith('/vote')) {
        const id = pathname.replace('/api/videos/', '');
        const video = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        if (!video) {
          return json({ success: false, message: 'Video not found' }, 404);
        }

        const isPrivate = video.privacy === 'private' || video.status === 'private';
        const isAdmin = await verifyAdminToken(request);

        if (isPrivate && !isAdmin) {
          return json({ success: false, message: 'This video is private. Access restricted.' }, 403);
        }

        // Increment views atomically for visitors
        if (!isAdmin) {
          await env.DB.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').bind(id).run();
          video.views = (video.views || 0) + 1;
        }

        let tags = [];
        try { tags = typeof video.tags === 'string' ? JSON.parse(video.tags) : (video.tags || []); } catch {}

        const cleanTitle = (rawTitle) => {
          let t = (rawTitle || '').trim();
          if (t.startsWith('http://') || t.startsWith('https://')) {
            try {
              const u = t.replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
              const parts = u.split('/');
              const last = parts[parts.length - 1] || '';
              const clean = decodeURIComponent(last).replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_+]/g, ' ').trim();
              if (clean && clean.length > 2) return clean;
            } catch {}
          }
          return t || 'Untitled Video';
        };

        const cleanUrl = (video.videoUrl || video.title || '').replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');

        return json({
          success: true,
          video: {
            ...video,
            title: cleanTitle(video.title),
            videoUrl: cleanUrl,
            tags,
            privacy: video.privacy || (video.status === 'private' ? 'private' : 'public')
          }
        });
      }

      // 4.1 PUT /api/videos/:id - update video
      if (pathname.startsWith('/api/videos/') && method === 'PUT') {
        const id = pathname.replace('/api/videos/', '');
        const existing = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        if (!existing) {
          return json({ success: false, message: 'Video not found' }, 404);
        }

        const body = await request.json().catch(() => ({}));
        const privacy = (body.privacy || (body.status === 'private' ? 'private' : (existing.privacy || 'public'))).toLowerCase();
        const status = privacy === 'private' ? 'private' : 'published';

        const toSqlString = (val) => {
          if (val === null || val === undefined) return null;
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        };

        const initialViews = body.initial_views !== undefined ? Number(body.initial_views) : (body.initialViews !== undefined ? Number(body.initialViews) : Number(existing.initial_views || 0));
        const initialLikes = body.initial_likes !== undefined ? Number(body.initial_likes) : (body.initialLikes !== undefined ? Number(body.initialLikes) : Number(existing.initial_likes || 0));

        await env.DB.prepare(`
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
        `).bind(
          body.title !== undefined ? body.title : existing.title,
          body.description !== undefined ? body.description : existing.description,
          body.duration !== undefined ? body.duration : existing.duration,
          body.category !== undefined ? body.category : existing.category,
          toSqlString(body.tags !== undefined ? body.tags : existing.tags),
          body.thumbnail !== undefined ? body.thumbnail : existing.thumbnail,
          body.videoUrl !== undefined ? body.videoUrl : existing.videoUrl,
          privacy,
          status,
          initialViews,
          initialLikes,
          id
        ).run();

        const updated = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        return json({ success: true, message: 'Video updated', video: updated });
      }

      // Helper to serialize any object/array to string for SQLite/D1
      const toSqlString = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      };

      // 5. POST /api/videos (Publish new video)
      if (pathname === '/api/videos' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.title) {
          return json({ success: false, message: 'Title is required' }, 400);
        }

        // Auto-create table if not exists with all columns
        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS videos (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            duration TEXT DEFAULT '03:30',
            views INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            dislikes INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 95,
            category TEXT DEFAULT 'General',
            tags TEXT,
            uploadedAt TEXT DEFAULT 'Just now',
            author TEXT DEFAULT 'VIRALKAM Admin',
            thumbnail TEXT NOT NULL,
            videoUrl TEXT NOT NULL,
            hlsUrl TEXT,
            embedUrl TEXT,
            seoTitle TEXT,
            seoDescription TEXT,
            canonicalUrl TEXT,
            aeoSummary TEXT,
            aeoKeyFacts TEXT,
            geoEntities TEXT,
            schemaJsonLd TEXT,
            status TEXT DEFAULT 'published',
            privacy TEXT DEFAULT 'public',
            initial_views INTEGER DEFAULT 0,
            initial_likes INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `).run();

        const id = body.id || `vid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const privacy = (body.privacy || (body.status === 'private' ? 'private' : 'public')).toLowerCase();
        const status = privacy === 'private' ? 'private' : 'published';
        const initialViews = Number(body.initial_views ?? body.initialViews ?? 0);
        const initialLikes = Number(body.initial_likes ?? body.initialLikes ?? 0);

        await env.DB.prepare(`
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
        `).bind(
          id,
          body.title,
          body.description || 'Watch video on VIRALKAM.COM',
          body.duration || '03:30',
          initialViews,
          initialLikes,
          Number(body.dislikes || 0),
          Number(body.rating || 95),
          body.category || 'General',
          toSqlString(body.tags || []),
          body.uploadedAt || 'Just now',
          body.author || 'VIRALKAM Admin',
          body.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
          body.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4',
          body.hlsUrl || null,
          body.embedUrl || null,
          body.seoTitle || null,
          body.seoDescription || null,
          body.canonicalUrl || null,
          toSqlString(body.aeoSummary),
          toSqlString(body.aeoKeyFacts),
          toSqlString(body.geoEntities || []),
          toSqlString(body.schemaJsonLd),
          status,
          privacy,
          initialViews,
          initialLikes
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
          rep.email || env.CONTACT_EMAIL || 'contact@yourdomain.com'
        ).run();

        return json({
          success: true,
          message: `Report received. Our moderation team (${env.CONTACT_EMAIL || 'contact@yourdomain.com'}) will review within 24 hours.`
        }, 201);
      }

      // 9. POST /api/r2/upload (Cloudflare R2 Direct Upload & Storage)
      if (pathname === '/api/r2/upload' && method === 'POST') {
        if (!env.BUCKET) {
          return json({
            success: false,
            message: 'Cloudflare R2 Storage (BUCKET) is not bound. Please bind R2 bucket "viralkam-videos" as BUCKET in wrangler.toml or Cloudflare dashboard.'
          }, 500);
        }

        const rawFileName = request.headers.get('X-File-Name') || `upload-${Date.now()}.mp4`;
        const filename = decodeURIComponent(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const contentType = request.headers.get('Content-Type') || 'video/mp4';
        const fileKey = `videos/${Date.now()}-${filename}`;

        // Stream into Cloudflare R2 Bucket
        await env.BUCKET.put(fileKey, request.body, {
          httpMetadata: { contentType }
        });

        // CDN delivery: uses custom CDN domain if configured or worker edge CDN endpoint
        const cdnDomain = env.CDN_DOMAIN;
        const publicUrl = cdnDomain && !cdnDomain.includes('yourdomain')
          ? `https://${cdnDomain}/${fileKey}`
          : `${url.origin}/cdn/${fileKey}`;

        return json({
          success: true,
          key: fileKey,
          url: publicUrl,
          cdnUrl: `${url.origin}/cdn/${fileKey}`,
          message: 'Video file uploaded successfully to Cloudflare R2 Storage'
        });
      }

      // 9.1 GET /cdn/* or /api/media/* (Direct Edge CDN Video Streaming from R2 with Seeking/Range Support)
      if ((pathname.startsWith('/cdn/') || pathname.startsWith('/api/media/')) && method === 'GET') {
        if (!env.BUCKET) {
          return json({ success: false, message: 'Cloudflare R2 BUCKET not bound' }, 404);
        }

        const rawKey = pathname.replace(/^\/(cdn|api\/media)\//, '');
        const key = decodeURIComponent(rawKey);

        const rangeHeader = request.headers.get('Range');
        const object = await env.BUCKET.get(key, {
          range: request.headers,
          onlyIf: request.headers
        });

        if (!object) {
          return new Response('Video file not found in R2 Storage', { status: 404 });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        if (object.range) {
          const start = object.range.offset;
          const end = object.range.offset + object.range.length - 1;
          headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
          headers.set('Content-Length', String(object.range.length));
          return new Response(object.body, { headers, status: 206 });
        }

        headers.set('Content-Length', String(object.size));
        return new Response(object.body, { headers, status: 200 });
      }

      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
      return json({ success: false, message: 'Not found' }, 404);

    } catch (err) {
      return json({ success: false, error: err.message }, 500);
    }
  }
};
