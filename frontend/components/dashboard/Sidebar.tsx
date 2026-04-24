import { useState, useEffect, useRef } from "react";
import { Copy, ExternalLink, Download, Play, Pause } from "lucide-react";
import { InputMode, ActiveMode } from "../../lib/types/dashboard";
import { truncateMiddle } from "../../lib/utils/formatters";
import { authFetch, getApiBase } from "../../lib/auth";

interface SidebarProps {
  videoId: string;
  videoTitle: string;
  source: string;
  inputMode: InputMode;
  activeMode: ActiveMode;
  setActiveMode: (mode: ActiveMode) => void;
  isProcessing: boolean;
  handleForceWhisper: () => void;
  transcriptLength: number;
  audioJobId: string | null;
  audioStatus: string | null;
}

export default function DashboardSidebar({
  videoId, videoTitle, source, inputMode, activeMode, setActiveMode,
  isProcessing, handleForceWhisper, transcriptLength, audioJobId, audioStatus
}: SidebarProps) {
  const [copyHint, setCopyHint] = useState("");
  const [ytDetails, setYtDetails] = useState<{ title: string; author_name: string } | null>(null);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (inputMode === "youtube" && videoId) {
      fetch(`https://noembed.com/embed?dataType=json&url=https://www.youtube.com/watch?v=${videoId}`)
        .then(res => res.json())
        .then(data => {
          if (data.title) {
            setYtDetails({ title: data.title, author_name: data.author_name });
          }
        })
        .catch(() => {});
    }
  }, [videoId, inputMode]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint("Copied!");
      setTimeout(() => setCopyHint(""), 1500);
    } catch {
      setCopyHint("Copy failed");
      setTimeout(() => setCopyHint(""), 1500);
    }
  };

  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  const handleAudioDownload = async () => {
    if (isDownloadingAudio) return;
    try {
      setIsDownloadingAudio(true);
      const res = await authFetch(`${getApiBase()}/api/video/audio/${videoId}`);
      if (!res.ok) throw new Error("Network error");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setAudioBlobUrl(url);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${videoId}_audio.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play();
          setIsPlaying(true);
        }
      }, 500);

    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloadingAudio(false);
    }
  };

  const displayTitle = ytDetails?.title || videoTitle || (inputMode === "youtube" ? "YouTube Video" : "Uploaded File");
  const authorName = ytDetails?.author_name || "";

  return (
    <aside className="space-y-6 h-full flex flex-col">
      {/* Video Hero Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/50 backdrop-blur-3xl shadow-2xl shadow-black/50 overflow-hidden flex-shrink-0 relative group">
        {inputMode === "youtube" ? (
          <div className="relative aspect-video w-full bg-slate-800">
            {audioBlobUrl && (
              <audio
                ref={audioRef}
                src={audioBlobUrl}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
              />
            )}
            <img
              src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}   
              onError={(e) => {
                 (e.currentTarget as HTMLImageElement).src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
              }}
              alt="YouTube thumbnail"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={() => {
                  if (audioBlobUrl) {
                    if (audioRef.current) {
                      if (isPlaying) audioRef.current.pause();
                      else audioRef.current.play();
                    }
                  } else {
                    handleAudioDownload();
                  }
                }}
                disabled={isDownloadingAudio}
                title={audioBlobUrl ? (isPlaying ? "Pause Audio" : "Play Audio") : "Download & Play Audio"}
                className={`relative bg-black/40 hover:bg-amber-500 hover:text-slate-950 p-2 rounded-full backdrop-blur-md transition-all group overflow-hidden ${audioBlobUrl && isPlaying ? "bg-amber-500 text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.5)]" : ""}`}
              >
                <div className="relative z-10 flex items-center justify-center h-4 w-4">
                  {isDownloadingAudio ? (
                    <div className="h-3 w-3 border-[2px] border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                  ) : audioBlobUrl ? (
                    isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-white group-hover:text-slate-950" />
                  ) : (
                    <Download className="w-4 h-4 text-white group-hover:text-slate-950" />
                  )}
                </div>
              </button>
              <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="bg-black/40 hover:bg-black/60 p-2 rounded-full backdrop-blur-md transition-colors" title="Open in YouTube">
                <ExternalLink className="w-4 h-4 text-white" />
              </a>
            </div>
            <div className="absolute bottom-0 left-0 p-4 w-full">
               <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-600/90 text-white backdrop-blur-md shadow-lg">YouTube Video</span>
                  {authorName && <span className="text-[11px] font-medium text-slate-300 truncate drop-shadow-md">{authorName}</span>}
               </div>
               <h3 className="text-[15px] leading-tight font-bold text-white line-clamp-2 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" title={displayTitle}>{displayTitle}</h3>
            </div>
            
          </div>
        ) : (
          <div className="p-5">
            <h3 className="text-lg font-semibold text-slate-100">{displayTitle}</h3>
            <p className="text-xs text-slate-400 mt-1">ID: {videoId}</p>
          </div>
        )}
        
        {/* Source metadata for YouTube below the image */}
        {inputMode === "youtube" && (
           <div className="px-4 py-3 bg-slate-900/80 border-t border-white/5 flex justify-between items-center text-xs">
              <span className="text-slate-400 tracking-wide">ID: <span className="font-mono text-slate-300 ml-1">{videoId}</span></span>
              <span className="text-slate-400 capitalize px-2.5 py-1 bg-white/5 rounded-md border border-white/5">{source.replace('_', ' ')}</span>
           </div>
        )}
        
        {(source === "youtube_auto" || source === "audio_upload" || source === "youtube_auto_rejected" || source === "no_transcript") && (
          <div className="p-4 bg-amber-950/20 border-t border-amber-500/10"> 
            <p className="text-[11px] leading-relaxed text-amber-200/90 tracking-wide text-center">
              {source === "audio_upload" ? "Standard fast transcription applied." : 
               source === "no_transcript" ? "No YouTube transcript found." :
               source === "youtube_auto_rejected" ? "YouTube transcript rejected." :
               "Using auto-generated transcript."}
            </p>
            <button
              type="button"
              onClick={handleForceWhisper}
              disabled={isProcessing}
              className="mt-3 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-2 text-xs font-bold text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
            >
              {isProcessing ? "Processing..." : (source === "audio_upload" ? "Force High-Accuracy AI" : "Try Whisper AI")}
            </button>
          </div>
        )}
      </div>

      {/* Navigation Buttons Card */}
      <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-3 backdrop-blur-2xl shadow-xl shadow-black/30 flex-shrink-0">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setActiveMode(inputMode === "audio" ? "progress" : "transcript")}
            className={
              "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium transition-all group " +
              (activeMode === "transcript" || activeMode === "progress"
                ? "bg-slate-800 text-white shadow-md border border-white/10"
                : "bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent")
            }
          >
            <span>{inputMode === "pdf" ? "Extracted Document" : inputMode === "audio" ? "Audio Progress" : "Raw Transcript"}</span>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeMode === "transcript" || activeMode === "progress" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-transparent"}`}></div>
          </button>
          <button
            onClick={() => setActiveMode("notes")}
            className={
              "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium transition-all group " +
              (activeMode === "notes"
                ? "bg-slate-800 text-white shadow-md border border-white/10"
                : "bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent")
            }
          >
            <span>Masterclass Notes</span>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeMode === "notes" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-transparent"}`}></div>
          </button>
          <button
            onClick={() => setActiveMode("mindmap" as ActiveMode)}
            className={
              "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium transition-all group " +
              (activeMode === "mindmap"
                ? "bg-slate-800 text-white shadow-md border border-white/10"
                : "bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent")
            }
          >
            <span>Mind Map</span>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeMode === "mindmap" ? "bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]" : "bg-transparent"}`}></div>
          </button>
          <button
            onClick={() => setActiveMode("summary" as ActiveMode)}
            className={
              "flex items-center justify-between rounded-xl px-4 py-3.5 text-sm font-medium transition-all group " +
              (activeMode === "summary"
                ? "bg-slate-800 text-white shadow-md border border-white/10"
                : "bg-transparent text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent")
            }
          >
            <span>Revision Summary</span>
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${activeMode === "summary" ? "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" : "bg-transparent"}`}></div>
          </button>
        </div>
      </div>

      {/* Session Stats Card */}
      <div className="mt-auto flex-1 flex flex-col justify-end space-y-4">
        <div className="rounded-3xl border border-white/5 bg-gradient-to-b from-slate-900/40 to-slate-950/80 p-5 shadow-inner shadow-black/50 backdrop-blur-sm">
          <div className="font-semibold text-slate-200 mb-4 flex justify-between items-center">
            <span className="text-sm tracking-wide">Session Info</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20"></span>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-xl text-xs border border-white/5">
                <span className="text-slate-500">Words</span>
                <span className="text-slate-200 font-mono bg-slate-800 px-2 py-0.5 rounded border border-white/10">{Math.round((transcriptLength || 0) / 5)}</span>
            </div>
            
            {audioJobId && (
              <div className="flex items-center justify-between bg-black/20 p-2.5 rounded-xl text-xs border border-white/5">
                <span className="text-slate-500">Job ID</span>
                <div className="flex items-center gap-2 group">
                    <span className="text-slate-300 font-mono tracking-wider">{truncateMiddle(audioJobId)}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(audioJobId)}
                      className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-sm"
                      title="Copy job ID"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                </div>
              </div>
            )}

            {copyHint && <div className="text-[10px] text-emerald-400 text-right animate-fade-in pr-1">{copyHint}</div>}
            
            {audioStatus && (
              <div className="flex justify-between items-center bg-black/20 p-2.5 rounded-xl text-xs border border-white/5">
                  <span className="text-slate-500">Status</span>
                  <span className="text-emerald-400 font-medium tracking-wide flex items-center gap-1.5 before:content-[''] before:block before:w-1.5 before:h-1.5 before:bg-emerald-400 before:rounded-full before:animate-ping">{audioStatus}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}