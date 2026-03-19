import os
import chromadb
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
from groq import Groq
from app.config import settings
import logging
from typing import Optional

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
        self.groq_client = Groq(api_key=settings.GROQ_API_KEY)
        
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

    def answer_question(self, video_id: str, question: str) -> str:
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

            # Format context WITH TIMESTAMPS
            context_pieces = []
            has_valid_timestamps = False
            for i, doc in enumerate(docs):
                meta = metas[i] if i < len(metas) else {}
                start = meta.get('start', 0)
                end = meta.get('end', 0)
                
                # Check if this is a dummy timestamp (0,0) from text input
                if start > 0 or end > 0:
                    has_valid_timestamps = True
                    start_str = self._format_timestamp(start)
                    end_str = self._format_timestamp(end)
                    context_pieces.append(f"[Time: {start_str}-{end_str}]\n{doc}")
                else:
                    # For Text Input: Just return text without [Time...] tag
                    context_pieces.append(f"{doc}")

            context = "\n\n".join(context_pieces)
            
            # Dynamic Citation Rule based on content type
            citation_rule = """
            5. CITATIONS (CRITICAL):
               - You MUST cite the timestamp for key facts IF they are available in context.
               - Format: (MM:SS-MM:SS)
               - Example: "The CPU fetches instructions (02:30-02:45)..."
            """ if has_valid_timestamps else ""

            # 2. Augmentation (Create Prompt)
            prompt = f"""
            You are an expert AI Tutor. Your goal is to explain concepts clearly using the provided context segments.

            CRITICAL INSTRUCTION - LANGUAGE & STYLE:
            - **DETECT** the language of the STUDENT QUESTION (English, Hindi, or Hinglish/Romanized Hindi).
            - **ANSWER** in the SAME language and style.
              - If the user asks in Hindi, answer in Hindi.
              - If the user asks in "Hinglish" (WhatsApp style), answer in Hinglish.
              - If the user asks in English, answer in English.
            
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
            4. EXPLANATION:
               - Explain algorithms step-by-step.
               - Be detailed and comprehensive.
            {citation_rule}

            CONTEXT:
            {context}

            STUDENT QUESTION: {question}

            AI TUTOR ANSWER:
            """
            
            # 3. Generation (Call Groq)
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1 # Strict mode
            )
            
            return response.choices[0].message.content
            
        except Exception as e:
            logger.error(f"Error answering question for video {video_id}: {str(e)}")
            return f"Error occurred while generating answer: {str(e)}"

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
            
            response = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7 
            )
            
            raw_questions = response.choices[0].message.content.strip().split('\n')
            # Clean up (remove "1. ", "-", empty lines)
            questions = [q.strip().lstrip("1234567890.- ") for q in raw_questions if q.strip()]
            
            # Start with the fixed summary question
            final_questions = ["Summarize this video"] + questions[:4]
            
            return final_questions

        except Exception as e:
            print(f"ERROR in generate_suggested_questions: {e}") # Debug print
            logger.error(f"Error generating suggestions for {video_id}: {e}")
            return ["Summarize this video", "What are the main topics?", "Who is the speaker?"]

    def generate_masterclass_notebook(self, video_id: str) -> dict:
        """Generate a Jupyter Notebook (.ipynb) JSON for the given video.

        This creates an outline template, then fills it in using chunked note generation
        to stay within token and rate limits.
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
            outline_resp = self.groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": outline_prompt}],
                temperature=0.2,
            )
            outline_text = outline_resp.choices[0].message.content
        except Exception as e:
            # Detect Groq rate limit errors and raise a structured exception so the API can return a 429.
            errmsg = str(e)
            if "rate limit" in errmsg.lower() or "rate_limit_exceeded" in errmsg.lower():
                import re

                match = re.search(r"try again in ([0-9hms\.]+)", errmsg, re.IGNORECASE)
                retry = match.group(1) if match else None
                raise RateLimitError(
                    f"Rate limit reached. Try again in {retry or 'a few minutes'}.",
                    retry_after_seconds=None,
                )
            raise

        try:
            import json
            outline = json.loads(outline_text)
            if not isinstance(outline, list):
                outline = [{"section": "Notes", "bullets": []}]
        except Exception:
            outline = [{"section": "Notes", "bullets": []}]

        cells = []
        # Title header
        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": [
                "# 🚀 Masterclass Notes\n\n",
                "Generated from transcript.\n",
            ],
        })

        # Outline cell
        outline_lines = ["## In This Lecture\n"]
        for entry in outline:
            section_title = entry.get("section")
            bullets = entry.get("bullets", [])
            outline_lines.append(f"- **{section_title}**")
            for b in bullets:
                outline_lines.append(f"  - {b}")
        cells.append({
            "cell_type": "markdown",
            "metadata": {},
            "source": ["\n".join(outline_lines) + "\n"],
        })

        def format_ts(start: float) -> str:
            try:
                seconds = int(float(start))
                m, s = divmod(seconds, 60)
                h, m = divmod(m, 60)
                return f"{h}:{m:02d}:{s:02d}" if h > 0 else f"{m}:{s:02d}"
            except Exception:
                return "0:00"

        def create_note_cell(chunk_text: str, ts: str) -> dict:
            prompt = f"""
            Create a concise, engaging note snippet (3-5 bullet points) for this transcript chunk.
            Return the note in **valid Markdown only** (no HTML or styling tags).

            - Start with a heading like `## Segment (0:00)`.
            - Include the timestamp in the first bullet point.
            - Use `*` or `-` for bullet points.
            - Wrap any math or formulas using `$...$` (inline) or `$$...$$` (block).

            Transcript:
            {chunk_text}
            """
            try:
                resp = self.groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                )
                note = resp.choices[0].message.content.strip()
            except Exception as e:
                errmsg = str(e)
                if "rate limit" in errmsg.lower() or "rate_limit_exceeded" in errmsg.lower():
                    import re

                    match = re.search(r"try again in ([0-9hms\.]+)", errmsg, re.IGNORECASE)
                    retry = match.group(1) if match else None
                    raise RateLimitError(
                        f"Rate limit reached. Try again in {retry or 'a few minutes'}.",
                        retry_after_seconds=None,
                    )
                raise

            # Strip any accidental HTML tags, to keep output safe and Markdown-friendly.
            import re

            note = re.sub(r"<[^>]+>", "", note)
            note = note.replace("\r\n", "\n").strip()

            return {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    f"## Segment ({ts})\n\n",
                    note + "\n",
                ],
            }

        for idx, doc in enumerate(documents):
            meta = metadatas[idx] if idx < len(metadatas) else {}
            start = meta.get("start", 0)
            ts = format_ts(start)
            cells.append(create_note_cell(doc, ts))

        notebook = {
            "nbformat": 4,
            "nbformat_minor": 5,
            "metadata": {"kernelspec": {"name": "python3", "language": "python"}},
            "cells": cells,
        }
        return notebook

# Singleton Instance
rag_service = RAGService()
rag_service = RAGService()