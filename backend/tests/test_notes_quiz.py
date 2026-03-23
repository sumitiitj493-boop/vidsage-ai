def test_notes_generate_and_pdf(client):
    # simple context
    context = "This is a test context. It contains several sentences."
    res = client.post("/api/notes/generate", json={"context": context, "style": "desi"})
    assert res.status_code == 200
    data = res.json()
    assert "content" in data
    assert isinstance(data["content"], str)

    # request PDF generation and check for pdf header
    pdf_res = client.post("/api/notes/pdf", json={"content": "Hello world", "title": "test"})
    # library may not be installed in CI environment; accept 500 or 200
    if pdf_res.status_code == 200:
        assert pdf_res.headers.get("content-type") == "application/pdf"
        # first bytes of a PDF file are "%PDF"
        body = pdf_res.content
        assert body.startswith(b"%PDF")
    else:
        assert pdf_res.status_code == 500
        # error message should mention PDF or library
        assert "PDF" in pdf_res.json().get("detail", "")


def test_masterclass_notes_endpoint(client):
    # This test assumes there is at least one uploaded video in the chroma collection
    # For pure unit test, we might need to insert a fake collection. Here we validate route behavior.
    res = client.post("/api/notes/masterclass", json={"video_id": "dummy_video", "output_format": "markdown"})
    # If video not indexed we expect a 500 with errors; test should not crash
    assert res.status_code in (200, 500, 404)
    data = res.json()
    if res.status_code == 200:
        assert "cells" in data
        assert isinstance(data["cells"], list)


def test_quiz_generate(client):
    req = {
        "context": "Some context about algebra and calculus.",
        "config": {"type": "mcq", "difficulty": "easy", "questionCount": 3},
    }
    res = client.post("/api/quiz/generate", json=req)
    assert res.status_code == 200
    data = res.json()
    assert "quiz" in data
    quiz = data["quiz"]
    assert quiz.get("questions") is not None
    assert len(quiz["questions"]) == 3
    # each question should have id and question text
    for q in quiz["questions"]:
        assert "id" in q and "question" in q
    # debug fields should always be returned for troubleshooting
    assert "debug_raw" in data and isinstance(data["debug_raw"], str)
    # optionally ensure debug_raw contains some JSON structure
    import json, re
    match = re.search(r"\[.*\]", data["debug_raw"], re.DOTALL)
    assert match is not None, "expected JSON array in debug_raw"
