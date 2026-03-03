from pydantic import BaseModel, Field
from typing import Optional

class TextRequest(BaseModel):
    title: str = Field(..., description="A title for the text content (e.g. Chapter name, Article title)")
    text: str = Field(..., description="The raw text content to process", min_length=50)
    
    class Config:
        json_schema_extra = {
            "example": {
                "title": "Introduction to Thermodynamics",
                "text": "Thermodynamics is a branch of physics that deals with heat, work, and temperature, and their relation to energy, entropy, and the physical properties of matter and radiation..."
            }
        }
