"""
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
