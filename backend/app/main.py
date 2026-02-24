from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import video

app = FastAPI(title="VidSage API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(video.router)

@app.get("/")
async def root():
    return {"message": "VidSage API running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}