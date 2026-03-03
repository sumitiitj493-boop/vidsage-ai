from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.rag_service import rag_service

router = APIRouter(prefix="/api/chat", tags=["Chat with Video"])

class ChatRequest(BaseModel):
    video_id: str
    question: str

@router.post("/ask")
def ask_video(request: ChatRequest):
    """
    Ask a question about a specific processed video.
    """
    answer = rag_service.answer_question(request.video_id, request.question)
    return {"answer": answer}

@router.get("/suggest/{video_id}")
def get_suggested_questions(video_id: str):
    """
    Get 5 suggested questions based on the video context.
    """
    questions = rag_service.generate_suggested_questions(video_id)
    return {"questions": questions}