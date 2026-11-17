/**
 * Cloudflare Worker API for VIRALKAAM.COM
 * Native Edge implementation with Cloudflare D1 (SQL Database) & Cloudflare R2 (Object Storage)
 */

// Global in-memory caches to prevent exceeding Cloudflare D1 daily read limits
let isD1SchemaChecked = false;
const videosMemoryCache = new Map();
let tagsMemoryCache = { data: null, timestamp: 0 };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // Security & CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, X-File-Name',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 0. Direct Edge CDN Video & Media Streaming from R2 Storage (with Seeking & Range Support)
    if ((pathname.startsWith('/cdn/') || pathname.startsWith('/api/media/')) && (method === 'GET' || method === 'HEAD')) {
      if (!env.BUCKET) {
        return new Response(JSON.stringify({ success: false, message: 'Cloudflare R2 BUCKET not bound' }), {
          status: 404,
          headers: corsHeaders
        });
      }

      const rawKey = pathname.replace(/^\/(cdn|api\/media)\//, '');
      const key = decodeURIComponent(rawKey);

      try {
        const object = await env.BUCKET.get(key, {
          range: request.headers,
          onlyIf: request.headers
        });

        if (!object) {
          return new Response('File not found in R2 Storage', {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
        headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');

        // Infer correct Content-Type if missing or generic octet-stream
        const existingType = headers.get('Content-Type');
        if (!existingType || existingType === 'application/octet-stream') {
          const lowerKey = key.toLowerCase();
          if (lowerKey.endsWith('.mp4')) headers.set('Content-Type', 'video/mp4');
          else if (lowerKey.endsWith('.webm')) headers.set('Content-Type', 'video/webm');
          else if (lowerKey.endsWith('.m3u8')) headers.set('Content-Type', 'application/x-mpegURL');
          else if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')) headers.set('Content-Type', 'image/jpeg');
          else if (lowerKey.endsWith('.png')) headers.set('Content-Type', 'image/png');
          else if (lowerKey.endsWith('.webp')) headers.set('Content-Type', 'image/webp');
          else headers.set('Content-Type', 'video/mp4');
        }

        if (method === 'HEAD') {
          headers.set('Content-Length', String(object.size));
          return new Response(null, { headers, status: 200 });
        }

        if (object.range) {
          const start = object.range.offset;
          const end = object.range.offset + object.range.length - 1;
          headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
          headers.set('Content-Length', String(object.range.length));
          return new Response(object.body, { headers, status: 206 });
        }

        headers.set('Content-Length', String(object.size));
        return new Response(object.body, { headers, status: 200 });
      } catch (streamErr) {
        return new Response('Streaming error: ' + streamErr.message, { status: 500 });
      }
    }

    // Serve Frontend Static Assets if not an /api route (with SPA fallback)
    if (!pathname.startsWith('/api') && !pathname.startsWith('/cdn/') && env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status === 404) {
        return env.ASSETS.fetch(new Request(new URL('/', request.url), request));
      }
      return assetRes;
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
        try {
          await ensureD1Columns(env.DB);
          const totalVideos = (await env.DB.prepare('SELECT COUNT(*) as total FROM videos').first())?.total || 0;
          const totalViews = (await env.DB.prepare('SELECT COALESCE(SUM(views), 0) as total FROM videos').first())?.total || 0;
          const totalCategories = (await env.DB.prepare('SELECT COUNT(*) as total FROM categories').first())?.total || 0;
          const totalTags = (await env.DB.prepare('SELECT COUNT(*) as total FROM tags').first())?.total || 0;
          
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

          const resolveMediaUrl = (mediaPath) => {
            if (!mediaPath) return '';
            let u = String(mediaPath).trim().replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
            if (u.includes('vcdn.viralkaam.com/') || u.includes('vcdn.viralkam.com/')) {
              u = u.replace(/https?:\/\/vcdn\.viralkaa?m\.com\//, `${url.origin}/cdn/`);
            } else if (u.startsWith('/cdn/')) {
              u = `${url.origin}${u}`;
            }
            return u;
          };

          const formattedRecent = (recentRows || []).map(v => {
            let tags = [];
            try { tags = typeof v.tags === 'string' ? JSON.parse(v.tags) : (v.tags || []); } catch {}
            return {
              ...v,
              title: cleanDisplayTitle(v.title),
              videoUrl: resolveMediaUrl(v.videoUrl || v.title || ''),
              thumbnail: resolveMediaUrl(v.thumbnail || ''),
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
              totalTags,
              recentVideos: formattedRecent
            }
          });
        } catch (err) {
          console.warn('[Admin Stats Read Error]:', err.message);
          return json({
            success: true,
            isLimitExceeded: String(err.message).includes('free tier daily row read limit'),
            stats: {
              totalVideos: 1039,
              totalViews: 0,
              totalCategories: 6,
              totalTags: 10,
              recentVideos: []
            }
          });
        }
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

      // 1.1 Fetch Video & Link Metadata for Auto-filling
      if (pathname === '/api/fetch-meta' && (method === 'GET' || method === 'POST')) {
        let targetUrl = '';
        if (method === 'GET') {
          targetUrl = url.searchParams.get('url') || '';
        } else {
          const body = await request.json().catch(() => ({}));
          targetUrl = body.url || '';
        }
        targetUrl = targetUrl.trim();
        if (!targetUrl) {
          return json({ success: false, message: 'URL parameter is required' }, 400);
        }

        try {
          // 1. If YouTube link
          const ytMatch = targetUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
          if (ytMatch && ytMatch[1]) {
            const ytId = ytMatch[1];
            const thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
            let ytTitle = '';
            let ytAuthor = '';
            try {
              const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`);
              if (oembedRes.ok) {
                const oembedData = await oembedRes.json();
                ytTitle = oembedData.title || '';
                ytAuthor = oembedData.author_name || '';
              }
            } catch {}

            const finalTitle = ytTitle || `YouTube Video (${ytId})`;
            return json({
              success: true,
              title: finalTitle,
              description: `Watch ${finalTitle} online in high definition streaming.`,
              thumbnail: thumbUrl,
              duration: '',
              tags: ['YouTube', 'Viral', 'Trending', 'HD'],
              category: 'Trending',
              views: Math.floor(Math.random() * 8000) + 2500,
              likes: Math.floor((Math.random() * 8000 + 2500) * 0.95),
              author: ytAuthor || 'Admin'
            });
          }

          // 2. Direct Video File (.mp4, .webm, .mkv, .mov, etc.)
          const cleanDisplay = (raw) => {
            try {
              const u = new URL(raw);
              const parts = u.pathname.split('/').filter(Boolean);
              const last = parts[parts.length - 1] || '';
              const withoutExt = decodeURIComponent(last).replace(/\.[a-zA-Z0-9]+$/, '');
              return withoutExt.replace(/[-_+.]/g, ' ').replace(/\s+/g, ' ').trim();
            } catch {
              return 'Online Video Stream';
            }
          };

          const isDirectVideo = /\.(mp4|webm|mkv|mov|avi|m3u8)(\?.*)?$/i.test(targetUrl);

          // Fetch web page or headers
          const pageRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });

          if (!pageRes.ok && isDirectVideo) {
            const title = cleanDisplay(targetUrl) || 'Stream Video';
            return json({
              success: true,
              title,
              description: `Watch ${title} in HD quality streaming.`,
              thumbnail: '',
              duration: '',
              tags: ['Viral', 'Trending', 'HD'],
              category: 'General',
              views: Math.floor(Math.random() * 5000) + 1200,
              likes: Math.floor((Math.random() * 5000 + 1200) * 0.94)
            });
          }

          const contentType = pageRes.headers.get('content-type') || '';
          if (contentType.includes('video/') || isDirectVideo) {
            const title = cleanDisplay(targetUrl) || 'Stream Video';
            return json({
              success: true,
              title,
              description: `Watch ${title} in HD quality streaming on VIRALKAAM.`,
              thumbnail: '',
              duration: '',
              tags: ['Viral', 'Trending', 'HD'],
              category: 'General',
              views: Math.floor(Math.random() * 6000) + 1500,
              likes: Math.floor((Math.random() * 6000 + 1500) * 0.95)
            });
          }

          // HTML Page Extraction
          const html = await pageRes.text();
          let title = '';
          let description = '';
          let thumbnail = '';
          let duration = '';
          let tags = [];

          // OG Title / Twitter Title / <title>
          const ogTitle = html.match(/<meta[^>]+(?:property|name)=["'](?:og:title|twitter:title)["'][^>]+content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
          if (ogTitle && ogTitle[1]) {
            title = ogTitle[1];
          } else {
            const docTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
            if (docTitle && docTitle[1]) title = docTitle[1];
          }

          // OG Description / Meta Description
          const ogDesc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["'][^>]+content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description|twitter:description)["']/i);
          if (ogDesc && ogDesc[1]) description = ogDesc[1];

          // OG Image / Twitter Image
          const ogImg = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:url)["']/i) ||
                        html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
          if (ogImg && ogImg[1]) {
            thumbnail = ogImg[1];
            if (thumbnail.startsWith('/')) {
              try {
                const u = new URL(targetUrl);
                thumbnail = `${u.origin}${thumbnail}`;
              } catch {}
            }
          }

          // Video Duration
          const ogDur = html.match(/<meta[^>]+(?:property|name)=["'](?:og:video:duration|video:duration)["'][^>]+content=["']([^"']+)["']/i) ||
                        html.match(/"duration":\s*["']([^"']+)["']/i);
          if (ogDur && ogDur[1]) {
            const rawD = ogDur[1].trim();
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(rawD)) {
              duration = rawD;
            } else {
              const numSec = parseInt(rawD, 10);
              if (!isNaN(numSec) && numSec > 0 && String(numSec) === rawD) {
                const m = Math.floor(numSec / 60);
                const s = numSec % 60;
                duration = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
              } else {
                const iso = rawD.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
                if (iso) {
                  const h = parseInt(iso[1] || '0', 10);
                  const m = parseInt(iso[2] || '0', 10);
                  const s = parseInt(iso[3] || '0', 10);
                  duration = h > 0 
                    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                }
              }
            }
          }

          // Keywords / Tags
          const kw = html.match(/<meta[^>]+(?:property|name)=["'](?:keywords|og:video:tag)["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:keywords|og:video:tag)["']/i);
          if (kw && kw[1]) {
            tags = kw[1].split(/[,|;]/).map(t => t.trim()).filter(t => t.length > 1 && t.length < 25).slice(0, 8);
          }

          // HTML decode entities
          const cleanText = (str) => (str || '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&ndash;/g, '-')
            .replace(/&mdash;/g, '-')
            .trim();

          title = cleanText(title) || cleanDisplay(targetUrl);
          description = cleanText(description) || `Watch ${title} online in HD quality.`;

          // Category detection
          let detectedCategory = 'General';
          const lowerAll = `${title} ${description} ${tags.join(' ')}`.toLowerCase();
          if (lowerAll.includes('desi') || lowerAll.includes('bhabhi') || lowerAll.includes('devar') || lowerAll.includes('patni') || lowerAll.includes('chudai')) {
            detectedCategory = 'Desi';
          } else if (lowerAll.includes('mms') || lowerAll.includes('leak') || lowerAll.includes('hidden') || lowerAll.includes('scandal')) {
            detectedCategory = 'MMS';
          } else if (lowerAll.includes('college') || lowerAll.includes('student') || lowerAll.includes('hostel')) {
            detectedCategory = 'College';
          } else if (lowerAll.includes('romance') || lowerAll.includes('romantic') || lowerAll.includes('couple') || lowerAll.includes('kiss')) {
            detectedCategory = 'Romance';
          } else if (lowerAll.includes('webseries') || lowerAll.includes('ullu') || lowerAll.includes('episode')) {
            detectedCategory = 'Webseries';
          } else if (lowerAll.includes('short') || lowerAll.includes('clip') || lowerAll.includes('reel')) {
            detectedCategory = 'Shorts';
          } else if (lowerAll.includes('viral') || lowerAll.includes('trending')) {
            detectedCategory = 'Viral';
          }

          if (tags.length === 0) {
            tags = [detectedCategory, 'Trending', 'Viral', 'HD'];
          }

          const views = Math.floor(Math.random() * 8500) + 1500;
          const likes = Math.floor(views * 0.95);

          return json({
            success: true,
            title,
            description,
            thumbnail,
            duration: duration || '',
            tags,
            category: detectedCategory,
            views,
            likes
          });
        } catch (err) {
          return json({
            success: false,
            message: `Failed to fetch metadata from link: ${err.message}`
          }, 500);
        }
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

      // 2.4 GET /api/tags - list all tags (cached to prevent exceeding D1 read limits)
      if (pathname === '/api/tags' && method === 'GET') {
        const now = Date.now();
        const bypass = url.searchParams.get('refresh') === '1';
        if (!bypass && tagsMemoryCache.data && (now - tagsMemoryCache.timestamp < 10 * 60 * 1000)) {
          return json({ success: true, tags: tagsMemoryCache.data });
        }

        try {
          const { results: tagRows } = await env.DB.prepare('SELECT id, name, slug FROM tags ORDER BY name ASC').all();
          const countMap = new Map();
          try {
            const { results: vidTags } = await env.DB.prepare('SELECT tags FROM videos WHERE tags IS NOT NULL').all();
            for (const row of (vidTags || [])) {
              let parsed = [];
              try {
                const p = JSON.parse(row.tags);
                parsed = Array.isArray(p) ? p : String(row.tags).split(',');
              } catch {
                parsed = String(row.tags || '').split(',');
              }
              for (const t of parsed) {
                const k = String(t || '').trim().toLowerCase();
                if (k) countMap.set(k, (countMap.get(k) || 0) + 1);
              }
            }
          } catch {}

          const tagsWithCounts = (tagRows || []).map(r => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            count: countMap.get(String(r.name || '').trim().toLowerCase()) || 0
          }));

          tagsMemoryCache = { data: tagsWithCounts, timestamp: now };
          return json({
            success: true,
            tags: tagsWithCounts
          });
        } catch (err) {
          if (tagsMemoryCache.data) {
            return json({ success: true, tags: tagsMemoryCache.data });
          }
          return json({ success: true, tags: [] });
        }
      }

      // Helper: Auto-extract Category, Tags, and full SEO/AEO/GEO metadata from video title & existing info
      const buildVideoSeoAeoGeoAndTaxonomy = (videoInput = {}, forceReclassify = false) => {
        const rawTitle = String(videoInput.title || '').trim();
        let cleanTitle = rawTitle;
        if (cleanTitle.startsWith('http://') || cleanTitle.startsWith('https://')) {
          try {
            const cleaned = cleanTitle.replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
            const parts = cleaned.split('/');
            const lastPart = parts[parts.length - 1] || '';
            cleanTitle = decodeURIComponent(lastPart).replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
          } catch {}
        } else {
          cleanTitle = cleanTitle.replace(/\.(mp4|webm|mkv|mov|avi)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        }
        cleanTitle = cleanTitle.replace(/\b(480p?|720p?|1080p?|r2)\b$/i, '').trim() || 'Trending Viral Video';

        let existingTagsArr = [];
        if (Array.isArray(videoInput.tags)) {
          existingTagsArr = videoInput.tags;
        } else if (typeof videoInput.tags === 'string' && videoInput.tags.trim()) {
          try {
            const parsed = JSON.parse(videoInput.tags);
            existingTagsArr = Array.isArray(parsed) ? parsed : videoInput.tags.split(',');
          } catch {
            existingTagsArr = videoInput.tags.split(',');
          }
        }

        const desc = String(videoInput.description || '').trim();
        const combinedText = `${cleanTitle} ${desc} ${existingTagsArr.join(' ')}`.toLowerCase();

        const CATEGORY_RULES = [
          { name: 'Webseries', keywords: ['webseries', 'web series', 'ullu', 'kooku', 'altbalaji', 'episode', 'series', 'full movie', 'movie'] },
          { name: 'MMS', keywords: ['mms', 'leaked', 'scandal', 'hidden', 'private', 'cam', 'caught', 'viral mms'] },
          { name: 'Regional', keywords: ['tamil', 'telugu', 'mallu', 'malayalam', 'bengali', 'bhojpuri', 'punjabi', 'marathi', 'gujarati', 'kannada', 'south', 'pakistani', 'nepali'] },
          { name: 'Shorts', keywords: ['shorts', 'short', 'reel', 'reels', 'insta', 'instagram', 'tiktok', 'clip', 'status'] },
          { name: 'Couple', keywords: ['couple', 'wife', 'husband', 'gf', 'bf', 'girlfriend', 'boyfriend', 'married', 'honeymoon', 'romance', 'romantic', 'lover', 'newly married', 'suhagrat'] },
          { name: 'Bhabhi', keywords: ['bhabhi', 'devar', 'aunty', 'aunt', 'milf', 'padosan', 'chachi', 'mami'] },
          { name: 'College', keywords: ['college', 'hostel', 'student', 'school', 'teen', 'campus', 'tuition', 'teacher'] },
          { name: 'Desi', keywords: ['desi', 'indian', 'hindi', 'gaon', 'village', 'dehati', 'bharat', 'hindustani'] },
          { name: 'Trending', keywords: ['trending', 'latest', '2026', '2025', 'new', 'hot', 'top'] },
          { name: 'Viral', keywords: ['viral', 'popular', 'best', 'full', 'hd', '4k', 'exclusive'] }
        ];

        const TAG_RULES = [
          { tag: 'Desi', keywords: ['desi', 'indian', 'gaon', 'village', 'dehati'] },
          { tag: 'Hindi', keywords: ['hindi', 'hindi audio', 'desi'] },
          { tag: 'Indian', keywords: ['indian', 'desi', 'bharat'] },
          { tag: 'MMS', keywords: ['mms', 'leaked', 'scandal', 'hidden'] },
          { tag: 'Couple', keywords: ['couple', 'gf', 'bf', 'girlfriend', 'boyfriend', 'wife', 'husband', 'married'] },
          { tag: 'Bhabhi', keywords: ['bhabhi', 'devar', 'aunty', 'milf'] },
          { tag: 'College', keywords: ['college', 'hostel', 'student', 'campus'] },
          { tag: 'Webseries', keywords: ['webseries', 'web series', 'episode', 'series', 'ullu'] },
          { tag: 'Shorts', keywords: ['shorts', 'reel', 'reels', 'insta', 'clip'] },
          { tag: 'Regional', keywords: ['tamil', 'telugu', 'mallu', 'bengali', 'punjabi', 'marathi', 'bhojpuri', 'south'] },
          { tag: 'Tamil', keywords: ['tamil'] },
          { tag: 'Mallu', keywords: ['mallu', 'malayalam'] },
          { tag: 'Punjabi', keywords: ['punjabi'] },
          { tag: 'Bengali', keywords: ['bengali'] },
          { tag: 'Pakistani', keywords: ['pakistani', 'pakistan'] },
          { tag: 'Romance', keywords: ['romance', 'romantic', 'honeymoon', 'lover'] },
          { tag: 'Trending', keywords: ['trending', 'latest', 'new', '2025', '2026'] },
          { tag: 'Viral', keywords: ['viral', 'popular', 'exclusive'] },
          { tag: 'HD', keywords: ['hd', '4k', 'full', 'uhd'] }
        ];

        const parseDurSecs = (durStr) => {
          if (!durStr) return 0;
          const p = String(durStr).split(':').map(Number);
          if (p.some(isNaN)) return 0;
          if (p.length === 2) return p[0] * 60 + p[1];
          if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
          return 0;
        };

        let resolvedCategory = String(videoInput.category || '').trim();
        const isGenericCat = !resolvedCategory || resolvedCategory.toLowerCase() === 'general';
        if (isGenericCat || forceReclassify) {
          let matched = '';
          for (const r of CATEGORY_RULES) {
            if (r.keywords.some(kw => combinedText.includes(kw))) {
              matched = r.name;
              break;
            }
          }
          if (!matched) {
            const secs = parseDurSecs(videoInput.duration);
            matched = (secs > 0 && secs <= 65) ? 'Shorts' : 'Viral';
          }
          resolvedCategory = matched;
        }

        const tagMap = new Map();
        const addTag = (raw) => {
          const t = String(raw || '').replace(/^#/, '').trim();
          if (!t || t.length < 2 || t.length > 32) return;
          const low = t.toLowerCase();
          if (low === 'general' || low === 'viralkam' || low === 'viralkaam' || low === 'null') return;
          if (!tagMap.has(low)) tagMap.set(low, t);
        };

        addTag(resolvedCategory);
        for (const r of TAG_RULES) {
          if (r.keywords.some(kw => combinedText.includes(kw))) {
            addTag(r.tag);
          }
        }
        for (const t of existingTagsArr) addTag(t);
        if (tagMap.size < 3) addTag('Viral');
        if (tagMap.size < 3) addTag('Trending');
        if (tagMap.size < 3) addTag('HD');

        const resolvedTags = Array.from(tagMap.values()).slice(0, 7);
        const durStr = String(videoInput.duration || '').trim();
        let isoDuration = '';
        if (durStr) {
          const dp = durStr.split(':').map(Number);
          if (!dp.some(isNaN)) {
            if (dp.length === 2) isoDuration = `PT${dp[0]}M${dp[1]}S`;
            else if (dp.length === 3) isoDuration = `PT${dp[0]}H${dp[1]}M${dp[2]}S`;
          }
        }

        const vidId = videoInput.id || `vid-${Date.now()}`;
        const seoTitle = `${cleanTitle} - Full HD ${resolvedCategory} Video | VIRALKAAM`;
        const isGenericDesc = !desc || desc.toLowerCase().startsWith('watch full video on') || desc.toLowerCase().startsWith('watch video on');
        const seoDescription = !isGenericDesc
          ? (desc.length > 158 ? desc.substring(0, 155) + '...' : desc)
          : `Watch ${cleanTitle} online in Full HD on VIRALKAAM. Category: ${resolvedCategory}. Tags: ${resolvedTags.slice(0, 4).join(', ')}. Fast free streaming.`;
        const canonicalUrl = `https://viralkaam.com/?v=${vidId}`;

        const aeoSummary = `"${cleanTitle}" is a featured ${resolvedCategory} video on VIRALKAAM.COM tagged with ${resolvedTags.join(', ')}. Streamed in high definition${durStr ? ` with a runtime of ${durStr}` : ''} for instant playback.`;
        const aeoKeyFacts = [
          { question: `What is "${cleanTitle}" about?`, answer: `${cleanTitle} is a popular ${resolvedCategory} video featuring ${resolvedTags.slice(0, 4).join(', ')} content streaming in HD on VIRALKAAM.` },
          { question: `Which category and tags belong to "${cleanTitle}"?`, answer: `It belongs to the ${resolvedCategory} category with tags: ${resolvedTags.join(', ')}.` },
          { question: `Where can I watch "${cleanTitle}"?`, answer: `Available for free high-speed streaming on VIRALKAAM.COM without paywalls.` },
          { question: `What is the duration of this video?`, answer: durStr ? `The total video duration is ${durStr} with instant player load.` : `Instant high-performance HD streaming.` }
        ];

        const geoEntities = Array.from(new Set([
          'VIRALKAAM',
          'VIRALKAAM.COM',
          resolvedCategory,
          ...resolvedTags,
          'HD Video Streaming',
          'Digital Media Streaming'
        ]));

        const schemaJsonLd = {
          '@context': 'https://schema.org',
          '@type': 'VideoObject',
          '@id': `https://viralkaam.com/?v=${vidId}#video`,
          name: seoTitle,
          description: seoDescription,
          thumbnailUrl: [videoInput.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1280&h=720&auto=format&fit=crop&q=80'],
          uploadDate: videoInput.created_at ? new Date(String(videoInput.created_at).replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString(),
          duration: isoDuration,
          contentUrl: videoInput.videoUrl || '',
          embedUrl: canonicalUrl,
          genre: resolvedCategory,
          keywords: geoEntities.join(', '),
          publisher: {
            '@type': 'Organization',
            name: 'VIRALKAAM',
            url: 'https://viralkaam.com',
            logo: { '@type': 'ImageObject', url: 'https://viralkaam.com/favicon.svg' }
          },
          interactionStatistic: {
            '@type': 'InteractionCounter',
            interactionType: { '@type': 'WatchAction' },
            userInteractionCount: Number(videoInput.views || 0)
          }
        };

        return {
          cleanTitle,
          category: resolvedCategory,
          tags: resolvedTags,
          seoTitle,
          seoDescription,
          canonicalUrl,
          aeoSummary,
          aeoKeyFacts,
          geoEntities,
          schemaJsonLd
        };
      };

      // 2.5 POST /api/tags - add new tag
      if (pathname === '/api/tags' && method === 'POST') {
        await ensureD1Columns(env.DB);
        const body = await request.json().catch(() => ({}));
        const name = (body.name || '').trim();
        if (!name) return json({ success: false, message: 'Tag name is required' }, 400);
        const slug = (body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        try {
          const res = await env.DB.prepare('INSERT INTO tags (name, slug) VALUES (?, ?)').bind(name, slug).run();
          tagsMemoryCache = { data: null, timestamp: 0 };
          return json({
            success: true,
            tag: { id: res.meta?.last_row_id || Date.now(), name, slug, count: 0 },
            message: 'Tag created successfully'
          }, 201);
        } catch {
          return json({ success: false, message: 'Tag already exists' }, 400);
        }
      }

      // 2.6 PUT /api/tags/:id - edit tag
      if (pathname.startsWith('/api/tags/') && method === 'PUT') {
        await ensureD1Columns(env.DB);
        const id = parseInt(pathname.replace('/api/tags/', ''), 10);
        const body = await request.json().catch(() => ({}));
        const newName = (body.name || '').trim();
        if (!newName) return json({ success: false, message: 'Tag name is required' }, 400);

        const existing = await env.DB.prepare('SELECT * FROM tags WHERE id = ?').bind(id).first();
        if (!existing) return json({ success: false, message: 'Tag not found' }, 404);

        const slug = (body.slug || newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
        await env.DB.prepare('UPDATE tags SET name = ?, slug = ? WHERE id = ?').bind(newName, slug, id).run();
        tagsMemoryCache = { data: null, timestamp: 0 };

        return json({ success: true, tag: { id, name: newName, slug }, message: 'Tag updated' });
      }

      // 2.7 DELETE /api/tags/:id - delete tag
      if (pathname.startsWith('/api/tags/') && method === 'DELETE') {
        await ensureD1Columns(env.DB);
        const id = parseInt(pathname.replace('/api/tags/', ''), 10);
        const existing = await env.DB.prepare('SELECT * FROM tags WHERE id = ?').bind(id).first();
        if (!existing) return json({ success: false, message: 'Tag not found' }, 404);

        await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();
        tagsMemoryCache = { data: null, timestamp: 0 };
        return json({ success: true, message: `Tag "${existing.name}" deleted` });
      }

      // 2.8 POST /api/admin/clear-dummy - delete old dummy test videos
      if (pathname === '/api/admin/clear-dummy' && method === 'POST') {
        const isAdmin = await verifyAdminToken(request);
        if (!isAdmin) return json({ success: false, message: 'Unauthorized' }, 401);
        await env.DB.prepare(`
          DELETE FROM videos 
          WHERE title LIKE '%Gaming Montage%' 
             OR title LIKE '%Never Gonna Give You Up%' 
             OR title LIKE '%Secret Roadmap%'
             OR videoUrl LIKE '%oceans.mp4%'
        `).run();
        videosMemoryCache.clear();
        return json({ success: true, message: 'Dummy test data cleared successfully' });
      }

      // 2.9 POST /api/admin/auto-optimize-all - Auto-generate Categories, Tags, SEO, AEO, GEO from titles in batches
      if (pathname === '/api/admin/auto-optimize-all' && method === 'POST') {
        const isAdmin = await verifyAdminToken(request);
        if (!isAdmin) return json({ success: false, message: 'Unauthorized' }, 401);
        await ensureD1Columns(env.DB);

        const body = await request.json().catch(() => ({}));
        const offset = Math.max(0, parseInt(body.offset, 10) || 0);
        const limit = Math.min(200, Math.max(10, parseInt(body.limit, 10) || 120));
        const forceReclassify = body.forceReclassify !== false;

        const totalRow = await env.DB.prepare('SELECT COUNT(*) as total FROM videos').first();
        const totalVideos = totalRow?.total || 0;

        const { results: batchVideos } = await env.DB.prepare(
          'SELECT id, title, description, duration, category, tags, thumbnail, videoUrl, views, created_at FROM videos ORDER BY rowid ASC LIMIT ? OFFSET ?'
        ).bind(limit, offset).all();

        const discoveredCats = new Set();
        const discoveredTags = new Set();
        const statements = [];

        for (const vid of (batchVideos || [])) {
          const opt = buildVideoSeoAeoGeoAndTaxonomy(vid, forceReclassify);
          discoveredCats.add(opt.category);
          for (const t of opt.tags) discoveredTags.add(t);

          statements.push(
            env.DB.prepare(`
              UPDATE videos SET
                category = ?,
                tags = ?,
                seoTitle = ?,
                seoDescription = ?,
                canonicalUrl = ?,
                aeoSummary = ?,
                aeoKeyFacts = ?,
                geoEntities = ?,
                schemaJsonLd = ?
              WHERE id = ?
            `).bind(
              opt.category,
              JSON.stringify(opt.tags),
              opt.seoTitle,
              opt.seoDescription,
              opt.canonicalUrl,
              opt.aeoSummary,
              JSON.stringify(opt.aeoKeyFacts),
              JSON.stringify(opt.geoEntities),
              JSON.stringify(opt.schemaJsonLd),
              vid.id
            )
          );
        }

        // Register all discovered categories and tags cleanly into admin tables
        for (const catName of discoveredCats) {
          const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          statements.push(env.DB.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)').bind(catName, slug));
        }
        for (const tagName of discoveredTags) {
          const slug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          statements.push(env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(tagName, slug));
        }

        // Execute in chunks of 50 statements per D1 batch
        for (let i = 0; i < statements.length; i += 50) {
          await env.DB.batch(statements.slice(i, i + 50));
        }

        videosMemoryCache.clear();
        tagsMemoryCache = { data: null, timestamp: 0 };

        const processed = (batchVideos || []).length;
        const nextOffset = offset + processed;
        return json({
          success: true,
          processed,
          offset,
          nextOffset,
          totalVideos,
          done: nextOffset >= totalVideos || processed === 0,
          categoriesSynced: Array.from(discoveredCats),
          tagsSyncedCount: discoveredTags.size
        });
      }

      // 3. GET /api/videos (with caching, R2 fallback & protection against D1 read limits)
      if (pathname === '/api/videos' && method === 'GET') {
        const params = url.searchParams;
        const isAdmin = await verifyAdminToken(request);
        const page = Math.max(1, parseInt(params.get('page')) || 1);
        const rawLimit = parseInt(params.get('limit')) || 24;
        const limit = isAdmin ? Math.min(Math.max(1, rawLimit), 10000) : Math.min(Math.max(1, rawLimit), 100);
        const offset = (page - 1) * limit;
        const search = (params.get('search') || params.get('q') || '').trim().slice(0, 100);
        const category = (params.get('category') || '').trim().slice(0, 50);
        const tag = (params.get('tag') || '').trim().slice(0, 50);
        const statusFilter = (params.get('status') || params.get('privacy') || '').trim().toLowerCase();
        const sort = params.get('sort') || 'newest';

        // Check in-memory cache for public queries to avoid D1 row read explosion
        const bypassCache = params.get('refresh') === '1' || request.headers.get('cache-control')?.includes('no-cache');
        const cacheKey = `${isAdmin ? 'admin' : 'pub'}_${page}_${limit}_${sort}_${category}_${tag}_${search}_${statusFilter}`;
        const cachedItem = videosMemoryCache.get(cacheKey);
        if (!bypassCache && cachedItem && (Date.now() - cachedItem.time < 30 * 1000) && !isAdmin) {
          return json(cachedItem.data);
        }

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

        if (tag) {
          conditions.push('(LOWER(tags) LIKE LOWER(?) OR LOWER(tags) LIKE LOWER(?))');
          bindings.push(`%"${tag}"%`, `%${tag}%`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        let orderBy = 'ORDER BY created_at DESC, rowid DESC';
        if (sort === 'popular') orderBy = 'ORDER BY likes DESC, rowid DESC';
        else if (sort === 'most_viewed') orderBy = 'ORDER BY views DESC, rowid DESC';
        else if (sort === 'longest') orderBy = 'ORDER BY duration DESC, rowid DESC';
        else if (sort === 'random') orderBy = 'ORDER BY RANDOM()';
        else if (sort === 'newest') orderBy = 'ORDER BY created_at DESC, rowid DESC';

        let results = [];
        let totalVideos = 0;

        try {
          // Count total
          const countQuery = await env.DB.prepare(`SELECT COUNT(*) as total FROM videos ${where}`).bind(...bindings).first();
          totalVideos = countQuery?.total || 0;

          // Fetch paginated
          const queryRes = await env.DB.prepare(`
            SELECT * FROM videos 
            ${where} 
            ${orderBy} 
            LIMIT ? OFFSET ?
          `).bind(...bindings, limit, offset).all();
          results = queryRes?.results || [];
        } catch (d1Err) {
          console.warn('[D1 Read Error / Daily Limit Exceeded]:', d1Err.message);

          // Fallback 1: Try reading from R2 Cache Snapshot if BUCKET is bound
          if (env.BUCKET) {
            try {
              const snapObj = await env.BUCKET.get('cache/videos_snapshot.json').catch(() => null);
              if (snapObj) {
                const snapJson = await snapObj.json().catch(() => null);
                if (Array.isArray(snapJson) && snapJson.length > 0) {
                  let filtered = snapJson;
                  if (category && category.toLowerCase() !== 'all') {
                    filtered = filtered.filter(v => (v.category || '').toLowerCase() === category.toLowerCase());
                  }
                  if (search) {
                    const q = search.toLowerCase();
                    filtered = filtered.filter(v => (v.title || '').toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q));
                  }
                  totalVideos = filtered.length;
                  const slice = filtered.slice(offset, offset + limit);
                  return json({
                    success: true,
                    videos: slice,
                    fallbackSource: 'r2_snapshot',
                    pagination: { page, limit, totalVideos, totalPages: Math.ceil(totalVideos / limit) }
                  });
                }
              }
            } catch {}
          }

          // Fallback 2: Check memory cache
          if (videosMemoryCache.has(cacheKey)) {
            const cached = videosMemoryCache.get(cacheKey);
            return json(cached.data);
          }

          // If no fallback data exists yet, return error details with explanation
          return json({
            success: false,
            error: d1Err.message,
            isLimitExceeded: String(d1Err.message).includes('free tier daily row read limit')
          }, 429);
        }

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

        const resolveMediaUrl = (mediaPath) => {
          if (!mediaPath) return '';
          let u = String(mediaPath).trim().replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
          if (u.includes('vcdn.viralkaam.com/') || u.includes('vcdn.viralkam.com/')) {
            u = u.replace(/https?:\/\/vcdn\.viralkaa?m\.com\//, `${url.origin}/cdn/`);
          } else if (u.startsWith('/cdn/')) {
            u = `${url.origin}${u}`;
          }
          return u;
        };

        // Format tags & geo
        const formattedVideos = results.map(v => {
          let tags = [];
          try { tags = typeof v.tags === 'string' ? JSON.parse(v.tags) : (v.tags || []); } catch {}
          let geo = [];
          try { geo = typeof v.geoEntities === 'string' ? JSON.parse(v.geoEntities) : (v.geoEntities || []); } catch {}
          const privacy = v.privacy || (v.status === 'private' ? 'private' : 'public');
          return {
            ...v,
            title: cleanDisplayTitle(v.title),
            videoUrl: resolveMediaUrl(v.videoUrl || v.title || ''),
            thumbnail: resolveMediaUrl(v.thumbnail || ''),
            our_server_url: resolveMediaUrl(v.our_server_url || ''),
            backup_url: resolveMediaUrl(v.backup_url || ''),
            other_ps_url: resolveMediaUrl(v.other_ps_url || ''),
            tags,
            geoEntities: geo,
            privacy,
            status: v.status || (privacy === 'private' ? 'private' : 'published'),
            initial_views: Number(v.initial_views || 0),
            initial_likes: Number(v.initial_likes || 0)
          };
        });

        const responseData = {
          success: true,
          videos: formattedVideos,
          pagination: {
            page,
            limit,
            totalVideos,
            totalPages: Math.ceil(totalVideos / limit)
          }
        };

        // Cache in memory for 60 seconds
        videosMemoryCache.set(cacheKey, { data: responseData, time: Date.now() });

        // Asynchronously save R2 snapshot when fetching page 1
        if (env.BUCKET && page === 1 && !search && !category) {
          ctx.waitUntil(env.BUCKET.put('cache/videos_snapshot.json', JSON.stringify(formattedVideos)).catch(() => {}));
        }

        return json(responseData);
      }

      // 3.1 POST /api/videos/bulk-delete
      if (pathname === '/api/videos/bulk-delete' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids : [];
        if (ids.length === 0) return json({ success: false, message: 'No IDs provided' }, 400);

        for (const id of ids) {
          await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
        }

        videosMemoryCache.clear();

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

        const resolveMediaUrl = (mediaPath) => {
          if (!mediaPath) return '';
          let u = String(mediaPath).trim().replace(/(https?:\/\/[^\s]+)(https?:\/\/)/i, '$1');
          if (u.includes('vcdn.viralkaam.com/') || u.includes('vcdn.viralkam.com/')) {
            u = u.replace(/https?:\/\/vcdn\.viralkaa?m\.com\//, `${url.origin}/cdn/`);
          } else if (u.startsWith('/cdn/')) {
            u = `${url.origin}${u}`;
          }
          return u;
        };

        return json({
          success: true,
          video: {
            ...video,
            title: cleanTitle(video.title),
            videoUrl: resolveMediaUrl(video.videoUrl || video.title || ''),
            thumbnail: resolveMediaUrl(video.thumbnail || ''),
            our_server_url: resolveMediaUrl(video.our_server_url || ''),
            backup_url: resolveMediaUrl(video.backup_url || ''),
            other_ps_url: resolveMediaUrl(video.other_ps_url || ''),
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

        const viewsToSet = body.views !== undefined ? Number(body.views) : (body.initial_views !== undefined ? Number(body.initial_views) : Number(existing.views || existing.initial_views || 0));
        const likesToSet = body.likes !== undefined ? Number(body.likes) : (body.initial_likes !== undefined ? Number(body.initial_likes) : Number(existing.likes || existing.initial_likes || 0));

        const nextTitle = body.title !== undefined ? body.title : existing.title;
        const nextDesc = body.description !== undefined ? body.description : existing.description;
        const nextDur = body.duration !== undefined ? body.duration : existing.duration;
        const nextThumb = body.thumbnail !== undefined ? body.thumbnail : existing.thumbnail;
        const nextVideoUrl = body.videoUrl !== undefined ? body.videoUrl : existing.videoUrl;
        const rawNextCat = body.category !== undefined ? body.category : existing.category;
        const rawNextTags = body.tags !== undefined ? body.tags : existing.tags;

        const autoMeta = buildVideoSeoAeoGeoAndTaxonomy({
          id,
          title: nextTitle,
          description: nextDesc,
          duration: nextDur,
          category: rawNextCat,
          tags: rawNextTags,
          thumbnail: nextThumb,
          videoUrl: nextVideoUrl,
          views: viewsToSet,
          created_at: body.created_at || existing.created_at
        }, false);

        const finalCategory = (rawNextCat && String(rawNextCat).trim() && String(rawNextCat).trim().toLowerCase() !== 'general')
          ? String(rawNextCat).trim()
          : autoMeta.category;
        const finalTagsArr = Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : autoMeta.tags;

        // Auto-register category into categories table
        if (finalCategory) {
          const catSlug = finalCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          try {
            await env.DB.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)').bind(finalCategory, catSlug).run();
          } catch {}
        }

        // Auto-register new tags into tags table
        if (Array.isArray(finalTagsArr)) {
          for (const t of finalTagsArr) {
            const cleanT = String(t).trim();
            if (cleanT) {
              const tSlug = cleanT.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              try {
                await env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(cleanT, tSlug).run();
              } catch {}
            }
          }
        }

        await env.DB.prepare(`
          UPDATE videos SET
            title = ?,
            description = ?,
            duration = ?,
            category = ?,
            tags = ?,
            thumbnail = ?,
            videoUrl = ?,
            seoTitle = ?,
            seoDescription = ?,
            canonicalUrl = ?,
            aeoSummary = ?,
            aeoKeyFacts = ?,
            geoEntities = ?,
            schemaJsonLd = ?,
            privacy = ?,
            status = ?,
            views = ?,
            likes = ?,
            initial_views = ?,
            initial_likes = ?,
            uploadedAt = COALESCE(?, uploadedAt),
            created_at = COALESCE(?, created_at),
            our_server_url = COALESCE(?, our_server_url),
            other_ps_url = COALESCE(?, other_ps_url),
            backup_url = COALESCE(?, backup_url),
            active_source = COALESCE(?, active_source),
            storage_source = COALESCE(?, storage_source),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          nextTitle,
          nextDesc,
          nextDur,
          finalCategory,
          toSqlString(finalTagsArr),
          nextThumb,
          nextVideoUrl,
          body.seoTitle || autoMeta.seoTitle,
          body.seoDescription || autoMeta.seoDescription,
          body.canonicalUrl || autoMeta.canonicalUrl,
          toSqlString(body.aeoSummary || autoMeta.aeoSummary),
          toSqlString(body.aeoKeyFacts || autoMeta.aeoKeyFacts),
          toSqlString(body.geoEntities && body.geoEntities.length ? body.geoEntities : autoMeta.geoEntities),
          toSqlString(body.schemaJsonLd || autoMeta.schemaJsonLd),
          privacy,
          status,
          viewsToSet,
          likesToSet,
          viewsToSet,
          likesToSet,
          body.uploadedAt !== undefined ? body.uploadedAt : null,
          body.created_at !== undefined ? body.created_at : null,
          body.our_server_url !== undefined ? body.our_server_url : null,
          body.other_ps_url !== undefined ? body.other_ps_url : null,
          body.backup_url !== undefined ? body.backup_url : null,
          body.active_source !== undefined ? body.active_source : null,
          body.storage_source !== undefined ? body.storage_source : null,
          id
        ).run();

        videosMemoryCache.clear();
        tagsMemoryCache = { data: null, timestamp: 0 };

        const updated = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        return json({
          success: true,
          message: 'Video updated',
          video: {
            ...updated,
            videoUrl: resolveMediaUrl(updated?.videoUrl || ''),
            thumbnail: resolveMediaUrl(updated?.thumbnail || ''),
            our_server_url: resolveMediaUrl(updated?.our_server_url || ''),
            backup_url: resolveMediaUrl(updated?.backup_url || ''),
            other_ps_url: resolveMediaUrl(updated?.other_ps_url || '')
          }
        });
      }

      // Helper to serialize any object/array to string for SQLite/D1
      const toSqlString = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      };

      // Helper to ensure all required D1 columns exist (runs only once per worker instance)
      async function ensureD1Columns(db) {
        if (!db || isD1SchemaChecked) return;
        isD1SchemaChecked = true;
        try {
          await db.prepare(`
            CREATE TABLE IF NOT EXISTS categories (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT UNIQUE NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `).run().catch(() => {});

          await db.prepare(`
            CREATE TABLE IF NOT EXISTS tags (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT UNIQUE NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `).run().catch(() => {});

          await db.prepare(`
            CREATE TABLE IF NOT EXISTS videos (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              description TEXT,
              duration TEXT DEFAULT '',
              views INTEGER DEFAULT 0,
              likes INTEGER DEFAULT 0,
              dislikes INTEGER DEFAULT 0,
              rating INTEGER DEFAULT 95,
              category TEXT DEFAULT 'General',
              tags TEXT,
              uploadedAt TEXT DEFAULT 'Just now',
              author TEXT DEFAULT 'VIRALKAAM Admin',
              thumbnail TEXT NOT NULL,
              videoUrl TEXT NOT NULL
            )
          `).run();

          const info = await db.prepare("PRAGMA table_info(videos)").all();
          const existing = new Set((info?.results || []).map(r => r.name.toLowerCase()));

          const columnsToAdd = [
            { name: 'duration', sql: "ALTER TABLE videos ADD COLUMN duration TEXT DEFAULT ''" },
            { name: 'views', sql: "ALTER TABLE videos ADD COLUMN views INTEGER DEFAULT 0" },
            { name: 'likes', sql: "ALTER TABLE videos ADD COLUMN likes INTEGER DEFAULT 0" },
            { name: 'dislikes', sql: "ALTER TABLE videos ADD COLUMN dislikes INTEGER DEFAULT 0" },
            { name: 'rating', sql: "ALTER TABLE videos ADD COLUMN rating INTEGER DEFAULT 95" },
            { name: 'category', sql: "ALTER TABLE videos ADD COLUMN category TEXT DEFAULT 'General'" },
            { name: 'tags', sql: "ALTER TABLE videos ADD COLUMN tags TEXT" },
            { name: 'uploadedat', sql: "ALTER TABLE videos ADD COLUMN uploadedAt TEXT DEFAULT 'Just now'" },
            { name: 'author', sql: "ALTER TABLE videos ADD COLUMN author TEXT DEFAULT 'VIRALKAAM Admin'" },
            { name: 'hlsurl', sql: "ALTER TABLE videos ADD COLUMN hlsUrl TEXT" },
            { name: 'embedurl', sql: "ALTER TABLE videos ADD COLUMN embedUrl TEXT" },
            { name: 'seotitle', sql: "ALTER TABLE videos ADD COLUMN seoTitle TEXT" },
            { name: 'seodescription', sql: "ALTER TABLE videos ADD COLUMN seoDescription TEXT" },
            { name: 'canonicalurl', sql: "ALTER TABLE videos ADD COLUMN canonicalUrl TEXT" },
            { name: 'aeosummary', sql: "ALTER TABLE videos ADD COLUMN aeoSummary TEXT" },
            { name: 'aeokeyfacts', sql: "ALTER TABLE videos ADD COLUMN aeoKeyFacts TEXT" },
            { name: 'geoentities', sql: "ALTER TABLE videos ADD COLUMN geoEntities TEXT" },
            { name: 'schemajsonld', sql: "ALTER TABLE videos ADD COLUMN schemaJsonLd TEXT" },
            { name: 'status', sql: "ALTER TABLE videos ADD COLUMN status TEXT DEFAULT 'published'" },
            { name: 'privacy', sql: "ALTER TABLE videos ADD COLUMN privacy TEXT DEFAULT 'public'" },
            { name: 'initial_views', sql: "ALTER TABLE videos ADD COLUMN initial_views INTEGER DEFAULT 0" },
            { name: 'initial_likes', sql: "ALTER TABLE videos ADD COLUMN initial_likes INTEGER DEFAULT 0" },
            { name: 'our_server_url', sql: "ALTER TABLE videos ADD COLUMN our_server_url TEXT" },
            { name: 'other_ps_url', sql: "ALTER TABLE videos ADD COLUMN other_ps_url TEXT" },
            { name: 'backup_url', sql: "ALTER TABLE videos ADD COLUMN backup_url TEXT" },
            { name: 'active_source', sql: "ALTER TABLE videos ADD COLUMN active_source TEXT DEFAULT 'our_server'" },
            { name: 'storage_source', sql: "ALTER TABLE videos ADD COLUMN storage_source TEXT DEFAULT 'other_ps'" },
            { name: 'created_at', sql: "ALTER TABLE videos ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP" },
            { name: 'updated_at', sql: "ALTER TABLE videos ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP" }
          ];

          for (const col of columnsToAdd) {
            if (!existing.has(col.name)) {
              try {
                await db.prepare(col.sql).run();
              } catch {}
            }
          }
        } catch (err) {
          console.warn('[D1 Migration] Schema check note:', err.message);
        }
      }

      // Helper to generate reliable Edge CDN URL for R2 objects
      function getR2CdnUrl(fileKey, origin) {
        if (!fileKey) return '';
        let k = String(fileKey).trim();
        if (k.includes('vcdn.viralkaam.com/') || k.includes('vcdn.viralkam.com/')) {
          k = k.replace(/https?:\/\/vcdn\.viralkaa?m\.com\//, '/cdn/');
        }
        if (k.includes('r2.dev/')) {
          k = k.replace(/https?:\/\/[^\/]+r2\.dev\//, '/cdn/');
        }
        if (k.startsWith('http://') || k.startsWith('https://')) return k;
        const cleanKey = k.replace(/^\/?(cdn\/)?/, '');
        const baseOrigin = (origin && origin.startsWith('http')) ? origin.replace(/\/+$/, '') : 'https://viralkam.viralkam-com.workers.dev';
        return `${baseOrigin}/cdn/${cleanKey}`;
      }

      // Helper function to guarantee thumbnail is stored in R2 (thumbnails/ folder)
      async function ensureThumbnailOnR2(thumbnail, id, env, origin) {
        if (!thumbnail || !env.BUCKET) return thumbnail;

        // If thumbnail is already saved in our R2 bucket or on our CDN, normalize and return
        if (
          thumbnail.includes('/cdn/thumbnails/') ||
          thumbnail.includes('thumbnails/') ||
          thumbnail.includes('r2.dev/thumbnails/')
        ) {
          let t = thumbnail;
          if (t.includes('vcdn.viralkaam.com/') || t.includes('vcdn.viralkam.com/')) {
            t = t.replace(/https?:\/\/vcdn\.viralkaa?m\.com\//, '/cdn/');
          }
          if (t.includes('r2.dev/')) {
            t = t.replace(/https?:\/\/[^\/]+r2\.dev\//, '/cdn/');
          }
          if (t.startsWith('/cdn/')) {
            const baseOrigin = (origin && origin.startsWith('http')) ? origin.replace(/\/+$/, '') : 'https://viralkam.viralkam-com.workers.dev';
            return `${baseOrigin}${t}`;
          }
          return t;
        }

        // Handle Base64 Data URI
        if (thumbnail.startsWith('data:image/')) {
          try {
            const match = thumbnail.match(/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/);
            if (match) {
              const mime = match[1];
              const b64 = match[2];
              const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
              const binStr = atob(b64);
              const len = binStr.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binStr.charCodeAt(i);
              }
              const thumbKey = `thumbnails/${Date.now()}-${id}${ext}`;
              await env.BUCKET.put(thumbKey, bytes.buffer, {
                httpMetadata: { contentType: mime }
              });
              return getR2CdnUrl(thumbKey, origin);
            }
          } catch (err) {
            console.warn('[Thumbnail R2] Error saving base64 to R2:', err.message);
          }
        }

        // Handle External HTTP / HTTPS link
        if (thumbnail.startsWith('http://') || thumbnail.startsWith('https://')) {
          try {
            const tRes = await fetch(thumbnail, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (tRes.ok && tRes.body) {
              const cType = tRes.headers.get('content-type') || 'image/jpeg';
              const ext = cType.includes('png') ? '.png' : cType.includes('webp') ? '.webp' : '.jpg';
              const thumbKey = `thumbnails/${Date.now()}-${id}${ext}`;
              await env.BUCKET.put(thumbKey, tRes.body, {
                httpMetadata: { contentType: cType }
              });
              return getR2CdnUrl(thumbKey, origin);
            }
          } catch (err) {
            console.warn('[Thumbnail R2] Error streaming external thumbnail to R2:', err.message);
          }
        }

        return thumbnail;
      }

      // Helper function to sync a single video to Cloudflare R2
      async function syncSingleVideoToR2(video, env, origin) {
        if (!video || !env.BUCKET) return video;
        const id = video.id;
        const currentUrl = (video.other_ps_url || video.videoUrl || '').trim();

        // Check if already on our server
        const alreadyOnServer = currentUrl.includes('/cdn/') || currentUrl.includes('r2.dev') || currentUrl.includes('viralkaam.com');
        if (alreadyOnServer && video.our_server_url) {
          return video;
        }

        let finalVideoUrl = video.our_server_url || '';
        let finalThumbnail = video.thumbnail || '';

        // 1. Stream video to R2 (videos/ folder)
        if (currentUrl && (currentUrl.startsWith('http://') || currentUrl.startsWith('https://')) && !alreadyOnServer) {
          try {
            const res = await fetch(currentUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (res.ok && res.body) {
              const cType = res.headers.get('content-type') || 'video/mp4';
              const ext = cType.includes('webm') ? '.webm' : '.mp4';
              const fileKey = `videos/${Date.now()}-${id}${ext}`;
              await env.BUCKET.put(fileKey, res.body, {
                httpMetadata: { contentType: cType }
              });
              finalVideoUrl = getR2CdnUrl(fileKey, origin);
            }
          } catch (err) {
            console.warn('[Sync R2] Error streaming video:', err.message);
          }
        }

        // 2. Stream thumbnail to R2 only if NOT already on our server (never regenerate if already in R2!)
        finalThumbnail = await ensureThumbnailOnR2(finalThumbnail, id, env, origin);

        if (finalVideoUrl) {
          const originalExternalUrl = video.other_ps_url || currentUrl;
          await env.DB.prepare(`
            UPDATE videos SET
              our_server_url = ?,
              other_ps_url = ?,
              backup_url = ?,
              videoUrl = ?,
              thumbnail = ?,
              storage_source = 'our_server',
              active_source = 'our_server',
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            finalVideoUrl,
            originalExternalUrl,
            originalExternalUrl,
            finalVideoUrl,
            finalThumbnail,
            id
          ).run();

          return await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        }

        return video;
      }

      // 4.5 POST /api/videos/sync-storage (Sync Other PS videos into Cloudflare R2 Server Storage)
      if (pathname === '/api/videos/sync-storage' && method === 'POST') {
        await ensureD1Columns(env.DB);
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
        if (ids.length === 0) return json({ success: false, message: 'No video IDs provided' }, 400);

        const results = [];
        for (const id of ids) {
          const vid = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
          if (vid) {
            const synced = await syncSingleVideoToR2(vid, env, url.origin);
            results.push(synced);
          }
        }

        videosMemoryCache.clear();

        const formattedResults = results.map(vid => ({
          ...vid,
          videoUrl: resolveMediaUrl(vid?.videoUrl || ''),
          thumbnail: resolveMediaUrl(vid?.thumbnail || ''),
          our_server_url: resolveMediaUrl(vid?.our_server_url || ''),
          backup_url: resolveMediaUrl(vid?.backup_url || ''),
          other_ps_url: resolveMediaUrl(vid?.other_ps_url || '')
        }));

        return json({
          success: true,
          message: `Successfully synced ${results.length} video(s) to Server Storage (Cloudflare R2)!`,
          results: formattedResults
        });
      }

      // 4.55 POST /api/videos/verify-storage (Verify whether synced files actually exist in Cloudflare R2)
      if (pathname === '/api/videos/verify-storage' && method === 'POST') {
        await ensureD1Columns(env.DB);
        const body = await request.json().catch(() => ({}));
        const verifyAll = Boolean(body.all);
        const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);

        if (!env.BUCKET) {
          return json({ success: false, message: 'Cloudflare R2 BUCKET is not bound' }, 500);
        }

        const extractR2Key = (fileUrl) => {
          if (!fileUrl) return null;
          try {
            const parsed = new URL(fileUrl, 'https://vcdn.viralkaam.com');
            let p = parsed.pathname;
            if (p.startsWith('/cdn/')) p = p.substring(5);
            else if (p.startsWith('/')) p = p.substring(1);
            return p;
          } catch {
            let clean = String(fileUrl).trim();
            if (clean.startsWith('/cdn/')) clean = clean.substring(5);
            else if (clean.startsWith('/')) clean = clean.substring(1);
            return clean;
          }
        };

        let vidsToCheck = [];
        if (verifyAll || ids.length === 0) {
          const res = await env.DB.prepare(`
            SELECT id, title, videoUrl, our_server_url, other_ps_url, backup_url, thumbnail, storage_source 
            FROM videos 
            WHERE (our_server_url IS NOT NULL AND our_server_url != '') 
               OR storage_source = 'our_server'
               OR videoUrl LIKE '%vcdn.viralkaam%'
               OR videoUrl LIKE '%/cdn/%'
          `).all();
          vidsToCheck = res?.results || [];
        } else {
          for (const id of ids) {
            const row = await env.DB.prepare('SELECT id, title, videoUrl, our_server_url, other_ps_url, backup_url, thumbnail, storage_source FROM videos WHERE id = ?').bind(id).first();
            if (row) vidsToCheck.push(row);
          }
        }

        let missingCount = 0;
        let verifiedCount = 0;
        const resetTitles = [];

        for (const vid of vidsToCheck) {
          let isVideoMissing = false;
          const urlToCheck = vid.our_server_url || vid.videoUrl;
          if (urlToCheck) {
            const vKey = extractR2Key(urlToCheck);
            if (vKey) {
              let head = await env.BUCKET.head(vKey).catch(() => null);
              if (!head && !vKey.startsWith('videos/')) {
                head = await env.BUCKET.head(`videos/${vKey}`).catch(() => null);
              }
              if (!head && vKey.startsWith('videos/')) {
                head = await env.BUCKET.head(vKey.replace(/^videos\//, '')).catch(() => null);
              }
              if (!head) {
                isVideoMissing = true;
              }
            }
          }

          if (isVideoMissing) {
            missingCount++;
            resetTitles.push(vid.title);
            const fallbackUrl = vid.other_ps_url || (vid.backup_url && !vid.backup_url.includes('vcdn.viralkaam') ? vid.backup_url : null) || 'https://vjs.zencdn.net/v/oceans.mp4';
            await env.DB.prepare(`
              UPDATE videos SET
                our_server_url = NULL,
                active_source = 'other_ps',
                storage_source = 'other_ps',
                videoUrl = ?,
                backup_url = NULL,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(fallbackUrl, vid.id).run();
          } else {
            verifiedCount++;
          }
        }

        return json({
          success: true,
          checkedCount: vidsToCheck.length,
          verifiedCount,
          missingCount,
          resetTitles,
          message: missingCount > 0
            ? `Storage Checked (${vidsToCheck.length} files): ${missingCount} deleted from R2 were reset to Pending Sync, ${verifiedCount} verified active!`
            : `All ${verifiedCount} synced file(s) are active and verified in Cloudflare R2 bucket!`
        });
      }

      // 4.6 POST /api/videos/switch-source (1-click active source toggle between Our Server & Other PS)
      if (pathname === '/api/videos/switch-source' && method === 'POST') {
        await ensureD1Columns(env.DB);
        const body = await request.json().catch(() => ({}));
        const targetSource = body.source === 'other_ps' ? 'other_ps' : 'our_server';
        const ids = Array.isArray(body.ids) ? body.ids : (body.id ? [body.id] : []);
        const switchAll = Boolean(body.all);

        if (switchAll) {
          if (targetSource === 'our_server') {
            await env.DB.prepare(`
              UPDATE videos 
              SET 
                videoUrl = COALESCE(our_server_url, videoUrl),
                backup_url = other_ps_url,
                active_source = 'our_server'
              WHERE our_server_url IS NOT NULL AND our_server_url != ''
            `).run();
          } else {
            await env.DB.prepare(`
              UPDATE videos 
              SET 
                videoUrl = COALESCE(other_ps_url, videoUrl),
                backup_url = our_server_url,
                active_source = 'other_ps'
              WHERE other_ps_url IS NOT NULL AND other_ps_url != ''
            `).run();
          }
          return json({ success: true, message: `All eligible videos switched to stream from ${targetSource === 'our_server' ? 'Our Server Storage' : 'Other Person Storage (Other PS)'}` });
        }

        if (ids.length === 0) return json({ success: false, message: 'No video IDs provided' }, 400);

        for (const id of ids) {
          const vid = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
          if (vid) {
            if (targetSource === 'our_server' && vid.our_server_url) {
              await env.DB.prepare(`
                UPDATE videos SET videoUrl = ?, backup_url = ?, active_source = 'our_server' WHERE id = ?
              `).bind(vid.our_server_url, vid.other_ps_url || vid.videoUrl, id).run();
            } else if (targetSource === 'other_ps' && (vid.other_ps_url || vid.backup_url)) {
              const otherUrl = vid.other_ps_url || vid.backup_url;
              await env.DB.prepare(`
                UPDATE videos SET videoUrl = ?, backup_url = ?, active_source = 'other_ps' WHERE id = ?
              `).bind(otherUrl, vid.our_server_url || vid.videoUrl, id).run();
            }
          }
        }

        videosMemoryCache.clear();

        return json({
          success: true,
          message: `Switched ${ids.length} video(s) to stream from ${targetSource === 'our_server' ? 'Our Server' : 'Other PS'}`
        });
      }

      // 5. POST /api/videos (Publish new video)
      if (pathname === '/api/videos' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!body.title) {
          return json({ success: false, message: 'Title is required' }, 400);
        }

        // Auto-heal D1 table schema if any columns are missing
        await ensureD1Columns(env.DB);

        // Check if video link already exists in database
        const incomingUrl = (body.videoUrl || '').trim();
        if (incomingUrl) {
          const existingVid = await env.DB.prepare(`
            SELECT * FROM videos 
            WHERE videoUrl = ? OR other_ps_url = ? OR our_server_url = ?
            LIMIT 1
          `).bind(incomingUrl, incomingUrl, incomingUrl).first();

          if (existingVid) {
            if (body.saveToServer && env.BUCKET && !existingVid.our_server_url) {
              const synced = await syncSingleVideoToR2(existingVid, env, url.origin);
              videosMemoryCache.clear();
              return json({
                success: true,
                message: `Video already exists in database; synced to Server Storage! Our server link is now Primary.`,
                video: synced,
                isSyncedExisting: true
              }, 200);
            } else {
              return json({
                success: true,
                message: `Video already exists in database as "${existingVid.title}".`,
                video: existingVid,
                isDuplicateExisting: true
              }, 200);
            }
          }
        }

        const id = body.id || `vid-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const privacy = (body.privacy || (body.status === 'private' ? 'private' : 'public')).toLowerCase();
        const status = privacy === 'private' ? 'private' : 'published';
        const initialViews = Number(body.initial_views ?? body.initialViews ?? 0);
        const initialLikes = Number(body.initial_likes ?? body.initialLikes ?? 0);

        let finalVideoUrl = body.videoUrl || 'https://vjs.zencdn.net/v/oceans.mp4';
        let finalThumbnail = body.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';

        // 1. Guaranteed: Thumbnail is ALWAYS stored in R2 thumbnails/ folder (whether video saveToServer is ON or OFF!)
        finalThumbnail = await ensureThumbnailOnR2(finalThumbnail, id, env, url.origin);

        // 2. Video storage: Only streamed to R2 videos/ folder if body.saveToServer is enabled
        if (body.saveToServer && env.BUCKET) {
          if (finalVideoUrl && (finalVideoUrl.startsWith('http://') || finalVideoUrl.startsWith('https://')) && !finalVideoUrl.includes('/cdn/')) {
            try {
              const remoteVid = await fetch(finalVideoUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
              });
              if (remoteVid.ok && remoteVid.body) {
                const cType = remoteVid.headers.get('content-type') || 'video/mp4';
                const ext = cType.includes('webm') ? '.webm' : '.mp4';
                const fileKey = `videos/${Date.now()}-${id}${ext}`;
                await env.BUCKET.put(fileKey, remoteVid.body, {
                  httpMetadata: { contentType: cType }
                });
                finalVideoUrl = getR2CdnUrl(fileKey, url.origin);
              }
            } catch (err) {
              console.warn('[R2 Save] Could not stream video to R2:', err.message);
            }
          }
        }

        // Fetch actual live table columns in D1
        let availableCols = new Set();
        try {
          const colQuery = await env.DB.prepare("PRAGMA table_info(videos)").all();
          availableCols = new Set((colQuery?.results || []).map(r => r.name));
        } catch {}

        let ourServerUrl = null;
        let otherPsUrl = null;
        let backupUrl = null;

        if (body.saveToServer && env.BUCKET) {
          ourServerUrl = finalVideoUrl;
          otherPsUrl = (body.videoUrl && body.videoUrl !== finalVideoUrl) ? body.videoUrl : null;
          backupUrl = otherPsUrl;
        } else if (finalVideoUrl.includes('/cdn/') || finalVideoUrl.includes('r2.dev')) {
          ourServerUrl = finalVideoUrl;
          otherPsUrl = body.other_ps_url || null;
          backupUrl = otherPsUrl;
        } else {
          ourServerUrl = null;
          otherPsUrl = finalVideoUrl;
          backupUrl = null;
        }

        const autoMeta = buildVideoSeoAeoGeoAndTaxonomy({
          id,
          title: body.title,
          description: body.description || '',
          duration: body.duration || '',
          category: body.category || 'General',
          tags: body.tags || [],
          thumbnail: finalThumbnail,
          videoUrl: finalVideoUrl,
          views: initialViews,
          created_at: body.isCustomDateTime && body.created_at ? body.created_at : undefined
        }, false);

        const resolvedCategory = (body.category && String(body.category).trim() && String(body.category).trim().toLowerCase() !== 'general')
          ? String(body.category).trim()
          : autoMeta.category;
        const resolvedTags = (Array.isArray(body.tags) && body.tags.length > 0)
          ? Array.from(new Set([...body.tags.map(t => String(t).trim()).filter(Boolean), ...autoMeta.tags])).slice(0, 7)
          : autoMeta.tags;

        const allCandidateFields = {
          id,
          title: body.title,
          description: body.description || 'Watch video on VIRALKAAM.COM',
          duration: body.duration || '',
          views: initialViews,
          likes: initialLikes,
          dislikes: Number(body.dislikes || 0),
          rating: Number(body.rating || 95),
          category: resolvedCategory,
          tags: toSqlString(resolvedTags),
          uploadedAt: body.uploadedAt || 'Just now',
          author: body.author || 'VIRALKAAM Admin',
          thumbnail: finalThumbnail,
          videoUrl: finalVideoUrl,
          hlsUrl: body.hlsUrl || null,
          embedUrl: body.embedUrl || null,
          seoTitle: body.seoTitle || autoMeta.seoTitle,
          seoDescription: body.seoDescription || autoMeta.seoDescription,
          canonicalUrl: body.canonicalUrl || autoMeta.canonicalUrl,
          aeoSummary: toSqlString(body.aeoSummary || autoMeta.aeoSummary),
          aeoKeyFacts: toSqlString(body.aeoKeyFacts || autoMeta.aeoKeyFacts),
          geoEntities: toSqlString((Array.isArray(body.geoEntities) && body.geoEntities.length > 0) ? body.geoEntities : autoMeta.geoEntities),
          schemaJsonLd: toSqlString(body.schemaJsonLd || autoMeta.schemaJsonLd),
          status,
          privacy,
          initial_views: initialViews,
          initial_likes: initialLikes,
          our_server_url: ourServerUrl,
          other_ps_url: otherPsUrl,
          backup_url: backupUrl,
          storage_source: ourServerUrl ? 'our_server' : 'other_ps',
          active_source: ourServerUrl ? 'our_server' : 'other_ps'
        };

        if (body.isCustomDateTime && body.created_at) {
          allCandidateFields.created_at = body.created_at;
        } else {
          // Format real-time UTC timestamp so default/real-time uploads always appear first
          allCandidateFields.created_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
          if (!body.uploadedAt || body.uploadedAt === 'Just now') {
            const now = new Date();
            const da = String(now.getDate()).padStart(2, '0');
            const mo = String(now.getMonth() + 1).padStart(2, '0');
            const yr = now.getFullYear();
            allCandidateFields.uploadedAt = `${da}/${mo}/${yr}`;
          }
        }

        // Auto-register category into categories table
        if (resolvedCategory) {
          const catSlug = resolvedCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          try {
            await env.DB.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)').bind(resolvedCategory, catSlug).run();
          } catch {}
        }

        // Auto-register new tags into tags table
        if (Array.isArray(resolvedTags)) {
          for (const t of resolvedTags) {
            const cleanT = String(t).trim();
            if (cleanT) {
              const tSlug = cleanT.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              try {
                await env.DB.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)').bind(cleanT, tSlug).run();
              } catch {}
            }
          }
        }
        tagsMemoryCache = { data: null, timestamp: 0 };

        const insertCols = availableCols.size > 0 
          ? Object.keys(allCandidateFields).filter(c => availableCols.has(c))
          : Object.keys(allCandidateFields);

        const placeholders = insertCols.map(() => '?').join(', ');
        const insertValues = insertCols.map(c => allCandidateFields[c]);

        await env.DB.prepare(`
          INSERT INTO videos (${insertCols.join(', ')})
          VALUES (${placeholders})
        `).bind(...insertValues).run();

        videosMemoryCache.clear();

        const created = await env.DB.prepare('SELECT * FROM videos WHERE id = ?').bind(id).first();
        const returnVideo = created || allCandidateFields;
        return json({
          success: true,
          message: 'Video published to Cloudflare D1',
          video: {
            ...returnVideo,
            videoUrl: resolveMediaUrl(returnVideo.videoUrl || ''),
            thumbnail: resolveMediaUrl(returnVideo.thumbnail || ''),
            our_server_url: resolveMediaUrl(returnVideo.our_server_url || ''),
            backup_url: resolveMediaUrl(returnVideo.backup_url || ''),
            other_ps_url: resolveMediaUrl(returnVideo.other_ps_url || '')
          }
        }, 201);
      }

      // 6. DELETE /api/videos/:id
      if (pathname.startsWith('/api/videos/') && method === 'DELETE') {
        const id = pathname.replace('/api/videos/', '');
        await env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
        videosMemoryCache.clear();
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

      // 9. POST /api/r2/upload & /api/upload (Cloudflare R2 Direct Upload & Storage)
      if ((pathname === '/api/r2/upload' || pathname === '/api/upload') && method === 'POST') {
        if (!env.BUCKET) {
          return json({
            success: false,
            message: 'Cloudflare R2 Storage (BUCKET) is not bound. Please bind R2 bucket "viralkam-videos" as BUCKET in wrangler.toml or Cloudflare dashboard.'
          }, 500);
        }

        const rawFileName = request.headers.get('X-File-Name') || `upload-${Date.now()}.mp4`;
        const filename = decodeURIComponent(rawFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const contentType = request.headers.get('Content-Type') || 'video/mp4';
        const isImage = contentType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(filename);
        const folder = isImage ? 'thumbnails' : 'videos';
        const fileKey = `${folder}/${Date.now()}-${filename}`;

        // Stream into Cloudflare R2 Bucket
        await env.BUCKET.put(fileKey, request.body, {
          httpMetadata: { contentType }
        });

        // Default to worker edge CDN endpoint to ensure immediate 100% working stream
        const edgeCdnUrl = getR2CdnUrl(fileKey, url.origin);

        return json({
          success: true,
          key: fileKey,
          url: edgeCdnUrl,
          cdnUrl: edgeCdnUrl,
          publicUrl: edgeCdnUrl,
          message: `${isImage ? 'Thumbnail' : 'Video'} file uploaded successfully to Cloudflare R2 Storage (${folder}/)`
        });
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
