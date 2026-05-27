"""
VidSage — API Rate Limiter Middleware

Protects against:
- Brute-force auth attempts
- API abuse / scraping
- Resource exhaustion (transcription, uploads)

Uses sliding window counter with Redis for distributed rate limiting.
Falls back to in-memory if Redis is unavailable.
"""

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


@dataclass
class RateLimitRule:
    """Defines a rate limit for a specific path pattern."""
    path_prefix: str
    requests: int          # max requests
    window_seconds: int    # per this many seconds
    key: str = "ip"        # "ip" or "user" (if authenticated)

    @property
    def description(self) -> str:
        return f"{self.requests} requests per {self.window_seconds}s on {self.path_prefix}"


# ── Default rate limit rules ─────────────────────────────────
DEFAULT_RULES = [
    # Auth endpoints — strict
    RateLimitRule(path_prefix="/api/auth/login", requests=5, window_seconds=60, key="ip"),
    RateLimitRule(path_prefix="/api/auth/", requests=20, window_seconds=60, key="ip"),

    # Upload / transcription — medium (expensive operations)
    RateLimitRule(path_prefix="/api/upload", requests=10, window_seconds=300, key="ip"),
    RateLimitRule(path_prefix="/api/transcription", requests=10, window_seconds=300, key="ip"),

    # Chat — medium
    RateLimitRule(path_prefix="/api/chat", requests=30, window_seconds=60, key="ip"),

    # Video processing — strict (most expensive)
    RateLimitRule(path_prefix="/api/video", requests=15, window_seconds=600, key="ip"),

    # Global API limit
    RateLimitRule(path_prefix="/api/", requests=100, window_seconds=60, key="ip"),

    # Health check — generous
    RateLimitRule(path_prefix="/health", requests=60, window_seconds=60, key="ip"),
]


class InMemoryRateLimiter:
    """Simple sliding window counter (per-process)."""

    def __init__(self):
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._cleanup_interval = 60
        self._last_cleanup = time.time()

    async def is_limited(self, key: str, rule: RateLimitRule) -> tuple[bool, dict]:
        """
        Returns (is_limited: bool, headers: dict).
        Headers include X-RateLimit-* for client visibility.
        """
        async with self._lock:
            now = time.time()
            window_key = f"{key}:{rule.path_prefix}"

            # Cleanup old entries
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup(now)
                self._last_cleanup = now

            # Remove expired entries
            cutoff = now - rule.window_seconds
            self._windows[window_key] = [
                t for t in self._windows[window_key] if t > cutoff
            ]

            current_count = len(self._windows[window_key])
            remaining = max(0, rule.requests - current_count)
            reset_time = int(now + rule.window_seconds) if current_count > 0 else int(now + rule.window_seconds)

            headers = {
                "X-RateLimit-Limit": str(rule.requests),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(reset_time),
            }

            if current_count >= rule.requests:
                headers["Retry-After"] = str(rule.window_seconds)
                return True, headers

            # Record this request
            self._windows[window_key].append(now)
            return False, headers

    def _cleanup(self, now: float):
        """Remove all expired entries."""
        for key in list(self._windows.keys()):
            # Remove entries older than max window (10 min)
            self._windows[key] = [t for t in self._windows[key] if now - t < 600]
            if not self._windows[key]:
                del self._windows[key]


class RedisRateLimiter:
    """Redis-based sliding window counter (works across multiple workers/instances)."""

    def __init__(self, redis_url: str):
        self._redis_url = redis_url
        self._redis = None
        self._local = InMemoryRateLimiter()  # fallback

    async def _get_redis(self):
        if self._redis is None:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(self._redis_url)
                await self._redis.ping()
                logger.info("Rate limiter connected to Redis")
            except Exception as e:
                logger.warning(f"Redis unavailable for rate limiting, using in-memory fallback: {e}")
                self._redis = None
        return self._redis

    async def is_limited(self, key: str, rule: RateLimitRule) -> tuple[bool, dict]:
        redis = await self._get_redis()
        if redis is None:
            return await self._local.is_limited(key, rule)

        try:
            import time as _time
            now = _time.time()
            window_key = f"ratelimit:{key}:{rule.path_prefix}"

            pipe = redis.pipeline()
            pipe.zremrangebyscore(window_key, 0, now - rule.window_seconds)
            pipe.zcard(window_key)
            pipe.zadd(window_key, {str(now): now})
            pipe.expire(window_key, rule.window_seconds + 10)

            results = await pipe.execute()
            current_count = results[1]
            remaining = max(0, rule.requests - current_count)

            headers = {
                "X-RateLimit-Limit": str(rule.requests),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(int(now + rule.window_seconds)),
            }

            if current_count >= rule.requests:
                headers["Retry-After"] = str(rule.window_seconds)
                return True, headers

            return False, headers

        except Exception as e:
            logger.warning(f"Redis rate limit error, falling back to in-memory: {e}")
            return await self._local.is_limited(key, rule)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    FastAPI middleware that enforces rate limiting on all requests.
    """

    def __init__(self, app, rules: Optional[list[RateLimitRule]] = None, redis_url: Optional[str] = None):
        super().__init__(app)
        self.rules = rules or DEFAULT_RULES

        if redis_url:
            self._limiter = RedisRateLimiter(redis_url)
            logger.info("Rate limiter: Redis mode")
        else:
            self._limiter = InMemoryRateLimiter()
            logger.info("Rate limiter: In-memory mode")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for non-API paths (static files, etc.)
        path = request.url.path

        # Find matching rule (most specific first)
        matched_rule = None
        for rule in sorted(self.rules, key=lambda r: -len(r.path_prefix)):
            if path.startswith(rule.path_prefix):
                matched_rule = rule
                break

        if matched_rule is None:
            return await call_next(request)

        # Build rate limit key
        client_ip = self._get_client_ip(request)
        key = f"{matched_rule.key}:{client_ip}"

        # Check rate limit
        is_limited, headers = await self._limiter.is_limited(key, matched_rule)

        if is_limited:
            logger.warning(f"Rate limited: {client_ip} on {path} ({matched_rule.description})")
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": matched_rule.window_seconds,
                },
            )
            for k, v in headers.items():
                response.headers[k] = v
            return response

        # Continue with request
        response = await call_next(request)

        # Add rate limit headers to response
        for k, v in headers.items():
            response.headers[k] = v

        return response

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Extract real client IP, respecting proxy headers."""
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            # First IP in the chain is the original client
            return forwarded.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP", "")
        if real_ip:
            return real_ip.strip()

        if request.client:
            return request.client.host

        return "unknown"