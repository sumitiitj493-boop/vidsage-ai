"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, Download, FileText, Globe, CheckCircle2, ChevronRight, BookOpen, AlertTriangle, ListOrdered, CalendarClock, Link, Code } from "lucide-react";
import { authFetch, getApiBase } from "../../lib/auth";

interface SummaryViewProps {
  videoId: string | null;
}

export default function SummaryView({ videoId }: SummaryViewProps) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = videoId ? `vidsage_summary_json_${videoId}` : null;

  const fetchSummary = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(`${getApiBase()}/api/chat/summary/${videoId}`);
      if (!res.ok) {
        throw new Error("Failed to generate summary");
      }
      const data = await res.json();
      
      let generated = data.summary;
      // Handle the case where backend error returns { summary: { error: "..." } }
      if (generated && generated.error) {
        throw new Error(generated.error);
      }
      if (!generated || Object.keys(generated).length === 0) {
        throw new Error("Empty summary generated.");
      }

      setSummary(generated);
      if (cacheKey) {
        sessionStorage.setItem(cacheKey, JSON.stringify(generated));
      }
    } catch (err: any) {
      setError(err.message || "Failed to load summary. Ensure the video is fully processed.");
    } finally {
      setLoading(false);
    }
  }, [videoId, cacheKey]);

  useEffect(() => {
    if (!videoId) return;
    if (cacheKey && !summary) {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          setSummary(JSON.parse(cached));
          return;
        } catch { }
      }
    }
    if (!summary && !loading && !error) {
      fetchSummary();
    }
  }, [videoId, cacheKey, summary, loading, error, fetchSummary]);

  useEffect(() => {
    if (summary?.code_blocks?.length) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
      script.onload = () => {
        ['python','cpp','javascript','java','bash'].forEach(lang => {
          const s = document.createElement('script');
          s.src = `https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-${lang}.min.js`;
          s.onload = () => (window as any).Prism?.highlightAll();
          document.head.appendChild(s);
        });
      };
      document.head.appendChild(script);

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css';
      document.head.appendChild(link);
    }
  }, [summary]);

  
  const handleDownloadObjectUrl = () => {
    if (!summary) return;
    try {
      // Just JSON file right now
      const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Revision_Summary_${videoId}.json`;
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

      // Clone the element so we can inline all computed styles
      const clone = element.cloneNode(true) as HTMLElement;

      const inlineStyles = (original: Element, cloned: Element) => {
        const computed = window.getComputedStyle(original);
        const styleStr = Array.from(computed).map(
          (prop) => `${prop}:${computed.getPropertyValue(prop)}`
        ).join(";");
        (cloned as HTMLElement).style.cssText = styleStr;
        const origChildren = original.children;
        const clonedChildren = cloned.children;
        for (let i = 0; i < origChildren.length; i++) {
          inlineStyles(origChildren[i], clonedChildren[i]);
        }
      };

      inlineStyles(element, clone);

      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VidSage — ${summary.title || "Revision Notes"}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-cpp.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-java.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background-color: #010511;
      background-image: radial-gradient(circle at top, rgba(255,255,255,0.08), transparent 55%),
                        linear-gradient(135deg, #010511, #05081a, #0b1220);
      background-attachment: fixed;
      min-height: 100vh;
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      padding: 2rem 1rem;
      color: #e2e8f0;
    }
    .export-wrapper {
      max-width: 950px;
      margin: 0 auto;
    }
    .print-bar {
      display: flex; justify-content: flex-end;
      margin-bottom: 20px;
    }
    .print-btn {
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: white; border: none; padding: 10px 22px;
      font-size: 14px; font-weight: 600; border-radius: 8px;
      cursor: pointer; box-shadow: 0 4px 12px rgba(79,70,229,0.3);
    }
    @media print {
      .print-bar { display: none !important; }
      html, body { background: #010511 !important; padding: 0; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="export-wrapper">
    <div class="print-bar">
      <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
    ${clone.outerHTML}
  </div>
  <script>
    document.querySelectorAll('pre code').forEach(block => {
      if (window.Prism) Prism.highlightElement(block);
    });
  </script>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VidSage_${(summary.title || "Notes").replace(/\s+/g, "_")}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("HTML export failed:", err);
    }
  };


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
          <p className="text-sm text-slate-400">Structured dynamic notes</p>
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
                  title="Download Summary Data as JSON"
              >
                <Download className="h-4 w-4" />
                <span>Download .json</span>
              </button>
            </>
          )}
          <button
            onClick={fetchSummary}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 active:bg-amber-500/30 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{loading ? "Synthesizing Notes..." : "Regenerate Summary"}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/50 shadow-inner relative overflow-y-auto custom-scrollbar">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 rounded-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
            <p className="text-slate-300 font-medium">Synthesizing dynamic structured notes...</p>
            <p className="text-xs text-slate-500 mt-2">Adjusting to video context</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 p-8 text-center z-10 rounded-2xl">
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
            <div id="pdf-export-content" className="p-8 text-slate-200">
                {/* Title & Gist */}
                <div className="mb-10 text-center">
                    <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-amber-500/30">
                        {summary.video_type?.replace('_', ' ')}
                    </span>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-6">
                        {summary.title || "Video Revision Notes"}
                    </h1>
                    <div className="max-w-3xl mx-auto text-lg text-slate-300 leading-relaxed bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50">
                        {summary.gist}
                    </div>
                </div>

                {/* Most Memorable */}
                {summary.memorable && (
                    <div className="mb-12 border-l-4 border-l-violet-500 bg-violet-500/10 p-6 rounded-r-2xl shadow-lg border-y border-r border-y-violet-500/20 border-r-violet-500/20">
                        <p className="text-violet-300 font-bold mb-2 flex items-center gap-2">
                            <BookOpen className="w-5 h-5" /> Most Memorable
                        </p>
                        <p className="italic text-lg text-slate-200">{summary.memorable}</p>
                    </div>
                )}

                {/* Main Points */}
                {summary.main_points && summary.main_points.length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-amber-400 mb-6 border-b border-slate-700 pb-2">Key Takeaways</h2>
                        <ul className="space-y-4">
                            {summary.main_points.map((pt: string, idx: number) => (
                                <li key={idx} className="flex gap-4 p-4 bg-slate-800/60 rounded-xl border border-white/5 shadow-md">
                                    <div className="flex-shrink-0 mt-1">
                                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <span className="text-[1.05rem] leading-relaxed text-slate-200">{pt}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-8 mb-12">
                    {/* Definitions & Terms */}
                    {summary.terms && summary.terms.length > 0 && (
                        <div>
                            <h2 className="text-2xl font-bold text-amber-400 mb-6 border-b border-slate-700 pb-2">Concepts & Terms</h2>
                            <div className="space-y-4">
                                {summary.terms.map((term: any, idx: number) => (
                                    <div key={idx} className="p-5 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 shadow-md">
                                        <h4 className="text-emerald-400 font-bold text-lg mb-2">{term.word}</h4>
                                        <p className="text-slate-300 text-sm leading-relaxed">{term.meaning}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mistakes & Gotchas */}
                    {summary.mistakes && summary.mistakes.length > 0 && (
                        <div>
                            <h2 className="text-2xl font-bold text-red-400 mb-6 border-b border-slate-700 pb-2 flex items-center gap-2">
                                <AlertTriangle className="w-6 h-6" /> Common Mistakes
                            </h2>
                            <div className="space-y-4">
                                {summary.mistakes.map((mistake: any, idx: number) => (
                                    <div key={idx} className="p-5 bg-red-950/30 rounded-xl border border-red-900/50 shadow-md">
                                        <div className="mb-3">
                                            <span className="text-xs font-bold text-red-500 uppercase tracking-wider mb-1 block">Wrong</span>
                                            <p className="text-slate-300 text-sm line-through decoration-red-500/50">{mistake.wrong}</p>
                                        </div>
                                        <div className="mb-3">
                                            <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1 block">Right</span>
                                            <p className="text-slate-200 text-sm font-medium">{mistake.right}</p>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-red-900/50">
                                            <p className="text-red-300 text-xs font-medium"><span className="text-red-400 font-bold">Why:</span> {mistake.why}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Steps / Process */}
                {summary.steps && summary.steps.length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-amber-400 mb-6 border-b border-slate-700 pb-2 flex items-center gap-2">
                            <ListOrdered className="w-6 h-6" /> Process / Steps
                        </h2>
                        <div className="relative border-l border-indigo-500/30 ml-4 space-y-6">
                            {summary.steps.map((step: string, idx: number) => (
                                <div key={idx} className="relative pl-8">
                                    <div className="absolute -left-[17px] top-1 w-8 h-8 rounded-full bg-slate-900 border-2 border-indigo-500 flex items-center justify-center text-indigo-400 font-bold text-sm">
                                        {idx + 1}
                                    </div>
                                    <div className="bg-slate-800/80 p-5 rounded-xl border border-slate-700/80 text-slate-200 text-sm leading-relaxed">
                                        {step}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recall Q&A */}
                {summary.recall_qa && summary.recall_qa.length > 0 && (
                    <div className="mb-12 page-break">
                        <h2 className="text-2xl font-bold text-amber-400 mb-6 border-b border-slate-700 pb-2">Active Recall Q&A</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {summary.recall_qa.map((qa: any, idx: number) => (
                                <div key={idx} className="group relative perspective-1000">
                                    <div className="p-6 bg-slate-800 border border-slate-700 rounded-xl h-full shadow-lg transition-all duration-300 hover:bg-slate-700">
                                        <h4 className="text-sky-400 font-bold mb-3 flex items-start gap-2">
                                            <span className="text-sky-500/50">Q:</span> {qa.q}
                                        </h4>
                                        <div className="pt-3 border-t border-slate-600">
                                            <span className="text-emerald-500/50 font-bold mr-2">A:</span> 
                                            <span className="text-slate-300">{qa.a}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Timeline */}
                {summary.timeline && summary.timeline.length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-2xl font-bold text-amber-400 mb-6 border-b border-slate-700 pb-2 flex items-center gap-2">
                            <CalendarClock className="w-6 h-6" /> Timeline / Events
                        </h2>
                        <div className="space-y-4">
                            {summary.timeline.map((event: any, idx: number) => (
                                <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 bg-slate-800/40 rounded-xl border border-white/5">
                                    <div className="md:w-1/4 flex-shrink-0 font-bold text-amber-500 border-b md:border-b-0 md:border-r border-amber-500/20 pb-2 md:pb-0 md:pr-4">
                                        {event.period}
                                    </div>
                                    <div className="text-slate-300">
                                        {event.event}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Code Blocks */}
                {summary.code_blocks && summary.code_blocks.length > 0 && (
                  <div className="mb-12">
                    <h2 className="text-2xl font-bold text-amber-400 mb-6 border-b border-slate-700 pb-2 flex items-center gap-2">
                      <Code className="w-5 h-5" /> Technical References
                    </h2>
                    <div className="flex flex-col gap-6">
                      {summary.code_blocks.map((block: any, index: number) => (
                        <div key={index} className="rounded-xl overflow-hidden border border-slate-700/50">
                          <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700/50">
                            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">{block.label}</span>
                            <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">{block.language}</span>
                          </div>
                          <pre className="!m-0 !rounded-none overflow-x-auto bg-[#1e1e2e] p-5 text-sm leading-relaxed">
                            <code className={`language-${block.language}`}>
                              {block.code}
                            </code>
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Steps / Resources */}
                {summary.next_steps && summary.next_steps.length > 0 && (
                    <div className="mb-8 p-6 bg-indigo-900/20 border border-indigo-500/30 rounded-2xl">
                        <h2 className="text-xl font-bold text-indigo-400 mb-4 flex items-center gap-2">
                            <Link className="w-5 h-5" /> Recommended Next Steps
                        </h2>
                        <ul className="space-y-2 text-slate-300">
                            {summary.next_steps.map((step: string, idx: number) => (
                                <li key={idx} className="flex bg-slate-800/80 p-3 rounded-lg"><ChevronRight className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" /> {step}</li>
                            ))}
                        </ul>
                    </div>
                )}

            </div>
        )}
      </div>
    </div>
  );
}