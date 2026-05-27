import os

new_files = {
    "backend/app/main.py": r'''"""
VidSage — Production main.py

Drops in as a replacement for your existing backend/app/main.py.
Adds:
- Rate limiting middleware
- Security headers middleware
- Request logging middleware
- Graceful shutdown
- Proper logging configuration
"""

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import require_auth
from app.config import settings
from app.api.routes import auth, video, transcription, upload, clean, text_input, chat, pdf, notes

# ── Logging Configuration ────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)-25s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

# ── Lifespan (replaces deprecated @app.on_event) ─────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────
    logger.info("🚀 VidSage API starting...")
    logger.info(f"   Environment: {settings.ENVIRONMENT}")
    logger.info(f"   Auth enabled: {settings.AUTH_ENABLED}")

    # Validate auth settings (from original main.py)
    if settings.AUTH_ENABLED and settings.ENVIRONMENT == "production":
        if settings.AUTH_SECRET_KEY == "vidsage-dev-secret-change-in-production" or len(settings.AUTH_SECRET_KEY) < 32:
            raise RuntimeError("AUTH_SECRET_KEY must be at least 32 characters in production")

        using_plain_password = bool(settings.AUTH_PASSWORD.strip()) and not bool(settings.AUTH_PASSWORD_HASH.strip())
        if using_plain_password:
            raise RuntimeError("Use AUTH_PASSWORD_HASH instead of AUTH_PASSWORD in production")

    logger.info("✅ Startup validation passed")

    yield

    # ── Shutdown ─────────────────────────────────────────
    logger.info("🛑 VidSage API shutting down...")


# ── CORS ─────────────────────────────────────────────────────
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if hasattr(settings, "FRONTEND_URL") and settings.FRONTEND_URL:
    CORS_ORIGINS.append(settings.FRONTEND_URL)
else:
    CORS_ORIGINS.extend(["https://vidsage.com", "https://www.vidsage.com"])

# ── App Creation ─────────────────────────────────────────────
app = FastAPI(
    title="VidSage API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware (order matters — last added = first executed) ──

# 1. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["Content-Length", "Content-Disposition", "X-Request-ID", "X-RateLimit-*"],
)

# 2. Security headers
from app.middleware.security import SecurityHeadersMiddleware
app.add_middleware(SecurityHeadersMiddleware)

# 3. Request logging
from app.middleware.request_logger import RequestLoggingMiddleware
app.add_middleware(RequestLoggingMiddleware)

# 4. Rate limiting (outermost — catches everything first)
from app.middleware.rate_limiter import RateLimitMiddleware
app.add_middleware(
    RateLimitMiddleware,
    redis_url=settings.REDIS_URL,
)

# ── Routes ────────────────────────────────────────────────────
app.include_router(auth.router)

auth_dependency = [Depends(require_auth)]
app.include_router(video.router, dependencies=auth_dependency)
app.include_router(transcription.router, dependencies=auth_dependency)
app.include_router(upload.router, dependencies=auth_dependency)
app.include_router(clean.router, dependencies=auth_dependency)
app.include_router(text_input.router, dependencies=auth_dependency)
app.include_router(chat.router, dependencies=auth_dependency)
app.include_router(notes.router, dependencies=auth_dependency)
app.include_router(pdf.router, dependencies=auth_dependency)

# ── Exception Handlers ───────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected internal server error occurred. Please try again later."},
    )

# ── Health & Info Endpoints ───────────────────────────────────
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
        "tech_stack": ["FastAPI", "faster-whisper", "yt-dlp", "Groq API", "Next.js"],
        "author": "VidSage Team",
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
    }

@app.get("/health/detailed")
async def health_detailed():
    """Detailed health check including dependencies."""
    checks = {"api": "healthy"}

    # Check Redis
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        checks["redis"] = "healthy"
    except Exception as e:
        checks["redis"] = f"unhealthy: {str(e)[:100]}"

    # Check ChromaDB
    try:
        import chromadb
        client = chromadb.PersistentClient(path=settings.CHROMA_DB_DIR)
        client.heartbeat()
        checks["chromadb"] = "healthy"
    except Exception as e:
        checks["chromadb"] = f"unhealthy: {str(e)[:100]}"

    all_healthy = all("healthy" in v for v in checks.values())
    return {
        "status": "healthy" if all_healthy else "degraded",
        "checks": checks,
        "environment": settings.ENVIRONMENT,
    }
''',
    "backend/app/config.py": r'''"""
VidSage Configuration — Production Hardened
Loads settings from .env file

Changes from original:
- Added PROXY_LIST for YouTube proxy rotation
- Added YT_COOKIE_FILE for authenticated YouTube access
- Added PROXY settings
"""

import os
from pathlib import Path
from dotenv import load_dotenv


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


# Load .env from backend directory
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


class Settings:
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").strip().lower()

    # Groq API (free LLM + Whisper API)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    # Whisper settings
    WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")
    WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "auto")

    # File paths
    backend_root = Path(__file__).parent.parent
    DOWNLOAD_DIR: str = os.getenv("DOWNLOAD_DIR", str(backend_root / "app" / "downloads"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", str(backend_root / "app" / "uploads"))

    # Cleaning settings
    CLEANING_MODEL: str = os.getenv("CLEANING_MODEL", "llama-3.1-8b-instant")
    MAX_CHUNK_SIZE: int = 2500

    # Fallback LLM (OpenRouter / OpenAI-compatible)
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_URL: str = os.getenv("OPENROUTER_URL", "https://openrouter.ai/api/v1")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "gpt-4o-mini")
    OPENROUTER_TIMEOUT: int = int(os.getenv("OPENROUTER_TIMEOUT", "120"))

    # RAG Settings
    CHROMA_DB_DIR: str = str(Path(__file__).parent.parent / "chroma_db")

    # Redis connection used by Celery and job manager
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    # ── NEW: Proxy & YouTube Settings ─────────────────────
    # Comma-separated proxy URLs for YouTube rotation
    PROXY_LIST: str = os.getenv("PROXY_LIST", "")
    # Path to cookies.txt for authenticated YouTube access
    YT_COOKIE_FILE: str = os.getenv("YT_COOKIE_FILE", "")
    # Minimum seconds between YouTube requests (bot detection prevention)
    YT_REQUEST_INTERVAL: float = float(os.getenv("YT_REQUEST_INTERVAL", "3.0"))

    # Authentication Settings
    AUTH_ENABLED: bool = _as_bool(os.getenv("AUTH_ENABLED"), True)
    AUTH_USERNAME: str = os.getenv("AUTH_USERNAME", "admin")
    AUTH_PASSWORD: str = os.getenv("AUTH_PASSWORD", "change-me")
    AUTH_PASSWORD_HASH: str = os.getenv("AUTH_PASSWORD_HASH", "")
    AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "vidsage-dev-secret-change-in-production")
    AUTH_ISSUER: str = os.getenv("AUTH_ISSUER", "vidsage-api")
    AUTH_AUDIENCE: str = os.getenv("AUTH_AUDIENCE", "vidsage-client")
    AUTH_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("AUTH_ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    AUTH_REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("AUTH_REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    AUTH_ACCESS_COOKIE_NAME: str = os.getenv("AUTH_ACCESS_COOKIE_NAME", "vidsage_access")
    AUTH_REFRESH_COOKIE_NAME: str = os.getenv("AUTH_REFRESH_COOKIE_NAME", "vidsage_refresh")
    AUTH_COOKIE_SECURE: bool = _as_bool(os.getenv("AUTH_COOKIE_SECURE"), ENVIRONMENT == "production")
    AUTH_COOKIE_SAMESITE: str = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    AUTH_TOKEN_LEEWAY_SECONDS: int = int(os.getenv("AUTH_TOKEN_LEEWAY_SECONDS", "30"))
    AUTH_MAX_LOGIN_ATTEMPTS: int = int(os.getenv("AUTH_MAX_LOGIN_ATTEMPTS", "6"))
    AUTH_LOGIN_WINDOW_SECONDS: int = int(os.getenv("AUTH_LOGIN_WINDOW_SECONDS", "300"))
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(AUTH_ACCESS_TOKEN_EXPIRE_MINUTES))
    )

    # Frontend / OAuth
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI", "")
    GOOGLE_OAUTH_STATE_COOKIE_NAME: str = os.getenv("GOOGLE_OAUTH_STATE_COOKIE_NAME", "vidsage_google_oauth_state")
    GOOGLE_OAUTH_NEXT_COOKIE_NAME: str = os.getenv("GOOGLE_OAUTH_NEXT_COOKIE_NAME", "vidsage_google_oauth_next")


settings = Settings()
''',
    "backend/app/services/proxy_manager.py": r'''"""
VidSage — Proxy Manager for YouTube & External Services

Solves: IP blocking, rate limiting, bot detection from YouTube/Google.
- Rotates proxy pools automatically
- Cooldown tracking per proxy
- Auto-retries with different proxies on failure
- User-Agent rotation
- Request throttling between YouTube requests
"""

import asyncio
import hashlib
import logging
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Rotating User-Agents ──────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
]


class ProxyStatus(str, Enum):
    ACTIVE = "active"
    COOLDOWN = "cooldown"
    DEAD = "dead"


@dataclass
class ProxyEntry:
    url: str
    status: ProxyStatus = ProxyStatus.ACTIVE
    fail_count: int = 0
    last_used: float = 0.0
    cooldown_until: float = 0.0
    total_requests: int = 0
    total_failures: int = 0

    @property
    def is_available(self) -> bool:
        if self.status == ProxyStatus.DEAD:
            return False
        if self.status == ProxyStatus.COOLDOWN and time.time() < self.cooldown_until:
            return False
        return True


@dataclass
class ProxyConfig:
    """Load proxy list from environment or file."""
    proxy_list: list[str] = field(default_factory=list)
    cooldown_seconds: int = 300          # 5 min cooldown on failure
    max_failures: int = 3                # mark dead after 3 failures
    min_interval_seconds: float = 2.0    # minimum gap between YouTube requests
    dead_proxy_revive_minutes: int = 30  # retry dead proxies after 30 min


class ProxyManager:
    """
    Manages a pool of proxies with rotation, cooldown, and health tracking.

    Usage:
        manager = ProxyManager()
        proxy = manager.get_next_proxy()
        # Use proxy with yt-dlp, httpx, etc.
    """

    def __init__(self, config: Optional[ProxyConfig] = None):
        self.config = config or ProxyConfig()
        self.proxies: list[ProxyEntry] = []
        self._current_index = 0
        self._last_request_time = 0.0
        self._lock = asyncio.Lock()

        # Initialize proxy pool
        for url in self.config.proxy_list:
            self.proxies.append(ProxyEntry(url=url))

        logger.info(
            f"ProxyManager initialized with {len(self.proxies)} proxies. "
            f"Direct mode = {len(self.proxies) == 0}"
        )

    # ── Public API ──────────────────────────────────────

    async def get_proxy(self) -> Optional[str]:
        """Get the next available proxy URL, or None for direct connection."""
        async with self._lock:
            # No proxies configured = direct connection
            if not self.proxies:
                return None

            # Revive dead proxies past revival time
            self._revive_dead_proxies()

            # Find next available
            available = [p for p in self.proxies if p.is_available]
            if not available:
                logger.warning("All proxies are in cooldown/dead. Using direct connection as fallback.")
                return None

            # Round-robin among available
            entry = available[self._current_index % len(available)]
            self._current_index += 1

            entry.last_used = time.time()
            entry.total_requests += 1

            logger.info(f"Using proxy: {self._mask_proxy(entry.url)} (requests: {entry.total_requests})")
            return entry.url

    async def report_success(self, proxy_url: Optional[str]) -> None:
        """Report a successful request — resets failure count."""
        async with self._lock:
            entry = self._find_entry(proxy_url)
            if entry:
                entry.fail_count = 0
                entry.status = ProxyStatus.ACTIVE

    async def report_failure(self, proxy_url: Optional[str]) -> None:
        """Report a failed request — increases cooldown or marks dead."""
        async with self._lock:
            entry = self._find_entry(proxy_url)
            if entry:
                entry.fail_count += 1
                entry.total_failures += 1

                if entry.fail_count >= self.config.max_failures:
                    entry.status = ProxyStatus.DEAD
                    logger.warning(f"Proxy {self._mask_proxy(entry.url)} marked DEAD after {entry.fail_count} failures")
                else:
                    entry.status = ProxyStatus.COOLDOWN
                    entry.cooldown_until = time.time() + self.config.cooldown_seconds
                    logger.warning(
                        f"Proxy {self._mask_proxy(entry.url)} in COOLDOWN "
                        f"({entry.fail_count}/{self.config.max_failures} failures)"
                    )

    async def throttle(self) -> None:
        """Enforce minimum interval between requests to avoid bot detection."""
        async with self._lock:
            now = time.time()
            elapsed = now - self._last_request_time
            if elapsed < self.config.min_interval_seconds:
                wait_time = self.config.min_interval_seconds - elapsed
                # Add random jitter (0–2 seconds)
                wait_time += random.uniform(0, 2.0)
                logger.info(f"Throttling: waiting {wait_time:.1f}s before next request")
                await asyncio.sleep(wait_time)
            self._last_request_time = time.time()

    def get_user_agent(self) -> str:
        """Get a random User-Agent string."""
        return random.choice(USER_AGENTS)

    @property
    def stats(self) -> dict:
        """Get proxy pool statistics."""
        if not self.proxies:
            return {"mode": "direct", "proxies": 0}

        return {
            "mode": "proxy_pool",
            "total": len(self.proxies),
            "active": sum(1 for p in self.proxies if p.status == ProxyStatus.ACTIVE),
            "cooldown": sum(1 for p in self.proxies if p.status == ProxyStatus.COOLDOWN),
            "dead": sum(1 for p in self.proxies if p.status == ProxyStatus.DEAD),
            "total_requests": sum(p.total_requests for p in self.proxies),
            "total_failures": sum(p.total_failures for p in self.proxies),
        }

    # ── Private ─────────────────────────────────────────

    def _find_entry(self, proxy_url: Optional[str]) -> Optional[ProxyEntry]:
        if proxy_url is None:
            return None
        for entry in self.proxies:
            if entry.url == proxy_url:
                return entry
        return None

    def _revive_dead_proxies(self) -> None:
        now = time.time()
        revive_threshold = self.config.dead_proxy_revive_minutes * 60
        for entry in self.proxies:
            if entry.status == ProxyStatus.DEAD:
                if now - entry.last_used > revive_threshold:
                    entry.status = ProxyStatus.ACTIVE
                    entry.fail_count = 0
                    logger.info(f"Revived dead proxy: {self._mask_proxy(entry.url)}")

    @staticmethod
    def _mask_proxy(url: str) -> str:
        """Mask proxy credentials for logging."""
        if "@" in url:
            # socks5://user:pass@host:port → socks5://****@host:port
            protocol, rest = url.split("://", 1)
            if "@" in rest:
                creds, host = rest.rsplit("@", 1)
                return f"{protocol}://****@{host}"
        return url


# ── Singleton instance ────────────────────────────────────────
# Initialize with proxies from environment variable:
# PROXY_LIST=socks5://user:pass@host1:port,http://user:pass@host2:port

import os

def _load_proxies_from_env() -> list[str]:
    raw = os.getenv("PROXY_LIST", "").strip()
    if not raw:
        return []
    proxies = [p.strip() for p in raw.split(",") if p.strip()]
    return proxies


_proxy_config = ProxyConfig(proxy_list=_load_proxies_from_env())
proxy_manager = ProxyManager(_proxy_config)
''',
    "backend/app/services/youtube_service.py": r'''"""
VidSage — YouTube Service (Production-Resilient)

Solves: YouTube IP blocking, rate limiting, bot detection.
- Uses ProxyManager for proxy rotation
- Throttles requests to avoid bot detection
- Multiple fallback strategies: captions API → yt-dlp → transcript API
- Exponential backoff on failures
- Request queue with concurrency limit
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from app.services.proxy_manager import proxy_manager

logger = logging.getLogger(__name__)


class YouTubeSource(str, Enum):
    YOUTUBE_TRANSCRIPT_API = "youtube_transcript_api"
    YT_DLP = "yt_dlp"
    MANUAL_CAPTIONS = "manual_captions"


@dataclass
class TranscriptResult:
    success: bool
    text: str
    source: Optional[YouTubeSource] = None
    language: Optional[str] = None
    video_id: Optional[str] = None
    error: Optional[str] = None


class YouTubeService:
    """
    Production-resilient YouTube transcript fetcher.

    Strategies (in order):
    1. youtube-transcript-api (fastest, but most likely to be blocked)
    2. yt-dlp with proxy rotation (more resilient)
    3. yt-dlp manual caption download (last resort)

    Features:
    - Automatic proxy rotation per request
    - Rate limiting / throttling between requests
    - Exponential backoff on failures
    - Concurrent request limiting (semaphore)
    """

    def __init__(
        self,
        max_concurrent: int = 3,
        base_backoff: float = 2.0,
        max_retries: int = 3,
    ):
        self.max_concurrent = max_concurrent
        self.base_backoff = base_backoff
        self.max_retries = max_retries
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._request_count = 0
        self._failure_count = 0

    async def get_transcript(
        self,
        video_url: str,
        languages: Optional[list[str]] = None,
    ) -> TranscriptResult:
        """
        Fetch transcript with full resilience pipeline.
        """
        languages = languages or ["en", "en-US", "en-GB"]

        async with self._semaphore:
            # Throttle before every YouTube request
            await proxy_manager.throttle()

            # Try each strategy in order
            strategies = [
                (YouTubeSource.YOUTUBE_TRANSCRIPT_API, self._fetch_via_transcript_api),
                (YouTubeSource.YT_DLP, self._fetch_via_yt_dlp),
                (YouTubeSource.MANUAL_CAPTIONS, self._fetch_via_yt_dlp_manual),
            ]

            last_error = None
            for source, fetch_fn in strategies:
                for attempt in range(self.max_retries):
                    proxy = await proxy_manager.get_proxy()
                    user_agent = proxy_manager.get_user_agent()

                    try:
                        logger.info(
                            f"Attempting {source.value} for {video_url} "
                            f"(attempt {attempt + 1}/{self.max_retries}, proxy={proxy is not None})"
                        )

                        result = await fetch_fn(
                            video_url=video_url,
                            proxy=proxy,
                            user_agent=user_agent,
                            languages=languages,
                        )

                        if result.success:
                            await proxy_manager.report_success(proxy)
                            self._request_count += 1
                            result.source = source
                            result.video_id = self._extract_video_id(video_url)
                            logger.info(
                                f"✅ Transcript fetched via {source.value} "
                                f"for {video_url} (total: {self._request_count})"
                            )
                            return result
                        else:
                            last_error = result.error

                    except Exception as e:
                        last_error = str(e)
                        logger.warning(f"❌ {source.value} attempt {attempt + 1} failed: {e}")
                        await proxy_manager.report_failure(proxy)

                        # Exponential backoff + jitter
                        backoff = self.base_backoff * (2 ** attempt) + random.uniform(0, 1)
                        logger.info(f"Backoff: {backoff:.1f}s")
                        await asyncio.sleep(backoff)

                # If this strategy exhausted retries, try next strategy
                logger.warning(f"Strategy {source.value} exhausted. Trying next...")

            self._failure_count += 1
            return TranscriptResult(
                success=False,
                text="",
                error=f"All transcript strategies failed. Last error: {last_error}",
            )

    # ── Strategy Implementations ─────────────────────────

    async def _fetch_via_transcript_api(
        self,
        video_url: str,
        proxy: Optional[str],
        user_agent: str,
        languages: list[str],
    ) -> TranscriptResult:
        """Strategy 1: youtube-transcript-api (Python library)."""
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            video_id = self._extract_video_id(video_url)

            # This library doesn't support proxies natively,
            # but we can set environment variables for it
            proxy_env = {}
            if proxy:
                proxy_env = {"HTTP_PROXY": proxy, "HTTPS_PROXY": proxy}

            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            transcript_list = await loop.run_in_executor(
                None,
                lambda: YouTubeTranscriptApi.get_transcript(
                    video_id,
                    languages=languages,
                ),
            )

            text = " ".join([entry["text"] for entry in transcript_list])
            return TranscriptResult(success=True, text=text, language=languages[0])

        except Exception as e:
            return TranscriptResult(success=False, text="", error=str(e))

    async def _fetch_via_yt_dlp(
        self,
        video_url: str,
        proxy: Optional[str],
        user_agent: str,
        languages: list[str],
    ) -> TranscriptResult:
        """Strategy 2: yt-dlp with proxy rotation."""
        try:
            import yt_dlp

            ydl_opts = {
                "skip_download": True,
                "writesubtitles": True,
                "writeautomaticsub": True,
                "subtitleslangs": languages,
                "subtitlesformat": "json3",
                "quiet": True,
                "no_warnings": True,
                "http_headers": {"User-Agent": user_agent},
                "socket_timeout": 30,
                "retries": 3,
                "fragment_retries": 3,
            }

            if proxy:
                ydl_opts["proxy"] = proxy

            # Cookie file for auth (optional)
            import os
            cookie_file = os.getenv("YT_COOKIE_FILE", "")
            if cookie_file and os.path.exists(cookie_file):
                ydl_opts["cookiefile"] = cookie_file

            loop = asyncio.get_event_loop()

            def _extract():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(video_url, download=False)
                    return info

            info = await loop.run_in_executor(None, _extract)

            # Try to get auto-generated subtitles first, then manual
            subs = info.get("automatic_captions", {}) or info.get("subtitles", {})

            for lang in languages:
                if lang in subs and subs[lang]:
                    # Download the subtitle content
                    sub_url = subs[lang][-1].get("url", "") if subs[lang] else ""
                    if sub_url:
                        import httpx
                        async with httpx.AsyncClient(
                            proxy=proxy,
                            headers={"User-Agent": user_agent},
                            timeout=30,
                        ) as client:
                            resp = await client.get(sub_url)
                            if resp.status_code == 200:
                                text = self._parse_subtitle_json(resp.json() if "json" in subs[lang][-1].get("ext", "") else resp.text)
                                return TranscriptResult(success=True, text=text, language=lang)

            return TranscriptResult(success=False, text="", error="No subtitles found via yt-dlp")

        except Exception as e:
            return TranscriptResult(success=False, text="", error=str(e))

    async def _fetch_via_yt_dlp_manual(
        self,
        video_url: str,
        proxy: Optional[str],
        user_agent: str,
        languages: list[str],
    ) -> TranscriptResult:
        """Strategy 3: yt-dlp manual caption download (VTT/SRT)."""
        try:
            import yt_dlp
            import tempfile
            import os

            with tempfile.TemporaryDirectory() as tmpdir:
                ydl_opts = {
                    "skip_download": True,
                    "writesubtitles": True,
                    "writeautomaticsub": True,
                    "subtitleslangs": languages,
                    "subtitlesformat": "srt",
                    "quiet": True,
                    "no_warnings": True,
                    "outtmpl": os.path.join(tmpdir, "%(id)s.%(ext)s"),
                    "http_headers": {"User-Agent": user_agent},
                    "socket_timeout": 30,
                }

                if proxy:
                    ydl_opts["proxy"] = proxy

                import os
                cookie_file = os.getenv("YT_COOKIE_FILE", "")
                if cookie_file and os.path.exists(cookie_file):
                    ydl_opts["cookiefile"] = cookie_file

                loop = asyncio.get_event_loop()

                def _download():
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([video_url])

                await loop.run_in_executor(None, _download)

                # Find and parse the downloaded subtitle file
                for f in os.listdir(tmpdir):
                    if f.endswith((".srt", ".vtt")):
                        filepath = os.path.join(tmpdir, f)
                        with open(filepath, "r", encoding="utf-8") as fh:
                            text = self._parse_subtitle_file(fh.read())
                        return TranscriptResult(success=True, text=text)

            return TranscriptResult(success=False, text="", error="No subtitle file downloaded")

        except Exception as e:
            return TranscriptResult(success=False, text="", error=str(e))

    # ── Helpers ──────────────────────────────────────────

    @staticmethod
    def _extract_video_id(url: str) -> str:
        """Extract YouTube video ID from various URL formats."""
        import re
        patterns = [
            r"(?:v=|/v/|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})",
            r"([a-zA-Z0-9_-]{11})",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return url

    @staticmethod
    def _parse_subtitle_json(data) -> str:
        """Parse JSON3 subtitle format from YouTube."""
        if isinstance(data, str):
            return data
        events = data.get("events", [])
        texts = []
        for event in events:
            segs = event.get("segs", [])
            for seg in segs:
                text = seg.get("utf8", "").strip()
                if text:
                    texts.append(text)
        return " ".join(texts)

    @staticmethod
    def _parse_subtitle_file(content: str) -> str:
        """Parse SRT/VTT subtitle content to plain text."""
        import re
        # Remove timestamps and sequence numbers
        lines = content.split("\n")
        text_lines = []
        for line in lines:
            line = line.strip()
            # Skip empty lines, sequence numbers, timestamp lines, VTT headers
            if not line:
                continue
            if line.startswith(("WEBVTT", "NOTE", "Kind:", "Language:")):
                continue
            if re.match(r"^\d+$", line):
                continue
            if re.match(r"\d{2}:\d{2}", line):
                continue
            if "-->" in line:
                continue
            # Clean HTML tags
            line = re.sub(r"<[^>]+>", "", line)
            if line:
                text_lines.append(line)
        return " ".join(text_lines)

    @property
    def stats(self) -> dict:
        return {
            "total_requests": self._request_count,
            "total_failures": self._failure_count,
            "proxy_pool": proxy_manager.stats,
        }


# ── Singleton ────────────────────────────────────────────────
youtube_service = YouTubeService()
'''
}

import os
for path, content in new_files.items():
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Done overwriting python files!")
