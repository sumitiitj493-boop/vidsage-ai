import { useState, useRef, useEffect } from "react";
import { ChatMessage, ChatSession } from "../lib/types/dashboard";

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
        setAllSessions(sessions);
      } catch {
        // ignore
      }
    }

    if (videoId) {
      const currentSession = sessions[videoId];
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

  // Save current session to all sessions
  useEffect(() => {
    if (!videoId) return;
    
    // Only save if there's actually a history
    setAllSessions((prev) => {
      const updated = {
        ...prev,
        [videoId]: {
          id: videoId,
          title: videoTitle || prev[videoId]?.title || "Untitled Video",
          updatedAt: Date.now(),
          messages: chatHistory
        }
      };
      
      // If we just cleared it, maybe we don't want to save an empty array, but updating is safer
      localStorage.setItem("vidsage_all_sessions", JSON.stringify(updated));
      return updated;
    });
  }, [chatHistory, videoId, videoTitle]);

  const askQuestion = async (question: string) => {
    if (!videoId || !question.trim()) return;
    setChatLoading(true);
    setChatAnswer("");

    try {
      const res = await fetch(`${apiBase}/api/chat/ask/stream`, {
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
        setChatAnswer(answer);
        setChatHistory((prev) => {
          const next = prev.slice(0, chatIndex + 1);
          next.push({ question, answer, format: chatOutputMode });
          return next;
        });
        setChatIndex((prev) => prev + 1);
        setChatQuestion("");
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
          setChatAnswer(accumulated);
        }
      }

      setChatHistory((prev) => {
        const next = prev.slice(0, chatIndex + 1);
        next.push({ question, answer: accumulated, format: chatOutputMode });
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

  const clearChatHistory = () => {
    setChatHistory([]);
    setChatIndex(-1);
    setChatQuestion("");
    setChatAnswer(null);
    if (videoId) {
      setAllSessions((prev) => {
        const cp = { ...prev };
        delete cp[videoId];
        localStorage.setItem("vidsage_all_sessions", JSON.stringify(cp));
        return cp;
      });
    }
  };

  const deleteSessionHistory = (idToDelete: string) => {
    setAllSessions((prev) => {
      const cp = { ...prev };
      delete cp[idToDelete];
      localStorage.setItem("vidsage_all_sessions", JSON.stringify(cp));
      return cp;
    });
    if (idToDelete === videoId) {
      setChatHistory([]);
      setChatIndex(-1);
      setChatQuestion("");
      setChatAnswer(null);
    }
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
    deleteSessionHistory
  };
}