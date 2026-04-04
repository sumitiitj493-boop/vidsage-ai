"use client";

import { useState, useEffect } from "react";
import mermaid from "mermaid";
import { Loader2, AlertCircle, RefreshCw, Download, ZoomIn, ZoomOut, Maximize, Minimize } from "lucide-react";

interface MindMapViewProps {
  videoId: string | null;
}

export default function MindMapView({ videoId }: MindMapViewProps) {
  const [graphCode, setGraphCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [svgCode, setSvgCode] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const fetchGraph = async () => {
    if (!videoId) return;
    setLoading(true);
    setError(null);
    setSvgCode(null);
    setZoomLevel(1);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${baseUrl}/api/chat/mindmap/${videoId}`);
      if (!res.ok) {
        throw new Error("Failed to generate mind map");
      }
      const data = await res.json();

      let code = data.mermaid || "graph TD\\n  A[Error] --> B[Invalid Data]";

      // Robust error stripping logic: remove triple backticks if present
      code = code.replace(/```mermaid/g, '').replace(/```/g, '').trim();
      renderMermaid(code);

    } catch (err: any) {
      setError(err.message || "Failed to load mind map. Ensure the video is fully processed.");
    } finally {
      setLoading(false);
    }
  };

  const renderMermaid = async (code: string) => {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        flowchart: { htmlLabels: true, curve: "basis" }
      });
      const id = "mermaid-graph-" + Date.now();
      const { svg } = await mermaid.render(id, code);
      setSvgCode(svg);
    } catch (err: any) {
      console.error("Mermaid Render Error:", err);
      // Fallback: If it still fails, the LLM gave us broken syntax despite our prompt.
      setError("AI generated invalid graph syntax. Please try regenerating.");
    }
  };

  const handleDownloadObjectUrl = () => {
    if (!svgCode) return;
    try {
      const blob = new Blob([svgCode], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `MindMap_${videoId}.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Download failed", e);
    }
  };

  useEffect(() => {
    if (videoId && !graphCode && !loading && !error) {
      fetchGraph();
    }
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-slate-500">
        Waiting for a video to be processed...
      </div>
    );
  }

  return (
    <div className={
      isFullScreen 
        ? "fixed inset-4 z-50 rounded-3xl border border-white/10 bg-slate-950 shadow-2xl flex flex-col p-6 overflow-hidden animate-fade-in" 
        : "flex h-full flex-col p-6 overflow-hidden"
    }>
      {isFullScreen && (
        <div className="fixed inset-0 -z-10 bg-black/60 backdrop-blur-sm" onClick={() => setIsFullScreen(false)} />
      )}
      <div className="mb-6 flex items-center justify-between z-10">
        <div>
          <h2 className="text-xl font-bold text-white">Visual Knowledge Graph</h2>
          <p className="text-sm text-slate-400">Interactive AI-generated concept map</p>
        </div>
        <div className="flex items-center gap-3">
          {svgCode && !loading && !error && (
            <>
              <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-800 p-1 mr-2">
                <button
                  onClick={() => setZoomLevel(prev => Math.max(0.2, prev - 0.2))}
                  className="rounded p-1 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <div className="px-2 text-xs font-mono text-slate-300 min-w-[3rem] text-center">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <button
                  onClick={() => setZoomLevel(prev => Math.min(3, prev + 0.2))}
                  className="rounded p-1 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <div className="px-2 text-xs font-mono text-slate-300 min-w-[3rem] text-center border-r border-white/10 pr-3">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="rounded p-1 hover:bg-slate-700 text-slate-300 transition-colors ml-1"
                  title={isFullScreen ? "Exit Full Screen" : "Full Screen View"}
                >
                  {isFullScreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </button>
              </div>

              <button
                onClick={handleDownloadObjectUrl}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 active:bg-slate-600 transition-colors"
                title="Download Graph as SVG"
              >
                <Download className="h-4 w-4" />
                <span>Download</span>
              </button>
            </>
          )}
          <button
            onClick={fetchGraph}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 active:bg-amber-500/30 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{loading ? "Generating..." : "Regenerate Graph"}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/50 p-4 shadow-inner relative overflow-auto custom-scrollbar">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10">
            <Loader2 className="h-10 w-10 animate-spin text-amber-500 mb-4" />
            <p className="text-slate-300 font-medium">AI is structuring the knowledge topology...</p>
            <p className="text-xs text-slate-500 mt-2">This may take 10-15 seconds</p>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/50 p-8 text-center z-10">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Rendering Error</h3>
            <p className="text-slate-400 mb-6 max-w-md">{error}</p>
            <button
              onClick={fetchGraph}
              className="rounded-lg bg-slate-800 px-6 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
            >
              Try Regenerating
            </button>
            <div className="mt-8 text-left w-full max-w-2xl">
              <p className="text-xs text-slate-500 mb-2">Raw Failed Code (For debugging):</p>
              <pre className="text-[10px] text-amber-500 bg-black/50 p-4 rounded-lg overflow-x-auto">
                {graphCode}
              </pre>
            </div>
          </div>
        )}

        {!loading && svgCode && !error && (
          <div 
            className="min-w-fit min-h-[500px] flex items-center justify-center p-8 [&>svg]:min-w-[800px] [&>svg]:h-auto transition-transform duration-300 origin-center"
            style={{ transform: `scale(${zoomLevel})` }}
            dangerouslySetInnerHTML={{ __html: svgCode }}
          />
        )}
      </div>
    </div>
  );
}
