from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import tempfile
import subprocess
import re
from app.services.rag_service import RateLimitError, rag_service

def sanitize_latex(latex_content: str) -> str:
    """Sanitize LaTeX content to fix common issues."""
    # Fix unbalanced braces (simple check)
    open_braces = latex_content.count('{')
    close_braces = latex_content.count('}')
    if open_braces > close_braces:
        # Add missing closing braces
        latex_content += '}' * (open_braces - close_braces)
    elif close_braces > open_braces:
        # Remove extra closing braces (last ones)
        diff = close_braces - open_braces
        latex_content = latex_content.rstrip('}')
        latex_content = latex_content[:-diff] if diff < len(latex_content) else latex_content
    
    # Fix common issues: ensure \end{tcolorbox} is present for each \begin{tcolorbox}
    begin_count = latex_content.count('\\begin{tcolorbox}')
    end_count = latex_content.count('\\end{tcolorbox}')
    if begin_count > end_count:
        latex_content += '\\end{tcolorbox}\n' * (begin_count - end_count)
    
    # Remove any trailing backslashes that might cause issues
    latex_content = latex_content.rstrip('\\')
    
    return latex_content

router = APIRouter(prefix="/api/notes", tags=["Notes"])

class NotesRequest(BaseModel):
    video_id: str
    output_format: str = "markdown"  # markdown | latex

class CompileRequest(BaseModel):
    latex_code: str


@router.get("/download/pdf/{video_id}")
def download_pdf_notes(video_id: str):
    """Compiles LaTeX to PDF on the fly and returns the file."""
    try:
        notebook_json = rag_service.generate_masterclass_notebook(
            video_id, output_format="latex"
        )
        latex_content = "\n".join([cell["source"][0] for cell in notebook_json.get("cells", []) if cell["cell_type"] == "markdown"])
        
        # Strip any existing preamble from LLM to force OUR custom preamble
        if "\\begin{document}" in latex_content:
            latex_content = latex_content.split("\\begin{document}", 1)[1]
            if "\\end{document}" in latex_content:
                latex_content = latex_content.split("\\end{document}", 1)[0]

        # Sanitize the LaTeX content
        latex_content = sanitize_latex(latex_content)

        latex_content = f"""\\documentclass{{article}}
\\usepackage[margin=1in]{{geometry}}
\\usepackage{{amsmath,amssymb}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[T1]{{fontenc}}
\\usepackage{{xcolor}}
\\usepackage{{tcolorbox}}
\\tcbuselibrary{{skins,breakable}}
\\usepackage{{listings}}
\\usepackage{{enumitem}}
\\usepackage{{fancyhdr}}
\\begin{{document}}
{latex_content}
\\end{{document}}"""

        temp_dir = tempfile.mkdtemp()
        tex_path = os.path.join(temp_dir, f"{video_id}.tex")
        pdf_path = os.path.join(temp_dir, f"{video_id}.pdf")
        
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_content)
            
        # Try XeLaTeX first, fallback to pdfLaTeX
        process = subprocess.run(
            ["xelatex", "-interaction=nonstopmode", "-halt-on-error", "-enable-installer", "-output-directory", temp_dir, tex_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        
        if not os.path.exists(pdf_path):
            # Fallback to pdfLaTeX
            process = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "-enable-installer", "-output-directory", temp_dir, tex_path],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
        
        if not os.path.exists(pdf_path):
            raise Exception("Failed to compile LaTeX to PDF. Is pdflatex installed?\n" + process.stdout.decode('utf-8'))
            
        return FileResponse(path=pdf_path, filename=f"VidSage_Notes_{video_id}.pdf", media_type="application/pdf")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compile")
def compile_latex_to_pdf(request: CompileRequest):
    try:
        latex_content = request.latex_code
        if "\\begin{document}" not in latex_content:
            latex_content = f"""\\documentclass{{article}}
\\usepackage[margin=1in]{{geometry}}
\\usepackage{{amsmath,amssymb}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[T1]{{fontenc}}
\\usepackage{{xcolor}}
\\usepackage{{tcolorbox}}
\\tcbuselibrary{{skins,breakable}}
\\usepackage{{listings}}
\\usepackage{{enumitem}}
\\usepackage{{fancyhdr}}
\\begin{{document}}
{latex_content}
\\end{{document}}"""
        
        # Sanitize the LaTeX content
        latex_content = sanitize_latex(latex_content)
            
        temp_dir = tempfile.mkdtemp()
        tex_path = os.path.join(temp_dir, "custom.tex")
        pdf_path = os.path.join(temp_dir, "custom.pdf")
        
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_content)
            
        process = subprocess.run(["xelatex", "-interaction=nonstopmode", "-halt-on-error", "-enable-installer", "-output-directory", temp_dir, tex_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if not os.path.exists(pdf_path):
            # Fallback to pdfLaTeX
            process = subprocess.run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "-enable-installer", "-output-directory", temp_dir, tex_path], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if not os.path.exists(pdf_path):
            raise Exception("Failed to compile LaTeX.\nLogs: " + process.stdout.decode("utf-8", errors="ignore"))
            
        return FileResponse(path=pdf_path, filename="VidSage_Custom.pdf", media_type="application/pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/masterclass")
def generate_masterclass_notes(request: NotesRequest):
    """Generate a Jupyter Notebook (.ipynb) JSON representing "masterclass" notes for the given video."""
    try:
        notebook_json = rag_service.generate_masterclass_notebook(
            request.video_id, output_format=request.output_format
        )
        return notebook_json
    except RateLimitError as rte:
        raise HTTPException(
            status_code=429,
            detail=str(rte),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
