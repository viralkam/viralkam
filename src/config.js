/**
 * Application Configuration
 * Reads from Vite environment variables (VITE_*) with safe default fallbacks.
 */
export const CONFIG = {
  SITE_NAME: import.meta.env.VITE_SITE_NAME || 'VIRALKAAM.COM',
  SITE_URL: import.meta.env.VITE_SITE_URL || 'https://viralkaam.com',
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api',
  CONTACT_EMAIL: import.meta.env.VITE_CONTACT_EMAIL || 'viralkam.com@gmail.com',
  CDN_DOMAIN: import.meta.env.VITE_CDN_DOMAIN || 'vcdn.viralkaam.com',
};
