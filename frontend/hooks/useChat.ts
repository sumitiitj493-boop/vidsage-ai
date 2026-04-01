import { useState, useRef, useEffect } from "react";
import { ChatMessage } from "../lib/types/dashboard";

export function useChat(videoId: string | undefined | null) {
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatIndex, setChatIndex] = useState(-1);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOutputMode, setChatOutputMode] = useState<"markdown" | "latex">("markdown");
  
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  // Auto-scroll
  useEffect(() => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }, [chatHistory, chatLoading]);

  // Persist history
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
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("vidsage_chat_history", JSON.stringify(chatHistory));
  }, [chatHistory]);

  const askQuestion = async (question: string) => {
    if (!videoId || !question.trim()) return;
    setChatLoading(true);
    setChatAnswer("");

    try {
      const res = await fetch(`${apiBase}/api/chat/ask/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question, format: chatOutputMode }),
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
    localStorage.removeItem("vidsage_chat_history");
  };

  return {
    chatQuestion, setChatQuestion,
    chatAnswer, setChatAnswer,
    chatHistory,
    chatIndex, setChatIndex,
    chatLoading,
    chatOutputMode, setChatOutputMode,
    chatContainerRef,
    chatEndRef,
    askQuestion,
    clearChatHistory
  };
}