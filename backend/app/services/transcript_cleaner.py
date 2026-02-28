"""
Transcript Cleaning Service - VidSage 

Three-layer cleaning pipeline:
1. Basic Cleaning: Remove fillers, fix spacing, capitalization
2. Custom Dictionary: Fix known domain-specific terms
3. LLM Cleaning: Use Groq (free) to fix proper nouns, grammar, context errors
"""

import re
import logging
from typing import Optional, List, Dict
from groq import Groq
from app.config import settings

logger = logging.getLogger(__name__)


class TranscriptCleaner:

    # ================= LAYER 1: BASIC CLEANING =================

    # Filler words to remove
    FILLER_WORDS = [
        r"\b(um|uh|erm|hmm|hm|ah|eh|oh)\b",
        r"\b(you know|i mean|like|basically|actually|literally|right)\b(?=[\s,.])",
        r"\b(so+)\b(?=\s*,)",  # "sooo," at start
    ]

    # Repeated words: "the the" → "the"
    REPEATED_WORDS = re.compile(r"\b(\w+)\s+\1\b", re.IGNORECASE)

    @staticmethod
    def basic_clean(text: str) -> str:
        """
        Layer 1: Regex-based cleaning
        a. Remove filler words
        b. Fix spacing and punctuation
        c. Remove repeated words
        d. Fix capitalization after periods
        """

        # Remove filler words
        for pattern in TranscriptCleaner.FILLER_WORDS:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)

        # Remove repeated words ("the the" -> "the")
        text = TranscriptCleaner.REPEATED_WORDS.sub(r"\1", text)

        # Fix multiple spaces
        text = re.sub(r"\s{2,}", " ", text)

        # Fix spacing around punctuation
        text = re.sub(r"\s+([.,!?;:])", r"\1", text)  # Remove space before punctuation
        text = re.sub(r"([.,!?;:])(?=[A-Za-z])", r"\1 ", text)  # Add space after punctuation

        # Capitalize after period/question/exclamation
        text = re.sub(
            r"([.!?]\s+)([a-z])",
            lambda m: m.group(1) + m.group(2).upper(),
            text
        )

        # Capitalize first letter
        if text:
            text = text[0].upper() + text[1:]

        # Remove leading/trailing whitespace
        text = text.strip()

        return text

    # Layer 2: CUSTOM DICTIONARY 

    # Added my known corrections here
    # Format: "wrong_word": "correct_word"
    CUSTOM_CORRECTIONS: Dict[str, str] = {
        # Add project-specific terms
        "vid sage": "VidSage",
        "vidsage": "VidSage",
        "fast api": "FastAPI",
        "fastapi": "FastAPI",

        # Common Indian name/place corrections (I will add more as needed)
        "smith kumar": "Sumit Kumar",
        "jyothpur": "Jodhpur",
    }

    @staticmethod
    def apply_dictionary(text: str) -> str:
        """
        Layer 2: Apply custom dictionary corrections
        Case-insensitive replacement
        """
        for wrong, correct in TranscriptCleaner.CUSTOM_CORRECTIONS.items():
            text = re.sub(
                re.escape(wrong),
                correct,
                text,
                flags=re.IGNORECASE
            )
        return text

    # Layer 3: LLM CLEANING (GROQ) 

    CLEANING_PROMPT = """You are a transcript editor. Fix the following raw speech-to-text transcript.

Rules:
1. Fix misspelled proper nouns (people names, place names, organization names)
2. Fix technical terms and domain-specific words
3. Fix grammar only where speech-to-text clearly made errors
4. Add proper punctuation and sentence structure
5. DO NOT change the meaning or rephrase sentences
6. DO NOT add information that wasn't in the original
7. DO NOT summarize — return the FULL corrected transcript
8. Keep the same length and content, just fix errors

Raw transcript:

{text}

Corrected transcript:

"""

    @staticmethod
    def _chunk_text(text: str, max_size: int = 3000) -> List[str]:
        """
        Split text into chunks for LLM processing.
        Splits at sentence boundaries to preserve context.
        """
        if len(text) <= max_size:
            return [text]

        chunks = []
        sentences = re.split(r'(?<=[.!?])\s+', text)
        current_chunk = ""

        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 > max_size:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence
            else:
                current_chunk += " " + sentence if current_chunk else sentence

        if current_chunk:
            chunks.append(current_chunk.strip())

        return chunks

    @staticmethod
    def llm_clean(text: str) -> str:
        """
        Layer 3: Use Groq LLM to fix context-dependent errors
        (proper nouns, place names, technical terms)
        """
        if not settings.GROQ_API_KEY:
            logger.warning("GROQ_API_KEY not set — skipping LLM cleaning")
            return text

        try:
            client = Groq(api_key=settings.GROQ_API_KEY)
            chunks = TranscriptCleaner._chunk_text(text, settings.MAX_CHUNK_SIZE)
            cleaned_chunks = []

            for i, chunk in enumerate(chunks):
                logger.info(f"LLM cleaning chunk {i+1}/{len(chunks)}")

                response = client.chat.completions.create(
                    model=settings.CLEANING_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a precise transcript editor. Only fix errors, never change meaning."
                        },
                        {
                            "role": "user",
                            "content": TranscriptCleaner.CLEANING_PROMPT.format(text=chunk)
                        }
                    ],
                    temperature=0.1,  # Low temperature = more precise, less creative
                    max_tokens=4096,
                )

                cleaned = response.choices[0].message.content.strip()
                cleaned_chunks.append(cleaned)

            return " ".join(cleaned_chunks)

        except Exception as e:
            logger.error(f"LLM cleaning failed: {e}")
            return text  # Return original if LLM fails

    # FULL PIPELINE 

    @staticmethod
    def clean(
        text: str,
        use_basic: bool = True,
        use_dictionary: bool = True,
        use_llm: bool = True
    ) -> Dict[str, str]:
        """
        Run the full cleaning pipeline.
        Returns both raw and cleaned versions.
        """

        result = {
            "raw_text": text,
            "cleaned_text": text,
            "cleaning_steps": []
        }

        # Layer 1: Basic cleaning
        if use_basic:
            result["cleaned_text"] = TranscriptCleaner.basic_clean(result["cleaned_text"])
            result["cleaning_steps"].append("basic")

        # Layer 2: Custom dictionary
        if use_dictionary:
            result["cleaned_text"] = TranscriptCleaner.apply_dictionary(result["cleaned_text"])
            result["cleaning_steps"].append("dictionary")

        # Layer 3: LLM cleaning
        if use_llm:
            result["cleaned_text"] = TranscriptCleaner.llm_clean(result["cleaned_text"])
            result["cleaning_steps"].append("llm")

        return result
