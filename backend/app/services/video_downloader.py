import yt_dlp
import asyncio
from pathlib import Path
from typing import Dict, Any


class VideoDownloaderService:

    def __init__(self, download_dir: str = "app/downloads"):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)

    def _get_ydl_opts(self, output_format: str, quality: str) -> Dict:
        return {
            'format': 'bestaudio/best',
            'outtmpl': str(self.download_dir / "%(id)s.%(ext)s"),
            'quiet': True,
            'no_warnings': False,
            'cookiefile': r'D:\semesters\sem4\projects\VidSage\backend\cookies.txt',
            'extractor_args': {
                'youtube': {
                    'skip': ['dash', 'hls'],
                    'player_skip': ['js'],
                }
            },
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            'socket_timeout': 30,
            'retries': 3,
            'fragment_retries': 3,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': output_format,
                'preferredquality': quality,
            }],
        }

    async def download_audio(self, url: str, output_format: str = "mp3", quality: str = "192") -> Dict[str, Any]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self._download_sync,
            url,
            output_format,
            quality,
        )

    def _download_sync(self, url: str, output_format: str, quality: str) -> Dict[str, Any]:
        opts = self._get_ydl_opts(output_format, quality)

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)

        video_id = info.get("id")
        title = info.get("title")
        duration = info.get("duration")

        file_path = self.download_dir / f"{video_id}.{output_format}"
        file_size = self._get_file_size(file_path)

        return {
            "video_id": video_id,
            "title": title,
            "duration": duration,
            "file_path": str(file_path),
            "file_size": file_size,
        }

    @staticmethod
    def get_video_title(url: str) -> str:
        """Fetch video title using yt-dlp without downloading."""
        try:
            with yt_dlp.YoutubeDL({'quiet': True, 'skip_download': True, 'cookiefile': r'D:\semesters\sem4\projects\VidSage\backend\cookies.txt'}) as ydl:
                info = ydl.extract_info(url, download=False)
                return info.get('title', 'Unknown Video')
        except Exception:
            return "Unknown Video"

    def _get_file_size(self, file_path: Path) -> str:

        if not file_path.exists():
            return "Unknown"

        size = file_path.stat().st_size
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.2f} {unit}"
            size /= 1024
        return f"{size:.2f} TB"