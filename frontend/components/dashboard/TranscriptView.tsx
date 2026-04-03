import { useState, useEffect } from "react";
import { Copy, ZoomIn, ZoomOut, Type, FileText } from "lucide-react";

interface TranscriptViewProps {
  transcriptText: string;
  setTranscriptText: (text: string) => void;
  inputMode?: string;
  pdfFile?: File | null;
}

export default function TranscriptView({ transcriptText, setTranscriptText, inputMode, pdfFile }: TranscriptViewProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (inputMode === 'pdf' && pdfFile) {
      const url = window.URL.createObjectURL(pdfFile);
      setPdfUrl(url);
      return () => window.URL.revokeObjectURL(url);
    } else {
      setPdfUrl(null);
    }
  }, [inputMode, pdfFile]);
  
  // Text formatting state
  const [fontSize, setFontSize] = useState(15);
  const [fontFamily, setFontFamily] = useState<"font-sans" | "font-serif" | "font-mono">("font-sans");

  const cycleFontFamily = () => {
    if (fontFamily === "font-sans") setFontFamily("font-serif");
    else if (fontFamily === "font-serif") setFontFamily("font-mono");
    else setFontFamily("font-sans");
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcriptText);
      setCopyHint("Copied!");
      setTimeout(() => setCopyHint(""), 1500);
    } catch {
      setCopyHint("Copy failed");
      setTimeout(() => setCopyHint(""), 1500);
    }
  };

  return (
    <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-2xl shadow-xl shadow-black/30 w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">{inputMode === 'pdf' ? 'Original Document' : 'Transcript'}</h2>
      </div>

      <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-5 text-sm text-slate-200 custom-scrollbar relative min-h-[50vh]">
        {inputMode === 'pdf' ? (
          pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-full min-h-[50vh] rounded-md bg-white/5" title="Uploaded PDF" />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 h-full">
              <FileText className="h-10 w-10 mb-3 opacity-20" />
              <p>No PDF file selected or available yet.</p>
            </div>
          )
        ) : transcriptText ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Raw Transcript Available
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {showTranscript && (
                  <>
                    <button
                      type="button"
                      onClick={() => setFontSize(Math.max(10, fontSize - 1))}
                      className="p-1.5 rounded-md bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
                      title="Decrease font size"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <div className="bg-slate-950/50 px-2 py-1 rounded border border-white/5 text-xs text-slate-400 font-mono w-8 text-center">{fontSize}</div>
                    <button
                      type="button"
                      onClick={() => setFontSize(Math.min(30, fontSize + 1))}
                      className="p-1.5 rounded-md bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
                      title="Increase font size"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    
                    <div className="h-4 w-px bg-white/10 mx-1"></div>

                    <button
                      type="button"
                      onClick={cycleFontFamily}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs font-medium text-slate-300 hover:bg-white/10 transition-colors capitalize"
                      title="Change font style"
                    >
                      <Type className="h-3 w-3" />
                      {fontFamily.split('-')[1]}
                    </button>
                    
                    <div className="h-4 w-px bg-white/10 mx-1"></div>
                  </>
                )}

                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-4 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
                >
                  <Copy className="h-3 w-3" />
                  {copyHint || "Copy text"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTranscriptText("");
                    setShowTranscript(false);
                  }}
                  className="rounded-full bg-red-500/10 border border-red-500/20 px-4 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setShowTranscript((prev) => !prev)}
                  className={
                    "rounded-full border px-4 py-1.5 text-xs font-bold transition-all " +
                    (showTranscript
                      ? "bg-amber-500/20 border-amber-500/30 text-amber-300 hover:bg-amber-500/30"
                      : "bg-emerald-500 text-slate-950 border-emerald-500 hover:bg-emerald-400 shadow-md shadow-emerald-500/20")
                  }
                >
                  {showTranscript ? "Hide text" : "Click to view full transcript"}
                </button>
              </div>
            </div>

            {showTranscript ? (
              <div className={`max-h-[45vh] overflow-y-auto rounded-lg border border-white/5 bg-slate-900/40 p-4 leading-relaxed text-slate-300 shadow-inner custom-scrollbar ${fontFamily}`} style={{ fontSize: `${fontSize}px` }}>
                {transcriptText.split('\n\n').map((chunk, i) => {
                  const match = chunk.match(/^(\[\d{1,2}:\d{2}(?::\d{2})?\])\s*([\s\S]*)$/);
                  if (match) {
                    return (
                      <div key={i} className="mb-4 bg-slate-800/40 border border-white/5 rounded-xl p-4 shadow-sm hover:border-white/10 hover:bg-slate-800/60 transition-colors">
                        <div className="text-emerald-400 font-mono text-[0.85em] mb-2 inline-block bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded shadow-sm">
                          {match[1]}
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">{match[2]}</div>
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="mb-4 bg-slate-800/40 border border-white/5 rounded-xl p-4 shadow-sm hover:border-white/10 hover:bg-slate-800/60 transition-colors">
                      <div className="whitespace-pre-wrap leading-relaxed">{chunk}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 border-2 border-dashed border-white/5 rounded-xl bg-black/10">
                <FileText className="h-8 w-8 mb-3 opacity-20" />
                <p className="text-sm">Transcript hidden to save space.</p>
                <p className="text-xs mt-1">Use the controls above to view or copy.</p>
              </div>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center h-full">
            <div className="h-10 w-10 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 opacity-50" />
            </div>
            <p>Transcript is empty or hasn&apos;t loaded yet.</p>
          </div>
        )}
      </div>
    </main>
  );
}