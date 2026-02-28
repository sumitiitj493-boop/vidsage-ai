from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import video, transcription, upload, clean

app = FastAPI(title="VidSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(video.router)
app.include_router(transcription.router)
app.include_router(upload.router)
app.include_router(clean.router)


@app.get("/")
async def root():
    return {"message": "VidSage API running"}


@app.get("/about")
async def about():
    return {
        "project": "VidSage",
        "description": "AI-Powered Universal Video Assistant",
        "version": "1.0.0",
        "features": [
            "YouTube video transcription (manual + auto captions)",
            "Whisper speech-to-text (faster-whisper)",
            "Audio file upload with background processing",
            "3-layer transcript cleaning (regex, dictionary, Groq LLM)",
        ],
        "tech_stack": ["FastAPI", "faster-whisper", "yt-dlp", "Groq API", "React (coming soon)"],
        "author": "VidSage Team"
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}