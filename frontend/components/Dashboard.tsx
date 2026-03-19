"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import { CheckCircle2, Copy, FileText, Loader2, Maximize2, Minimize2, Mic, Upload } from "lucide-react";

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
  const [activeMode, setActiveMode] = useState<"transcript" | "notes" | "progress">("transcript");
  const [showTranscript, setShowTranscript] = useState(false);
  const [audioProgress, setAudioProgress] = useState<number | null>(null);
  const [audioElapsed, setAudioElapsed] = useState<number | null>(null);
  const [audioEstimated, setAudioEstimated] = useState<number | null>(null);
  const [audioStatus, setAudioStatus] = useState<string | null>(null);

  const [copyStatus, setCopyStatus] = useState<"" | "copied" | "failed">("");
  const [copyHint, setCopyHint] = useState<string>("");

  const isAudioDone =
    audioStatus === "completed" || (audioProgress !== null && audioProgress >= 100);

  const truncateMiddle = (value: string, visibleChars = 8) => {
    if (!value || value.length <= visibleChars * 2) return value;
    return `${value.slice(0, visibleChars)}…${value.slice(-visibleChars)}`;
  };

  const parseTimestamp = (ts: string) => {
    const parts = ts.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  };

  const linkifyTimestamps = (text: string, videoId: string) => {
    // Match timestamps like 0:20, 00:20, 1:02:15 and ranges like 0:20-0:35 or 0:20 - 0:35
    const regex = /(\b\d{1,2}:\d{2}(?::\d{2})?\b)(?:\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?\b))?/g;
    return text.replace(regex, (match, start, end) => {
      const startSeconds = parseTimestamp(start);
      if (startSeconds === null) return match;

      const link = `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}s`;
      if (!end) return `[${start}](${link})`;

      const endSeconds = parseTimestamp(end);
      if (endSeconds === null) return `[${start}](${link}) — ${end}`;

      // Render range as two clickable timestamps (start + end)
      return `[${start}](${link}) – [${end}](https://www.youtube.com/watch?v=${videoId}&t=${endSeconds}s)`;
    });
  };


  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
      setCopyHint("Copied!");
      setTimeout(() => {
        setCopyStatus("");
        setCopyHint("");
      }, 1500);
    } catch {
      setCopyStatus("failed");
      setCopyHint("Copy failed");
      setTimeout(() => {
        setCopyStatus("");
        setCopyHint("");
      }, 1500);
    }
  };
  const [inputMode, setInputMode] = useState<"youtube" | "pdf" | "audio">("youtube");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioJobId, setAudioJobId] = useState<string | null>(null);

  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<Array<{ question: string; answer: string }>>([]);
  const [chatIndex, setChatIndex] = useState(-1);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatFullScreen, setChatFullScreen] = useState(false);
  const [fullScreenTutorMode, setFullScreenTutorMode] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [notesNotebook, setNotesNotebook] = useState<any | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const normalizeMathMarkdown = (text: string, videoId?: string) => {
    // Convert output into clean Markdown that separates math from descriptive text.
    // Math is rendered inline using $...$ so surrounding text remains normal.
    const withLinks = videoId ? linkifyTimestamps(text, videoId) : text;

    const normalizeSpokenMath = (input: string) =>
      input
        .replace(/\bsine squared\s+([A-Za-z0-9])/gi, "\\sin^2 $1")
        .replace(/\bsine squared\b/gi, "\\sin^2")
        .replace(/\bsine\b/gi, "\\sin")
        .replace(/\bcos\b/gi, "\\cos")
        .replace(/\bcosine\b/gi, "\\cos")
        .replace(/\btan\b/gi, "\\tan")
        .replace(/\btangent\b/gi, "\\tan")
        .replace(/\btheta\b/gi, "\\theta")
        .replace(/\bpi\b/gi, "\\pi")
        .replace(/\bdelta\b/gi, "\\delta");

    const normalizeCasualEquation = (line: string) =>
      line
        .replace(/\bis\b/gi, "=")
        .replace(/\bequals\b/gi, "=")
        .replace(/\bplus\b/gi, "+")
        .replace(/\bminus\b/gi, "-")
        .replace(/\btimes\b/gi, "*")
        .replace(/\bdivided by\b/gi, "/")
        .replace(/\bover\b/gi, "/");

    const normalizeFraction = (line: string) =>
      line.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, "\\frac{$1}{$2}");

    const normalizeTrig = (line: string) =>
      line
        .replace(/\\cos\s*(\d+)x/gi, "\\cos($1x)")
        .replace(/\\sin\s*(\d+)x/gi, "\\sin($1x)");

    // Simplify common formatting patterns into nicer LaTeX.
    const normalizeCommonIdentities = (line: string) =>
      line
        .replace(/\\frac\{1\}\{2\}\s*\*\s*1\s*-\s*\\cos\((\d+)x\)/gi, "\\frac{1-\\cos($1x)}{2}")
        .replace(/\\frac\{1\}\{2\}\s*\*\s*1\s*-\s*\\cos\s*(\d+)x/gi, "\\frac{1-\\cos($1x)}{2}");

    const stripDollarSigns = (line: string) =>
      line.replace(/\$/g, "").replace(/\u2061/g, ""); // remove stray $ and invisible function-application chars

    const wrapMathInLine = (line: string) => {
      // Remove any stray dollar-sign delimiters (some AI outputs are malformed).
      const cleaned = stripDollarSigns(line);

      // Protect URLs from being accidentally converted into math by our regexes.
      const urlRegex = /https?:\/\/[\w\-\.\/%&=\?\+\#]+/g;
      const urls: string[] = [];
      const placeholder = (match: string) => {
        const key = `__URL_${urls.length}__`;
        urls.push(match);
        return key;
      };
      const withoutUrls = cleaned.replace(urlRegex, placeholder);

      const shouldConvert = /\b(sin|cos|tan|log|ln|\d+\/\d+|\^|=)\b/i.test(withoutUrls);
      if (!shouldConvert) return cleaned;

      const normalized = normalizeSpokenMath(normalizeCasualEquation(withoutUrls));
      const fractioned = normalizeFraction(normalized);
      const trigged = normalizeTrig(fractioned);
      const simplified = normalizeCommonIdentities(trigged);

      // Wrap detected math expressions in $...$ so KaTeX renders them cleanly.
      // 1) Fractions (\frac{a}{b})
      // 2) Common trig/power patterns (\sin^2 x, \cos 2x, etc.)
      // 3) Operator expressions (a + b, 1/2 * x, etc.)
      const wrapWithDollar = (text: string, regex: RegExp) =>
        text
          .split("$")
          .map((segment, idx) => {
            if (idx % 2 === 1) return segment; // already inside math
            return segment.replace(regex, (m) => `$${m}$`);
          })
          .join("$");

      const mathRegex = /[A-Za-z0-9\\][A-Za-z0-9\\^_{}()]*\s*(?:[+\-*/^]\s*[A-Za-z0-9\\][A-Za-z0-9\\^_{}()]*)+/g;

      let out = simplified;
      out = wrapWithDollar(out, /\\frac\{[^}]+\}\{[^}]+\}/g);
      out = wrapWithDollar(out, /\\(?:sin|cos|tan|log|ln|theta|pi|delta)(?:\^\d+)?\s*[A-Za-z0-9()]+/g);
      out = wrapWithDollar(out, mathRegex);

      // Restore URLs that were stripped before math wrapping.
      urls.forEach((url, idx) => {
        out = out.replace(`__URL_${idx}__`, url);
      });

      return out;
    };

    return withLinks
      .split("\n")
      .flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed) return [line];
        return [wrapMathInLine(line)];
      })
      .join("\n");
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const videoId = useMemo(() => {
    // Some endpoints (PDF upload) return pdf_id instead of video_id.
    // Normalize it so downstream logic can use a single identifier.
    return (
      downloadState.response?.video_id ||
      downloadState.response?.pdf_id ||
      downloadState.response?.job_id
    );
  }, [downloadState.response]);

  useEffect(() => {
    if (!chatFullScreen) return;

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChatFullScreen(false);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [chatFullScreen]);

  const videoTitle = useMemo(() => {
    return downloadState.response?.video_title || downloadState.response?.title || "";
  }, [downloadState.response]);

  const isReady = stage === "ready";

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const fetchMasterclassNotes = async () => {
    if (!videoId) return;
    setNotesLoading(true);
    setNotesError(null);

    try {
      const res = await fetch(`${apiBase}/api/notes/masterclass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.message || "Failed to generate notes");
      setNotesNotebook(data);
    } catch (e: any) {
      setNotesError(e?.message || String(e));
    } finally {
      setNotesLoading(false);
    }
  };

  const downloadNotesNotebook = () => {
    if (!notesNotebook) return;
    const blob = new Blob([JSON.stringify(notesNotebook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${videoTitle || videoId || "notes"}.ipynb`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const getNotesHtml = () => {
    if (!notesNotebook) return "";
    const cellsHtml = notesNotebook.cells
      ?.map((cell: any) => {
        if (!cell || cell.cell_type !== "markdown") return "";
        const src = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
        return src;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${videoTitle || "Notes"}</title>
  <style>
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
      padding: 2rem;
    }

    a {
      color: #58a6ff;
    }

    h1, h2, h3 {
      color: #f0f6fc;
    }

    .notes-header {
      background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1a1f29 100%);
      padding: 24px;
      border-left: 6px solid #a371f7;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 4px 15px rgba(163, 113, 247, 0.2);
    }

    .notes-header h1 {
      margin: 0;
      font-size: 2.25rem;
    }

    .notes-header p {
      margin: 8px 0 0;
      color: #a371f7;
      font-size: 1.1rem;
      font-weight: 600;
    }

    .notebook-cell {
      margin-bottom: 1.5rem;
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 18px;
    }

    .card h2 {
      margin-top: 0;
      color: #58a6ff;
    }

    .code-block {
      background: rgba(13, 17, 23, 0.9);
      padding: 16px;
      border-radius: 10px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
  </style>
</head>
<body>
  <div class="notes-header">
    <h1>🚀 Masterclass Notes</h1>
    <p>Generated from transcript</p>
  </div>
  <div class="card">
    ${cellsHtml}
  </div>
</body>
</html>`;
  };

  const downloadNotesHtml = () => {
    const html = getNotesHtml();
    if (!html) return;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${videoTitle || videoId || "notes"}.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const printNotesPdf = () => {
    const html = getNotesHtml();
    if (!html) return;

    const printWindow = window.open("", "_blank", "width=900,height=800");
    if (!printWindow) return;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    // Delay to ensure styling loads before print.
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  useEffect(() => {
    // Reset notes when switching to a different video.
    setNotesNotebook(null);
    setNotesError(null);
  }, [videoId]);

  useEffect(() => {
    if (activeMode === "notes" && videoId && !notesNotebook && !notesLoading) {
      fetchMasterclassNotes();
    }
  }, [activeMode, videoId]);

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
setAudioStatus("uploading");
      setAudioProgress(0);
      setAudioElapsed(0);
      setAudioEstimated(null);
      setActiveMode("progress");
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
      setShowTranscript(false); // Don't auto-show transcript; user must choose to view it
      if (inputMode !== "audio") {
        setStage("ready");
      }

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

      // For audio uploads, show progress/status instead of transcript by default
      setActiveMode(inputMode === "audio" ? "progress" : "transcript");
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

  useEffect(() => {
    if (activeMode === "progress" && isAudioDone) {
      setActiveMode("notes");
    }
  }, [activeMode, isAudioDone]);

  // Auto-scroll chat to bottom when a new message is added
  useEffect(() => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatHistory, chatLoading]);

  // Persist chat history locally so page reload doesn't lose context
  useEffect(() => {
    const stored = localStorage.getItem("vidsage_chat_history");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setChatHistory(parsed);
          setChatIndex(parsed.length - 1);
        }
      } catch {
        // ignore malformed stored value
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("vidsage_chat_history", JSON.stringify(chatHistory));
  }, [chatHistory]);

  const pollAudioStatus = async (jobId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/audio/status/${jobId}`);
      const data = await res.json();
      setAudioStatus(data.status);

      if (typeof data.progress === "number") {
        setAudioProgress(data.progress);
      }
      if (typeof data.elapsed === "number") {
        setAudioElapsed(data.elapsed);
      }
      if (typeof data.estimated === "number") {
        setAudioEstimated(data.estimated);
      }

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

      // continue polling while processing
      if (data.status && data.status !== "completed" && data.status !== "failed") {
        setTimeout(() => pollAudioStatus(jobId), 2500);
      }
    } catch {
      // ignore
    }
  };

  const askQuestion = async (question: string) => {
    if (!videoId || !question.trim()) return;
    setChatLoading(true);

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

      const answer = String(data.answer ?? "(No answer returned)");
      setChatAnswer(answer);

      // Add answer to history (support step-back navigation)
      setChatHistory((prev) => {
        const next = prev.slice(0, chatIndex + 1);
        next.push({ question, answer });
        return next;
      });
      setChatIndex((prev) => prev + 1);
      setChatQuestion("");
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
    setAudioStatus(null);
    setAudioProgress(null);
    setAudioElapsed(null);
    setAudioEstimated(null);
    setCopyStatus("");
    setCopyHint("");
  };


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

              {inputMode === "audio" && (
                <div className="mt-6 w-full max-w-lg rounded-xl border border-white/10 bg-slate-950/40 p-4 text-left text-sm">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Status</span>
                    <span className="text-slate-200">{audioStatus || "starting..."}</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${audioProgress ?? 0}%` }}
                    />
                  </div>
                  {audioProgress != null && (
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>{audioProgress.toFixed(0)}%</span>
                      {audioEstimated != null && (
                        <span>ETA: {formatTime(audioEstimated)}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
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
                    onClick={() =>
                      setActiveMode(inputMode === "audio" ? "progress" : "transcript")
                    }
                    className={
                      "rounded-xl px-4 py-2 text-sm font-medium " +
                      (activeMode === "transcript" || activeMode === "progress"
                        ? "bg-amber-500 text-slate-950"
                        : "bg-transparent text-slate-200 hover:bg-slate-800/40")
                    }
                  >
                    {inputMode === "audio" ? "Progress" : "Transcript"}
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
                </div>

                <div className="mt-auto rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200">
                  <div className="font-semibold text-slate-100 mb-2">Stats</div>
                  <div className="text-xs text-slate-400">Transcript length: {transcriptText.length} chars</div>
                  {audioJobId && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                      <span>Job:</span>
                      <span className="truncate">{truncateMiddle(audioJobId)}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(audioJobId)}
                        className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/50 text-slate-300 hover:bg-slate-800"
                        title="Copy job ID"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      {copyHint && (
                        <span className="text-xs text-emerald-300">{copyHint}</span>
                      )}
                    </div>
                  )}
                  {audioStatus && (
                    <div className="mt-1 text-xs text-slate-400">Status: {audioStatus}</div>
                  )}
                </div>
              </div>
            </aside>

            {/* Center Content */}
            <main className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">
                  {activeMode === "progress" 
                    ? "Audio progress" 
                    : activeMode === "transcript" 
                    ? "Transcript" 
                    : "Notes"}
                </h2>
              </div>

              {activeMode === "progress" && (
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-white">Status</div>
                    <div className="text-lg font-semibold text-white">
                      {audioProgress != null ? `${audioProgress.toFixed(0)}%` : "—"}
                    </div>
                  </div>

                  <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-900">
                    <div
                      className={
                        "h-full rounded-full " +
                        (isAudioDone
                          ? "bg-emerald-500"
                          : "shimmer bg-amber-500")
                      }
                      style={{ width: `${audioProgress ?? 0}%` }}
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-200">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-slate-400">Current</span>
                        <span className="text-base font-semibold">
                          {audioStatus || "waiting"}
                        </span>
                      </div>
                      {isAudioDone && (
                        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                          Complete
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        "uploading",
                        "queued",
                        "preprocessing",
                        "transcribing",
                        "cleaning",
                        "indexing",
                      ].map((step) => {
                        const order = [
                          "uploading",
                          "queued",
                          "preprocessing",
                          "transcribing",
                          "cleaning",
                          "indexing",
                        ];
                        const currentIndex = order.indexOf(audioStatus || "");
                        const stepIndex = order.indexOf(step);
                        const isDone = isAudioDone || stepIndex < currentIndex;
                        const isActive = !isAudioDone && stepIndex === currentIndex;

                        return (
                          <div
                            key={step}
                            className={
                              "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 backdrop-blur-sm " +
                              (isActive
                                ? "bg-amber-500/20 text-amber-100"
                                : isDone
                                ? "bg-emerald-500/10 text-emerald-200"
                                : "bg-white/5 text-slate-400")
                            }
                          >
                            <span>
                              {isActive ? (
                                <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                              ) : isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-slate-500" />
                              )}
                            </span>
                            <span className="capitalize">{step}</span>
                          </div>
                        );
                      })}
                    </div>

                    {isAudioDone ? (
                      <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                        <div className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-100">
                          <CheckCircle2 className="h-5 w-5" />
                          <span>Analysis Complete!</span>
                        </div>

                        <button
                          onClick={() => setActiveMode("notes")}
                          className="mt-4 inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 hover:bg-emerald-400"
                        >
                          Go to Notes
                        </button>
                      </div>
                    ) : (
                      audioElapsed != null &&
                      audioEstimated != null && (
                        <div className="text-xs text-slate-400">
                          {`Elapsed: ${formatTime(audioElapsed)} · ETA: ${formatTime(audioEstimated)}`}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {activeMode === "transcript" && (
                <div className="mt-4 max-h-[60vh] rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200">
                  {transcriptText ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-400">Transcript available</div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              copyToClipboard(transcriptText);
                            }}
                            className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/15"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTranscriptText("");
                              setShowTranscript(false);
                            }}
                            className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/15"
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowTranscript((prev) => !prev)}
                            className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/15"
                          >
                            {showTranscript ? "Hide" : "Show"} transcript
                          </button>
                        </div>
                      </div>

                      {showTranscript ? (
                        <pre className="whitespace-pre-wrap">{transcriptText}</pre>
                      ) : (
                        <p className="text-slate-400">Transcript hidden. Click “Show transcript” to view.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-slate-400">Transcript is empty.</p>
                  )}
                </div>
              )}

              {activeMode === "notes" && (
                <div className="mt-4">
                  <div className="rounded-2xl bg-gradient-to-r from-[#0d1117] via-[#161b22] to-[#1a1f29] border-l-4 border-purple-400 p-6 shadow-lg shadow-purple-500/10">
                    <h2 className="text-2xl font-semibold text-white">🚀 Masterclass Notes</h2>
                    <p className="mt-2 text-sm text-purple-200">Generated from transcript. Click “Generate notes” to refresh.</p>
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-6 text-sm text-slate-200">
                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        type="button"
                        onClick={fetchMasterclassNotes}
                        disabled={!videoId || notesLoading}
                        className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {notesLoading
                          ? "Generating notes…"
                          : notesNotebook
                          ? "Regenerate notes"
                          : "Generate notes"}
                      </button>
                      {notesNotebook && (
                        <>
                          <button
                            type="button"
                            onClick={downloadNotesNotebook}
                            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/15"
                          >
                            Download .ipynb
                          </button>
                          <button
                            type="button"
                            onClick={downloadNotesHtml}
                            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/15"
                          >
                            Download HTML
                          </button>
                          <button
                            type="button"
                            onClick={printNotesPdf}
                            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/15"
                          >
                            Print / Save PDF
                          </button>
                        </>
                      )}
                    </div>

                    {notesError && (
                      <p className="text-sm text-red-400 mb-3">Error generating notes: {notesError}</p>
                    )}

                    {notesNotebook ? (
                      <div className="prose prose-invert max-w-none leading-relaxed">
                        {notesNotebook.cells?.map((cell: any, idx: number) => {
                          const cellText = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source);
                          return (
                            <div key={idx} className="notebook-cell">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                              >
                                {normalizeMathMarkdown(cellText, videoId)}
                              </ReactMarkdown>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-400">
                        Click “Generate notes” to fetch the masterclass notebook (.ipynb) for this video.
                      </p>
                    )}
                  </div>
                </div>
              )}

            </main>

            {/* Right Sidebar (Sage Assistant) */}
            <aside className="space-y-6 h-full">
              <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-slate-800/50 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Sage Assistant</h3>
                    <span className="text-xs text-slate-400">AI Chat</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatFullScreen(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-slate-200 hover:bg-white/15"
                    title="Expand chat"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex flex-1 flex-col overflow-hidden">
                  <div ref={chatContainerRef} className="flex-1 space-y-4 overflow-y-auto pr-2">
                    {chatHistory.slice(0, chatIndex + 1).map((entry, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl bg-emerald-500/20 p-3 text-sm text-slate-200">
                            <div className="text-xs text-slate-300 mb-1">You</div>
                            <div className="whitespace-pre-wrap">{entry.question}</div>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-2xl bg-slate-900/60 border border-white/10 p-3 text-sm text-slate-200">
                            <div className="text-xs text-slate-400 mb-1">Sage</div>
                            <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath, remarkGfm]}
                                rehypePlugins={[rehypeKatex]}
                                components={{
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-300 hover:text-blue-100"
                                    >
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {normalizeMathMarkdown(entry.answer, videoId)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {chatHistory.length === 0 && (
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

                    <div className="mt-4 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={chatQuestion}
                          onChange={(e) => setChatQuestion(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey && !chatLoading) {
                              e.preventDefault();
                              askQuestion(chatQuestion);
                            }
                          }}
                          placeholder="Ask the Sage... (press Enter to send)"
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

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setChatHistory([]);
                            setChatIndex(-1);
                            setChatAnswer(null);
                            setChatQuestion("");
                            localStorage.removeItem("vidsage_chat_history");
                          }}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/15"
                        >
                          Clear chat
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const last = chatHistory[chatHistory.length - 1];
                            if (last) askQuestion(last.question);
                          }}
                          disabled={chatHistory.length === 0 || chatLoading}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 hover:bg-white/15 disabled:opacity-50"
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      <div
        className={
          "fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xl p-6 transition-opacity duration-300 ease-out " +
          (chatFullScreen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none")
        }
        aria-hidden={!chatFullScreen}
      >
        <div
          className={
            "relative flex h-[92vh] w-[92vw] max-w-[1200px] overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-slate-950/90 shadow-2xl ring-1 ring-white/10 transition-transform duration-300 " +
            (chatFullScreen ? "scale-100" : "scale-95")
          }
        >
            <div className="absolute right-3 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setChatFullScreen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/70 text-slate-100 hover:bg-slate-800"
                title="Close full screen"
              >
                <Minimize2 className="h-5 w-5" />
              </button>
            </div>

            <div
              className={
                "grid h-full w-full " +
                (fullScreenTutorMode ? "grid-cols-1 lg:grid-cols-[40%_60%]" : "grid-cols-1")
              }
            >
              {/* Transcript (left side) */}
              {fullScreenTutorMode && (
                <div className="border-r border-white/10 p-6 overflow-y-auto">
                  <h3 className="text-sm font-semibold text-white">Transcript</h3>
                  <p className="text-xs text-slate-400 mb-4">View transcript while chatting (Tutor Mode)</p>
                  {transcriptText ? (
                    <div className="prose prose-invert max-w-none leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {transcriptText}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-slate-400">Transcript is empty.</p>
                  )}
                </div>
              )}

              {/* Chat (right side) */}
              <div
                className={
                  "flex flex-col overflow-hidden bg-slate-950/80 " +
                  (fullScreenTutorMode ? "" : "px-6 py-4")
                }
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Sage Assistant</h3>
                    <span className="text-xs text-slate-400">AI Chat</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFullScreenTutorMode((prev) => !prev)}
                      className={
                        "flex h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold " +
                        (fullScreenTutorMode
                          ? "bg-emerald-500 text-slate-950"
                          : "bg-white/10 text-slate-200 hover:bg-white/15")
                      }
                      title="Toggle transcript view"
                    >
                      <span>Transcript</span>
                      <span className="text-xs">{fullScreenTutorMode ? "On" : "Off"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setChatFullScreen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/70 text-slate-100 hover:bg-slate-800"
                      title="Exit full screen"
                    >
                      <Minimize2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col overflow-hidden px-6 py-4">
                  <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {chatHistory.slice(0, chatIndex + 1).map((entry, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl bg-emerald-500/20 p-3 text-sm text-slate-200">
                            <div className="text-xs text-slate-300 mb-1">You</div>
                            <div className="whitespace-pre-wrap">{entry.question}</div>
                          </div>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[80%] rounded-2xl bg-slate-900/60 border border-white/10 p-3 text-sm text-slate-200">
                            <div className="text-xs text-slate-400 mb-1">Sage</div>
                            <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                              <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {normalizeMathMarkdown(entry.answer, videoId)}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {chatHistory.length === 0 && (
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
