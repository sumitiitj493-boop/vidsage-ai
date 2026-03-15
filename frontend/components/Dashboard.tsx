"use client";

import { useEffect, useMemo, useState } from "react";
import QuizGenerator from "@/components/QuizGenerator";

type VideoDownloadState = {
  status: "idle" | "loading" | "done" | "error";
  error?: string;
  response?: any;
};

export default function Dashboard() {
  const [videoUrl, setVideoUrl] = useState("");
  const [downloadState, setDownloadState] = useState<VideoDownloadState>({ status: "idle" });
  const [stage, setStage] = useState<"empty" | "processing" | "ready">("empty");
  const [activeTab, setActiveTab] = useState<"chat" | "quiz" | "summary">("chat");

  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const [showTranscript, setShowTranscript] = useState(false);

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

    try {
      const rawUrl = videoUrl.trim();
      const normalizedUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

      const res = await fetch(`${apiBase}/api/video/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_url: normalizedUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.detail || data?.message || "Failed to process video");
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
      setShowTranscript(false);

      // load suggested questions for chat
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

      setActiveTab("chat");
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

  const askQuestion = async (question: string) => {
    if (!videoId || !question.trim()) return;
    setChatLoading(true);
    setChatAnswer(null);
    setActiveTab("chat");

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
    setDownloadState({ status: "idle" });
    setStage("empty");
    setActiveTab("chat");
    setSuggestedQuestions([]);
    setChatQuestion("");
    setChatAnswer(null);
    setShowTranscript(false);
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
            <div className="relative">
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Paste a YouTube URL and press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleProcessVideo();
                }}
                className="w-full rounded-full border border-white/15 bg-slate-950/40 px-6 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleProcessVideo}
                disabled={!videoUrl || stage === "processing"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {stage === "processing" ? "Processing..." : "Process"}
              </button>
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
              <h2 className="text-2xl font-semibold text-white">Start by entering a YouTube URL</h2>
              <p className="mt-2 text-sm text-slate-300">
                VidSage will process the video, extract the transcript, and unlock Quiz & Chat.
              </p>
              <button
                onClick={handleProcessVideo}
                disabled={!videoUrl}
                className="mt-6 rounded-xl bg-amber-500 px-8 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                Process Video
              </button>
            </div>
          </div>
        )}

        {stage === "ready" && (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* Sidebar */}
            <aside className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
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

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    onClick={() => setShowTranscript((prev) => !prev)}
                    className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-indigo-400"
                  >
                    {showTranscript ? "Hide Transcript" : "Show Transcript"}
                  </button>
                  {showTranscript && (
                    <div className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-200">
                      {transcriptText ? (
                        <pre className="whitespace-pre-wrap">{transcriptText}</pre>
                      ) : (
                        <p className="text-slate-400">Transcript is empty.</p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(transcriptText);
                          setCopyStatus("copied");
                          setTimeout(() => setCopyStatus(""), 1500);
                        } catch {
                          setCopyStatus("failed");
                          setTimeout(() => setCopyStatus(""), 1500);
                        }
                      }}
                      disabled={!transcriptText}
                      className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/75 disabled:opacity-40"
                    >
                      Copy Transcript
                    </button>
                    <button
                      onClick={() => setTranscriptText("")}
                      disabled={!transcriptText}
                      className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800/75 disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                  {copyStatus === "copied" && <p className="text-xs text-emerald-300">Copied!</p>}
                  {copyStatus === "failed" && <p className="text-xs text-rose-300">Copy failed</p>}
                </div>
              </div>
            </aside>

            {/* Main action panel */}
            <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Learning Session</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab("chat")}
                    className={
                      "rounded-full px-4 py-2 text-sm font-semibold " +
                      (activeTab === "chat"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-800/75")
                    }
                  >
                    Chat
                  </button>
                  <button
                    onClick={() => setActiveTab("quiz")}
                    className={
                      "rounded-full px-4 py-2 text-sm font-semibold " +
                      (activeTab === "quiz"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-800/75")
                    }
                  >
                    Quiz
                  </button>
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={
                      "rounded-full px-4 py-2 text-sm font-semibold " +
                      (activeTab === "summary"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800 text-slate-200 hover:bg-slate-800/75")
                    }
                  >
                    Summary
                  </button>
                </div>
              </div>

              <div className="mt-6">
                {activeTab === "chat" && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                        <span>Suggestions</span>
                        <span className="text-slate-500">Tap to ask</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggestedQuestions.slice(0, 8).map((q) => (
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
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                      <div className="flex gap-2">
                        <input
                          value={chatQuestion}
                          onChange={(e) => setChatQuestion(e.target.value)}
                          placeholder="Ask a question..."
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

                      {chatAnswer && (
                        <div className="mt-4 rounded-xl bg-slate-900/50 border border-white/10 p-4 text-sm text-slate-200">
                          <div className="text-xs text-slate-400 mb-2">Answer</div>
                          <div className="whitespace-pre-wrap">{chatAnswer}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "quiz" && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <QuizGenerator transcriptId={videoId} videoTitle={videoTitle || "YouTube Video"} />
                  </div>
                )}

                {activeTab === "summary" && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-6">
                    <h3 className="text-base font-semibold text-white mb-3">Summary</h3>
                    <div className="text-sm text-slate-200 max-h-96 overflow-y-auto whitespace-pre-wrap">
                      {transcriptText || "No transcript available yet."}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
