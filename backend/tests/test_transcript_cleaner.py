import asyncio

from app.services.transcript_cleaner import TranscriptCleaner


def test_basic_clean_removes_fillers_and_caps():
    raw = "this is um a test. this is so good."
    cleaned = TranscriptCleaner.basic_clean(raw)
    assert "um" not in cleaned.lower()
    assert cleaned.startswith("This")


def test_full_pipeline_returns_expected_keys():
    raw = "this is a test. this is so good."
    result = asyncio.run(TranscriptCleaner.clean(raw, use_llm=False))

    assert "cleaned_text" in result
    assert "cleaning_steps" in result
    assert "basic" in result["cleaning_steps"]
