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
          const theData = rl.result;
          theData.video_id = jobId;
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
            const suggRes = await fetch(`${apiBase}/api/chat/suggest/${jobId}`);
            if (suggRes.ok) {
              const suggData = await suggRes.json();
              if (Array.isArray(suggData.questions)) {
                setSuggestedQuestions(suggData.questions);
              }
            }
          } catch {
            // ignore
          }
          setActiveMode("transcript");
        }
        return;
      }

      if (data.status && data.status !== "completed" && data.status !== "failed") {
        // Poll every 5 seconds to reduce backend log spam
        setTimeout(() => pollAudioStatus(jobId), 5000);
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
        if (opts.forceWhisper) {
          form.append("force_whisper", "true");
        }
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