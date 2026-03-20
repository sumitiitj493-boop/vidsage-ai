from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# the quiz endpoint needs the shared RAG service for accessing the vector
# database and calling the LLM. importing at module level avoids scoping
# issues that previously caused an UnboundLocalError when an inner import
# statement attempted to bind the same name.
from app.services.rag_service import rag_service

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
            # grab all documents and sample evenly; avoids questions clustering
            # at the beginning of long transcripts
            try:
                results = coll.get()
                docs = results.get("documents", []) or []
            except Exception:
                results = coll.get(limit=50)
                docs = results.get("documents", []) or []

            if docs:
                max_docs = 5
                if len(docs) > max_docs:
                    step = len(docs) / max_docs
                    sampled = [docs[int(i * step)] for i in range(max_docs)]
                else:
                    sampled = docs

                context_text = "\n\n".join(sampled)
            else:
                # no vectors stored yet – try fetching a YouTube transcript
                from app.services.youtube_transcript_service import YouTubeTranscriptService
                yt = YouTubeTranscriptService.fetch_transcript(req.transcriptId)
                if yt.get("success") and yt.get("text"):
                    full = yt["text"]
                    # split into 5 roughly equal parts
                    parts = []
                    chunk_len = max(1, len(full) // 5)
                    for i in range(0, len(full), chunk_len):
                        parts.append(full[i : i + chunk_len])
                    context_text = "\n\n".join(parts[:5])
                else:
                    # still nothing; treat as missing
                    raise ValueError(f"no indexed context and no yt transcript for {req.transcriptId}")
        except ValueError as ve:
            # propagate error to client
            raise HTTPException(status_code=404, detail=str(ve))
        except Exception:
            # swallow other errors but context_text may remain empty
            pass

    # ask the LLM to produce questions matching the chosen type/difficulty
    # and return results in a simple JSON array so we can parse options easily
    prompt = (
        f"Generate {req.config.questionCount} {req.config.type} questions "
        f"(difficulty: {req.config.difficulty}) based on the following context:\n{context_text}\n"
        "Return the output as a JSON array where each element has at least a \"question\" "
        "field. For MCQ type include an \"options\" list and a \"answer\" key. "
        "Example: [{\"question\":\"What is X?\", \"options\":[\"A\",\"B\"], \"answer\":\"A\"}]"
    )

    try:
        raw = rag_service.chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
        ).strip()

        questions = []
        # helper to attempt JSON parsing and return None on failure
        import json, re

        def _try_parse(s: str):
            try:
                return json.loads(s)
            except Exception:
                return None

        parsed = _try_parse(raw)
        if parsed is None:
            # try to locate a JSON array or object anywhere in the response
            m = re.search(r"(\[.*\])", raw, re.DOTALL)
            if m:
                parsed = _try_parse(m.group(1))
            else:
                m = re.search(r"(\{.*\})", raw, re.DOTALL)
                if m:
                    parsed = _try_parse(m.group(1))

        # turn whatever we parsed into a list of question dicts
        if isinstance(parsed, list):
            for idx, item in enumerate(parsed[: req.config.questionCount]):
                entry = {"id": f"q{idx+1}", **item}
                entry.setdefault("type", req.config.type if req.config.type != "mixed" else "mcq")
                questions.append(entry)
        elif isinstance(parsed, dict) and parsed.get("questions"):
            for idx, item in enumerate(parsed.get("questions")[: req.config.questionCount]):
                entry = {"id": f"q{idx+1}", **item}
                entry.setdefault("type", req.config.type if req.config.type != "mixed" else "mcq")
                questions.append(entry)
        else:
            # fallback to line-based parsing like before
            lines = [l.strip() for l in raw.split("\n") if l.strip()]
            for idx, line in enumerate(lines[: req.config.questionCount]):
                clean = line.lstrip("0123456789. -")
                q_type = req.config.type if req.config.type != "mixed" else "mcq"
                entry: dict = {"id": f"q{idx+1}", "type": q_type, "question": clean}
                if q_type == "mcq":
                    entry["options"] = ["A", "B", "C", "D"]
                    entry["correctAnswer"] = "A"
                questions.append(entry)

        # if LLM gave an empty list or produced no usable lines, try a simpler retry
        if not questions:
            import logging
            logging.getLogger(__name__).warning(
                "LLM returned empty response for quiz prompt; raw=\"%s\"", raw
            )
            # retry without JSON requirement
            alt_prompt = (
                f"Generate {req.config.questionCount} {req.config.type} questions"
                f" (difficulty: {req.config.difficulty}) based on the following context:\n{context_text}"
            )
            try:
                alt_raw = rag_service.chat_completion(
                    messages=[{"role": "user", "content": alt_prompt}],
                    model="llama-3.3-70b-versatile",
                    temperature=0.7,
                ).strip()
                lines = [l.strip() for l in alt_raw.split("\n") if l.strip()]
                for idx, line in enumerate(lines[: req.config.questionCount]):
                    clean = line.lstrip("0123456789. -")
                    q_type = req.config.type if req.config.type != "mixed" else "mcq"
                    entry: dict = {"id": f"q{idx+1}", "type": q_type, "question": clean}
                    if q_type == "mcq":
                        entry["options"] = ["A", "B", "C", "D"]
                        entry["correctAnswer"] = "A"
                    questions.append(entry)
            except Exception:
                pass

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

        resp = {"quiz": {"title": "Generated Quiz", "questions": questions}}
        resp["debug_raw"] = raw

        # if questions are all placeholders, try suggestions endpoint as a backup
        if all(q.get("question", "").startswith("Sample") for q in questions):
            resp["used_suggestions"] = False
            # generate simple questions the same way /api/chat/suggestions does
            # generate simple questions the same way /api/chat/suggestions does
            try:
                suggs = rag_service.generate_suggested_questions(req.transcriptId)
                # convert to quiz entries
                questions = []
                for idx, text in enumerate(suggs[: req.config.questionCount]):
                    questions.append({
                        "id": f"q{idx+1}",
                        "type": req.config.type if req.config.type != "mixed" else "mcq",
                        "question": text,
                    })
                resp = {"quiz": {"title": "Generated Quiz", "questions": questions}}
                resp["used_suggestions"] = True
                resp["suggestions"] = suggs
            except Exception:
                # keep original placeholders but indicate we tried
                resp["used_suggestions"] = False
        return resp

    except Exception as e:
        # fallback behaviour for tests / missing key or other error.
        # The outer try catches any error during prompt construction or LLM
        # invocation.  Log the exception so we can diagnose why the normal
        # path failed, and also return the error in the response for easier
        # debugging during development.
        import logging
        logging.getLogger(__name__).exception("quiz generation failed")

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
        # include error text in response for debugging
        return {"quiz": {"title": "Generated Quiz", "questions": questions},
                "debug_error": str(e)}
