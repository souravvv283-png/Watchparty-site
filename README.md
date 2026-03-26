# 🎬 Watch Party

Watch YouTube videos and share your screen in sync with friends — real-time via Socket.io + WebRTC.

---

## Project Structure

```
watch-party/
├── client/          ← React + Vite frontend
├── server/          ← Express + Socket.io backend
├── package.json     ← Root scripts (build + start)
├── railway.json     ← Railway deploy config
├── render.yaml      ← Render deploy config
└── Procfile         ← Heroku/Render compatibility
```

In **production**, Vite builds the React app into `server/public/`.
Express then serves it as static files — **one server, one port, one deployment.**

---

## Local Development

### 1. Install all dependencies
```bash
npm run install:all
```

### 2. Run backend (Terminal 1)
```bash
npm run dev:server
# → http://localhost:3001
```

### 3. Run frontend (Terminal 2)
```bash
npm run dev:client
# → http://localhost:5173
```

Vite proxies `/api` and `/socket.io` requests to Express automatically.

---

## Deploy (Single Repo)

Both frontend and backend deploy together as **one service**.
The `npm run build` script compiles React into `server/public/`,
then `npm start` runs Express which serves everything.

### ▶ Option A — Railway (Recommended, free tier)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
3. Select your repo — Railway auto-detects `railway.json`
4. Set environment variable:
   ```
   NODE_ENV = production
   ```
5. Click **Deploy** — Railway runs `npm run build` then `npm start`
6. Go to **Settings → Networking → Generate Domain** to get your public URL

That's it. One URL for everything. ✅

---

### ▶ Option B — Render (free tier, sleeps after inactivity)

1. Push to GitHub
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo
4. Render detects `render.yaml` automatically, or set manually:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
5. Add environment variable:
   ```
   NODE_ENV = production
   ```
6. Deploy — your URL is `https://watch-party-xxxx.onrender.com`

---

### ▶ Option C — Heroku

```bash
heroku create your-watch-party
heroku config:set NODE_ENV=production
git push heroku main
```

---

### ▶ Option D — VPS (DigitalOcean, Linode, etc.)

```bash
# On your server
git clone https://github.com/you/watch-party.git
cd watch-party
NODE_ENV=production npm run build
NODE_ENV=production npm start

# Keep alive with PM2
npm install -g pm2
NODE_ENV=production pm2 start server/index.js --name watch-party
pm2 save
```

For HTTPS (required for screen sharing), put Nginx in front:
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    # ... ssl certs via certbot

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";  # required for WebSocket
        proxy_set_header Host $host;
    }
}
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port Express listens on |
| `NODE_ENV` | `development` | Set to `production` to serve React build |

---

## Notes

- **Screen sharing** requires **HTTPS** — Railway/Render provide this automatically
- Netflix/Disney+ block screen capture via DRM (you'll see a black screen)
- Works great for local video files, browser games, non-DRM sites
- Rooms are in-memory — they reset when the server restarts
