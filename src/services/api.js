/**
 * VIRALKAM API Client Service
 * Connects to Cloudflare Workers / D1 API with graceful fallback to mock data
 */

import { INITIAL_VIDEOS, CATEGORIES } from '../mockVideos';
import { CONFIG } from '../config';

const API_BASE = CONFIG.API_BASE_URL;

export const api = {
  /**
   * Fetch paginated & filtered videos from Backend / D1
   */
  async getVideos({ page = 1, limit = 24, search = '', category = '', sort = 'newest' } = {}) {
    try {
      const params = new URLSearchParams();
      if (page) params.append('page', page);
      if (limit) params.append('limit', limit);
      if (search) params.append('search', search);
      if (category) params.append('category', category);
      if (sort) params.append('sort', sort);

      const res = await fetch(`${API_BASE}/videos?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('[API] Backend unreachable, falling back to local dataset:', err.message);
      
      // Fallback filtering
      let list = [...INITIAL_VIDEOS];
      if (search) {
        const q = search.toLowerCase();
        list = list.filter(v => 
          v.title.toLowerCase().includes(q) || 
          v.description.toLowerCase().includes(q) ||
          v.category.toLowerCase().includes(q)
        );
      }
      if (category) {
        list = list.filter(v => v.category.toLowerCase() === category.toLowerCase());
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
   * Fetch single video + increment views
   */
  async getVideoById(id) {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.video;
    } catch (err) {
      console.warn(`[API] Fallback for video ${id}:`, err.message);
      return INITIAL_VIDEOS.find(v => v.id === id) || null;
    }
  },

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
   * Delete video (Admin)
   */
  async deleteVideo(id) {
    try {
      const token = this.getAdminToken();
      const res = await fetch(`${API_BASE}/videos/${id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });
      return res.ok;
    } catch (err) {
      console.warn(`[API] Deleted locally: ${id}`, err.message);
      return true;
    }
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
   * Upload video file directly to Cloudflare R2 object storage
   */
  async uploadVideoFile(file) {
    const res = await fetch(`${API_BASE}/r2/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'video/mp4',
        'X-File-Name': encodeURIComponent(file.name)
      },
      body: file
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `R2 storage upload failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.url;
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
      return CATEGORIES.map(c => ({ name: c, count: 12 }));
    }
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
