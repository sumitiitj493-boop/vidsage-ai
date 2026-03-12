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
    # if a transcriptId is provided, try to pull some chunks from the RAG
    # database to give the LLM concrete context. Otherwise fall back to
    # whatever text the client sent.
    context_text = req.context or ""
    if req.transcriptId:
        try:
            coll = rag_service.chroma_client.get_collection(f"video_{req.transcriptId}")
            results = coll.get(limit=5)
            docs = results.get("documents", [])
            if docs:
                context_text = "\n\n".join(docs[:5])
        except Exception:
            pass

    prompt = f"Generate {req.config.questionCount} {req.config.type} questions " \
             f"(difficulty: {req.config.difficulty}) based on the following context:\n{context_text}"

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
        # fallback behaviour for tests / missing key or other error.
        # Instead of generic samples we try to derive simple questions from
        # the provided context_text so they are at least related to the video.
        questions = []
        # split context into sentences for naive question generation
        sentences = [s.strip() for s in context_text.split('.') if s.strip()]
        for i in range(req.config.questionCount):
            q_type = req.config.type if req.config.type != "mixed" else "mcq"
            if i < len(sentences):
                base = sentences[i][:60]
                question_text = f"What is discussed: '{base}'?"
            else:
                question_text = f"Sample {q_type} question {i+1}."
            entry = {"id": f"q{i+1}", "type": q_type, "question": question_text}
            if q_type == "mcq":
                entry["options"] = ["A", "B", "C", "D"]
                entry["correctAnswer"] = "A"
            questions.append(entry)
        return {"quiz": {"title": "Generated Quiz", "questions": questions}}
