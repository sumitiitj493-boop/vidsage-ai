"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Sparkles,
  Trophy,
  Clock,
  Target,
  Zap,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useQuiz } from "@/hooks/useQuiz";
import { cn } from "@/lib/utils";

type Props = {
  transcriptId?: string;
  videoTitle?: string;
};

type QuizType = "mcq" | "subjective" | "numerical" | "mixed";

type Difficulty = "easy" | "medium" | "hard" | "mixed";

export default function QuizGenerator({ transcriptId, videoTitle }: Props) {
  const [step, setStep] = useState<"config" | "quiz" | "results">("config");
  const [quizType, setQuizType] = useState<QuizType>("mcq");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [questionCount, setQuestionCount] = useState(5);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);

  const {
    quiz,
    isGenerating,
    error,
    score,
    userAnswers,
    debugRaw,
    usedSuggestions,
    suggestions,
    generateQuiz,
    submitAnswer,
    calculateScore,
    resetQuiz,
  } = useQuiz();

  const currentQuestion = quiz?.questions?.[currentQuestionIndex];

  const isAnswered = Boolean(
    currentQuestion && userAnswers[currentQuestion.id] !== undefined
  );

  const isCorrect = useMemo(() => {
    if (!currentQuestion) return false;
    const answer = userAnswers[currentQuestion.id];
    if (answer === undefined) return false;
    return answer.trim().toLowerCase() === currentQuestion.correctAnswer?.trim().toLowerCase();
  }, [currentQuestion, userAnswers]);

  // Timer
  useEffect(() => {
    if (step !== "quiz") {
      setTimeSpent(0);
      return;
    }

    const interval = setInterval(() => {
      setTimeSpent((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [step]);

  const handleGenerate = async () => {
    const quizData = await generateQuiz(
      { type: quizType, difficulty, questionCount },
      transcriptId
    );

    if (quizData?.questions?.length) {
      setCurrentQuestionIndex(0);
      setShowExplanation(false);
      setStep("quiz");
    }
  };

  const handleNext = () => {
    if (!quiz) return;
    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex((i) => i + 1);
      setShowExplanation(false);
    } else {
      calculateScore();
      setStep("results");
    }
  };

  const handlePrevious = () => {
    setShowExplanation(false);
    setCurrentQuestionIndex((idx) => Math.max(0, idx - 1));
  };

  const handleRestart = () => {
    resetQuiz();
    setTimeout(() => {
      // keep the same config so user can regenerate quickly
      setStep("config");
      setCurrentQuestionIndex(0);
      setShowExplanation(false);
    }, 0);
  };

  const progressWidth = quiz
    ? `${((currentQuestionIndex + 1) / quiz.questions.length) * 100}%`
    : "0%";

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-white/10 p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold">Quiz Generator</h2>
          <p className="text-sm text-slate-300">
            {videoTitle ? `${videoTitle}` : "Generate questions from your transcript"}
          </p>
        </div>
        {step === "quiz" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Time</span>
            <div className="rounded-full bg-slate-800/60 px-3 py-1 text-xs font-semibold text-slate-100">
              {String(Math.floor(timeSpent / 60)).padStart(2, "0")}
              :{String(timeSpent % 60).padStart(2, "0")}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {step === "config" && (
          <div className="space-y-6">
            {/* Type */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Question Type</h3>
                <span className="text-xs text-slate-400">Select format</span>
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: "mcq", label: "MCQ", icon: "🔘", desc: "Multiple Choice" },
                  { id: "subjective", label: "Subjective", icon: "✍️", desc: "Written Answers" },
                  { id: "numerical", label: "Numerical", icon: "🔢", desc: "Math Problems" },
                  { id: "mixed", label: "Mixed", icon: "🎲", desc: "All Types" },
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setQuizType(type.id as QuizType)}
                    className={cn(
                      "rounded-xl border px-4 py-4 text-left transition",
                      quizType === type.id
                        ? "border-amber-500 bg-amber-500/15 shadow-sm"
                        : "border-white/10 hover:border-white/20"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{type.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{type.label}</div>
                        <div className="text-xs text-slate-400">{type.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Difficulty Level</h3>
                <span className="text-xs text-slate-400">Adjust the challenge</span>
              </div>
              <div className="mt-3 flex gap-2">
                {[
                  { id: "easy", label: "Easy" },
                  { id: "medium", label: "Medium" },
                  { id: "hard", label: "Hard" },
                  { id: "mixed", label: "Mixed" },
                ].map((level) => (
                  <button
                    key={level.id}
                    onClick={() => setDifficulty(level.id as Difficulty)}
                    className={cn(
                      "flex-1 rounded-xl px-4 py-2 text-sm font-medium transition",
                      difficulty === level.id
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800/50 text-slate-300 hover:bg-slate-800"
                    )}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">Number of Questions</h3>
                <span className="text-xs text-slate-400">{questionCount}</span>
              </div>
              <input
                type="range"
                min={3}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="mt-2 w-full accent-amber-500"
              />
            </div>

            {/* Generate */}
            <div className="mt-4">
              <button
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400 disabled:opacity-60"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <div className="flex items-center justify-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  {isGenerating ? "Generating Questions..." : "Generate Quiz"}
                </div>
              </button>
              {error && (
                <p className="mt-3 text-sm text-rose-300">Error: {error}</p>
              )}
            </div>

            {suggestions && suggestions.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Suggested Questions</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 5).map((q, idx) => (
                    <span
                      key={idx}
                      className="rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-200"
                    >
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === "quiz" && currentQuestion && (
          <div>
            <div className="mb-4">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-400"
                  style={{ width: progressWidth }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="space-y-1">
                <div className="text-xs text-slate-400">Question {currentQuestionIndex + 1} of {quiz?.questions.length}</div>
                <h3 className="text-lg font-semibold text-slate-100">{currentQuestion.question}</h3>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-800/50 px-2 py-1 text-xs text-slate-300">
                    {currentQuestion.type.toUpperCase()}
                  </span>
                  <span className="rounded-full bg-slate-800/50 px-2 py-1 text-xs text-slate-300">
                    {currentQuestion.difficulty ?? difficulty}
                  </span>
                </div>
              </div>

              <button
                className="rounded-full border border-white/10 bg-slate-800/50 px-3 py-2 text-xs uppercase tracking-wide text-slate-200 hover:bg-slate-800"
                onClick={() => setShowExplanation((v) => !v)}
              >
                {showExplanation ? "Hide" : "Check Answer"}
              </button>
            </div>

            {currentQuestion.type === "mcq" && currentQuestion.options && (
              <div className="space-y-3">
                {currentQuestion.options.map((option, idx) => {
                  const selected = userAnswers[currentQuestion.id] === option;
                  const correct = showExplanation && option === currentQuestion.correctAnswer;
                  const wrong = showExplanation && selected && !correct;

                  return (
                    <button
                      key={option + idx}
                      className={cn(
                        "w-full rounded-xl border px-4 py-4 text-left transition",
                        correct
                          ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                          : wrong
                          ? "border-rose-500 bg-rose-500/15 text-rose-200"
                          : selected
                          ? "border-amber-500 bg-amber-500/15 text-amber-200"
                          : "border-white/10 hover:border-white/20"
                      )}
                      onClick={() => submitAnswer(currentQuestion.id, option)}
                      disabled={showExplanation}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "inline-flex h-8 w-8 items-center justify-center rounded-lg font-semibold",
                              correct
                                ? "bg-emerald-500 text-white"
                                : wrong
                                ? "bg-rose-500 text-white"
                                : selected
                                ? "bg-amber-500 text-white"
                                : "bg-slate-800 text-slate-300"
                            )}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-sm leading-relaxed">{option}</span>
                        </div>
                        {correct && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                        {wrong && <XCircle className="h-5 w-5 text-rose-400" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQuestion.type === "subjective" && (
              <textarea
                value={userAnswers[currentQuestion.id] || ""}
                onChange={(e) => submitAnswer(currentQuestion.id, e.target.value)}
                placeholder="Type your answer here..."
                rows={5}
                className="w-full rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            )}

            {showExplanation && currentQuestion.explanation && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-amber-200">
                  <Zap className="h-4 w-4" />
                  Explanation
                </div>
                <p className="text-sm text-slate-300">{currentQuestion.explanation}</p>
              </div>
            )}

            {(debugRaw || usedSuggestions !== null) && (
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                    <Target className="h-4 w-4" />
                    Debug
                  </div>
                  <button
                    className="text-xs text-slate-300 hover:text-slate-100"
                    onClick={() => setShowDebug((v) => !v)}
                  >
                    {showDebug ? "Hide" : "Show"}
                  </button>
                </div>
                {showDebug && (
                  <div className="border-t border-slate-800 px-4 py-3 text-xs font-mono text-slate-300">
                    {usedSuggestions !== null && (
                      <div className="mb-2">
                        Used suggestions: <span className="font-semibold">{usedSuggestions ? "Yes" : "No"}</span>
                      </div>
                    )}
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap">{debugRaw || "(no debug output)"}</pre>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
              <button
                onClick={handlePrevious}
                disabled={currentQuestionIndex === 0}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-800/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <div className="flex gap-2">
                {showExplanation && (
                  <button
                    onClick={() => setShowExplanation(false)}
                    className="rounded-xl border border-white/10 bg-slate-800/40 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Continue
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  {currentQuestionIndex === (quiz?.questions.length ?? 1) - 1 ? "Finish Quiz" : "Next"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-6 text-center">
            <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-emerald-500/15">
              <Trophy className="h-10 w-10 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-semibold text-slate-100">Quiz Complete</h3>
            <p className="text-sm text-slate-300">
              Your score: <span className="font-semibold text-slate-100">{score !== null ? Math.round(score) : "-"}%</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Time</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {String(Math.floor(timeSpent / 60)).padStart(2, "0")}:{String(timeSpent % 60).padStart(2, "0")}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Questions</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  {quiz?.questions.length ?? 0}
                </div>
              </div>
              <div className="rounded-xl bg-slate-900/40 p-4">
                <div className="text-xs text-slate-400">Difficulty</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">{difficulty}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={handleRestart}
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
              >
                Try Again
              </button>
              <button
                onClick={() => setStep("quiz")}
                className="rounded-xl border border-white/10 bg-slate-800/50 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Review Answers
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
