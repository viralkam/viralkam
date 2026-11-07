import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DATABASE_PATH 
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'viralkam.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export function initDatabase() {
  const db = new DatabaseSync(DB_PATH);

  // 1. Initialize clean schema
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);

  // 2. Insert standard default categories (no videos)
  const defaultCategories = ["Viral", "Trending", "Desi", "MMS", "Webseries", "Shorts"];
  const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)');
  for (const cat of defaultCategories) {
    insertCat.run(cat, cat.toLowerCase());
  }

  // 3. Insert standard default tags
  const defaultTags = ["Trending", "Desi", "Viral", "MMS", "Bhabhi", "Romance", "College", "HD"];
  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)');
  for (const tag of defaultTags) {
    insertTag.run(tag, tag.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }

  console.log('[Database] Clean database initialized with 0 dummy videos.');
  return db;
}

// If run directly
if (process.argv[1] === __filename) {
  initDatabase();
}
