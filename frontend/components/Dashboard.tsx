"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Mic, Upload, Loader2 } from "lucide-react";
import QuizGenerator from "@/components/QuizGenerator";

type VideoDownloadState = {
  status: "idle" | "loading" | "done" | "error";
  error?: string;
  response?: any;
};

function markdownToHtml(markdown: string) {
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const lines = escapeHtml(markdown).split(/\r?\n/);
  const htmlLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    if (/^#{3}\s+/.test(line)) {
      htmlLines.push(`<h3 class="text-lg font-semibold text-white">${line.replace(/^#{3}\s+/, "")}</h3>`);
      inList = false;
      continue;
    }
    if (/^#{2}\s+/.test(line)) {
      htmlLines.push(`<h2 class="text-xl font-semibold text-white">${line.replace(/^#{2}\s+/, "")}</h2>`);
      inList = false;
      continue;
    }
    if (/^#\s+/.test(line)) {
      htmlLines.push(`<h1 class="text-2xl font-semibold text-white">${line.replace(/^#\s+/, "")}</h1>`);
      inList = false;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      if (!inList) {
        htmlLines.push("<ul class=\"list-disc list-inside text-slate-200\">");
        inList = true;
      }
      const item = line.replace(/^\s*[-*+]\s+/, "");
      htmlLines.push(`<li>${item}</li>`);
      continue;
    }
    if (inList) {
      htmlLines.push("</ul>");
      inList = false;
    }
    if (line.trim() === "") {
      htmlLines.push("<br />");
      continue;
    }
    let formatted = line
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code class=\"rounded bg-slate-800 px-1 py-[0.125rem] text-slate-200\">$1</code>");
    htmlLines.push(`<p class=\"text-slate-200 leading-relaxed\">${formatted}</p>`);
  }

  if (inList) {
    htmlLines.push("</ul>");
  }

  return htmlLines.join("");
}

