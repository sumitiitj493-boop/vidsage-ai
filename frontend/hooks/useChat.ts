import { useState, useRef, useEffect } from "react";
import { ChatMessage, ChatSession } from "../lib/types/dashboard";
import { authFetch } from "../lib/auth";

export function useChat(videoId: string | undefined | null, videoTitle?: string) {
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatIndex, setChatIndex] = useState(-1);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOutputMode, setChatOutputMode] = useState<"markdown" | "latex">("markdown");
  const [chatLanguage, setChatLanguage] = useState<string>("auto");
  const [allSessions, setAllSessions] = useState<Record<string, ChatSession>>({});
  
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const readTranscriptCache = (id: string, session: ChatSession) => {
    try {
      const cacheKey = "vidsage_transcripts";
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
      if (existing && existing[id]) {
        return {
          ...session,
          transcript: existing[id].transcript || session.transcript,
          suggestedQuestions: existing[id].suggestedQuestions || session.suggestedQuestions,
        };
      }
    } catch {
      // ignore cache read errors
    }

    return session;
  };

  const persistSessions = (next: Record<string, ChatSession>) => {
    try {
      // All saved sessions are kept. For non-saved, we keep the 10 most recent ones.
      const entries = Object.values(next);
      const saved = entries.filter((s) => s.saved);
      const nonsaved = entries
        .filter((s) => !s.saved)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10); // Keep more non-saved sessions
      
      const finalObj: Record<string, ChatSession> = {};
      [...saved, ...nonsaved].forEach((s) => (finalObj[s.id] = s));
      
      localStorage.setItem("vidsage_all_sessions", JSON.stringify(finalObj));
      return finalObj;
    } catch {
      // Fallback in case of any error
      localStorage.setItem("vidsage_all_sessions", JSON.stringify(next));
      return next;
    }
  };

  // Auto-scroll
  useEffect(() => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatHistory, chatLoading]);

  // Load all sessions and current session
  useEffect(() => {
    const stored = localStorage.getItem("vidsage_all_sessions");
    let sessions: Record<string, ChatSession> = {};
    if (stored) {
      try {
        sessions = JSON.parse(stored);
        console.log("Loaded sessions from storage:", sessions); // Debug
        setAllSessions(sessions);
      } catch (e) {
        console.error("Failed to parse sessions:", e);
      }
    }

    if (videoId) {
      const currentSession = sessions[videoId];
      console.log("Current videoId:", videoId, "Found session:", !!currentSession); // Debug
      if (currentSession?.messages) {
        setChatHistory(currentSession.messages);
        setChatIndex(currentSession.messages.length - 1);
      } else {
        setChatHistory([]);
        setChatIndex(-1);
      }
      setChatAnswer(null);
      setChatQuestion("");
    } else {
      setChatHistory([]);
      setChatIndex(-1);
      setChatAnswer(null);
      setChatQuestion("");
    }
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
    const cleanTitle = videoTitle?.trim();
    
    setAllSessions((prev) => {
      const existing = prev[videoId];
      const nextTitle = cleanTitle || existing?.title || "Untitled Video";

      if (existing && existing.title === nextTitle && existing.id === videoId) {
        return prev;
      }

      const updatedSession: ChatSession = {
        id: videoId,
        title: nextTitle,
        updatedAt: existing?.updatedAt ?? Date.now(),
        messages: existing?.messages ?? [],
        transcript: existing?.transcript,
        suggestedQuestions: existing?.suggestedQuestions,
        saved: existing?.saved ?? false,
      };

      return persistSessions({
        ...prev,
        [videoId]: updatedSession,
      });
    });
  }, [videoId, videoTitle]);

  // Save current session to all sessions when chat history changes
  useEffect(() => {
    if (!videoId || chatHistory.length === 0) return;

    setAllSessions((prev) => {
      const current = prev[videoId];
      
      const updatedSession: ChatSession = {
        id: videoId,
        title: videoTitle || current?.title || "Untitled Video",
        updatedAt: Date.now(),
        messages: chatHistory,
        saved: current?.saved || false,
        transcript: current?.transcript,
        suggestedQuestions: current?.suggestedQuestions,
      };

      const next = { ...prev, [videoId]: updatedSession };
      return persistSessions(next);
    });
  }, [chatHistory, videoId]); // Removed videoTitle from deps to reduce updates

  const saveSessionPermanently = (id: string) => {
    setAllSessions((prev) => {
      const currentSession = prev[id] || {
        id,
        title: videoTitle || "Untitled Video",
        updatedAt: Date.now(),
        messages: [],
      };

      const nextSession = readTranscriptCache(id, {
        ...currentSession,
        saved: true,
        updatedAt: Date.now(),
      });

      return persistSessions({
        ...prev,
        [id]: nextSession,
      });
    });
  };

  const toggleSaveSession = (id: string) => {
    setAllSessions((prev) => {
      const currentSession = prev[id] || {
          id,
          title: videoTitle || "Untitled Video",
          updatedAt: Date.now(),
          messages: chatHistory,
          saved: false
        };

      const isSaved = !!currentSession.saved;
      const nextSession = {
        ...currentSession,
        saved: !isSaved,
        updatedAt: Date.now(),
      };

      const hydratedSession = !isSaved ? readTranscriptCache(id, nextSession) : nextSession;

      return persistSessions({
        ...prev,
        [id]: hydratedSession,
      });
    });
  };

  const askQuestion = async (question: string) => {
    if (!videoId) {
        alert("The Chat module didn't receive the processing job ID. Upload might have cleared it.");
        return;
    }
    if (!question.trim()) return;
    
    // Clear input field immediately
    setChatQuestion("");
    setChatLoading(true);
    setChatAnswer("");

    // Push optimistic message
    setChatHistory((prev) => {
      const next = prev.slice(0, chatIndex + 1);
      next.push({ question, answer: "", format: chatOutputMode });
      return next;
    });
    setChatIndex((prev) => prev + 1);

    try {
      const res = await authFetch(`${apiBase}/api/chat/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question, format: chatOutputMode, language: chatLanguage }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || data?.message || "Failed to get answer");
      }

      const reader = res.body?.getReader();
      if (!reader) {
        const data = await res.json();
        const answer = String(data.answer ?? "(No answer returned)");
        setChatHistory((prev) => {
          const next = [...prev];
          next[next.length - 1].answer = answer;
          return next;
        });
        return;
      }

      const decoder = new TextDecoder();
      let done = false;
      let accumulated = "";

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          accumulated += decoder.decode(value, { stream: true });
          setChatHistory((prev) => {
            const next = [...prev];
            next[next.length - 1].answer = accumulated;
            return next;
          });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setChatHistory((prev) => {
        const next = [...prev];
        next[next.length - 1].answer = `Error: ${errMsg}`;
        return next;
      });
    } finally {
      setChatLoading(false);
    }
  };

  const clearChatHistory = () => {
    setChatHistory([]);
    setChatIndex(-1);
    setChatQuestion("");
    setChatAnswer(null);
    if (videoId) {
      setAllSessions((prev) => {
        const cp = { ...prev };
        delete cp[videoId];
        return persistSessions(cp);
      });
    }
  };

  const deleteSessionHistory = (idToDelete: string) => {
    setAllSessions((prev) => {
      const cp = { ...prev };
      delete cp[idToDelete];
      return persistSessions(cp);
    });
    if (idToDelete === videoId) {
      setChatHistory([]);
      setChatIndex(-1);
      setChatQuestion("");
      setChatAnswer(null);
    }
    try {
      const cacheKey = "vidsage_transcripts";
      const existing = JSON.parse(localStorage.getItem(cacheKey) || "{}");
      if (existing && existing[idToDelete]) {
        delete existing[idToDelete];
        localStorage.setItem(cacheKey, JSON.stringify(existing));
      }
    } catch {}
  };

  return {
    chatQuestion, setChatQuestion,
    chatAnswer, setChatAnswer,
    chatHistory,
    chatIndex, setChatIndex,
    chatLoading,
    chatOutputMode, setChatOutputMode,
    chatLanguage, setChatLanguage,
    chatContainerRef,
    chatEndRef,
    askQuestion,
    clearChatHistory,
    allSessions,
    deleteSessionHistory,
    saveSessionPermanently,
    toggleSaveSession
  };
}