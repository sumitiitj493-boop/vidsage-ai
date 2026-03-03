from fastapi import APIRouter, HTTPException
import time
import uuid
import logging
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.models.text_models import TextRequest
from app.services.transcript_cleaner import TranscriptCleaner
from app.services.transcript_quality_checker import TranscriptQualityChecker
from app.services.rag_service import rag_service

router = APIRouter(prefix="/api/text", tags=["Text Processing"])
logger = logging.getLogger(__name__)

@router.post("/process")
async def process_text(request: TextRequest):
    """
    Process raw text input from user (PDF content, Notes, Articles).
    Run validation and basic cleaning pipeline.
    """
    start_time = time.time()
    
    # Generate a unique ID for this text session
    text_id = str(uuid.uuid4())
    print(f"DEBUG: Generated ID: {text_id}") # Confirm generation in console
    
    try:
        logger.info(f"Processing text input: {request.title} (ID: {text_id})")
        
        # 1. Validate Content Relevance & Coherence
        # Even for user text, we check if it's coherent to the title provided 
        # to ensure high quality notes generation later.
        validation_result = TranscriptQualityChecker.validate_transcript(
            request.text, 
            request.title
        )
        
        if not validation_result["is_valid"]:
            logger.warning(f"Text validation failed: {validation_result.get('reason')}")
            # We don't block user input like we do for YouTube auto-captions,
            # but we flag it in the response so UI can show a warning if needed.
        
        # 2. Clean the text (Basic Clean only - fast)
        cleaned = await TranscriptCleaner.clean(
            request.text,
            use_llm=False 
        )
        
        # 3. Create Segments (Split large text into small chunks for RAG)
        # We mimic video segments by splitting text into meaningful chunks
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=300,      # Smaller characters per "segment"
            chunk_overlap=30,    # Small overlap
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        text_chunks = splitter.split_text(cleaned["cleaned_text"])
        
        segments = []
        for chunk in text_chunks:
            segments.append({
                "start": 0.0,
                "end": 0.0,
                "text": chunk
            })

         # 4. Index for RAG (So user can chat with this text)
        try:
            rag_service.index_video(text_id, segments)
        except Exception as e:
            logger.error(f"RAG Indexing Error for text {text_id}: {e}")

        # 5. Structure the response
        return {
            "success": True,
            "source": "user_text",
            "video_id": text_id, # Use 'video_id' key for frontend consistency
            "title": request.title,
            "processing_time_seconds": round(time.time() - start_time, 2),
            "quality_check": validation_result,
            "raw_text": request.text,
            "cleaned_text": cleaned["cleaned_text"],
            "cleaning_steps": cleaned["cleaning_steps"],
            "segments": segments
        }

    except Exception as e:
        logger.error(f"Error processing text input: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
