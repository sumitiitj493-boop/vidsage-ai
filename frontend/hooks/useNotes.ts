import { useState, useCallback, useEffect } from "react";
import { NotesFormat } from "../lib/types/dashboard";
import { stripEmojis, keepEnglishOnly } from "../lib/utils/formatters";
import { convertMarkdownToHtmlStr } from "../lib/utils/markdown";

export function useNotes(videoId: string | undefined | null, videoTitle: string, activeMode: string) {
  const [notesNotebook, setNotesNotebook] = useState<any | null>(null);
  const [notesFormat, setNotesFormat] = useState<NotesFormat>("markdown");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  // Reset notes when switching video
  useEffect(() => {
    setNotesNotebook(null);
    setNotesError(null);
  }, [videoId]);

  const fetchMasterclassNotes = useCallback(async () => {
    if (!videoId) return;
    setNotesLoading(true);
    setNotesError(null);

    try {
      const res = await fetch(`${apiBase}/api/notes/masterclass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, output_format: notesFormat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.message || "Failed to generate notes");
      setNotesNotebook(data);
    } catch (e: any) {
      setNotesError(e?.message || String(e));
    } finally {
      setNotesLoading(false);
    }
  }, [videoId, notesFormat, apiBase]);

  // Load automatically once
  useEffect(() => {
    if (activeMode === "notes" && videoId && !notesNotebook && !notesLoading && !notesError) {
      fetchMasterclassNotes();
    }
  }, [activeMode, videoId, notesNotebook, notesLoading, notesError, fetchMasterclassNotes]);

  // Generators for the different file types
  const getNotesHtml = useCallback(() => {
    if (!notesNotebook) return "";
    const cellsHtml = notesNotebook.cells
      ?.map((cell: any) => {
        if (!cell || cell.cell_type !== "markdown") return "";
        const src = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
        return convertMarkdownToHtmlStr(src);
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${videoTitle || "Notes"}</title>
  <style>
    body { background: #0d1117; color: #c9d1d9; font-family: system-ui, sans-serif; padding: 2rem; }
    h1, h2, h3 { color: #f0f6fc; }
    .notes-header {
      background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1a1f29 100%);
      padding: 24px; border-left: 6px solid #a371f7; border-radius: 12px;
      margin-bottom: 24px; box-shadow: 0 4px 15px rgba(163, 113, 247, 0.2);
    }
    .notes-header h1 { margin: 0; font-size: 2.25rem; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 18px; margin-bottom: 18px; }
  </style>
</head>
<body>
  <div class="notes-header">
    <h1>🚀 Masterclass Notes</h1>
    <p>Generated from transcript</p>
  </div>
  <div class="card">
    ${cellsHtml}
  </div>
</body>
</html>`;
  }, [notesNotebook, videoTitle]);

  const getNotesLatex = useCallback(() => {
    if (!notesNotebook) return "";

    const content = notesNotebook.cells
      ?.map((cell: any) => {
        if (!cell || cell.cell_type !== "markdown") return "";
        let text = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
        text = stripEmojis(text);
        text = keepEnglishOnly(text);

        // Simple LaTeX markup conversions
        text = text.replace(/^######\s*(.+)$/gm, "\\subsubsubsection{$1}");
        text = text.replace(/^#####\s*(.+)$/gm, "\\subsubsection{$1}");
        text = text.replace(/^####\s*(.+)$/gm, "\\subsection{$1}");
        text = text.replace(/^###\s*(.+)$/gm, "\\section{$1}");
        text = text.replace(/^##\s*(.+)$/gm, "\\subsection{$1}");
        text = text.replace(/^#\s*(.+)$/gm, "\\section{$1}");

        const lines = text.split("\n");
        let inItemize = false;
        const out = [];
        for (let rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) {
            if (inItemize) { out.push("\\end{itemize}"); inItemize = false; }
            out.push(""); continue;
          }
          const itemMatch = trimmed.match(/^[-*+]\s+(.+)$/);
          if (itemMatch) {
            if (!inItemize) { out.push("\\begin{itemize}"); inItemize = true; }
            out.push(`\\item ${itemMatch[1].replace(/^\*\s*-\s*/, "").replace(/^[-]\s*\*\s*/, "").replace(/^\*\s*\*\s*/, "")}`);
            continue;
          }
          if (inItemize) { out.push("\\end{itemize}"); inItemize = false; }
          out.push(trimmed);
        }
        if (inItemize) out.push("\\end{itemize}");
        return out.join("\n");
      })
      .join("\n\n");

    const safeTitle = keepEnglishOnly(stripEmojis(videoTitle || "Notes"));
    return `\\documentclass{article}\\usepackage{amsmath,amssymb}\\begin{document}\\title{${safeTitle}}\\maketitle\n\n${content}\n\\end{document}`;
  }, [notesNotebook, videoTitle]);

  // Downloader utilities
  const downloadNotesNotebook = () => {
    if (!notesNotebook) return;
    const blob = new Blob([JSON.stringify(notesNotebook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${videoTitle || "notes"}.ipynb`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadNotesLatex = () => {
    const latex = getNotesLatex();
    if (!latex) return;
    const blob = new Blob([latex], { type: "application/x-latex" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${videoTitle || "notes"}.tex`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const downloadNotesHtml = () => {
    const html = getNotesHtml();
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${videoTitle || "notes"}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openInOverleaf = () => {
    const latex = getNotesLatex();
    if (!latex) return;
    const uint8 = new TextEncoder().encode(latex);
    let binary = "";
    for (let i = 0; i < uint8.length; i += 1) binary += String.fromCharCode(uint8[i]);
    const base64 = btoa(binary);

    const form = document.createElement("form");
    form.action = "https://www.overleaf.com/docs";
    form.method = "POST";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "snip_uri";
    input.value = `data:application/x-tex;base64,${base64}`;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
  };

  const printNotesPdf = () => {
    const html = getNotesHtml();
    if (!html) return;
    const printWindow = window.open("", "_blank", "width=900,height=800");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.addEventListener("afterprint", () => printWindow.close());
    setTimeout(() => printWindow.print(), 250);
  };

  const downloadNotesPdfBackend = async () => {
    if (!notesNotebook || !videoId) return;
    try {
      const response = await fetch(`http://localhost:8000/api/notes/download/pdf/${videoId}`, {
        method: "GET"
      });
      if (!response.ok) throw new Error("Failed to download backend PDF");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${videoTitle || "notes"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to download PDF from backend");
    }
  };

  return {
    notesNotebook,
    notesFormat, setNotesFormat,
    notesLoading,
    notesError,
    fetchMasterclassNotes,
    downloadNotesNotebook,
    downloadNotesLatex,
    downloadNotesHtml,
    downloadNotesPdfBackend,
    getNotesLatex,
    openInOverleaf,
    printNotesPdf
  };
}