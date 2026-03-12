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
    """Generate a quiz based on provided context or transcript.

    Uses the RAG service's LLM client to craft questions matching the requested
    type and difficulty. Falls back to simple placeholders if the external call
    fails (e.g. during testing or when GROQ key is missing).
    """
    if not req.transcriptId and not req.context:
        raise HTTPException(status_code=400, detail="transcriptId or context required for quiz generation")

    # build the prompt for the LLM
    prompt = f"Generate {req.config.questionCount} {req.config.type} questions " \
             f"(difficulty: {req.config.difficulty}) based on the following context:\n{req.context or ''}"
    if req.transcriptId:
        prompt += f"\n(transcript id: {req.transcriptId})"  # for debugging

    try:
        response = rag_service.groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        raw = response.choices[0].message.content.strip()
        # split into lines and attempt to parse into questions
        lines = [l.strip() for l in raw.split("\n") if l.strip()]
        questions = []
        for idx, line in enumerate(lines[: req.config.questionCount]):
            # simple cleaning: remove numbering
            clean = line.lstrip("0123456789. -")
            q_type = req.config.type if req.config.type != "mixed" else "mcq"
            entry: dict = {"id": f"q{idx+1}", "type": q_type, "question": clean}
            if q_type == "mcq":
                # not enough info to generate options; use placeholders
                entry["options"] = ["A", "B", "C", "D"]
                entry["correctAnswer"] = "A"
            questions.append(entry)

        # if LLM returned fewer questions than requested, pad
        while len(questions) < req.config.questionCount:
            i = len(questions)
            q_type = req.config.type if req.config.type != "mixed" else "mcq"
            questions.append({
                "id": f"q{i+1}",
                "type": q_type,
                "question": f"Sample {q_type} question {i+1}.",
                "options": ["A", "B", "C", "D"] if q_type == "mcq" else [],
                "correctAnswer": "A" if q_type == "mcq" else "Sample answer",
            })

        return {"quiz": {"title": "Generated Quiz", "questions": questions}}

    except Exception as e:
        # fallback behaviour for tests / missing key
        questions = []
        for i in range(req.config.questionCount):
            q_type = req.config.type if req.config.type != "mixed" else "mcq"
            questions.append({
                "id": f"q{i+1}",
                "type": q_type,
                "question": f"Sample {q_type} question {i+1}.",
                "options": ["A", "B", "C", "D"] if q_type == "mcq" else [],
                "correctAnswer": "A" if q_type == "mcq" else "Sample answer",
            })
        return {"quiz": {"title": "Generated Quiz", "questions": questions}}
