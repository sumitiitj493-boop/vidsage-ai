from pydantic import BaseModel
from typing import List, Optional


class TranscribeRequest(BaseModel):
    audio_path: str
    language: Optional[str] = None


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