from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.rag_service import RateLimitError, rag_service

router = APIRouter(prefix="/api/notes", tags=["Notes"])

class NotesRequest(BaseModel):
    video_id: str


@router.post("/masterclass")
def generate_masterclass_notes(request: NotesRequest):
    """Generate a Jupyter Notebook (.ipynb) JSON representing "masterclass" notes for the given video."""
    try:
        notebook_json = rag_service.generate_masterclass_notebook(request.video_id)
        return notebook_json
    except RateLimitError as rte:
        raise HTTPException(
            status_code=429,
            detail=str(rte),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
