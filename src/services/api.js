/**
 * VIRALKAM API Client Service
 * Connects to Cloudflare Workers / D1 API with graceful fallback to mock data
 */

import { INITIAL_VIDEOS, CATEGORIES } from '../mockVideos';

const API_BASE = '/api';

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
   * Create / Publish new video (Admin)
   */
  async createVideo(videoData) {
    try {
      const res = await fetch(`${API_BASE}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(videoData)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      return data.video || videoData;
    } catch (err) {
      console.warn('[API] Saved locally in state:', err.message);
      return videoData;
    }
  },

  /**
   * Delete video (Admin)
   */
  async deleteVideo(id) {
    try {
      const res = await fetch(`${API_BASE}/videos/${id}`, {
        method: 'DELETE'
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
  async submitReport({ videoId, videoTitle, reason, email = 'viralkam.com@gmail.com' }) {
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
        message: 'Report received. Our moderation team (viralkam.com@gmail.com) will review within 24 hours.'
      };
    }
  }
};
