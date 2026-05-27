💰 $0/month Architecture

User
  │
  ├──→ Vercel (Free)                    ← Frontend
  │     vidsage.vercel.app
  │          │
  │          ▼
  ├──→ Render (Free)                    ← Backend API + Celery
  │     vidsage-backend.onrender.com
  │          │
  │          ├──→ Upstash Redis (Free)  ← Job queue
  │          ├──→ Groq API (Free)       ← Whisper + LLM
  │          └──→ ChromaDB (in-memory)  ← RAG
  │
  └──→ Auto-deploys from GitHub push

📂 New Files for Free Tier
File	Purpose
backend/Dockerfile.render	Slim Docker image optimized for 512MB RAM
backend/render-start.sh	Runs FastAPI + Celery in one container
backend/requirements.render.txt	Lighter deps (no local Whisper needed)
backend/app/services/transcription_service.py	Groq API Whisper → local Whisper fallback
frontend/vercel.json	Vercel config for Next.js
render.yaml	Render Blueprint (auto-config)
FREE-DEPLOY-STEP-BY-STEP.md	Idiot-proof deployment guide
FREE-DEPLOY.md	Architecture overview

🔑 Why This Works for Free
Problem	Solution
Whisper needs 4GB RAM	Groq API handles transcription in cloud (free)
Celery needs separate server	Runs in same container with solo pool
Redis needs hosting	Upstash free tier (10K commands/day)
Need SSL/HTTPS	Vercel + Render provide HTTPS automatically
Need domain	.vercel.app and .onrender.com subdomains (free)

⚡ Quick Deploy (30 minutes)

1. python generate_secrets.py          ← Generate keys
2. Push to GitHub
3. Upstash → Create Redis DB            ← 2 min
4. Vercel → Import repo → Deploy        ← 3 min
5. Render → Import repo → Add env vars  ← 5 min
6. Update Vercel env with Render URL    ← 2 min
7. Visit your live site! 🎉

The only tradeoff: Render sleeps after 15min of no traffic, so the first visitor waits ~30 seconds. After that it's fast. For a resume project, this is perfect.
