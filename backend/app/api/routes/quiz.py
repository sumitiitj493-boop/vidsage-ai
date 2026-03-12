from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/quiz", tags=["Quiz"])


class QuizConfig(BaseModel):
    type: str  # mcq | subjective | numerical | mixed
    difficulty: str  # easy | medium | hard | mixed
    questionCount: int


class QuizRequest(BaseModel):
    transcriptId: str | None = None
    context: str | None = None
    config: QuizConfig


@router.post("/generate")
def generate_quiz(req: QuizRequest):
    """Generate a simple quiz structure. This is a lightweight implementation that
    returns dummy questions if no intelligent generator is available.
    """
    if not req.transcriptId and not req.context:
        raise HTTPException(status_code=400, detail="transcriptId or context required for quiz generation")

    # Basic placeholder quiz generator. For demonstration we create generic questions.
    questions = []
    for i in range(req.config.questionCount):
        q_type = req.config.type if req.config.type != "mixed" else "mcq"
        question_text = f"Sample {q_type} question {i+1}."
        question = {
            "id": f"q{i+1}",
            "type": q_type,
            "question": question_text,
            "options": ["A", "B", "C", "D"] if q_type == "mcq" else [],
            "correctAnswer": "A" if q_type == "mcq" else "Sample answer",
        }
        questions.append(question)

    return {"quiz": {"title": "Generated Quiz", "questions": questions}}
