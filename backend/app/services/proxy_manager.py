"""
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
