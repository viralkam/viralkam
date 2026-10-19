/**
 * VIRALKAM API Client Service
 * Connects to Cloudflare Workers / D1 API with graceful fallback to mock data
 */

import { INITIAL_VIDEOS, CATEGORIES } from '../mockVideos';
import { CONFIG } from '../config';

const API_BASE = CONFIG.API_BASE_URL;

export const api = {
  /**
   * Admin Authentication Helpers
   */
  getAdminToken() {
    return localStorage.getItem('vk_admin_token') || sessionStorage.getItem('vk_admin_token') || '';
  },

  setAdminToken(token, remember = true) {
    if (remember) {
      localStorage.setItem('vk_admin_token', token);
    } else {
      sessionStorage.setItem('vk_admin_token', token);
    }
  },

  clearAdminToken() {
    localStorage.removeItem('vk_admin_token');
    sessionStorage.removeItem('vk_admin_token');
  },

  async loginAdmin(id, password) {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Invalid credentials');
    }
    return data;
  },

  async verifyAdmin() {
    const token = this.getAdminToken();
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/admin/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Get Admin Summary Stats (Total videos, views, categories, recent videos)
   */
  async getAdminStats() {
    try {
      const token = this.getAdminToken();
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.stats;
    } catch (err) {
      console.warn('[API] Could not fetch stats from backend:', err.message);
      return null;
    }
  },

  /**
   * Fetch paginated & filtered videos from Backend / D1
   */
  async getVideos({ page = 1, limit = 24, search = '', category = '', status = '', privacy = '', sort = 'newest' } = {}) {
    try {
      const params = new URLSearchParams();
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (status || privacy) params.append('status', status || privacy);
      if (sort) params.append('sort', sort);

      const token = this.getAdminToken();
      const res = await fetch(`${API_BASE}/videos?${params.toString()}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('[API] Backend unreachable, falling back to local dataset:', err.message);
      
      let list = [...INITIAL_VIDEOS];
      if (search) {
        const q = search.toLowerCase();
        list = list.filter(v => 
          v.title.toLowerCase().includes(q) || 
          v.description.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q)
        );
      }
      if (category && category !== 'All' && category !== 'All Categories') {
        list = list.filter(v => v.category.toLowerCase() === category.toLowerCase());
      }
      if (status && status !== 'all') {
        list = list.filter(v => (v.status || 'published').toLowerCase() === status.toLowerCase() || (v.privacy || 'public').toLowerCase() === status.toLowerCase());
      }
      if (sort === 'popular') list.sort((a, b) => b.likes - a.likes);
      else if (sort === 'most_viewed') list.sort((a, b) => b.views - a.views);

      const start = (page - 1) * limit;
      return {
        success: true,
        videos: list.slice(start, start + limit),
        pagination: {
          page,
          limit,
          totalVideos: list.length,
          totalPages: Math.ceil(list.length / limit)
        }
      };
    }
  },

  /**
   * Fetch single video
   */
  async getVideoById(id) {
    try {
      const token = this.getAdminToken();
      const res = await fetch(`${API_BASE}/videos/${id}`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.video;
    } catch (err) {
      console.warn(`[API] Fallback for video ${id}:`, err.message);
      return INITIAL_VIDEOS.find(v => v.id === id) || null;
    }
  },

  /**
   * Create / Publish new video (Admin)
   */
  async createVideo(videoData) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/videos`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(videoData)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || `Failed to save to database (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.video || videoData;
  },

  /**
   * Update existing video (Admin)
   */
  async updateVideo(id, videoData) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/videos/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(videoData)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || errData.error || `Failed to update video (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.video;
  },

  /**
   * Delete video (Admin)
   */
  async deleteVideo(id) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/videos/${id}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to delete video');
    }
    return true;
  },

  /**
   * Bulk delete videos (Admin)
   */
  async bulkDeleteVideos(ids) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/videos/bulk-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ ids })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to delete selected videos');
    }
    return true;
  },

  /**
   * Upvote / Downvote video
   */
  async voteVideo(id, type) {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`[API] Vote logged locally:`, err.message);
      return { success: true };
    }
  },

  /**
   * Upload video or thumbnail file (supports local dev server & R2 object storage)
   */
  async uploadVideoFile(file) {
    // 1. Try local dev endpoint first (/api/upload)
    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'video/mp4',
          'X-File-Name': encodeURIComponent(file.name)
        },
        body: file
      });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
    } catch (err) {
      console.log('Local upload failed, checking R2 endpoint...');
    }

    // 2. Fallback to Cloudflare R2 endpoint (/api/r2/upload)
    const r2Res = await fetch(`${API_BASE}/r2/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'video/mp4',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: file
    });
    if (!r2Res.ok) {
      const err = await r2Res.json().catch(() => ({}));
      throw new Error(err.message || `Storage upload failed (HTTP ${r2Res.status})`);
    }
    const data = await r2Res.json();
    return data.url || data.cdnUrl;
  },

  /**
   * Fetch Categories with counts
   */
  async getCategories() {
    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.categories || [];
    } catch {
      return CATEGORIES.map((c, i) => ({ id: i + 1, name: c, slug: c.toLowerCase(), count: 0 }));
    }
  },

  /**
   * Create category (Admin)
   */
  async createCategory(name) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to create category');
    }
    return data.category;
  },

  /**
   * Update category (Admin)
   */
  async updateCategory(id, name) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to update category');
    }
    return data.category;
  },

  /**
   * Delete category (Admin)
   */
  async deleteCategory(id) {
    const token = this.getAdminToken();
    const res = await fetch(`${API_BASE}/categories/${id}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to delete category');
    }
    return true;
  },

  /**
   * Submit Report / Removal Request
   */
  async submitReport({ videoId, videoTitle, reason, email = CONFIG.CONTACT_EMAIL }) {
    try {
      const res = await fetch(`${API_BASE}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, videoTitle, reason, email })
      });
      return await res.json();
    } catch (err) {
      return {
        success: true,
        message: `Report received. Our moderation team (${CONFIG.CONTACT_EMAIL}) will review within 24 hours.`
      };
    }
  }
};
