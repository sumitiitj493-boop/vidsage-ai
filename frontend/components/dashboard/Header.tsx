import { RefObject } from "react";
import Link from "next/link";
import { FileText, Upload } from "lucide-react";
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
    <header className="flex items-center justify-between gap-4 px-6 py-6 border-b border-white/5 bg-slate-900/30">
      <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center text-lg font-bold text-slate-950 shadow-lg shadow-amber-500/40 animate-spin-slow">
          V
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">VidSage</h1>
          <p className="text-sm text-slate-300">AI Study Buddy for Videos</p>
          </div>
      </Link>

      <div className="flex-1 max-w-3xl ml-8">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                setInputMode("youtube");
              }}
              placeholder={
                inputMode === "youtube"
                  ? "Paste a YouTube URL and press Enter"
                  : inputMode === "pdf"
                  ? pdfFile?.name || "Select a PDF file to process"
                  : audioFile?.name || "Select an audio file to process"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") handleProcessVideo();
              }}
              className="w-full rounded-full border border-white/15 bg-slate-950/60 px-6 py-3 pr-32 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all"
            />
            <button
              onClick={handleProcessVideo}
              disabled={!canProcess}
              className={
                "absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors " +
                (canProcess ? "animate-pulse" : "")
              }
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
              "flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-slate-950/40 text-slate-200 hover:bg-slate-800/60 transition-all " +
              (inputMode === "pdf" ? "ring-2 ring-amber-500" : "")
            }
            title="Upload PDF"
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
              "flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-slate-950/40 text-slate-200 hover:bg-slate-800/60 transition-all " +
              (inputMode === "audio" ? "ring-2 ring-amber-500" : "")
            }
            title="Upload Audio"
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
          className="rounded-xl border border-white/10 bg-slate-900/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors"
        >
          New Session
        </button>
        <button
          onClick={onOpenHistory}
          className="rounded-xl border border-white/10 bg-slate-900/50 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 transition-colors"
        >
          History
        </button>
        <button
          onClick={onLogout}
          className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-2.5 text-sm font-medium text-red-200 hover:bg-red-500/20 transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}