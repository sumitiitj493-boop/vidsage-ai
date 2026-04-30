import { RefObject } from "react";
import Link from "next/link";
import { FileText, FileAudio, RotateCcw, Clock, LogOut, Link as LinkIcon, Sparkles } from "lucide-react";
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
    <header className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6 px-4 md:px-6 py-4 md:py-5 border-b border-white/5 bg-gradient-to-r from-slate-900/40 to-slate-900/20 backdrop-blur-md">
      {/* Row 1 on Mobile: Logo and Icon buttons */}
      <div className="flex w-full md:w-auto items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-3 group hover:opacity-90 transition-opacity">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-xl font-bold text-slate-950 shadow-lg shadow-amber-500/30 group-hover:shadow-amber-500/50 transition-shadow shrink-0">
            V
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white leading-tight md:leading-normal">VidSage</h1>
            <p className="text-[10px] md:text-xs text-slate-400 font-medium hidden sm:block">AI Study Buddy for Videos</p>
          </div>
        </Link>
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={resetSession}
            className="flex items-center justify-center h-[44px] w-[44px] rounded-lg bg-slate-800/40 hover:bg-slate-700/60 border border-white/15 hover:border-white/20 text-slate-300 hover:text-white transition-all"
            title="New Session"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            onClick={onOpenHistory}
            className="flex items-center justify-center h-[44px] w-[44px] rounded-lg bg-slate-800/40 hover:bg-slate-700/60 border border-white/15 hover:border-white/20 text-slate-300 hover:text-white transition-all"
            title="History"
          >
            <Clock className="h-5 w-5" />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center h-[44px] w-[44px] rounded-lg bg-slate-800/40 hover:bg-red-500/10 border border-white/15 hover:border-red-500/30 text-slate-300 hover:text-red-400 transition-all"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Row 2 on Mobile: Input + Process */}
      <div className="flex-1 w-full max-w-3xl md:mx-4 order-3 md:order-2">
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-2.5 w-full">
          <div className="relative flex-1 w-full flex flex-col sm:flex-row gap-2 sm:block">
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
              className="w-full rounded-xl border border-white/20 bg-slate-950/50 px-5 py-3 sm:pr-[120px] text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all shadow-sm"
            />
            <button
              onClick={handleProcessVideo}
              disabled={!canProcess}
              className={
                "w-full sm:w-auto h-[44px] sm:h-[calc(100%-8px)] sm:absolute sm:right-1 sm:top-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-500/20 " +
                (canProcess ? "hover:shadow-emerald-500/40" : "")
              }
              title="Process video/audio/PDF"
            >
              {stage === "processing" ? "Processing..." : "Process"}
            </button>
          </div>

          <div className="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0 justify-center">
            <button
              type="button"
              onClick={() => {
                setInputMode("pdf");
                fileInputRef.current?.click();
              }}
              className={
                "flex h-[44px] w-full sm:w-11 items-center justify-center rounded-lg border transition-all shadow-sm " +
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
                "flex h-[44px] w-full sm:w-11 items-center justify-center rounded-lg border transition-all shadow-sm " +
                (inputMode === "audio"
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-emerald-500/20"
                  : "bg-slate-800/40 border-white/15 text-slate-300 hover:bg-slate-700/60 hover:border-white/20")
              }
              title="Upload audio file"
            >
              <FileAudio className="h-5 w-5" />
            </button>
          </div>

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

      {/* Row 1 on Desktop only: Desktop Buttons */}
      <div className="hidden md:flex items-center gap-3 order-2 md:order-3">
        <button
          onClick={resetSession}
          className="flex min-h-[44px] items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 border border-white/15 hover:border-white/20 text-slate-300 hover:text-white font-medium transition-all shadow-sm text-sm shrink-0"
          title="Start a new session"
        >
          <RotateCcw className="h-4 w-4" />
          <span>New Session</span>
        </button>
        <button
          onClick={onOpenHistory}
          className="flex min-h-[44px] items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-slate-700/60 border border-white/15 hover:border-white/20 text-slate-300 hover:text-white font-medium transition-all shadow-sm text-sm shrink-0"
          title="View processing history"
        >
          <Clock className="h-4 w-4" />
          <span>History</span>
        </button>
        <button
          onClick={onLogout}
          className="flex min-h-[44px] items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/40 hover:bg-red-500/10 border border-white/15 hover:border-red-500/30 text-slate-300 hover:text-red-300 font-medium transition-all shadow-sm text-sm shrink-0"
          title="Logout from your account"
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}