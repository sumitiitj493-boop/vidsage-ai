=============================================================
VidSage — FREE Deployment Step-by-Step
=============================================================
Total cost: $0.00/month
Time needed: ~30 minutes
=============================================================
═══════════════════════════════════════════════════════
BEFORE YOU START — On Your Local Machine
═══════════════════════════════════════════════════════
Step 0a: Generate production secrets

cd your-project-directory
pip install bcrypt
python generate_secrets.py
SAVE the output — you'll need AUTH_SECRET_KEY and AUTH_PASSWORD_HASH
Step 0b: Commit and push all new files to GitHub

git add .
git commit -m "Add production deployment config"
git push origin main
═══════════════════════════════════════════════════════
STEP 1: Create Upstash Redis (2 minutes)
═══════════════════════════════════════════════════════
1. Go to https://upstash.com
2. Click "Start Free" → Sign up with GitHub
3. Click "Create Database"
- Name: vidsage-redis
- Region: closest to you
- Type: Regional
4. Click "Create"
5. On the database page, click "@upstash/redis" tab
6. Copy the UPSTASH_REDIS_REST_URL (you'll need it)
7. Also copy the traditional Redis URL:
redis://default:YOUR_PASSWORD@us1-useast1-NNN.upstash.io:6379
SAVE THIS: redis://default:xxxxx@us1-xxxxx.upstash.io:6379
═══════════════════════════════════════════════════════
STEP 2: Deploy Frontend to Vercel (3 minutes)
═══════════════════════════════════════════════════════
1. Go to https://vercel.com
2. Click "Sign Up" → Use GitHub
3. Click "Add New" → "Project"
4. Find your VidSage repo → Click "Import"
5. Configure:
- Project Name: vidsage
- Framework Preset: Next.js (auto-detected)
- Root Directory: click "Edit" → type "frontend" → Confirm
- Build Command: npm run build (default)
- Output Directory: .next (default)
6. Under "Environment Variables", add:
NEXT_PUBLIC_API_BASE_URL = https://vidsage-backend.onrender.com
(You'll update this after Step 3. For now, just guess the name)
7. Click "Deploy"
8. Wait ~2 minutes for build
9. Your URL: https://vidsage.vercel.app (or similar)
SAVE THIS URL
═══════════════════════════════════════════════════════
STEP 3: Deploy Backend to Render (5 minutes)
═══════════════════════════════════════════════════════
1. Go to https://render.com
2. Click "Get Started" → Sign up with GitHub
3. Click "New" → "Web Service"
4. Find your VidSage repo → Click "Connect"
5. Configure:
- Name: vidsage-backend
- Root Directory: backend
- Runtime: Docker
- Region: Oregon (or closest)
- Branch: main
- Instance Type: Free ← IMPORTANT
- Dockerfile Path: ./Dockerfile.render
6. Under "Advanced" → "Add Environment Variable", add ALL of these:
ENVIRONMENT = production
PORT = 10000
REDIS_URL = redis://default:xxxxx@us1-xxxxx.upstash.io:6379
FRONTEND_URL = https://vidsage.vercel.app (from Step 2)
GROQ_API_KEY = gsk_your_key_here
AUTH_ENABLED = true
AUTH_USERNAME = your_email@example.com
AUTH_PASSWORD = (leave empty)
AUTH_PASSWORD_HASH = $2b$12$xxxxx (from generate_secrets.py)
AUTH_SECRET_KEY = your_long_secret_key (from generate_secrets.py)
AUTH_ISSUER = vidsage-api
AUTH_AUDIENCE = vidssage-client
AUTH_COOKIE_SECURE = false
AUTH_COOKIE_SAMESITE = lax
DOWNLOAD_DIR = /opt/render/project/src/app/downloads
UPLOAD_DIR = /opt/render/project/src/app/uploads
CHROMA_DB_DIR = /opt/render/project/src/chroma_db
WHISPER_MODEL_SIZE = base
WHISPER_DEVICE = cpu
WHISPER_COMPUTE_TYPE = auto
7. Click "Create Web Service"
8. Wait ~5-10 minutes for first build (Docker image build)
9. Your URL: https://vidsage-backend.onrender.com
TEST IT:
Open in browser: https://vidsage-backend.onrender.com/health
Should return: {"status":"healthy","environment":"production"}
═══════════════════════════════════════════════════════
STEP 4: Connect Frontend ↔ Backend (2 minutes)
═══════════════════════════════════════════════════════
In Vercel Dashboard:
1. Go to your vidsage project → Settings → Environment Variables
2. Update NEXT_PUBLIC_API_BASE_URL to your ACTUAL Render URL:
https://vidsage-backend.onrender.com
3. Go to Deployments → Click "..." on latest → "Redeploy"
4. Wait ~1 minute
In Render Dashboard:
1. Go to vidsage-backend → Environment
2. Make sure FRONTEND_URL = https://your-actual-vercel-url.vercel.app
3. Save changes (triggers auto-redeploy)
═══════════════════════════════════════════════════════
STEP 5: Test Everything (2 minutes)
═══════════════════════════════════════════════════════
1. Visit your Vercel URL: https://vidsage.vercel.app
→ Frontend should load
2. Try logging in with your AUTH credentials
3. Try uploading an audio file or pasting a YouTube URL
4. Check Render logs:
Dashboard → vidsage-backend → Logs
NOTE: First request after 15min of inactivity = ~30s cold start
This is normal for free tier. Subsequent requests are fast.
═══════════════════════════════════════════════════════
STEP 6: Update CORS (if needed)
═══════════════════════════════════════════════════════
If you get CORS errors:
1. In Render → Environment
2. Make sure FRONTEND_URL exactly matches your Vercel URL
3. Including https:// and no trailing slash
═══════════════════════════════════════════════════════
WHAT YOU GET FOR FREE
═══════════════════════════════════════════════════════
┌─────────────────────────────────────────────────────┐
│ │
│ https://vidsage.vercel.app ← Frontend │
│ https://vidsage-backend.onrender.com ← Backend API │
│ │
│ ✅ Live URL to share on resume │
│ ✅ Working transcription via Groq │
│ ✅ Background job processing via Celery + Upstash │
│ ✅ RAG / Chat with ChromaDB │
│ ✅ Rate limiting + Security headers │
│ ✅ YouTube video processing │
│ ✅ Auto-deploys from GitHub pushes │
│ │
│ Total cost: $0.00/month │
│ │
└─────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════
FREE TIER LIMITATIONS (What to expect)
═══════════════════════════════════════════════════════
Render (Backend):
- 512MB RAM (enough with Groq API, no local Whisper)
- Sleeps after 15min inactivity → 30s cold start
- 750 hours/month (enough for continuous runtime)
- ChromaDB data persists but resets on redeploy
Vercel (Frontend):
- 100GB bandwidth/month
- Always on, no sleep
- Auto-deploys from GitHub
Upstash (Redis):
- 10,000 commands/day (plenty for demo)
- 256MB storage
Groq (Transcription + LLM):
- Free tier with rate limits
- whisper-large-v3 model
- llama-3.1-8b-instant for cleaning
═══════════════════════════════════════════════════════
UPGRADE PATH (When you get a job/budget)
═══════════════════════════════════════════════════════
$7/mo → Render Starter (no sleep, 2GB RAM)
$5/mo → Vercel Pro (faster builds, more bandwidth)
$15/mo → Hetzner VPS (8GB RAM, run EVERYTHING including local Whisper)
$0/mo → Oracle Cloud Always Free (24GB ARM VM — the holy grail)