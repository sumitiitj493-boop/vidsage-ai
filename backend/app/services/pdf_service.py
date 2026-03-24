import pypdf
import logging
import io
import re

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
    def _sanitize_latex_for_fallback(latex_content: str) -> str:
        """Create a fallback LaTeX source that avoids optional packages not installed in minimal TeX."""
        fallback = latex_content

        # Drop geometry + tcolorbox package inclusions
        fallback = re.sub(r"\\\\usepackage\s*\[.*?\]\s*\{geometry\}", "", fallback)
        fallback = re.sub(r"\\\\usepackage\s*\{geometry\}", "", fallback)
        fallback = re.sub(r"\\\\usepackage\s*\{tcolorbox\}", "", fallback)
        fallback = re.sub(r"\\\\tcbuselibrary\s*\{.*?\}", "", fallback)

        # Replace tcolorbox blocks with quote box for fallback
        fallback = re.sub(r"\\begin\{tcolorbox\}(.*?)\\end\{tcolorbox\}", r"\\begin{quote}\1\\end{quote}", fallback, flags=re.DOTALL)

        # Make sure we have a single \\usepackage{color} fallback
        if "\\\\usepackage{xcolor}" not in fallback:
            fallback = fallback.replace("\\\\begin{document}", "\\\\usepackage{xcolor}\\n\\\\begin{document}")

        return fallback

    @staticmethod
    def _run_pdflatex(tmpdir: str) -> None:
        for _ in range(2):
            result = subprocess.run([
                "pdflatex", "-interaction=nonstopmode", "-halt-on-error", "document.tex"
            ], cwd=tmpdir, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
            if result.returncode != 0:
                raise Exception(result.stdout.decode(errors="ignore") + "\n" + result.stderr.decode(errors="ignore"))

    @staticmethod
    def latex_to_pdf(latex_content: str) -> bytes:
        """
        Compiles LaTeX content to PDF and returns the PDF bytes.
        Requires pdflatex to be installed on the system.
        """
        def _compile(content: str):
            with tempfile.TemporaryDirectory() as tmpdir:
                tex_path = os.path.join(tmpdir, "document.tex")
                pdf_path = os.path.join(tmpdir, "document.pdf")
                with open(tex_path, "w", encoding="utf-8") as f:
                    f.write(content)

                PDFService._run_pdflatex(tmpdir)

                if not os.path.exists(pdf_path):
                    raise Exception("PDF was not generated. Check LaTeX source for errors.")
                with open(pdf_path, "rb") as pdf_file:
                    return pdf_file.read()

        try:
            return _compile(latex_content)
        except Exception as first_error:
            err_text = str(first_error)
            logger.warning(f"First pdflatex pass failed, trying fallback engine: {err_text}")

            # If the problem is missing packages (geometry/tcolorbox) we attempt a fallback source.
            if "geometry.sty" in err_text or "tcolorbox.sty" in err_text or "Undefined control sequence" in err_text:
                fallback_content = PDFService._sanitize_latex_for_fallback(latex_content)
                try:
                    return _compile(fallback_content)
                except Exception as second_error:
                    logger.error(f"Fallback LaTeX compilation also failed: {second_error}")
                    raise Exception(f"Failed to compile LaTeX to PDF (fallback also failed): {second_error}")

            logger.error(f"LaTeX to PDF compilation failed: {first_error}")
            raise Exception(f"Failed to compile LaTeX to PDF: {first_error}")
