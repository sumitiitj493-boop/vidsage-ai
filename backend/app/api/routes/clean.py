"""
Transcript Cleaning Routes - VidSage Phase 5
Standalone endpoint to clean any transcript text
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.transcript_cleaner import TranscriptCleaner

router = APIRouter(prefix="/api/clean", tags=["Transcript Cleaning"])


class CleanRequest(BaseModel):
    text: str
    use_basic: Optional[bool] = True
    use_dictionary: Optional[bool] = True
    use_llm: Optional[bool] = True


class CleanResponse(BaseModel):
    success: bool
    raw_text: str
    cleaned_text: str
    cleaning_steps: list


@router.post("/", response_model=CleanResponse)
async def clean_transcript(request: CleanRequest):
    """
    Clean a raw transcript using the 3-layer pipeline:
    1. Basic (regex) -> 2. Custom Dictionary -> 3. LLM (Groq)
    """
    try:
        result = TranscriptCleaner.clean(
            text=request.text,
            use_basic=request.use_basic,
            use_dictionary=request.use_dictionary,
            use_llm=request.use_llm,
        )

        return CleanResponse(
            success=True,
            raw_text=result["raw_text"],
            cleaned_text=result["cleaned_text"],
            cleaning_steps=result["cleaning_steps"],
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleaning failed: {str(e)}")
