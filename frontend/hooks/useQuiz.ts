"use client";

import { useCallback, useMemo, useState } from "react";
import { authFetch } from "../lib/auth";

export type QuizQuestionType = "mcq" | "subjective" | "numerical" | "mixed";

export type QuizDifficulty = "easy" | "medium" | "hard" | "mixed";

export type QuizQuestion = {
  id: string;
  type: QuizQuestionType;
  difficulty?: QuizDifficulty;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
};

export type Quiz = {
  questions: QuizQuestion[];
  metadata?: Record<string, unknown>;
};

export type QuizGenerationOptions = {
  type?: QuizQuestionType;
  difficulty?: QuizDifficulty;
  questionCount?: number;
};

export function useQuiz() {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugRaw, setDebugRaw] = useState<string | null>(null);
  const [usedSuggestions, setUsedSuggestions] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  const generateQuiz = useCallback(
    async (
      options: QuizGenerationOptions = {},
      transcriptId?: string,
      context?: string
    ) => {
      setIsGenerating(true);
      setError(null);
      setScore(null);

      try {
        const payload: Record<string, unknown> = {
          options,
        };
        if (transcriptId) payload.transcriptId = transcriptId;
        if (context) payload.context = context;

        const res = await authFetch(`${apiBase}/api/quiz/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API failed (${res.status}): ${text}`);
        }

        const data = await res.json();

        // backend wraps quiz response as { quiz: { title, questions }, debug_raw, used_suggestions }
        const quizData = data?.quiz ?? data;
        if (!quizData?.questions || !Array.isArray(quizData.questions)) {
          throw new Error("Invalid quiz response from server.");
        }

        setQuiz(quizData);
        setDebugRaw(data?.debug_raw ?? null);
        setUsedSuggestions(data?.used_suggestions ?? null);
        setSuggestions(data?.suggestions ?? null);
        setUserAnswers({});
        setScore(null);
        return quizData;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setQuiz(null);
        setDebugRaw(null);
        setUsedSuggestions(null);
        setSuggestions(null);
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [apiBase]
  );

  const submitAnswer = useCallback((questionId: string, answer: string) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const calculateScore = useCallback(() => {
    if (!quiz) return;
    const total = quiz.questions.length;
    const correct = quiz.questions.filter((q) => {
      const answer = userAnswers[q.id];
      if (answer === undefined || answer === null) return false;
      return answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    }).length;
    setScore((correct / total) * 100);
  }, [quiz, userAnswers]);

  const resetQuiz = useCallback(() => {
    setQuiz(null);
    setUserAnswers({});
    setScore(null);
    setError(null);
  }, []);

  const hasError = useMemo(() => !!error, [error]);

  return {
    quiz,
    isGenerating,
    error,
    hasError,
    score,
    userAnswers,
    debugRaw,
    usedSuggestions,
    suggestions,
    generateQuiz,
    submitAnswer,
    calculateScore,
    resetQuiz,
  };
}
