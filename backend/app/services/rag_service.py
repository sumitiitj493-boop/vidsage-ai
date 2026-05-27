import json
import logging
import os
import re
from typing import Any, Dict, Generator, List, Optional
from threading import Lock

import requests
from groq import Groq

from app.config import settings

logger = logging.getLogger(__name__)

class RateLimitError(Exception):
    pass

class RAGService:
    def __init__(self):
        self.groq_client = None
        self._runtime_lock = Lock()
        self.groq_enabled = bool(settings.GROQ_API_KEY)
        
        self.db_dir = "/app/chroma_db"
        if not os.path.exists(self.db_dir):
            try:
                os.makedirs(self.db_dir, exist_ok=True)
            except:
                self.db_dir = "/tmp"

    def _ensure_runtime(self) -> None:
        if self.groq_enabled and self.groq_client is None:
            with self._runtime_lock:
                if self.groq_client is None:
                    self.groq_client = Groq(api_key=settings.GROQ_API_KEY)

    # Completely stubbed out ML models
    def _ensure_embedding_model(self) -> None:
        pass

    def _ensure_groq_client(self) -> None:
        self._ensure_runtime()

    def _get_db_path(self, video_id: str) -> str:
        return os.path.join(self.db_dir, f"video_{video_id}_lite.json")

    def index_video(self, video_id: str, segments: list[dict]):
        logger.info(f"Indexing video {video_id} for RAG (Lite Mode)...")
        
        chunks = []
        current_chunk_text = []
        current_chunk_start = 0.0
        current_chunk_len = 0
        
        for i, segment in enumerate(segments):
            if current_chunk_len == 0:
                current_chunk_start = segment.get("start", 0.0)
                
            text = segment.get("text", "")
            current_chunk_text.append(text)
            current_chunk_len += len(text)
            
            if current_chunk_len > 500 or i == len(segments) - 1:
                chunk_str = " ".join(current_chunk_text)
                chunks.append({
                    "text": chunk_str,
                    "start": current_chunk_start,
                    "end": segment.get("end", 0.0)
                })
                current_chunk_text = []
                current_chunk_len = 0

        with open(self._get_db_path(video_id), "w", encoding="utf-8") as f:
            json.dump(chunks, f)

    def _format_timestamp(self, seconds: float) -> str:
        try:
            seconds_int = int(seconds)
            m, s = divmod(seconds_int, 60)
            return f"{m}:{s:02d}"
        except:
            return "0:00"

    def _simple_bm25_search(self, query: str, chunks: List[dict], top_k: int = 5) -> List[dict]:
        query_words = set(re.findall(r'\w+', query.lower()))
        if not query_words:
            return chunks[:top_k]
            
        scores = []
        for chunk in chunks:
            text = chunk.get("text", "").lower()
            text_words = set(re.findall(r'\w+', text))
            score = len(query_words.intersection(text_words))
            scores.append((score, chunk))
            
        scores.sort(key=lambda x: x[0], reverse=True)
        return [c for score, c in scores[:top_k]]

    def answer_question(self, video_id: str, question: str, output_format: str = "markdown", language: str = "auto") -> str:
        self._ensure_runtime()
        db_path = self._get_db_path(video_id)
        if not os.path.exists(db_path):
            return "Analysis not found for this video. Please process it first."
            
        with open(db_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
            
        best_chunks = self._simple_bm25_search(question, chunks, top_k=5)
        
        context_pieces = []
        for chunk in best_chunks:
            start_str = self._format_timestamp(chunk["start"])
            end_str = self._format_timestamp(chunk["end"])
            context_pieces.append(f"[Time: {start_str}-{end_str}]\n{chunk['text']}")
            
        context = "\n\n".join(context_pieces)
        prompt = f"You are an AI Tutor.\nCONTEXT:\n{context}\n\nQUESTION: {question}\nANSWER:"

        try:
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.1,
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error: {e}"

    def answer_question_stream(self, video_id: str, question: str, language: str = "auto") -> Generator[str, None, None]:
        db_path = self._get_db_path(video_id)
        if not os.path.exists(db_path):
            yield "Analysis not found for this video. Please process it first."
            return

        with open(db_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
            
        best_chunks = self._simple_bm25_search(question, chunks, top_k=5)
        
        context_pieces = []
        for chunk in best_chunks:
            start_str = self._format_timestamp(chunk["start"])
            end_str = self._format_timestamp(chunk["end"])
            context_pieces.append(f"[Time: {start_str}-{end_str}]\n{chunk['text']}")
            
        context = "\n\n".join(context_pieces)
        prompt = f"You are an AI Tutor.\nCONTEXT:\n{context}\n\nQUESTION: {question}\nANSWER:"

        try:
            self._ensure_runtime()
            stream = self.groq_client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.1,
                stream=True
            )
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            yield f"Error: {e}"

    def generate_summary(self, video_id: str) -> dict:
        db_path = self._get_db_path(video_id)
        if not os.path.exists(db_path):
            return {"error": "Analysis not found for this video. Please process it first."}
            
        with open(db_path, "r", encoding="utf-8") as f:
            chunks = json.load(f)
            
        text_sample = " ".join([c["text"] for c in chunks[:50]])
        prompt = f"""You are an AI Summarizer. Please summarize this video text snippet into JSON.
Return ONLY valid JSON.
{{
  "video_type": "<type>",
  "title": "<punchy title>",
  "gist": "<summary>",
  "main_points": ["<point 1>"],
  "terms": []
}}
TEXT:
{text_sample}"""

        try:
            self._ensure_runtime()
            response = self.groq_client.chat.completions.create(
                messages=[{"role": "system", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            result_json = json.loads(response.choices[0].message.content)
            result_json["success"] = True
            return result_json
        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            return {"error": str(e)}

rag_service = RAGService()
