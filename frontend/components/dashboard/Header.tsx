import { RefObject } from "react";
import Link from "next/link";
import { FileText, Upload, RotateCcw, Clock, LogOut } from "lucide-react";
import { InputMode, DashboardStage } from "../../lib/types/dashboard";

interface HeaderProps {
  videoUrl: string;
  setVideoUrl: (v: string) => void;
  inputMode: InputMode;
  setInputMode: (m: InputMode) => void;
  pdfFile: File | null;
  setPdfFile: (f: File | null) => void;
  audioFile: File | null;
  setAudioFile: (f: File | null) => void;
  stage: DashboardStage;
  handleProcessVideo: () => void;
  resetSession: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  audioInputRef: RefObject<HTMLInputElement>;
  onOpenHistory?: () => void;
  onLogout?: () => void;
}

export default function DashboardHeader({
  videoUrl, setVideoUrl, inputMode, setInputMode, pdfFile, setPdfFile, audioFile, setAudioFile,
  stage, handleProcessVideo, resetSession, fileInputRef, audioInputRef, onOpenHistory, onLogout
}: HeaderProps) {
  const canProcess =
    stage !== "processing" &&
    ((inputMode === "youtube" && videoUrl.trim()) ||
      (inputMode === "pdf" && pdfFile) ||
      (inputMode === "audio" && audioFile));

  return (
    <header className="flex items-center justify-between gap-6 px-6 py-5 border-b border-white/5 bg-gradient-to-r from-slate-900/40 to-slate-900/20 backdrop-blur-md">
      <Link href="/" className="flex items-center gap-3 group hover:opacity-90 transition-opacity">
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xl font-bold text-slate-950 shadow-lg shadow-amber-500/30 group-hover:shadow-amber-500/50 transition-shadow">
          V
        </div>
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight text-white">VidSage</h1>
          <p className="text-xs text-slate-400 font-medium">AI Study Buddy for Videos</p>
          </div>
      </Link>

      <div className="flex-1 max-w-3xl mx-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <input
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setInputMode("youtube");
              }}
              placeholder={
                inputMode === "youtube"
                  ? "Paste a YouTube URL..."
                  : inputMode === "pdf"
                  ? pdfFile?.name || "Select a PDF file"
                  : audioFile?.name || "Select an audio file"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleProcessVideo();
              }}
              className="w-full rounded-xl border border-white/20 bg-slate-950/50 px-5 py-3 pr-36 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-sm"
            />
            <button
              onClick={handleProcessVideo}
              disabled={!canProcess}
              className={
                "absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 " +
                (canProcess ? "hover:shadow-emerald-500/40" : "")
              }
              title="Process video/audio/PDF"
            >
              {stage === "processing" ? "Processing..." : "Process"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setInputMode("pdf");
              fileInputRef.current?.click();
            }}
            className={
              "flex h-11 w-11 items-center justify-center rounded-lg border transition-all shadow-sm " +
              (inputMode === "pdf"
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-amber-500/20"
                : "bg-slate-800/40 border-white/15 text-slate-300 hover:bg-slate-700/60 hover:border-white/20")
            }
            title="Upload PDF file"
          >
            <FileText className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              setInputMode("audio");
              audioInputRef.current?.click();
            }}
            className={
              "flex h-11 w-11 items-center justify-center rounded-lg border transition-all shadow-sm " +
              (inputMode === "audio"
                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-emerald-500/20"
                : "bg-slate-800/40 border-white/15 text-slate-300 hover:bg-slate-700/60 hover:border-white/20")
            }
            title="Upload audio file"
          >
            <Upload className="h-5 w-5" />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPdfFile(file);
              setInputMode("pdf");
              setVideoUrl("");
            }}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setAudioFile(file);
              setInputMode("audio");
              setVideoUrl("");
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={resetSession}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 border border-white/15 hover:border-white/20 text-slate-300 hover:text-white font-medium transition-all shadow-sm text-sm"
          title="Start a new session"
        >
          <RotateCcw className="h-4 w-4" />
          <span>New Session</span>
        </button>
        <button
          onClick={onOpenHistory}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 border border-white/15 hover:border-white/20 text-slate-300 hover:text-white font-medium transition-all shadow-sm text-sm"
          title="View processing history"
        >
          <Clock className="h-4 w-4" />
          <span>History</span>
        </button>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-red-500/10 border border-white/15 hover:border-red-500/30 text-slate-300 hover:text-red-300 font-medium transition-all shadow-sm text-sm"
          title="Logout from your account"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}