export default function Dashboard() {
  const [videoUrl, setVideoUrl] = useState("");
  const [downloadState, setDownloadState] = useState<VideoDownloadState>({ status: "idle" });
  const [stage, setStage] = useState<"empty" | "processing" | "ready">("empty");
  const [activeMode, setActiveMode] = useState<"transcript" | "notes" | "quiz">("transcript");
  const [inputMode, setInputMode] = useState<"youtube" | "pdf" | "audio">("youtube");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioJobId, setAudioJobId] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<string | null>(null);

  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const videoId = useMemo(() => {
    return downloadState.response?.video_id || downloadState.response?.video_id;
  }, [downloadState.response]);

  const videoTitle = useMemo(() => {
    return downloadState.response?.video_title || downloadState.response?.title || "";
  }, [downloadState.response]);

  const isReady = stage === "ready";

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const handleProcessVideo = async () => {
    setStage("processing");
    setDownloadState({ status: "loading" });
    setChatAnswer(null);
    setSuggestedQuestions([]);
    setAudioJobId(null);
    setAudioStatus(null);

    try {
      let data: any;

      if (inputMode === "youtube") {
        const rawUrl = videoUrl.trim();
        const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

        const res = await fetch(`${apiBase}/api/video/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_url: normalizedUrl }),
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
        setAudioStatus("queued");
        data = { video_id: result.job_id, source: "audio_upload" };
        pollAudioStatus(result.job_id);
      }

      setDownloadState({ status: "done", response: data });

      const rawText =
        data.cleaned_text ||
        data.raw_text ||
        (Array.isArray(data.segments)
          ? data.segments.map((s: any) => s.text).join("\n")
          : "");

      setTranscriptText(rawText);
      setCopyStatus("");
      setStage("ready");

      try {
        const suggRes = await fetch(`${apiBase}/api/chat/suggest/${data.video_id}`);
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
    } catch (err) {
      setDownloadState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      setStage("empty");
    }
  };

  useEffect(() => {
    if (!videoId) return;
    const loadSuggestions = async () => {
      try {
        const res = await fetch(`${apiBase}/api/chat/suggest/${videoId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data?.questions)) {
          setSuggestedQuestions(data.questions);
        }
      } catch {
        // ignore
      }
    };

    loadSuggestions();
  }, [videoId]);

  const pollAudioStatus = async (jobId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/audio/status/${jobId}`);
      const data = await res.json();
      setAudioStatus(data.status);
      if (data.status === "completed") {
        // fetch result now
        const result = await fetch(`${apiBase}/api/audio/result/${jobId}`);
        const rl = await result.json();
        if (rl.status === "completed") {
          setDownloadState({ status: "done", response: rl.result });
          setStage("ready");
        }
        return;
      }
      if (data.status === "queued" || data.status === "processing") {
        setTimeout(() => pollAudioStatus(jobId), 2500);
      }
    } catch {
      // ignore
    }
  };

  const askQuestion = async (question: string) => {
    if (!videoId || !question.trim()) return;
    setChatLoading(true);
    setChatAnswer(null);

    try {
      const res = await fetch(`${apiBase}/api/chat/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || data?.message || "Failed to get answer");
      }
      setChatAnswer(String(data.answer ?? "(No answer returned)"));
    } catch (err) {
      setChatAnswer(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setChatLoading(false);
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
    setChatQuestion("");
    setChatAnswer(null);
    setTranscriptText("");
  };

  const canGenerateQuiz = !!videoId;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const transcriptSegments = downloadState.response?.segments || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Top progress bar */}
      {stage === "processing" && (
        <div className="h-1 w-full bg-amber-500/20">
          <div className="h-full w-3/4 animate-[progress_3s_ease-in-out_infinite] bg-amber-400" />
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center text-lg font-bold text-slate-950">V</div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">VidSage</h1>
            <p className="text-sm text-slate-300">AI Study Buddy for Videos</p>
          </div>
        </div>

        <div className="flex-1">
          <div className="mx-auto max-w-3xl">
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
                  className="w-full rounded-full border border-white/15 bg-slate-950/40 px-6 py-3 pr-32 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={handleProcessVideo}
                  disabled={
                    stage === "processing" ||
                    (inputMode === "youtube" && !videoUrl.trim()) ||
                    (inputMode === "pdf" && !pdfFile) ||
                    (inputMode === "audio" && !audioFile)
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
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
                  "flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/40 text-slate-200 hover:bg-slate-800/60 " +
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
                  "flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-slate-950/40 text-slate-200 hover:bg-slate-800/60 " +
                  (inputMode === "audio" ? "ring-2 ring-amber-500" : "")
                }
                title="Upload Audio"
              >
                <Mic className="h-5 w-5" />
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
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={resetSession}
            className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            New Session
          </button>
          <button
            onClick={() => alert("History coming soon")}
            className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            History
          </button>
        </div>
      </header>

      <main className="px-6 pb-10">
        {stage === "empty" && (
          <div className="mt-16 flex flex-col items-center justify-center gap-4 text-center">
            <div className="max-w-xl rounded-3xl border border-white/10 bg-slate-900/50 px-10 py-12">
              <h2 className="text-2xl font-semibold text-white">Ready to generate insights</h2>
              <p className="mt-2 text-sm text-slate-300">
                Paste a YouTube URL, upload a PDF, or upload audio using the controls in the header.
              </p>
            </div>
          </div>
        )}

        {stage === "processing" && (
          <div className="mt-16 flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-slate-900/50 px-10 py-12">
              <Loader2 className="h-12 w-12 animate-spin text-amber-400" />
              <h2 className="text-2xl font-semibold text-white">Extracting wisdom from your video...</h2>
              <p className="text-sm text-slate-300">This can take a moment. We'll notify you when the transcript is ready.</p>
            </div>
          </div>
        )}

        {stage === "ready" && (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_360px] gap-6 items-stretch min-h-[60vh]">
            {/* Left Sidebar (Navigation) */}
            <aside className="space-y-6 h-full">
              <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                <div className="flex items-start gap-4">
                  <img
                    src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                    alt="YouTube thumbnail"
                    className="h-20 w-28 rounded-lg object-cover border border-white/10"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-slate-100">{videoTitle || "YouTube Video"}</h3>
                    <p className="text-xs text-slate-400 mt-1">ID: {videoId}</p>
                    <p className="text-xs text-slate-400">Source: {downloadState.response?.source}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <button
                    onClick={() => setActiveMode("transcript")}
                    className={
                      "rounded-xl px-4 py-2 text-sm font-medium " +
                      (activeMode === "transcript"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-transparent text-slate-200 hover:bg-slate-800/40")
                    }
                  >
                    Transcript
                  </button>
                  <button
                    onClick={() => setActiveMode("notes")}
                    className={
                      "rounded-xl px-4 py-2 text-sm font-medium " +
                      (activeMode === "notes"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-transparent text-slate-200 hover:bg-slate-800/40")
                    }
                  >
                    Notes
                  </button>
                  <button
                    onClick={() => setActiveMode("quiz")}
                    className={
                      "rounded-xl px-4 py-2 text-sm font-medium " +
                      (activeMode === "quiz"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-transparent text-slate-200 hover:bg-slate-800/40")
                    }
                  >
                    Quiz
                  </button>
                </div>

                <div className="mt-auto rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200">
                  <div className="font-semibold text-slate-100 mb-2">Stats</div>
                  <div className="text-xs text-slate-400">Transcript length: {transcriptText.length} chars</div>
                  {audioJobId && (
                    <div className="mt-2 text-xs text-slate-400">
                      Audio job: {audioJobId} ({audioStatus || "pending"})
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* Center Content */}
            <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">{activeMode === "transcript" ? "Transcript" : activeMode === "notes" ? "Notes" : "Quiz"}</h2>
              </div>

              {activeMode === "transcript" && (
                <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm leading-relaxed text-slate-200">
                  {transcriptText ? (
                    <pre className="whitespace-pre-wrap">{transcriptText}</pre>
                  ) : (
                    <p className="text-slate-400">Transcript is empty.</p>
                  )}
                </div>
              )}

              {activeMode === "notes" && (
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-200">
                  <div className="text-sm text-slate-400 mb-2">Notes (Markdown)</div>
                  {transcriptText ? (
                    <div
                      className="prose prose-invert max-w-none leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: markdownToHtml(transcriptText) }}
                    />
                  ) : (
                    <p className="text-slate-400">No transcript available yet.</p>
                  )}
                </div>
              )}

              {activeMode === "quiz" && (
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-6">
                  <QuizGenerator transcriptId={videoId} videoTitle={videoTitle || "YouTube Video"} />
                </div>
              )}
            </main>

            {/* Right Sidebar (Sage Assistant) */}
            <aside className="space-y-6 h-full">
              <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-800/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Sage Assistant</h3>
                  <span className="text-xs text-slate-400">AI Chat</span>
                </div>

                <div className="mt-4 flex flex-1 flex-col overflow-hidden">
                  <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                    {chatAnswer ? (
                      <div className="rounded-xl bg-slate-900/50 border border-white/10 p-4 text-sm text-slate-200">
                        <div className="text-xs text-slate-400 mb-2">Answer</div>
                        <div className="whitespace-pre-wrap">{chatAnswer}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400">Ask a question to get started.</div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Quick Questions</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {suggestedQuestions.slice(0, 6).map((q) => (
                        <button
                          key={q}
                          onClick={() => {
                            setChatQuestion(q);
                            askQuestion(q);
                          }}
                          className="rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <input
                        value={chatQuestion}
                        onChange={(e) => setChatQuestion(e.target.value)}
                        placeholder="Ask the Sage..."
                        className="flex-1 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => askQuestion(chatQuestion)}
                        disabled={!chatQuestion.trim() || chatLoading}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {chatLoading ? "Thinking..." : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
