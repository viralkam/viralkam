/**
 * Video Title & URL Formatting Helpers
 * Cleans raw URLs or file paths into human-friendly video titles and handles double-pasted URLs.
 */

export function cleanDisplayTitle(rawTitle) {
  let t = (rawTitle || '').trim();
  if (!t) return 'Untitled Video';

  // If title is a full URL or CDN file path
  if (t.startsWith('http://') || t.startsWith('https://') || t.includes('cdn.') || t.endsWith('.mp4') || t.endsWith('.m3u8')) {
    try {
      // Fix cases where URLs were doubled: e.g. https://domain.com/path.mp4https://domain.com/path.mp4
      const singleUrl = t.replace(/(https?:\/\/[^\s]+?)(https?:\/\/)/i, '$1');
      
      // Extract the last path component
      let pathname = singleUrl;
      try {
        const u = new URL(singleUrl);
        pathname = u.pathname;
      } catch {
        pathname = singleUrl.split('?')[0];
      }

      const parts = pathname.split('/').filter(Boolean);
      let filename = parts[parts.length - 1] || '';

      // Decode URI components and remove file extension
      filename = decodeURIComponent(filename).replace(/\.[a-zA-Z0-9]+$/, '');

      // Replace hyphens, underscores, dots, and plus signs with spaces
      let cleaned = filename.replace(/[-_+.]/g, ' ').replace(/\s+/g, ' ').trim();

      // Capitalize first letter of words if needed
      if (cleaned && cleaned.length > 2) {
        return cleaned;
      }
    } catch {
      // Fallback to basic string replacement
      const segments = t.split('/');
      const last = segments[segments.length - 1] || '';
      const fallback = decodeURIComponent(last).replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_+.]/g, ' ').trim();
      if (fallback && fallback.length > 2) return fallback;
    }
  }

  return t;
}

export function cleanVideoUrl(rawUrl, fallbackUrl = '') {
  let u = (rawUrl || '').trim();
  if (!u) return fallbackUrl;

  // Fix doubled URLs
  u = u.replace(/(https?:\/\/[^\s]+?)(https?:\/\/)/i, '$1');

  // Strip accidental quotes or trailing punctuation
  u = u.replace(/^["']+|["']+$/g, '');

  // If pointing to unconfigured or unreachable vcdn.viralkaam.com or vcdn.viralkam.com, rewrite to edge CDN endpoint
  if (u.includes('vcdn.viralkaam.com/') || u.includes('vcdn.viralkam.com/')) {
    u = u.replace(/https?:\/\/vcdn\.viralkaa?m\.com\//, '/cdn/');
  }

  // If running in browser and URL is a relative /cdn/ path, resolve to full origin URL
  if (typeof window !== 'undefined' && u.startsWith('/cdn/')) {
    u = `${window.location.origin}${u}`;
  }

  return u || fallbackUrl;
}

export const FALLBACK_THUMBNAIL = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
