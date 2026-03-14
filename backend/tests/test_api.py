import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes.video import extract_video_id

client = TestClient(app)


def test_clean_endpoint_returns_cleaned_text():
    payload = {
        "text": "this is a test. um this is a clean sentence.",
        "use_basic": True,
        "use_dictionary": False,
        "use_llm": False,
    }

    response = client.post("/api/clean/", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "cleaned_text" in data
    assert "um" not in data["cleaned_text"].lower()


def test_extract_video_id_from_various_urls():
    assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://m.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_health_endpoint():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json().get("message") == "VidSage API running"
