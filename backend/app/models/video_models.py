from pydantic import BaseModel, field_validator
from typing import Optional
import re


class VideoRequest(BaseModel):
    video_url: str
    output_format: Optional[str] = "mp3"
    quality: Optional[str] = "192"

    @field_validator("video_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        pattern = re.compile(r"^https?://.+")
        if not pattern.match(v):
            raise ValueError("Invalid URL format")
        return v

    @field_validator("output_format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        allowed = ["mp3", "wav", "aac", "m4a"]
        if v.lower() not in allowed:
            raise ValueError(f"Format must be one of {allowed}")
        return v.lower()


class VideoResponse(BaseModel):
    success: bool
    message: str
    video_id: Optional[str] = None
    title: Optional[str] = None
    duration: Optional[int] = None
    file_path: Optional[str] = None
    file_size: Optional[str] = None