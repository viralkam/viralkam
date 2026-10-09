-- Cloudflare D1 / SQLite Database Schema for VIRALKAM.COM

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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
  tags TEXT, -- JSON array of tags as string
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  video_title TEXT,
  reason TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'pending'
);

-- Indexes for lightning fast searching and sorting
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_views ON videos(views DESC);
CREATE INDEX IF NOT EXISTS idx_videos_likes ON videos(likes DESC);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
