import pypdf
import logging
import io

logger = logging.getLogger(__name__)

class PDFService:
    @staticmethod
    def extract_text(file_content: bytes) -> list[dict]:
        """
        Extracts text from a PDF file.
        Returns a list of segments: [{"text": "...", "start": 1, "end": 1}, ...]
        (We use 'start'/'end' as page numbers to be compatible with the RAG system)
        """
        try:
            # Create a file-like object from bytes
            pdf_file = io.BytesIO(file_content)
            reader = pypdf.PdfReader(pdf_file)
            
            segments = []
            
            # Extract text page by page
            for i, page in enumerate(reader.pages):
                text = page.extract_text()
                if text and text.strip():
                    # clean up basic whitespace (remove extra newlines)
                    clean_text = " ".join(text.split())
                    
                    segments.append({
                        "text": clean_text,
                        "start": i + 1, # Page Number
                        "end": i + 1    # Page Number
                    })
            
            logger.info(f"Extracted {len(segments)} pages from PDF")
            return segments

        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            raise Exception(f"Failed to process PDF: {str(e)}")
