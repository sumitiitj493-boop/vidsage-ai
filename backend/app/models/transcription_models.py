from pydantic import BaseModel
from typing import List, Optional


class TranscribeRequest(BaseModel):
    audio_path: str
    language: Optional[str] = None
    english_only: bool = False
    translate_to_english: bool = False


class SegmentResponse(BaseModel):
    start: float
    end: float
    text: str


class TranscribeResponse(BaseModel):
    success: bool
    text: str
    segments: List[SegmentResponse]
    language: str
    duration: float