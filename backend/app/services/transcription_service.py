from faster_whisper import WhisperModel
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    text: str
    segments: List[TranscriptSegment]
    language: str
    duration: float


class TranscriptionService:

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8"
    ):
        logger.info(f"Loading Faster-Whisper model: {model_size}")
        self.model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type
        )
        self.model_size = model_size
        logger.info("Model loaded successfully!")

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        progress_callback=None
    ) -> TranscriptionResult:

        path = Path(audio_path)

        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        segments_generator, info = self.model.transcribe(
            str(audio_path),
            language=language,
            vad_filter=True
        )

        segments = []
        full_text = []

        # Estimate total duration for progress (fallback to 0 if not available)
        total_duration = getattr(info, 'duration', 0) or 0
        last_percent = -1

        for segment in segments_generator:
            segments.append(
                TranscriptSegment(
                    start=segment.start,
                    end=segment.end,
                    text=segment.text.strip()
                )
            )
            full_text.append(segment.text.strip())

            # Progress reporting
            if total_duration > 0 and progress_callback:
                percent = int(100 * min(segment.end, total_duration) / total_duration)
                if percent != last_percent and percent % 5 == 0:
                    progress_callback(percent)
                    last_percent = percent

        # Ensure 100% is reported
        if progress_callback:
            progress_callback(100)

        return TranscriptionResult(
            text=" ".join(full_text),
            segments=segments,
            language=info.language,
            duration=info.duration
        )