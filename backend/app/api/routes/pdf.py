from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.pdf_service import PDFService
from app.services.rag_service import rag_service
import uuid
import logging

router = APIRouter(prefix="/api/pdf", tags=["PDF Operations"])
logger = logging.getLogger(__name__)

@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Uploads a PDF, extracts text, and indexes it for RAG chatting.
    Returns a 'pdf_id' that you should use as 'video_id' in the chat API.
    """
    # 1. Validation
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    try:
        # Generate a unique ID for this PDF (e.g., "pdf_a1b2c3d4")
        pdf_id = f"pdf_{uuid.uuid4().hex[:8]}"
        logger.info(f"Processing PDF: {file.filename} (ID: {pdf_id})")

        # 2. Read content
        content = await file.read()

        # 3. Extract Text using our Service
        segments = PDFService.extract_text(content)

        if not segments:
             raise HTTPException(status_code=400, detail="Could not extract text from PDF. It might be empty or scanned (images only).")

        # 4. Index into RAG (We reuse the existing 'index_video' function!)
        # The RAG service treats 'video_id' as just a collection name, so passing a PDF ID works perfectly.
        rag_service.index_video(video_id=pdf_id, segments=segments)

        return {
            "success": True,
            "pdf_id": pdf_id,  # Frontend should store this to chat later
            "filename": file.filename,
            "pages": len(segments),
            "message": "PDF processed successfully! Ready to chat."
        }

    except Exception as e:
        logger.error(f"PDF Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
