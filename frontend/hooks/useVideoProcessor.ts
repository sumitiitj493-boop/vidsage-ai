import { useState, useCallback } from "react";
import { VideoDownloadState, InputMode, DashboardStage, ActiveMode } from "../lib/types/dashboard";

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

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const pollAudioStatus = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/audio/status/${jobId}`);
      const data = await res.json();
      setAudioStatus(data.status);

      if (typeof data.progress === "number") setAudioProgress(data.progress);
      if (typeof data.elapsed === "number") setAudioElapsed(data.elapsed);
      if (typeof data.estimated === "number") setAudioEstimated(data.estimated);

      if (data.status === "completed") {
        const result = await fetch(`${apiBase}/api/audio/result/${jobId}`);
        const rl = await result.json();
        if (rl.status === "completed") {
          setDownloadState({ status: "done", response: rl.result });
          setStage("ready");
        }
        return;
      }

      if (data.status && data.status !== "completed" && data.status !== "failed") {
        setTimeout(() => pollAudioStatus(jobId), 2500);
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

    try {
      let data: any;

      if (inputMode === "youtube") {
        const rawUrl = videoUrl.trim();
        const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

        const res = await fetch(`${apiBase}/api/video/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_url: normalizedUrl,
            force_whisper: opts.forceWhisper ?? false,
          }),
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.detail || data?.message || "Failed to process video");
      } else if (inputMode === "pdf") {
        if (!pdfFile) throw new Error("Select a PDF file first.");
        const form = new FormData();
        form.append("file", pdfFile);
        const res = await fetch(`${apiBase}/api/pdf/upload`, {
          method: "POST",
          body: form,
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.detail || data?.message || "Failed to upload PDF");
      } else if (inputMode === "audio") {
        if (!audioFile) throw new Error("Select an audio file first.");
        const form = new FormData();
        form.append("file", audioFile);
        const res = await fetch(`${apiBase}/api/audio/upload`, {
          method: "POST",
          body: form,
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result?.detail || result?.message || "Failed to upload audio");
        if (!result.job_id) throw new Error("No job id returned");
        setAudioJobId(result.job_id);
        setAudioStatus("uploading");
        setAudioProgress(0);
        setAudioElapsed(0);
        setAudioEstimated(null);
        setActiveMode("progress");
        data = { video_id: result.job_id, source: "audio_upload" };
        pollAudioStatus(result.job_id);
      }

      setDownloadState({ status: "done", response: data });

      const rawText = data.cleaned_text || data.raw_text ||
        (Array.isArray(data.segments) ? data.segments.map((s: any) => s.text).join("\n") : "");

      setTranscriptText(rawText);
      if (inputMode !== "audio") {
        setStage("ready");
      }

      try {
        const suggRes = await fetch(`${apiBase}/api/chat/suggest/${data.video_id || data.pdf_id}`);
        if (suggRes.ok) {
          const suggData = await suggRes.json();
          if (Array.isArray(suggData.questions)) {
            setSuggestedQuestions(suggData.questions);
          }
        }
      } catch {
        // ignore
      }

      setActiveMode(inputMode === "audio" ? "progress" : "transcript");
    } catch (err) {
      setDownloadState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      setStage("empty");
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
  };

  const loadSession = (videoId: string, title?: string) => {
    setDownloadState({ 
      status: "done", 
      response: {
        video_id: videoId,
        video_title: title || "Historical Session",
        cleaned_text: "Transcript not cached for historical sessions. Please re-process the URL for the full transcript."
      } 
    });
    setStage("ready");
    setTranscriptText("Transcript not cached for historical sessions. Please re-process the URL for the full transcript.");
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
    processVideo,
    resetSession,
    loadSession,
  };
}