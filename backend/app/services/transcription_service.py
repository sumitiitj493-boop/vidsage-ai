from faster_whisper import WhisperModel
from pathlib import Path
from typing import Optional, List
from dataclasses import dataclass
import logging
import re

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
        import multiprocessing
        
        import os
        os.environ["OMP_NUM_THREADS"] = str(max(1, multiprocessing.cpu_count() // 2))

        threads = max(1, multiprocessing.cpu_count())
        # Use more workers to parallel-process VAD segments (MASSIVE CPU BOOST)
        workers = max(2, multiprocessing.cpu_count() // 2) 
        
        self.model = WhisperModel(
            model_size,
            device=device,
            compute_type=compute_type,
            cpu_threads=threads,
            num_workers=workers
        )
        self.model_size = model_size
        logger.info("Model loaded successfully!")

    def _filter_english_text(self, text: str) -> str:
        # Keep only ASCII letters/digits/basic punctuation/spaces/newlines
        return re.sub(r"[^A-Za-z0-9\-\.,;:!\?\(\)\[\]\'\"\s]", "", text)

    def _translate_to_english(self, text: str) -> str:
        # Placeholder translation: if non-ascii content exists, drop non-latin chars.
        # You can replace this method with a real translator backend later.
        if re.search(r"[^\x00-\x7F]", text):
            logger.info("Transcription contains non-ASCII content; applying fallback English translation/cleanup.")
            return self._filter_english_text(text)
        return text

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        progress_callback=None,
        english_only: bool = False,
        translate_to_english: bool = False,
        force_accuracy: bool = False
    ) -> TranscriptionResult:

        path = Path(audio_path)

        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        # Debug: Indicate start of transcription loop
        print(f"[DEBUG] Starting transcription loop for: {audio_path} (High Accuracy: {force_accuracy})", flush=True)

        segments_generator, info = self.model.transcribe(
            str(audio_path),
            language=language,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=2000 if force_accuracy else 500),
            beam_size=5 if force_accuracy else 1, # Use beam search for higher accuracy when forced
            condition_on_previous_text=force_accuracy # Maintain context for better accuracy when forced
        )

        segments = []
        full_text = []

        # Estimate total duration for progress (fallback to 0 if not available) 
        total_duration = getattr(info, 'duration', 0) or 0
        last_percent = -1

        # Always print 0% at start
        if progress_callback:
            progress_callback(0)

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

        final_text = " ".join(full_text)

        if translate_to_english:
            final_text = self._translate_to_english(final_text)
            # Also update segments text similarly
            for seg in segments:
                seg.text = self._translate_to_english(seg.text)

        if english_only:
            final_text = self._filter_english_text(final_text)
            for seg in segments:
                seg.text = self._filter_english_text(seg.text)

        # Remove left-over repeated whitespace
        final_text = re.sub(r"\s+", " ", final_text).strip()

        return TranscriptionResult(
            text=final_text,
            segments=segments,
            language=info.language,
            duration=info.duration
        )