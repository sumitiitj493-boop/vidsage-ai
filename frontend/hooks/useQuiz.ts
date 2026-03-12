"use client";

import { useState, useCallback } from "react";
import { Quiz, QuizQuestion } from "@/types";
import { generateId } from "@/lib/utils";
import { api } from "@/services/api";
import toast from "react-hot-toast";

interface QuizConfig {
  type: "mcq" | "subjective" | "numerical" | "mixed";
  difficulty: "easy" | "medium" | "hard" | "mixed";
  questionCount: number;
}

interface UseQuizReturn {
  quiz: Quiz | null;
  isGenerating: boolean;
  userAnswers: Record<string, string>;
  score: number | null;
  generateQuiz: (config: QuizConfig, transcriptId?: string, context?: string) => Promise<Quiz | null>;
  submitAnswer: (questionId: string, answer: string) => void;
  calculateScore: () => void;
  resetQuiz: () => void;
}

export function useQuiz(): UseQuizReturn {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [score, setScore] = useState<number | null>(null);

  const generateQuiz = useCallback(async (
    config: QuizConfig,
    transcriptId?: string,
    context?: string
  ): Promise<Quiz | null> => {
    if (!transcriptId && !context) {
      toast.error("No content available for quiz generation");
      return null;
    }

    setIsGenerating(true);
    setQuiz(null);
    setUserAnswers({});
    setScore(null);

    let finalQuiz: Quiz | null = null;

    try {
      const response = await api.post("/api/quiz/generate", {
        transcriptId,
        context,
        config,
      });

      if (response.data?.quiz) {
        console.log("quiz API returned", response.data.quiz);
        // normalize questions to array of objects
        let questions: any = response.data.quiz.questions;
        if (typeof questions === "string") {
          // if the LLM returned a numbered list in one string, try splitting
          let parts = questions.split(/\d+\./).map((s: string) => s.trim()).filter(Boolean);
          if (parts.length <= 1) {
            // fallback to newline split if numbering not present
            parts = questions.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
          }
          questions = parts.map((q: string, i: number) => ({
            id: `q${i+1}`,
            type: "subjective",
            question: q,
            correctAnswer: "",
          }));
        }
        if (!Array.isArray(questions)) {
          questions = [];
        }
        finalQuiz = {
          id: generateId(),
          title: response.data.quiz.title || "Generated Quiz",
          questions,
          totalQuestions: questions.length,
          generatedAt: new Date(),
        };
        setQuiz(finalQuiz);
        toast.success("Quiz generated successfully!");
      } else {
        console.warn("quiz API returned no quiz field", response.data);
      }
    } catch (error: any) {
      console.error("Quiz generation error:", error);
      
      // Generate mock quiz for demo
      finalQuiz = generateMockQuiz(config);
      setQuiz(finalQuiz);
      toast.success("Quiz generated (demo mode)");
    } finally {
      setIsGenerating(false);
    }

    return finalQuiz;
  }, []);

  const submitAnswer = useCallback((questionId: string, answer: string) => {
    setUserAnswers((prev: Record<string,string>) => ({
      ...prev,
      [questionId]: answer,
    }));
  }, []);

  const calculateScore = useCallback(() => {
    if (!quiz) return;

    let correct = 0;
    quiz.questions.forEach((question: QuizQuestion) => {
      if (userAnswers[question.id]?.toLowerCase() === question.correctAnswer.toLowerCase()) {
        correct++;
      }
    });

    setScore((correct / quiz.questions.length) * 100);
  }, [quiz, userAnswers]);

  const resetQuiz = useCallback(() => {
    setQuiz(null);
    setUserAnswers({});
    setScore(null);
  }, []);

  return {
    quiz,
    isGenerating,
    userAnswers,
    score,
    generateQuiz,
    submitAnswer,
    calculateScore,
    resetQuiz,
  };
}

// Mock quiz generator for demo
function generateMockQuiz(config: QuizConfig): Quiz {
  const questions: QuizQuestion[] = [];
  
  for (let i = 0; i < config.questionCount; i++) {
    const type = config.type === "mixed" 
      ? ["mcq", "subjective"][Math.floor(Math.random() * 2)] as "mcq" | "subjective"
      : config.type;

    if (type === "mcq") {
      questions.push({
        id: generateId(),
        type: "mcq",
        question: `Sample MCQ Question ${i + 1}: What is the main concept discussed in this section?`,
        options: [
          "Option A - First choice",
          "Option B - Second choice",
          "Option C - Third choice",
          "Option D - Fourth choice",
        ],
        correctAnswer: "Option A - First choice",
        explanation: "This is the correct answer because...",
        difficulty: config.difficulty === "mixed" ? "medium" : config.difficulty,
      });
    } else {
      questions.push({
        id: generateId(),
        type: "subjective",
        question: `Sample Subjective Question ${i + 1}: Explain the key concepts in your own words.`,
        correctAnswer: "Sample answer explaining the concept...",
        explanation: "A good answer should include...",
        difficulty: config.difficulty === "mixed" ? "medium" : config.difficulty,
      });
    }
  }

  return {
    id: generateId(),
    title: "Practice Quiz",
    questions,
    totalQuestions: questions.length,
    generatedAt: new Date(),
  };
}
