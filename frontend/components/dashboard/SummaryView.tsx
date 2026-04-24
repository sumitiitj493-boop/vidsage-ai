"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { Loader2, RefreshCw, Download, FileText, Globe } from "lucide-react";
import { normalizeMathMarkdown } from "../../lib/utils/markdown";
import { authFetch, getApiBase } from "../../lib/auth";

interface SummaryViewProps {
  videoId: string | null;
}

export default function SummaryView({ videoId }: SummaryViewProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = videoId ? `vidsage_summary_${videoId}` : null;

  const fetchSummary = async () => {
    if (!videoId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${getApiBase()}/api/chat/summary/${videoId}`);
      if (!res.ok) {
        throw new Error("Failed to generate summary");
      }
      const data = await res.json();
      const generated = data.summary || "No summary generated.";
      setSummary(generated);
      if (cacheKey) {
        sessionStorage.setItem(cacheKey, generated);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load summary. Ensure the video is fully processed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadObjectUrl = () => {
    if (!summary) return;
    try {
      const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Revision_Summary_${videoId}.md`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  const handleDownloadHtml = () => {
    if (!summary) return;
    
    try {
      const element = document.getElementById("pdf-export-content");
      if (!element) return;
      
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VidSage Revision Summary</title>
  <!-- Load Tailwind CSS via CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
  <!-- Load KaTeX CSS for math formulas -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  
  <style>
    body {
      background-color: #0f172a; /* Tailwind slate-900 */
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      padding: 3rem 1rem;
    }
    .export-container {
      max-width: 900px;
      margin: 0 auto;
      background-color: #0f172a;
    }
    /* Ensure elements force print styling inside browser if printed later */
    @media print {
      body { background-color: white !important; }
      .export-container { max-width: 100%; top: 0 !important; margin: 0 !important; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="position: sticky; top: 0; z-index: 50; padding: 16px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); border-bottom: 1px solid #1e293b; display: flex; justify-content: flex-end; margin-bottom: 24px;">
    <button onclick="window.print()" style="background: #4f46e5; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); transition: all 0.2s;">🖨️ Print / Save as PDF</button>
  </div>
  <div class="export-container">
    ${element.outerHTML}
  </div>
</body>
</html>
      `;

      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `VidSage_Revision_${videoId}.html`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("HTML generation failed", e);
    }
  };

  useEffect(() => {
    if (!videoId) return;
    if (cacheKey && !summary) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        setSummary(cached);
        return;
      }
    }
    if (!summary && !loading && !error) {
      fetchSummary();
    }
  }, [videoId, cacheKey, summary, loading, error]);

  if (!videoId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-slate-500">
        Waiting for a video to be processed...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-6 overflow-hidden">
      <div className="mb-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Revision Summary</h2>
          <p className="text-sm text-slate-400">Structured markdown cheat sheet</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {summary && !loading && !error && (
            <>
              <button
                onClick={handleDownloadHtml}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-indigo-600/20 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-600/40 active:bg-indigo-600/60 transition-colors"
                title="Save page as an interactive HTML file"
              >
                <Globe className="h-4 w-4" />
                <span>Save as HTML</span>
              </button>
              
              <button
                onClick={handleDownloadObjectUrl}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 active:bg-slate-600 transition-colors"
                  title="Download Summary as MD"
              >
                <Download className="h-4 w-4" />
                <span>Download .md</span>
              </button>
            </>
          )}
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 active:bg-amber-500/30 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{loading ? "Drafting..." : "Regenerate Summary"}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/50 p-6 shadow-inner relative overflow-y-auto custom-scrollbar">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
            <p className="text-slate-300 font-medium">Synthesizing key transcript concepts...</p>
            <p className="text-xs text-slate-500 mt-2">This may take a moment</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 p-8 text-center z-10">
            <FileText className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Summary Error</h3>
            <p className="text-slate-400 mb-6 max-w-md">{error}</p>
            <button
              onClick={fetchSummary}
              className="rounded-lg bg-slate-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Try Regenerating
            </button>
          </div>
        )}

        {!loading && summary && !error && (
            <div id="pdf-export-content" className="prose prose-invert max-w-none 
                prose-headings:text-amber-400 prose-headings:font-bold 
                prose-h1:border-b prose-h1:border-slate-800 prose-h1:pb-3 prose-h1:text-3xl
                prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-6 prose-h2:border-b prose-h2:border-amber-500/20 prose-h2:pb-2
                prose-h3:text-amber-300 prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-4
                prose-h4:text-emerald-400 prose-h4:text-lg prose-h4:mt-8 prose-h4:mb-3
                prose-a:text-blue-400 hover:prose-a:text-blue-300
                prose-strong:text-emerald-400 prose-strong:font-bold
                prose-em:text-violet-300
                prose-blockquote:border-l-4 prose-blockquote:border-l-amber-500 prose-blockquote:bg-amber-500/10 prose-blockquote:px-5 prose-blockquote:py-4 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:shadow-lg hover:prose-blockquote:bg-amber-500/20 prose-blockquote:transition-all prose-blockquote:text-slate-200 prose-blockquote:my-8
                prose-table:w-full prose-table:overflow-hidden prose-table:rounded-2xl prose-table:shadow-2xl prose-table:border prose-table:border-emerald-500/20 prose-table:border-collapse prose-table:my-10 prose-table:bg-slate-900/50 hover:prose-table:border-emerald-500/50 hover:prose-table:shadow-emerald-500/10 prose-table:transition-all prose-table:duration-500
                prose-th:bg-gradient-to-r prose-th:from-emerald-700/90 prose-th:to-emerald-500/90 prose-th:p-5 prose-th:text-left prose-th:text-white prose-th:font-extrabold prose-th:tracking-wider prose-th:uppercase prose-th:text-sm prose-th:border prose-th:border-slate-600/60
                prose-td:px-5 prose-td:py-4 prose-td:border prose-td:border-slate-600/50 prose-td:text-slate-200
                prose-tr:even:bg-slate-800/50 prose-tr:odd:bg-transparent
                prose-tr:hover:bg-slate-700/50 prose-tr:transition-colors
                prose-li:marker:text-amber-500 prose-li:my-3 prose-li:text-slate-200
                prose-p:my-5 prose-p:text-slate-200
                prose-code:text-pink-400 prose-code:bg-pink-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-mono prose-code:text-sm prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-slate-900 prose-pre:border prose-pre:border-white/10 prose-pre:shadow-lg
                prose-hr:border-slate-800 prose-hr:my-10
                text-slate-200 leading-loose text-[1.05rem] tracking-wide px-4 py-2">
                <ReactMarkdown
                    remarkPlugins={[remarkMath, remarkGfm]}
                    rehypePlugins={[rehypeKatex, rehypeRaw] as any}
                    components={({
                      card: ({node, children, ...props}: any) => (
                        <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/80 border border-slate-700/50 p-6 my-6 rounded-2xl shadow-xl hover:shadow-indigo-500/20 hover:border-indigo-400/30 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                          {children}
                        </div>
                      ),
                      tip: ({node, children, ...props}: any) => (
                        <div className="bg-violet-950/40 border-l-4 border-violet-500 p-6 my-6 rounded-r-xl shadow-xl hover:shadow-violet-500/10 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                          <div className="text-violet-300 font-extrabold mb-3 flex items-center gap-2 text-lg">💡 Pro Tip</div>
                          <div className="text-slate-200">{children}</div>
                        </div>
                      ),
                      warning: ({node, children, ...props}: any) => (
                        <div className="bg-red-950/40 border-l-4 border-red-500 p-6 my-6 rounded-r-xl shadow-xl hover:shadow-red-500/10 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                          <div className="text-red-400 font-extrabold mb-3 flex items-center gap-2 text-lg">⚠️ Warning</div>
                          <div className="text-slate-200">{children}</div>
                        </div>
                      ),
                      important: ({node, children, ...props}: any) => (
                        <div className="bg-emerald-950/40 border-l-4 border-emerald-500 p-6 my-6 rounded-r-xl shadow-xl hover:shadow-emerald-500/10 transition-all duration-300 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>ul]:m-0 [&>ol]:m-0 [&_li]:my-1" {...props}>
                          <div className="text-emerald-400 font-extrabold mb-3 flex items-center gap-2 text-lg">🎯 Important Concept</div>
                          <div className="text-slate-200">{children}</div>
                        </div>
                      ),
                    } as any)}
                >
                    {normalizeMathMarkdown(summary, videoId)}
                </ReactMarkdown>
            </div>
        )}
      </div>
    </div>
  );
}