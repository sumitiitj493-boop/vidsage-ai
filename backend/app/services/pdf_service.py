import pypdf
import logging
import io

logger = logging.getLogger(__name__)

import tempfile
import os
import subprocess

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

    @staticmethod
    def latex_to_pdf(latex_content: str) -> bytes:
        """
        Compiles LaTeX content to PDF and returns the PDF bytes.
        Requires pdflatex to be installed on the system.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            tex_path = os.path.join(tmpdir, "document.tex")
            pdf_path = os.path.join(tmpdir, "document.pdf")
            with open(tex_path, "w", encoding="utf-8") as f:
                f.write(latex_content)

            try:
                # Run pdflatex quietly, twice for references
                for _ in range(2):
                    result = subprocess.run([
                        "pdflatex", "-interaction=nonstopmode", "-halt-on-error", "document.tex"
                    ], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                    if result.returncode != 0:
                        raise Exception(result.stdout.decode(errors="ignore") + "\n" + result.stderr.decode(errors="ignore"))

                if not os.path.exists(pdf_path):
                    raise Exception("PDF was not generated. Check LaTeX source for errors.")
                with open(pdf_path, "rb") as pdf_file:
                    return pdf_file.read()
            except Exception as e:
                logger.error(f"LaTeX to PDF compilation failed: {e}")
                raise Exception(f"Failed to compile LaTeX to PDF: {str(e)}")
