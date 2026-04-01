import { useState } from "react";
import { Copy } from "lucide-react";

interface TranscriptViewProps {
  transcriptText: string;
  setTranscriptText: (text: string) => void;
}

export default function TranscriptView({ transcriptText, setTranscriptText }: TranscriptViewProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const [copyHint, setCopyHint] = useState("");

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
    <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-2xl shadow-xl shadow-black/30">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Transcript</h2>
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-5 text-sm text-slate-200 custom-scrollbar">
        {transcriptText ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-medium text-slate-300 uppercase tracking-wider">Raw Transcript Available</span>
              </div>
              <div className="flex flex-wrap gap-2">
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
              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-white/5 bg-slate-900/60 p-4 font-mono text-[13px] leading-snug text-slate-300 shadow-inner custom-scrollbar">
                <pre className="whitespace-pre-wrap font-sans">{transcriptText}</pre>
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
          <div className="py-8 text-center text-slate-500 flex flex-col items-center">
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

// Just defining the missing import
import { FileText } from "lucide-react";