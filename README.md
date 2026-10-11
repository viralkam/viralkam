# 🎬 Video Platform (Full-Stack Video Web Application)

High-performance video sharing and streaming application with automated SEO/AEO/GEO optimization, admin control panel, and dual-backend support:
- **Local Dev:** Fast Node.js SQLite server (`backend/server.js`)
- **Production Edge:** Serverless Cloudflare Workers + D1 Database + R2 Object Storage

---

## ⚡ Quickstart (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Files
A clean template `[.env.example](.env.example)` is provided. Create your local overrides file:
```bash
# Copy template to .env.local (This file is ignored by Git for your security)
cp .env.example .env.local
```

### 3. Run Locally
In separate terminals (or concurrently):
```bash
# Terminal 1: Start Backend API (Port 5000)
npm run backend

# Terminal 2: Start Vite Frontend (Port 5173)
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🚀 Production Cloudflare Deployment

When deploying to Cloudflare Workers & Pages, **NEVER** commit real passwords or private keys to GitHub.

### Step 1: Login to Cloudflare
```bash
npx wrangler login
```

### Step 2: Create D1 Database & Run Migrations
```bash
npx wrangler d1 create viralkam-db
npx wrangler d1 execute viralkam-db --file=./backend/schema.sql
```
*(Copy the generated `database_id` into `wrangler.toml` under `[[d1_databases]]`)*

### Step 3: Set Production Secrets (Variables & Secrets)
Set your secure production admin password and JWT key via Cloudflare Dashboard (**Settings > Variables & Secrets**) OR via Wrangler CLI:
```bash
npx wrangler secret put ADMIN_PASS
npx wrangler secret put JWT_SECRET
```

### Step 4: Build and Deploy
```bash
npm run build
npx wrangler deploy
```

---

## 🔒 Security Best Practices
- `.env` and `.env.local` are automatically ignored by `.gitignore`.
- Always keep sensitive credentials in `.env.local` or Cloudflare Secrets.
- Use `.env.example` as a clean public template for new projects.
