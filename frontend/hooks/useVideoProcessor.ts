import { useState, useCallback } from "react";
import { VideoDownloadState, InputMode, DashboardStage, ActiveMode } from "../lib/types/dashboard";
import { authFetch } from "../lib/auth";

export function useVideoProcessor() {
  const [videoUrl, setVideoUrl] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("youtube");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  
  const [downloadState, setDownloadState] = useState<VideoDownloadState>({ status: "idle" });
  const [stage, setStage] = useState<DashboardStage>("empty");
  const [activeMode, setActiveMode] = useState<ActiveMode>("transcript");
  
  const [audioJobId, setAudioJobId] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const [audioElapsed, setAudioElapsed] = useState<number | null>(null);
  const [audioEstimated, setAudioEstimated] = useState<number | null>(null);
  
  const [transcriptText, setTranscriptText] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  
  const isAudioDone = audioStatus === "completed" || (audioProgress !== null && audioProgress >= 100);
  const isProcessing = stage === "processing";
  const [isWhisperActive, setIsWhisperActive] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const pollAudioStatus = useCallback(async (jobId: string) => {
    try {
      const res = await authFetch(`${apiBase}/api/audio/status/${jobId}`);
      const data = await res.json();
      setAudioStatus(data.status);

      if (typeof data.progress === "number") setAudioProgress(data.progress);
      if (typeof data.elapsed === "number") setAudioElapsed(data.elapsed);
      if (typeof data.estimated === "number") setAudioEstimated(data.estimated);

      if (data.status === "completed") {
        const result = await authFetch(`${apiBase}/api/audio/result/${jobId}`);
        const rl = await result.json();
        if (rl.status === "completed") {
          const theData = rl.result;
          if (!theData.video_id) {
            theData.video_id = jobId;
          }
          setDownloadState({ status: "done", response: theData });
          
          let rawText = "";
          if (Array.isArray(theData.segments) && theData.segments.length > 0) {
            let chunkStartTime = theData.segments[0].start;
            let currentChunk = "";
            const chunks = [];

            for (let i = 0; i < theData.segments.length; i++) {
              const s = theData.segments[i];
              currentChunk += s.text + " ";
              if (s.end - chunkStartTime >= 45 || i === theData.segments.length - 1 || currentChunk.length > 800) {
                const h = Math.floor(chunkStartTime / 3600);
                const m = Math.floor((chunkStartTime % 3600) / 60).toString().padStart(2, '0');
                const sec = Math.floor(chunkStartTime % 60).toString().padStart(2, '0');
                const timeStamp = h > 0 ? `[${h}:${m}:${sec}]` : `[${m}:${sec}]`;
                chunks.push(`${timeStamp}\n${currentChunk.trim()}`);
                if (i < theData.segments.length - 1) chunkStartTime = theData.segments[i + 1].start;
                currentChunk = "";
              }
            }
            rawText = chunks.join("\n\n");
          } else {
            rawText = theData.cleaned_text || theData.raw_text || "";
          }
          setTranscriptText(rawText);
          setStage("ready");
          try {
            // cache transcript + suggestions locally so historical sessions can load full transcript
            const cacheKey = "vidsage_transcripts";
            const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
            existing[theData.video_id] = existing[theData.video_id] || {};
            existing[theData.video_id].transcript = rawText;
            localStorage.setItem(cacheKey, JSON.stringify(existing));
          } catch {
            // ignore storage errors
          }
          try {
            const suggRes = await authFetch(`${apiBase}/api/chat/suggest/${jobId}`);
            if (suggRes.ok) {
              const suggData = await suggRes.json();
              if (Array.isArray(suggData.questions)) {
                setSuggestedQuestions(suggData.questions);
                try {
                  const cacheKey = "vidsage_transcripts";
                  const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
                  existing[theData.video_id] = existing[theData.video_id] || {};
                  existing[theData.video_id].suggestedQuestions = suggData.questions;
                  localStorage.setItem(cacheKey, JSON.stringify(existing));
                } catch {}
              }
            }
          } catch {
            // ignore
          }
          setActiveMode("transcript");
        }
        return;
      }

      if (data.status === "failed") {
        const message = data.error || "Whisper transcription failed";
        setDownloadState({ status: "error", error: message });
        setStage("empty");
        return;
      }

      if (data.status && data.status !== "completed" && data.status !== "failed") {
        // Keep UI responsive with near real-time progress.
        setTimeout(() => pollAudioStatus(jobId), 1200);
      }
    } catch {
      // ignore
    }
  }, [apiBase]);

  const processVideo = async (opts: { forceWhisper?: boolean } = {}) => {
    setStage("processing");
    setDownloadState({ status: "loading" });
    setSuggestedQuestions([]);
    setAudioJobId(null);
    setAudioStatus(null);
    setAudioProgress(null);
    setIsWhisperActive(!!opts.forceWhisper);

    try {
      let data: any;

      if (inputMode === "youtube") {
        const rawUrl = videoUrl.trim();
        const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

        const res = await authFetch(`${apiBase}/api/video/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_url: normalizedUrl,
            force_whisper: opts.forceWhisper ?? false,
          }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData?.detail || errorData?.message || "Failed to process video");
        }
        data = await res.json();

        if (data?.job_id) {
          setAudioJobId(data.job_id);
          setAudioStatus(data.status || "queued");
          setAudioProgress(typeof data.progress === "number" ? data.progress : 0);
          setAudioElapsed(0);
          setAudioEstimated(null);
          setActiveMode("progress");
          pollAudioStatus(data.job_id);
          return;
        }
      } else if (inputMode === "pdf") {
        if (!pdfFile) throw new Error("Select a PDF file first.");
        const form = new FormData();
        form.append("file", pdfFile);
        const res = await authFetch(`${apiBase}/api/pdf/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData?.detail || errorData?.message || "Failed to upload PDF");
        }
        data = await res.json();
      } else if (inputMode === "audio") {
        if (!audioFile) throw new Error("Select an audio file first.");
        const form = new FormData();
        form.append("file", audioFile);
        if (opts.forceWhisper) {
          form.append("force_whisper", "true");
        }
        const res = await authFetch(`${apiBase}/api/audio/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData?.detail || errorData?.message || "Failed to upload audio");
        }
        const result = await res.json();
        if (!result.job_id) throw new Error("No job id returned");
        setAudioJobId(result.job_id);
        setAudioStatus("uploading");
        setAudioProgress(0);
        setAudioElapsed(0);
        setAudioEstimated(null);
        setActiveMode("progress");
        data = { video_id: result.job_id, source: opts.forceWhisper ? "audio_enhanced" : "audio_upload" };
        pollAudioStatus(result.job_id);
      }

      setDownloadState({ status: "done", response: data });

      let rawText = "";
      if (inputMode === "pdf") {
        rawText = data.raw_text || data.cleaned_text || "";
      } else if (Array.isArray(data.segments) && data.segments.length > 0) {
        let chunkStartTime = data.segments[0].start;
        let currentChunk = "";
        const chunks = [];
        
        for (let i = 0; i < data.segments.length; i++) {
          const s = data.segments[i];
          currentChunk += s.text + " ";
          
          if (s.end - chunkStartTime >= 45 || i === data.segments.length - 1 || currentChunk.length > 800) {
            // Include hour if needed
            const h = Math.floor(chunkStartTime / 3600);
            const m = Math.floor((chunkStartTime % 3600) / 60).toString().padStart(2, '0');
            const sec = Math.floor(chunkStartTime % 60).toString().padStart(2, '0');
            const timeStamp = h > 0 ? `[${h}:${m}:${sec}]` : `[${m}:${sec}]`;
            
            chunks.push(`${timeStamp}\n${currentChunk.trim()}`);
            
            if (i < data.segments.length - 1) {
              chunkStartTime = data.segments[i + 1].start;
            }
            currentChunk = "";
          }
        }
        rawText = chunks.join("\n\n");
      } else {
        rawText = data.cleaned_text || data.raw_text || "";
      }

      setTranscriptText(rawText);
      if (inputMode !== "audio") {
        setStage("ready");
      }
      try {
        // cache transcript for this video/pdf so history can show it later
        const idKey = data.video_id || data.pdf_id || (data.job_id && data.job_id.toString());
        if (idKey) {
          const cacheKey = "vidsage_transcripts";
          const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
          existing[idKey] = existing[idKey] || {};
          existing[idKey].transcript = rawText;
          localStorage.setItem(cacheKey, JSON.stringify(existing));
        }
      } catch {}
      try {
        const suggRes = await authFetch(`${apiBase}/api/chat/suggest/${data.video_id || data.pdf_id}`);
        if (suggRes.ok) {
          const suggData = await suggRes.json();
          if (Array.isArray(suggData.questions)) {
            setSuggestedQuestions(suggData.questions);
            try {
              const idKey = data.video_id || data.pdf_id || (data.job_id && data.job_id.toString());
              if (idKey) {
                const cacheKey = "vidsage_transcripts";
                const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
                existing[idKey] = existing[idKey] || {};
                existing[idKey].suggestedQuestions = suggData.questions;
                localStorage.setItem(cacheKey, JSON.stringify(existing));
              }
            } catch {}
          }
        }
      } catch {
        // ignore
      }

      setActiveMode(inputMode === "audio" ? "progress" : "transcript");
    } catch (err) {
      setDownloadState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      setStage("empty");
    } finally {
      setIsWhisperActive(false);
    }
  };

  const resetSession = () => {
    setVideoUrl("");
    setPdfFile(null);
    setAudioFile(null);
    setInputMode("youtube");
    setDownloadState({ status: "idle" });
    setStage("empty");
    setActiveMode("transcript");
    setSuggestedQuestions([]);
    setTranscriptText("");
    setAudioStatus(null);
    setAudioProgress(null);
    setAudioElapsed(null);
    setAudioEstimated(null);
    setIsWhisperActive(false);
  };

  const loadSession = (videoId: string, title?: string) => {
    // Attempt to load cached transcript + suggestions from localStorage
    let cachedTranscript = null;
    let cachedSuggestions: string[] | undefined = undefined;
    try {
      const cacheKey = "vidsage_transcripts";
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
      if (existing && existing[videoId]) {
        cachedTranscript = existing[videoId].transcript || null;
        cachedSuggestions = existing[videoId].suggestedQuestions;
      }
    } catch {
      // ignore
    }

    setDownloadState({ 
      status: "done", 
      response: {
        video_id: videoId,
        video_title: title || "Historical Session",
        cleaned_text: cachedTranscript || "Transcript not cached for historical sessions. Please re-process the URL for the full transcript."
      } 
    });
    setStage("ready");
    setTranscriptText(cachedTranscript || "Transcript not cached for historical sessions. Please re-process the URL for the full transcript.");
    setSuggestedQuestions(cachedSuggestions || []);
    setActiveMode("transcript");
  };

  return {
    videoUrl, setVideoUrl,
    inputMode, setInputMode,
    pdfFile, setPdfFile,
    audioFile, setAudioFile,
    downloadState,
    stage,
    activeMode, setActiveMode,
    audioJobId, audioStatus, audioProgress, audioElapsed, audioEstimated,
    transcriptText, setTranscriptText,
    suggestedQuestions,
    isAudioDone,
    isProcessing,
    isWhisperActive,
    processVideo,
    resetSession,
    loadSession,
  };
}