/**
 * Persistent Upload History Service for VIRALKAM Admin Panel
 * Tracks all video upload jobs in localStorage so status is preserved even if user refreshes/leaves.
 */

const STORAGE_KEY = 'vk_upload_history';

export const uploadHistory = {
  getAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addItem({
    id = `up-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    title = 'Untitled Upload',
    type = 'Single Upload', // 'Single Upload' | 'Direct Link' | 'Bulk Upload' | 'Excel Import'
    fileName = '',
    fileSize = '',
    duration = '',
    thumbnail = '',
    status = 'uploading', // 'uploading' | 'published' | 'failed'
    progress = 0,
    currentStep = 'Uploading to storage...',
    videoUrl = '',
    videoId = '',
    error = '',
    uploadedAt = new Date().toLocaleString()
  }) {
    try {
      const items = this.getAll();
      const newItem = {
        id,
        title,
        type,
        fileName,
        fileSize,
        duration,
        thumbnail,
        status,
        progress,
        currentStep,
        videoUrl,
        videoId,
        error,
        uploadedAt,
        timestamp: Date.now()
      };
      items.unshift(newItem);
      // Keep up to 100 most recent upload records
      const trimmed = items.slice(0, 100);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return newItem;
    } catch (e) {
      console.warn('[UploadHistory] Could not save item:', e);
      return null;
    }
  },

  updateItem(id, updates = {}) {
    try {
      const items = this.getAll();
      const index = items.findIndex((it) => it.id === id);
      if (index !== -1) {
        items[index] = { ...items[index], ...updates };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        return items[index];
      }
    } catch (e) {
      console.warn('[UploadHistory] Could not update item:', e);
    }
    return null;
  },

  removeItem(id) {
    try {
      const items = this.getAll().filter((it) => it.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return items;
    } catch {
      return [];
    }
  },

  clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
};
