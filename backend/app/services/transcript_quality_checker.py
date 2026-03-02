
"""
Transcript Quality Checker

Validates auto-generated transcripts against the video's title to ensure content relevance.
This service uses an LLM to determine if the transcript content matches the provided video title,
filtering out hallucinations or irrelevant auto-generated text.
"""

import json
import logging
from groq import Groq
from app.config import settings

logger = logging.getLogger(__name__)

def _get_validation_prompt(title: str, snippet: str) -> str:
    """Constructs the prompt for the validation LLM."""
    return f"""
    You are a Content Validator. Determine if the following transcript snippet matches the video title.

    VIDEO TITLE: "{title}"
    TRANSCRIPT SNIPPET: "{snippet}"

    CRITERIA:
    1. Relevance: Does the transcript content logically relate to the video title?
    2. Coherence: Is the text intelligible (even with minor grammar issues)?
    
    Reject if the transcript is gibberish, repetitive loops, or completely unrelated to the title.

    Return a JSON object:
    {{
        "is_valid": boolean,
        "reason": "Brief explanation"
    }}
    """

class TranscriptQualityChecker:
    
    @staticmethod
    def validate_transcript(transcript: str, video_title: str) -> dict:
        """
        Validates if the transcript content aligns with the video title using an LLM.

        Args:
            transcript (str): The full transcript text.
            video_title (str): The title of the video.

        Returns:
            dict: Validation result containing "is_valid" (bool) and "reason" (str).
        """
        if not transcript or len(transcript.strip()) < 50:
             return {"is_valid": False, "reason": "Transcript is too short or empty."}

        # Validate based on the first 4000 characters, which is usually sufficient
        # to determine topic relevance and detect gross errors.
        snippet = transcript[:4000]

        try:
            client = Groq(api_key=settings.GROQ_API_KEY)
            
            prompt = _get_validation_prompt(video_title, snippet)

            response = client.chat.completions.create(
                model=settings.CLEANING_MODEL,
                messages=[ 
                    {"role": "system", "content": "You are a validator. Output JSON only."}, 
                    {"role": "user", "content": prompt} 
                ],
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            logger.info(f"Validation result: {content}")
            
            result = json.loads(content)
            return {
                "is_valid": result.get("is_valid", False),
                "reason": result.get("reason", "validation_logic_decision")
            }

        except Exception as e:
            logger.error(f"Transcript validation failed: {e}")
            # Fail safe: if validation errors out, treat as invalid to trigger fallback mechanisms.
            return {"is_valid": False, "reason": f"Validation Error: {str(e)}"}
