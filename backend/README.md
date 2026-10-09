# VIRALKAM.COM - Cloudflare Backend (D1 Database + R2 Storage + Workers API)

A complete high-performance, zero-egress backend built specifically for **Cloudflare**.

---

## 🏗 Architecture
- **API Runtime:** Cloudflare Workers (`backend/src/worker.js`)
- **Database:** Cloudflare D1 Serverless SQL (`viralkam-db` - 100% SQLite compatible)
- **Video & CDN Storage:** Cloudflare R2 (`viralkam-videos` - 0 Egress bandwidth fees!)
- **Local Dev Engine:** Built-in Node 24 `node:sqlite` server (`backend/server.js`)

---

## ⚡ 1. Local Development (Instant Running - No Config Required)
You can run the backend locally on port 5000:

```bash
# Start backend server
node backend/server.js

# Or seed/re-seed the 72 videos
node backend/seed.js
```

---

## 🚀 2. Deploy to Cloudflare (Step-by-Step)

### Step 1: Login to Cloudflare
```bash
npx wrangler login
```

### Step 2: Create Cloudflare D1 Database
```bash
npx wrangler d1 create viralkam-db
```
*Note down the `database_id` output and paste it inside `backend/wrangler.toml` under `[[d1_databases]]`.*

### Step 3: Run Database Migrations on Cloudflare D1
```bash
# Initialize Tables
npx wrangler d1 execute viralkam-db --file=./schema.sql

# (Optional) Seed Initial Videos
npx wrangler d1 execute viralkam-db --file=./seed.sql
```

### Step 4: Create Cloudflare R2 Storage Bucket (for Videos & Thumbs)
```bash
npx wrangler r2 bucket create viralkam-videos
```

### Step 5: Deploy Worker to Cloudflare Global Edge
```bash
npx wrangler deploy
```

Done! Your API will be live globally at `https://viralkam-api.<your-subdomain>.workers.dev`.

---

## 📡 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/videos` | List, search, category filter, sort, pagination |
| `GET` | `/api/videos/:id` | Get video details & atomically increment views |
| `POST` | `/api/videos` | Publish new video (Admin) |
| `DELETE` | `/api/videos/:id` | Delete video (Admin) |
| `POST` | `/api/videos/:id/vote` | Upvote / Downvote |
| `GET` | `/api/categories` | Categories list with video counts |
| `POST` | `/api/reports` | DMCA / Removal requests (viralkam.com@gmail.com) |
| `POST` | `/api/r2/upload` | Direct video upload to Cloudflare R2 |
