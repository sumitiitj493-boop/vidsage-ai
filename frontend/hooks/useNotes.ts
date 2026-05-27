import { useState, useCallback, useEffect } from "react";
import { NotesFormat } from "../lib/types/dashboard";
import { stripEmojis, keepEnglishOnly } from "../lib/utils/formatters";
import { convertMarkdownToHtmlStr, normalizeMathMarkdown } from "../lib/utils/markdown";
import { authFetch } from "../lib/auth";

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
      const res = await authFetch(`${apiBase}/api/notes/masterclass`, {
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
    const customCellsHtml = notesNotebook.cells
      ?.map((cell: any) => {
        if (!cell || cell.cell_type !== "markdown") return "";
        let src = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
        
        // Clean timestamp / segment lines if present
        src = src.split("\n")
                 .filter((line: string) => !/^\\s*-?\\s*Timestamp\\s*[:=]/i.test(line))
                 .filter((line: string) => !/^\\s*Segment\\s*\\(.*\\)/i.test(line))
           .join("\n");

        const normalized = normalizeMathMarkdown(src, videoId ?? "");
        const cellHtml = convertMarkdownToHtmlStr(normalized);
        return `<div class="notebook-cell">\n${cellHtml}\n</div>`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${videoTitle || "Notes"}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.0/github-markdown.min.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css" />
  <style>
    body { background-color: #0d1117; padding: 40px; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .notes-container { max-width: 900px; margin: 0 auto; }
    .notes-header {
      background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1a1f29 100%);
      padding: 24px; border-left: 6px solid #a371f7; border-radius: 12px;
      margin-bottom: 32px; box-shadow: 0 4px 15px rgba(163, 113, 247, 0.2);
    }
    .notes-header h1 { margin: 0 0 8px 0; font-size: 2.25rem; color: #f0f6fc; }
    .notes-header p { margin: 0; color: #8b949e; font-size: 1.1rem; }
    .markdown-body {
      box-sizing: border-box; min-width: 200px; margin: 0 auto;
      background-color: transparent; padding: 0;
    }
    .notebook-cell {
      background: #161b22; border: 1px solid #30363d; border-radius: 12px;
      padding: 32px; margin-bottom: 24px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      transition: border-color 0.2s ease;
    }
    
    /* Beautiful Custom Overrides */
    .markdown-body h1, .markdown-body h2, .markdown-body h3 {
      color: #d2a8ff;
      border-bottom: 1px solid #30363d;
      padding-bottom: 0.3em;
    }
    .markdown-body a { color: #58a6ff; text-decoration: none; font-weight: 500; }
    .markdown-body a:hover { text-decoration: underline; }
    
    /* Callout / Box styling for Blockquotes */
    .markdown-body blockquote {
      margin: 1.5em 0;
      padding: 1em 1.2em;
      color: #c9d1d9;
      background-color: rgba(163, 113, 247, 0.1);
      border-left: 4px solid #a371f7;
      border-radius: 4px;
    }
    
    /* Highlighted Code / Math visibility improvements */
    .markdown-body pre { background-color: #0d1117; border: 1px solid #30363d; border-radius: 8px; }
    .katex-display { margin: 1.5em 0; overflow-x: auto; overflow-y: hidden; }
    
    @media (prefers-color-scheme: light) {
      body { background-color: #f6f8fa; }
      .notes-header { background: #ffffff; box-shadow: 0 4px 15px rgba(163, 113, 247, 0.15); }
      .notes-header h1 { color: #24292f; }
      .notes-header p { color: #57606a; }
      .notebook-cell { background: #ffffff; border-color: #d0d7de; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
      
      .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #6f42c1; border-bottom-color: #d0d7de; }
      .markdown-body a { color: #0969da; }
      .markdown-body blockquote { background-color: rgba(111, 66, 193, 0.08); border-left-color: #6f42c1; color: #24292f; }
      .markdown-body pre { background-color: #f6f8fa; border-color: #d0d7de; }
    }
    
    @media print {
      body { padding: 0; background-color: white; }
      .notes-container { max-width: 100%; top: 0 !important; margin: 0 !important; }
      .notebook-cell { border: none; padding: 0; margin-bottom: 30px; box-shadow: none; page-break-inside: avoid; background: white !important; }
      .notes-header { box-shadow: none; border-left: 4px solid #a371f7; background: #f6f8fa !important; }
      .notes-header h1 { color: #000 !important; }
      .no-print { display: none !important; }
      * {
        color: black !important;
        text-shadow: none !important;
        background-color: transparent !important;
      }
      body *, .markdown-body * {
        color: black !important;
      }
      pre, blockquote, code {
        border: 1px solid #ccc !important;
        page-break-inside: avoid;
      }
      table, th, td { border: 1px solid #ccc !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="position: sticky; top: 0; z-index: 50; padding: 16px; background: rgba(13, 17, 23, 0.95); backdrop-filter: blur(10px); border-bottom: 1px solid #30363d; display: flex; justify-content: flex-end; margin-bottom: 24px;">
    <button onclick="window.print()" style="background: #a371f7; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(163, 113, 247, 0.3); transition: all 0.2s;">🖨️ Print / Save as PDF</button>
  </div>
  <div class="notes-container">
    <div class="notes-header">
      <h1>Masterclass Notes</h1>
      <p>Generated from transcript</p>
    </div>
    <div class="markdown-body">
      ${customCellsHtml}
    </div>
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

        // Simple LaTeX markup conversions
        text = text.replace(/^######\s*(.+)$/gm, "\\subsubsubsection{$1}");
        text = text.replace(/^#####\s*(.+)$/gm, "\\subsubsection{$1}");
        text = text.replace(/^####\s*(.+)$/gm, "\\subsection{$1}");
        text = text.replace(/^###\s*(.+)$/gm, "\\section{$1}");
        text = text.replace(/^##\s*(.+)$/gm, "\\subsection{$1}");
        text = text.replace(/^#\s*(.+)$/gm, "\\section{$1}");

        // Bold and italic
        text = text.replace(/\*\*(.*?)\*\*/g, "\\textbf{$1}");
        text = text.replace(/\*(.*?)\*/g, "\\textit{$1}");
        text = text.replace(/__(.*?)__/g, "\\textbf{$1}");
        text = text.replace(/_(.*?)_/g, "\\textit{$1}");

        // XML Tags
        text = text.replace(/<card>([\s\S]*?)<\/card>/g, "\\begin{tcolorbox}[colback=blue!5!white,colframe=blue!75!black,title=Explanation]\n$1\n\\end{tcolorbox}");
        text = text.replace(/<tip>([\s\S]*?)<\/tip>/g, "\\begin{tcolorbox}[colback=purple!5!white,colframe=purple!75!black,title=Pro Tip]\n$1\n\\end{tcolorbox}");
        text = text.replace(/<warning>([\s\S]*?)<\/warning>/g, "\\begin{tcolorbox}[colback=red!5!white,colframe=red!75!black,title=Warning]\n$1\n\\end{tcolorbox}");
        text = text.replace(/<important>([\s\S]*?)<\/important>/g, "\\begin{tcolorbox}[colback=green!5!white,colframe=green!75!black,title=Important Concept]\n$1\n\\end{tcolorbox}");

        // Basic inline formula parsing (if present)
        text = text.replace(/\$\$(.*?)\$\$/g, "\\[ $1 \\]"); // Block
        text = text.replace(/\$(.*?)\$/g, "\\($1\\)"); // Inline

        const lines = text.split("\n");
        let inItemize = false;
        let inBlockquote = false;
        let inTable = false;
        const out = [];
        for (let rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) {
            if (inItemize) { out.push("\\end{itemize}"); inItemize = false; }
            if (inBlockquote) { out.push("\\end{tcolorbox}"); inBlockquote = false; }
            if (inTable) { out.push("\\end{tabular}\\n\\end{center}\\n\\end{table}"); inTable = false; }
            out.push(""); continue;
          }

          // Table parser simple
          if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            if (inItemize) { out.push("\\end{itemize}"); inItemize = false; }
            if (inBlockquote) { out.push("\\end{tcolorbox}"); inBlockquote = false; }
            
            const cols = trimmed.split("|").slice(1, -1).map((c: string) => c.trim());
            // is it a separator row?
            const isSeparator = cols.every((c: string) => /^[\\s:-—-]*$/.test(c.replace(/—/g, '-')));
            
            if (!inTable) {
              if (isSeparator) continue; // ignore leading separator without header
              inTable = true;
              const formatStr = cols.map(() => "l").join("|");
              out.push("\\begin{table}[h!]\\n\\begin{center}\\n\\begin{tabular}{|" + formatStr + "|}");
              out.push("\\hline");
              out.push(cols.join(" & ") + " \\\\ \\hline");
            } else {
              if (isSeparator) {
                 // out.push("\\hline"); 
              } else {
                 out.push(cols.join(" & ") + " \\\\ \\hline");
              }
            }
            continue;
          } else {
            if (inTable) { out.push("\\end{tabular}\\n\\end{center}\\n\\end{table}"); inTable = false; }
          }
          
          const bqMatch = trimmed.match(/^>\s*(.*)$/);
          if (bqMatch) {
            if (inItemize) { out.push("\\end{itemize}"); inItemize = false; }
            if (!inBlockquote) { 
               out.push("\\begin{tcolorbox}[colback=blue!5!white, colframe=blue!75!black, title=Key Insight, breakable]"); 
               inBlockquote = true; 
            }
            out.push(bqMatch[1]);
            continue;
          } else {
            if (inBlockquote) { out.push("\\end{tcolorbox}"); inBlockquote = false; }
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
        if (inBlockquote) out.push("\\end{tcolorbox}");
        if (inTable) out.push("\\end{tabular}\\n\\end{center}\\n\\end{table}");
        return out.join("\n");
      })
      .join("\n\n");

    const safeTitle = stripEmojis(videoTitle || "Notes").replace(/([&%$#_{}~^\\])/g, '\\$1');
    const fancyPreamble = `\\documentclass{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath,amssymb}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{xcolor}
\\usepackage{tcolorbox}
\\tcbuselibrary{skins,breakable}
\\usepackage{listings}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{sectsty}
\\sectionfont{\\color{blue!80!black}}
\\subsectionfont{\\color{purple!80!black}}
\\subsubsectionfont{\\color{teal!80!black}}
\\begin{document}
\\title{${safeTitle}}
\\maketitle
`;
    return `${fancyPreamble}\n${content}\n\\end{document}`;
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
      const latex_code = getNotesLatex();
      const response = await authFetch(`${apiBase}/api/notes/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex_code: latex_code })
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