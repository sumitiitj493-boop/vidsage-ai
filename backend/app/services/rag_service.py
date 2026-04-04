import json
import logging
from typing import Any, Dict, Generator, List, Optional

import chromadb
import requests
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from groq import Groq

from app.config import settings

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    """Raised when the Groq API rate limit has been reached."""

    def __init__(self, message: str, retry_after_seconds: Optional[int] = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds

class RAGService:
    def __init__(self):
        # 1. Initialize the "Brain" (Embeddings)
        # We switch to a Multilingual model to support Hindi/Hinglish/English mix
        # 'paraphrase-multilingual-MiniLM-L12-v2' (Multilingual, 384 dim, ~470MB)
        logger.info("Loading RAG Embedding Model (Multilingual)...")
        self.embedding_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2') 
        
        # 2. Initialize "Memory" (ChromaDB)
        # Persist data to ./chroma_db folder so it survives restarts
        logger.info(f"Connecting to ChromaDB at: {settings.CHROMA_DB_DIR}")
        self.chroma_client = chromadb.PersistentClient(path=settings.CHROMA_DB_DIR)
        
        # 3. Initialize "Logic" (LLM)
        # Groq needs an API key; if absent we will fallback to OpenRouter.
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY) if settings.GROQ_API_KEY else None
        self.groq_enabled = bool(settings.GROQ_API_KEY)

        # OpenRouter / OpenAI-compatible fallback
        self.openrouter_key = settings.OPENROUTER_API_KEY
        self.openrouter_url = settings.OPENROUTER_URL.rstrip("/")
        self.openrouter_model = settings.OPENROUTER_MODEL
        self.openrouter_timeout = settings.OPENROUTER_TIMEOUT
        self.openrouter_enabled = bool(self.openrouter_key)

    def _build_strict_latex_prompt(self, base_prompt: str) -> str:
        return f"""
{base_prompt}

IMPORTANT INSTRUCTIONS (Use for notebook-quality math notes):
- Output must be valid LaTeX and Markdown only.
- Use `\\text{...}` for prose inside LaTeX math segments if needed.
- For formulas, use LaTeX math delimiters (`$...$` inline, `$$...$$` block).
- Prefer standalone `$$...$$` blocks for any non-trivial equation or derivation.
- Never split a single equation across multiple lines or emit unmatched dollar signs.
- Provide section headings, bullet points, and clean structure.
- Do NOT include raw segment tags like "Segment (0:00)" repeated.
- Do not output Hindi or other mix-language in this mode; use English only.
- If you cannot answer, output `\\text{{Unable to generate notes.}}`.
"""

    def _messages_to_prompt(self, messages: List[Dict[str, Any]]) -> str:
        """Convert a chat-style messages list into a single string prompt."""
        prompt_lines: List[str] = []
        for m in messages:
            role = str(m.get("role", "user")).strip().capitalize()
            content = str(m.get("content", ""))
            prompt_lines.append(f"{role}: {content}")
        return "\n".join(prompt_lines)

    def _is_rate_limit_error(self, error: Exception) -> bool:
        msg = str(error).lower()
        if "429" in msg or "rate limit" in msg or "quota" in msg or "rate_limit" in msg:
            return True
        status = getattr(error, "status_code", None) or getattr(error, "code", None)
        try:
            if status and int(status) == 429:
                return True
        except Exception:
            pass
        return False

    def _openrouter_generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str:
        """Generate text via an OpenAI-compatible OpenRouter endpoint."""
        if not self.openrouter_enabled:
            raise RuntimeError(
                "OpenRouter fallback is disabled. Set OPENROUTER_API_KEY in your env to enable."
            )

        # OpenRouter may reject requests that are too large. Cap prompt size to avoid 400 errors.
        max_prompt_chars = 15000
        if len(prompt) > max_prompt_chars:
            logger.warning(
                "Truncating OpenRouter prompt from %d to %d chars to avoid request errors.",
                len(prompt),
                max_prompt_chars,
            )
            prompt = prompt[:max_prompt_chars]

        payload: Dict[str, Any] = {
            "model": model or self.openrouter_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        headers = {
            "Authorization": f"Bearer {self.openrouter_key}",
            "Content-Type": "application/json",
        }

        resp = requests.post(
            f"{self.openrouter_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=self.openrouter_timeout,
        )
        try:
            resp.raise_for_status()
        except requests.HTTPError as e:
            logger.error(
                "OpenRouter request failed (status=%s): %s",
                resp.status_code,
                resp.text,
            )
            raise RuntimeError(
                f"OpenRouter request failed (status={resp.status_code}): {resp.text}"
            ) from e

        data = resp.json()
        choices = data.get("choices") or []
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""

    def _openrouter_generate_stream(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Generator[str, None, None]:
        """Stream output from an OpenAI-compatible OpenRouter endpoint."""
        if not self.openrouter_enabled:
            raise RuntimeError(
                "OpenRouter fallback is disabled. Set OPENROUTER_API_KEY in your env to enable."
            )

        # OpenRouter may reject requests that are too large. Cap prompt size to avoid request errors.
        max_prompt_chars = 15000
        if len(prompt) > max_prompt_chars:
            logger.warning(
                "Truncating OpenRouter prompt from %d to %d chars to avoid request errors.",
                len(prompt),
                max_prompt_chars,
            )
            prompt = prompt[:max_prompt_chars]

        payload: Dict[str, Any] = {
            "model": model or self.openrouter_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        headers = {
            "Authorization": f"Bearer {self.openrouter_key}",
            "Content-Type": "application/json",
        }

        resp = requests.post(
            f"{self.openrouter_url}/chat/completions",
            json=payload,
            headers=headers,
            timeout=self.openrouter_timeout,
            stream=True,
        )
        try:
            resp.raise_for_status()
        except requests.HTTPError as e:
            logger.error(
                "OpenRouter stream request failed (status=%s): %s",
                resp.status_code,
                resp.text,
            )
            raise RuntimeError(
                f"OpenRouter request failed (status={resp.status_code}): {resp.text}"
            ) from e

        for raw_line in resp.iter_lines(decode_unicode=True):
            if not raw_line:
                continue
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith("data:"):
                payload_text = line[len("data:"):].strip()
                if payload_text == "[DONE]":
                    break
                try:
                    item = json.loads(payload_text)
                except Exception:
                    continue
                for choice in item.get("choices", []):
                    delta = choice.get("delta", {})
                    if not delta:
                        continue
                    chunk = delta.get("content") or delta.get("text")
                    if chunk:
                        yield chunk

    def _chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        model: str = "llama-3.3-70b-versatile",
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
        force_local: bool = False,
    ) -> Generator[str, None, None]:
        """Stream text using Groq (single chunk) or OpenRouter (live)."""
        prompt = self._messages_to_prompt(messages)

        # Try Groq first with robust model fallback
        if self.groq_enabled and self.groq_client:
            default_groq_models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"]
            models_to_try = [model] + [m for m in default_groq_models if m != model]
            
            for current_model in models_to_try:
                try:
                    response = self.groq_client.chat.completions.create(
                        model=current_model, messages=messages, temperature=temperature
                    )
                    yield response.choices[0].message.content
                    return
                except Exception as e:
                    if self._is_rate_limit_error(e):
                        logger.warning(f"Groq rate limit hit on {current_model}; trying next. ({e})")
                        continue
                    else:
                        logger.warning(f"Groq call failed on {current_model}; trying next. ({e})")
                        continue

        # Final attempt: fallback to OpenRouter streaming.
        # OpenRouter uses a different model namespace than Groq (e.g. gpt-4o-mini).
        yield from self._openrouter_generate_stream(
            prompt, model=self.openrouter_model, temperature=temperature, max_tokens=max_tokens
        )

    def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        model: str = "llama-3.3-70b-versatile",
        temperature: float = 0.1,
        max_tokens: Optional[int] = None,
        force_local: bool = False,
    ) -> str:
        """Generate text using Groq, with optional local Ollama fallback."""
        return "".join(
            self._chat_completion_stream(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                force_local=force_local,
            )
        )

    def index_video(self, video_id: str, segments: list[dict]):
        """
        TEACH MODE: Chunks the transcript SEGMENTS and saves it to Vector DB with timestamps.
        segments format: [{"text": "...", "start": 0.0, "end": 10.0}, ...]
        """
        logger.info(f"Indexing video {video_id} for RAG with timestamps...")
        
        chunks = []
        metadatas = []
        
        current_chunk_text = []
        current_chunk_start = 0.0
        current_chunk_len = 0
        
        # 1. Group segments into chunks (~500 chars)
        for i, seg in enumerate(segments):
            text = seg.get("text", "")
            start = seg.get("start", 0.0)
            end = seg.get("end", 0.0)
            
            if not current_chunk_text:
                current_chunk_start = start
            
            current_chunk_text.append(text)
            current_chunk_len += len(text)
            
            # If chunk is big enough or this is the last segment
            if current_chunk_len >= 500 or i == len(segments) - 1:
                full_text = " ".join(current_chunk_text)
                chunks.append(full_text)
                metadatas.append({
                    "start": current_chunk_start,
                    "end": end
                })
                
                # Reset for next chunk
                current_chunk_text = []
                current_chunk_len = 0

        if not chunks:
            logger.warning(f"No chunks created for video {video_id}")
            return
            
        # B. Embeddings (Text -> Numbers)
        embeddings = self.embedding_model.encode(chunks).tolist()
        
        # C. Storage (Save to ChromaDB)
        collection_name = f"video_{video_id}"
        
        # Reset collection if it exists (re-indexing)
        try:
            self.chroma_client.delete_collection(collection_name)
        except:
            pass
            
        collection = self.chroma_client.create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"} # Similarity metric
        )
        
        collection.add(
            documents=chunks,
            embeddings=embeddings,
            ids=[f"chunk_{i}" for i in range(len(chunks))],
            metadatas=metadatas
        )
        logger.info(f"Indexed {len(chunks)} chunks for video {video_id}")

    def _format_timestamp(self, seconds: float) -> str:
        """Converts 125.5 -> 2:05 or 1:02:05"""
        try:
            seconds = int(float(seconds))
            m, s = divmod(seconds, 60)
            h, m = divmod(m, 60)
            if h > 0:
                return f"{h}:{m:02d}:{s:02d}"
            return f"{m}:{s:02d}"
        except:
            return "0:00"

    def answer_question(self, video_id: str, question: str, output_format: str = "markdown", language: str = "auto") -> str:
        """
        EXAM MODE: Retrieves context and answers the question.
        Returns the answer or an error message.
        """
        try:
            collection_name = f"video_{video_id}"
            
            try:
                collection = self.chroma_client.get_collection(collection_name)
            except:
                return "Analysis not found for this video. Please process it first."
                
            # 1. Retrieval (Find relevant chunks)
            # 1.1 Embed the question
            query_embedding = self.embedding_model.encode(question).tolist()
            
            # 1.2 Query db
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=5 
            )
            
            docs = results['documents'][0]
            metas = results['metadatas'][0] if results['metadatas'] else []

            if not docs:
                return "No relevant context found in this video."

            is_pdf = video_id.startswith("pdf_")

            # Format context
            context_pieces = []
            has_valid_timestamps = False
            has_page_numbers = False
            for i, doc in enumerate(docs):
                meta = metas[i] if i < len(metas) else {}
                start = meta.get('start', 0)
                end = meta.get('end', 0)
                
                # Check if it's a PDF
                if is_pdf:
                    has_page_numbers = True
                    context_pieces.append(f"[Page: {int(start)}]\n{doc}")
                # Check if this is a dummy timestamp (0,0) from text input
                elif start > 0 or end > 0:
                    has_valid_timestamps = True
                    start_str = self._format_timestamp(start)
                    end_str = self._format_timestamp(end)
                    context_pieces.append(f"[Time: {start_str}-{end_str}]\n{doc}")
                else:
                    # For Text Input: Just return text without [Time...] tag
                    context_pieces.append(f"{doc}")

            context = "\n\n".join(context_pieces)
            
            # Dynamic Citation Rule based on content type
            if is_pdf and has_page_numbers:
                citation_rule = """
            5. CITATIONS (CRITICAL):
               - You MUST cite the page number for key facts IF they are available in context.
               - Format: (Page: X)
               - Example: "The CPU fetches instructions (Page: 2)..."
                """
            elif has_valid_timestamps:
                citation_rule = """
            5. CITATIONS (CRITICAL):
               - You MUST cite the timestamp for key facts IF they are available in context.
               - Format: (MM:SS-MM:SS)
               - Example: "The CPU fetches instructions (02:30-02:45)..."
                """
            else:
                citation_rule = ""

            if language.lower() == "hindi":
                lang_instruction = "You MUST answer strictly in Hindi (Devanagari script), regardless of the language the user asked in."
            elif language.lower() == "hinglish":
                lang_instruction = "You MUST answer strictly in Hinglish (WhatsApp style Hindi written in English alphabet), regardless of the language the user asked in."
            elif language.lower() == "english":
                lang_instruction = "You MUST answer strictly in professional English, regardless of the language the user asked in."
            else:
                lang_instruction = """- **DETECT** the language of the STUDENT QUESTION (English, Hindi, or Hinglish/Romanized Hindi).
            - **ANSWER** in the SAME language and style.
              - If the user asks in Hindi (Devanagari), answer in Hindi (Devanagari).
              - If the user asks in "Hinglish" (WhatsApp style like 'ye kaise hua'), answer in Hinglish.
              - If the user asks in professional English, answer in professional English."""

            # 2. Augmentation (Create Prompt)
            prompt = f"""
            You are an expert AI Tutor. Your goal is to explain concepts clearly using the provided context segments.

            CRITICAL INSTRUCTION - LANGUAGE & STYLE:
            {lang_instruction}
            
            CRITICAL INSTRUCTION - HANDLING ERRORS:
            1. **Transcript Errors**: The transcript is imperfect (e.g., "one new man" -> "Von Neumann"). mentally correct these errors.
            2. **User Question Accuracy**: 
               - If the user asks a question with a minor typo, answer it.
               - If the user asks about a DIFFERENT person or concept, start "This topic is not covered in the context." (Or the equivalent in the user's language).

            STRICT RULES:
            1. Answer based on the **available CONTEXT** chunks below.
            2. If the answer is not in the context, do NOT hallucinate. State that the topic is not found.
            3. VISUALIZATION:
               - Provide an ASCII diagram ONLY for complex data structures.
            4. EXPLANATION:\n               - Explain algorithms step-by-step.\n               - Be detailed and comprehensive.\n            5. MATHEMATICS (CRITICAL):\n               - ALL mathematical formulas, variables, equations, and Greek letters MUST be formatted in LaTeX mode.\n               - Wrap ALL inline math in single dollar signs (e.g. \\(a, b, \\\\alpha)\\\$).\n               - Wrap ALL block/standalone equations in double dollar signs (e.g. \\$\\\^T x_p + b = 0\\$\\\$).\n               - NEVER output plain text math formulas.
            {citation_rule}

            CONTEXT:
            {context}

            STUDENT QUESTION: {question}

            AI TUTOR ANSWER:
            """
            
            if output_format.lower() == "latex":
                prompt = self._build_strict_latex_prompt(prompt)

            answer = self.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.1,  # Strict mode
            )

            if output_format.lower() == "latex":
                # Ensure it is LaTeX-friendly by wrapping plain text in \text{}
                return answer.strip()

            return answer
            
        except Exception as e:
            logger.error(f"Error answering question for video {video_id}: {str(e)}")
            return f"Error occurred while generating answer: {str(e)}"

    def answer_question_stream(self, video_id: str, question: str, language: str = "auto") -> Generator[str, None, None]:
        """Stream the answer text as it is generated."""
        try:
            collection_name = f"video_{video_id}"

            try:
                collection = self.chroma_client.get_collection(collection_name)
            except:
                yield "Analysis not found for this video. Please process it first."
                return

            # 1. Retrieval (Find relevant chunks)
            query_embedding = self.embedding_model.encode(question).tolist()
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=5,
            )

            docs = results["documents"][0]
            metas = results["metadatas"][0] if results.get("metadatas") else []

            if not docs:
                yield "No relevant context found in this video."
                return

            is_pdf = video_id.startswith("pdf_")
            
            # Format context
            context_pieces = []
            has_valid_timestamps = False
            has_page_numbers = False
            
            for i, doc in enumerate(docs):
                meta = metas[i] if i < len(metas) else {}
                start = meta.get("start", 0)
                end = meta.get("end", 0)

                if is_pdf:
                    has_page_numbers = True
                    context_pieces.append(f"[Page: {int(start)}]\n{doc}")
                elif start > 0 or end > 0:
                    has_valid_timestamps = True
                    start_str = self._format_timestamp(start)
                    end_str = self._format_timestamp(end)
                    context_pieces.append(f"[Time: {start_str}-{end_str}]\n{doc}")
                else:
                    context_pieces.append(f"{doc}")

            context = "\n\n".join(context_pieces)

            if language.lower() == "hindi":
                lang_instruction = "You MUST answer strictly in Hindi (Devanagari script), regardless of the language the user asked in."
            elif language.lower() == "hinglish":
                lang_instruction = "You MUST answer strictly in Hinglish (WhatsApp style Hindi written in English alphabet), regardless of the language the user asked in."
            elif language.lower() == "english":
                lang_instruction = "You MUST answer strictly in professional English, regardless of the language the user asked in."
            else:
                lang_instruction = """- **DETECT** the language of the STUDENT QUESTION (English, Hindi, or Hinglish/Romanized Hindi).
            - **ANSWER** in the SAME language and style.
              - If the user asks in Hindi (Devanagari), answer in Hindi (Devanagari).
              - If the user asks in "Hinglish" (WhatsApp style like 'ye kaise hua'), answer in Hinglish.
              - If the user asks in professional English, answer in professional English."""

            if is_pdf and has_page_numbers:
                citation_rule = """
            5. CITATIONS (CRITICAL):
               - You MUST cite the page number for key facts IF they are available in context.
               - Format: (Page: X)
               - Example: \"The CPU fetches instructions (Page: 2)...\"
            """
            elif has_valid_timestamps:
                citation_rule = """
            5. CITATIONS (CRITICAL):
               - You MUST cite the timestamp for key facts IF they are available in context.
               - Format: (MM:SS-MM:SS)
               - Example: \"The CPU fetches instructions (02:30-02:45)...\"
            """
            else:
                citation_rule = ""

            prompt = f"""
            You are an expert AI Tutor. Your goal is to explain concepts clearly using the provided context segments.

            CRITICAL INSTRUCTION - LANGUAGE & STYLE:
            {lang_instruction}
            
            CRITICAL INSTRUCTION - HANDLING ERRORS:
            1. **Transcript Errors**: The transcript is imperfect (e.g., \"one new man\" -> \"Von Neumann\"). mentally correct these errors.
            2. **User Question Accuracy**: 
               - If the user asks a question with a minor typo, answer it.
               - If the user asks about a DIFFERENT person or concept, start \"This topic is not covered in the context.\" (Or the equivalent in the user's language).

            STRICT RULES:
            1. Answer based on the **available CONTEXT** chunks below.
            2. If the answer is not in the context, do NOT hallucinate. State that the topic is not found.
            3. VISUALIZATION:
               - Provide an ASCII diagram ONLY for complex data structures.
            4. EXPLANATION:\n               - Explain algorithms step-by-step.\n               - Be detailed and comprehensive.\n            5. MATHEMATICS (CRITICAL):\n               - ALL mathematical formulas, variables, equations, and Greek letters MUST be formatted in LaTeX mode.\n               - Wrap ALL inline math in single dollar signs (e.g. \\(a, b, \\\\alpha)\\\$).\n               - Wrap ALL block/standalone equations in double dollar signs (e.g. \\$\\\^T x_p + b = 0\\$\\\$).\n               - NEVER output plain text math formulas.
            {citation_rule}

            CONTEXT:
            {context}

            STUDENT QUESTION: {question}

            AI TUTOR ANSWER:
            """

            yield from self._chat_completion_stream(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.1,
            )

        except Exception as e:
            logger.error(f"Error answering question for video {video_id}: {str(e)}")
            yield f"Error occurred while generating answer: {str(e)}"

    def generate_suggested_questions(self, video_id: str) -> list[str]:
        """
        Generates 5 suggested questions based on the video context.
        """
        try:
            collection_name = f"video_{video_id}"
            try:
                collection = self.chroma_client.get_collection(collection_name)
            except:
                return ["What is this video about?", "Can you summarize the main points?"]

            # Get first 10 chunks to understand the topic
            # First, just get ANY chunks to be robust
            try:
                # Try getting first 5 items (Chroma API varies by version)
                results = collection.get(limit=10)
            except:
                # Fallback: try by ID if limit param fails modules
                ids_to_fetch = [f"chunk_{i}" for i in range(5)]
                results = collection.get(ids=ids_to_fetch)
            
            documents = results['documents']
            
            # Debug: Check what we got
            # print(f"DEBUG: Found {len(documents)} docs")

            if not documents:
                 # Last resort: Try getting all (if small)
                 results = collection.get()
                 documents = results['documents'][:5]
                 
            if not documents:
                return ["Summarize this video", "What are the key takeaways?"]
            
            context = "\n".join([doc for doc in documents if doc])[:4000] # Limit context size
            
            prompt = f"""
            Task: Generate 4 SHORT, PUNCHY questions based on the video context.
            (The backend will prepend "Summarize this video" automatically, so generate 4 engaging conceptual ones.)
            
            RULES:
            1. KEEP IT SHORT: Questions must be under 8-10 words. Ideal: 5 words.
            2. INTELLIGENT CORRECTION: Fix speech-to-text errors (e.g., "one new man" -> "Von Neumann").
            3. NO JARGON OVERLOAD: Simple, direct questions.
            
            BAD EXAMPLES (Too long):
            - "Can you explain the detailed process of how the Von Neumann architecture handles memory management?"
            - "What is the significance of the memory hop problem?"
            
            GOOD EXAMPLES (Short & Attractive):
            - "How does Von Neumann architecture work?"
            - "Explain the Memory Hop problem."
            - "What is the Control Unit?"
            - "Steps for instruction execution?"
            
            TRANSCRIPT CONTEXT:
            {context}
            
            OUTPUT FORMAT:
            - Exactly 4 questions (I will add a summary question manually).
            - One per line.
            - No numbering or bullets.
            """
            
            raw_questions = self.chat_completion(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.7,
            ).strip().split('\n')
            # Clean up (remove "1. ", "-", empty lines)
            questions = [q.strip().lstrip("1234567890.- ") for q in raw_questions if q.strip()]
            
            # Start with the fixed summary question
            final_questions = ["Summarize this video"] + questions[:4]
            
            return final_questions

        except Exception as e:
            print(f"ERROR in generate_suggested_questions: {e}") # Debug print
            logger.error(f"Error generating suggestions for {video_id}: {e}")
            return ["Summarize this video", "What are the main topics?", "Who is the speaker?"]

    def generate_masterclass_notebook(self, video_id: str, output_format: str = "markdown") -> dict:
        """Generate a Jupyter Notebook (.ipynb) JSON for the given video.

        This creates an outline template, then fills it in using chunked note generation
        to stay within token and rate limits.

        output_format: "markdown" or "latex"
        """
        collection_name = f"video_{video_id}"

        try:
            collection = self.chroma_client.get_collection(collection_name)
        except Exception:
            raise ValueError("Video not indexed. Please process it first.")

        # Fetch some chunks (limit for safety)
        try:
            results = collection.get(limit=50)
        except Exception:
            results = collection.get()

        documents = results.get("documents", [])
        metadatas = results.get("metadatas", [])
        if not documents:
            raise ValueError("No transcript chunks found for this video.")

        # 1) Generate an outline template from the beginning of the transcript
        outline_context = "\n\n".join(documents[:5])
        outline_prompt = f"""
        You are an expert educational content creator.
        Create a concise outline (section titles + bullet points) for masterclass notes.
        Language: English only.
        Do not include Hindi, Romanized Hindi, or mixed-language text.
        Use the transcript below to infer main topics and subtopics.

        Transcript:
        {outline_context}

        OUTPUT (JSON):
        [
          {{"section": "Title", "bullets": ["...", "..."]}},
          ...
        ]
        """

        try:
            # Use `chat_completion` instead of `groq_client.chat` to leverage the multi-model fallback loop
            outline_text = self.chat_completion(
                messages=[{"role": "user", "content": outline_prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.2,
            )
        except Exception as e:
            # If all fallbacks fail, log the error and use a minimal fallback outline instead of crashing.
            logger.error(f"Outline generation completely failed: {e}")
            outline_text = '[{"section": "Generated Notes", "bullets": ["Generation partially failed due to rate limits."]}]'

        try:
            import json
            outline = json.loads(outline_text)
            if not isinstance(outline, list):
                outline = [{"section": "Notes", "bullets": []}]
        except Exception:
            outline = [{"section": "Notes", "bullets": []}]

        # Sanitize outline: avoid generic noisy root labels
        if len(outline) == 1 and outline[0].get("section", "").strip().lower() == "notes":
            outline = []

        cells = []
        # Title header
        if output_format.lower() == "latex":
            cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "\\section*{🚀 \\textcolor{red}{Masterclass Notes}}\n",
                    "\\textit{Generated from transcript.}\n\n",
                ],
            })
        else:
            cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# 🚀 Masterclass Notes\n\n",
                    "Generated from transcript.\n\n",
                ],
            })

        # Outline cell
        if output_format.lower() == "latex":
            outline_lines = ["\\subsection*{In This Lecture}\n\\begin{tcolorbox}[colback=blue!5!white,colframe=blue!75!black,title=Lecture Outline]\n"]
            for entry in outline:
                section_title = entry.get("section")
                bullets = entry.get("bullets", [])
                outline_lines.append(f"\\textbf{{\\textcolor{{blue}}{{{section_title}}}}}\n")
                if bullets:
                    outline_lines.append("\\begin{itemize}\n")
                    for b in bullets:
                        outline_lines.append(f"\\item \\textcolor{{green}}{{{b}}}\n")
                    outline_lines.append("\\end{itemize}\n")
            outline_lines.append("\\end{tcolorbox}\n")
            cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": ["".join(outline_lines) + "\n"],
            })
        else:
            outline_lines = ["## In This Lecture\n"]
            for entry in outline:
                section_title = entry.get("section")
                bullets = entry.get("bullets", [])
                outline_lines.append(f"- **{section_title}**\n")
                for b in bullets:
                    outline_lines.append(f"  - {b}\n")
            cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": ["".join(outline_lines) + "\n"],
            })

        # Add section overview cells for navigational flow
        for entry in outline:
            section_title = entry.get("section", "Untitled")
            bullets = entry.get("bullets", [])
            
            # STRICT Separation: Since this is a Jupyter Notebook generation, we only use Markdown.
            section_source = [f"## {section_title}\n\n"]
            for b in bullets:
                section_source.append(f"- {b}\n")
            section_source.append("\n")

            cells.append({
                "cell_type": "markdown",
                "metadata": {},
                "source": section_source,
            })

        def format_ts(start: float) -> str:
            try:
                seconds = int(float(start))
                m, s = divmod(seconds, 60)
                h, m = divmod(m, 60)
                return f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"
            except Exception:
                return "0:00"

        # Grouping chunks to ensure continuous flow and avoid rigid repetitive formats
        chunk_group_size = 5
        grouped_chunks = []
        for i in range(0, len(documents), chunk_group_size):
            group_docs = documents[i:i + chunk_group_size]
            
            # Find the starting timestamp of this group
            orig_idx = i
            meta = metadatas[orig_idx] if orig_idx < len(metadatas) else {}
            start = meta.get("start", 0)
            ts = format_ts(start)
            
            combined_text = "\n\n".join(group_docs)
            grouped_chunks.append((combined_text, ts))

        def create_note_cell(chunk_text: str, ts: str, prev_context: str) -> tuple:
            # A prompt that encourages fluid, beautifully formatted markdown or LaTeX
            logger.info(f"Generating cell at ts={ts}, length={len(chunk_text)}")
            if output_format.lower() == "latex":
                prompt = f"""You are an elite AI educational writer generating a premium Masterclass study guide in LaTeX format.
Continue writing comprehensive, flowing course notes based on the following transcript segment.
Use LaTeX formatting with colors, boxes, and interactive elements to make the notes visually appealing.

Guidelines:
- Use \\textcolor{{blue}}{{text}} for key terms and important concepts.
- Use \\begin{{tcolorbox}}[colback=blue!5!white,colframe=blue!75!black,title=Key Insight]
Your insight text here.
\\end{{tcolorbox}} for important insights or quotes.
- Use \\begin{{tcolorbox}}[colback=green!5!white,colframe=green!75!black,title=Formula] ... \\end{{tcolorbox}} for mathematical formulas.
- Use \\section{{}} and \\subsection{{}} for structure.
- Use \\textbf{{}} for emphasis.
- Use itemize or enumerate for lists.
- Include mathematical equations with $$ or \\[ \\] delimiters.
- Keep equations balanced and properly formatted.
- Connect ideas logically in flowing paragraphs.

Previous Context (pick up the flow from here):
{prev_context[-800:] if prev_context else "This is the start of the lecture."}

Transcript Segment:
{chunk_text}

OUTPUT (LaTeX format only, no markdown):"""
            else:
                prompt = f"""You are an elite AI educational writer generating a premium Masterclass study guide.
Continue writing comprehensive, flowing course notes based on the following transcript segment.
DO NOT use repetitive structures like starting every single section with "> **Summary:**" or a bullet list.

Guidelines:
- Write fluidly, like a well-edited textbook or premium article.
- Use Markdown headers (`### Your Creative Subheading`) to separate concepts. Let headers be creative, NOT literal labels like "Blockquotes".
- Use **bold text** for key terms and new vocabulary.
- Start important insights, quotes, or key formulas with a `>` character at the beginning of the line so they render as blockquotes. Do NOT write the word "Blockquote".
- Use `- ` bullet points occasionally for lists, but rely on flowing paragraphs too.
- If explaining Math or formulas, use `$$ formula $$` on its own line and explain its variables.
- Keep every equation delimiter balanced. Prefer a single complete block equation over partial inline fragments.
- Connect ideas logically.

Previous Context (pick up the flow from here):
{prev_context[-800:] if prev_context else "This is the start of the lecture."}

Transcript Segment:
{chunk_text}

OUTPUT (Markdown format):"""
            try:
                note = self.chat_completion(
                    messages=[{"role": "user", "content": prompt}],
                    model="llama-3.3-70b-versatile",
                    temperature=0.3,
                ).strip()
            except Exception as e:
                logger.error(f"Chunk generation failed: {e}")
                if output_format.lower() == "latex":
                    note = f"\\subsection*{{Segment Notes ({ts})}}\n\\begin{{tcolorbox}}[colback=red!5!white,colframe=red!75!black,title=Error]\nAI limits reached. Processing skipped for this portion.\n\\end{{tcolorbox}}"
                else:
                    note = f"### Segment Notes ({ts})\n> AI limits reached.\n- Processing skipped for this portion."

            # Fix newlines
            import re
            note = re.sub(r"<[^>]+>", "", note).strip()
            note = note.replace("\r\n", "\n").strip()

            if output_format.lower() == "latex":
                return {"cell_type": "markdown", "metadata": {}, "source": [note + "\n\n"]}, note

            return {"cell_type": "markdown", "metadata": {}, "source": [note + "\n\n"]}, note

        prev_context = ""
        for chunk_text, ts in grouped_chunks:
            cell, md_text = create_note_cell(chunk_text, ts, prev_context)
            cells.append(cell)
            prev_context += "\n\n" + md_text

        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "python3", "language": "python"}},
            "cells": cells,
        }
        return notebook

# Singleton Instance
rag_service = RAGService()