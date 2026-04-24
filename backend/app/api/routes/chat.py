from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.services.rag_service import rag_service

router = APIRouter(prefix="/api/chat", tags=["Chat with Video"])

class ChatRequest(BaseModel):
    video_id: str
    question: str
    format: str = "markdown"  # markdown | latex
    language: str = "auto"

@router.post("/ask")
def ask_video(request: ChatRequest):
    """
    Ask a question about a specific processed video.
    """
    answer = rag_service.answer_question(request.video_id, request.question, output_format=request.format, language=request.language)
    return {"answer": answer}


@router.post("/ask/stream")
def ask_video_stream(request: ChatRequest):
    """Stream the answer text as it is generated."""

    def stream_generator():
        for chunk in rag_service.answer_question_stream(request.video_id, request.question, request.language):
            yield chunk

    return StreamingResponse(stream_generator(), media_type="text/plain")

@router.get("/suggest/{video_id}")
def get_suggested_questions(video_id: str):
    """
    Get 5 suggested questions based on the video context.
    """
    questions = rag_service.generate_suggested_questions(video_id)
    return {"questions": questions}

@router.get("/summary/{video_id}")
def get_summary(video_id: str):
    """
    Generate an optimized revision summary.
    """
    try:
        summary_text = rag_service.generate_summary(video_id)
        return {"summary": summary_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mindmap/{video_id}")
def get_mindmap(video_id: str):
    """
    Generate a Mermaid.js mindmap based on the video context.
    """
    try:
        mindmap_code = rag_service.generate_mindmap(video_id)
        return {"mermaid": mindmap_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

