"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Sparkles,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Trophy,
  Target,
  Zap,
  HelpCircle,
  Clock,
  Award,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useQuiz } from "@/hooks/useQuiz";
import { cn } from "@/lib/utils";

interface QuizGeneratorProps {
  transcriptId?: string;
  context?: string;
  videoTitle?: string;
}

type QuizType = "mcq" | "subjective" | "numerical" | "mixed";
type Difficulty = "easy" | "medium" | "hard" | "mixed";

export function QuizGenerator({
  transcriptId,
  context,
  videoTitle,
}: QuizGeneratorProps) {
  const [step, setStep] = useState<"config" | "quiz" | "results">("config");
  const [quizType, setQuizType] = useState<QuizType>("mcq");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [questionCount, setQuestionCount] = useState(5);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const [timeSpent, setTimeSpent] = useState(0);
  const [showDebug, setShowDebug] = useState(false);

  const {
    quiz,
    isGenerating,
    userAnswers,
    score,
    debugRaw,
    usedSuggestions,
    generateQuiz,
    submitAnswer,
    calculateScore,
    resetQuiz,
  } = useQuiz();

  // Timer
  useEffect(() => {
    let interval: any;
    if (step === "quiz" && !score) {
      interval = setInterval(() => {
        setTimeSpent((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [step, score]);

  const handleGenerate = async () => {
    const newQuiz = await generateQuiz(
      { type: quizType, difficulty, questionCount },
      transcriptId,
      context
    );
    console.log("quiz after generation", newQuiz);
    if (newQuiz && newQuiz.questions && newQuiz.questions.length > 0) {
      setStep("quiz");
      setCurrentQuestion(0);
      setTimeSpent(0);
    }
  };

  const handleNext = () => {
    if (quiz && currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
      setShowExplanation(false);
    } else {
      calculateScore();
      setStep("results");
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
      setShowExplanation(false);
    }
  };

  const handleRestart = () => {
    resetQuiz();
    setStep("config");
    setCurrentQuestion(0);
    setTimeSpent(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const currentQ = quiz?.questions[currentQuestion];
  const isAnswered = currentQ ? !!userAnswers[currentQ.id] : false;
  // temporary simplification to avoid parser issues
  const isCorrect = false;

  // progress bar width calculated separately to simplify JSX
  const progressWidth = quiz
    ? `${((currentQuestion + 1) / quiz.questions.length) * 100}%`
    : "0%";

  // helper to render quiz step so JSX is simpler
  const renderQuiz = () => {
    if (quiz?.questions.length === 0) {
      return (
        <motion.div
          key="no-quiz"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 text-center text-dark-400"
        >
          No questions could be generated for this content.
        </motion.div>
      );
    }
    if (currentQ) {
      return (
        <motion.div
          key="quiz"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="p-6"
        >
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                initial={{ width: 0 }}
                animate={{
                  width: progressWidth,
                }}
              />
            </div>
          </div>

          {/* Question */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              {/* Question Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-dark-500">
                    Q{currentQuestion + 1}
                  </span>
                  <Badge
                    variant={
                      currentQ.difficulty === "easy"
                        ? "sage"
                        : currentQ.difficulty === "hard"
                        ? "red"
                        : "amber"
                    }
                    size="sm"
                  >
                    {currentQ.difficulty}
                  </Badge>
                  <Badge variant="gray" size="sm">
                    {currentQ.type.toUpperCase()}
                  </Badge>
                </div>
                <button
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="text-dark-500 hover:text-dark-300 transition-colors"
                >
                  <HelpCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Question Text */}
              <h4 className="text-lg font-medium text-dark-100 mb-6">
                {currentQ.question}
              </h4>

              {/* Options (for MCQ) */}
              {currentQ.type === "mcq" && currentQ.options && (
                <div className="space-y-3">
                  {currentQ.options.map((option, index) => {
                    const isSelected = userAnswers[currentQ.id] === option;
                    const isCorrectOption =
                      showExplanation && option === currentQ.correctAnswer;
                    const isWrongSelection =
                      showExplanation && isSelected && !isCorrectOption;

                    return (
                      <motion.button
                        key={index}
                        whileHover={{ scale: showExplanation ? 1 : 1.01 }}
                        whileTap={{ scale: showExplanation ? 1 : 0.99 }}
                        onClick={() => {
                          if (!showExplanation) {
                            submitAnswer(currentQ.id, option);
                          }
                        }}
                        disabled={showExplanation}
                        className={cn(
                          "w-full p-4 rounded-xl text-left transition-all flex items-center gap-3",
                          isCorrectOption
                            ? "bg-sage-500/20 border-sage-500 text-sage-400"
                            : isWrongSelection
                            ? "bg-red-500/20 border-red-500 text-red-400"
                            : isSelected
                            ? "bg-amber-500/20 border-amber-500 text-amber-400"
                            : "bg-dark-800/50 border-dark-700 hover:border-dark-600 text-dark-200",
                          "border"
                        )}
                      >
                        <span
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-medium text-sm",
                            isCorrectOption
                              ? "bg-sage-500 text-white"
                              : isWrongSelection
                              ? "bg-red-500 text-white"
                              : isSelected
                              ? "bg-amber-500 text-white"
                              : "bg-dark-700 text-dark-400"
                          )}
                        >
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="flex-1">{option}</span>
                        {isCorrectOption && (
                          <CheckCircle2 className="w-5 h-5 text-sage-500" />
                        )}
                        {isWrongSelection && (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Text Input (for Subjective) */}
              {currentQ.type === "subjective" && (
                <textarea
                  value={userAnswers[currentQ.id] || ""}
                  onChange={(e) => submitAnswer(currentQ.id, e.target.value)}
                  placeholder="Type your answer here..."
                  rows={4}
                  disabled={showExplanation}
                  className="w-full bg-dark-800/50 border border-dark-700 rounded-xl px-4 py-3 text-dark-100 placeholder:text-dark-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                />
              )}

              {/* Explanation */}
              <AnimatePresence>
                {showExplanation && currentQ.explanation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-blue-400">
                        Explanation
                      </span>
                    </div>
                    <p className="text-sm text-dark-300">{currentQ.explanation}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>

          {/* Debug info */}
          {(debugRaw || usedSuggestions !== null) && (
            <div className="mt-6 p-4 rounded-xl bg-dark-900/70 border border-dark-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-dark-100">Debug</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDebug((prev) => !prev)}
                >
                  {showDebug ? "Hide" : "Show"}
                </Button>
              </div>
              {showDebug && (
                <div className="text-xs font-mono text-dark-300 space-y-2">
                  {usedSuggestions !== null && (
                    <div>
                      Used suggestions: <span className="font-semibold">{usedSuggestions ? "Yes" : "No"}</span>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap max-h-40 overflow-y-auto">{debugRaw || "(no debug output)"}</pre>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-dark-700/50">
            <Button
              variant="ghost"
              onClick={handlePrevious}
              disabled={currentQuestion === 0}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            <div className="flex gap-2">
              {!showExplanation && isAnswered && (
                <Button
                  variant="secondary"
                  onClick={() => setShowExplanation(true)}
                >
                  Check Answer
                </Button>
              )}
              <Button onClick={handleNext}>
                {currentQuestion === quiz!.questions.length - 1
                  ? "Finish Quiz"
                  : "Next"}
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </motion.div>
      );
    }
    return null;
  };

  return <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-dark-700/50 bg-gradient-to-r from-amber-500/10 to-orange-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-dark-100">Quiz Generator</h3>
              <p className="text-xs text-dark-400">
                {videoTitle || "Test your knowledge"}
              </p>
            </div>
          </div>
          {step === "quiz" && (
            <div className="flex items-center gap-3">
              <Badge variant="gray" className="gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(timeSpent)}
              </Badge>
              <Badge variant="amber">
                {currentQuestion + 1} / {quiz?.questions.length}
              </Badge>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Configuration Step */}
        {step === "config" && (
          <motion.div
            key="config"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 space-y-6"
          >
            {/* Quiz Type */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-3">
                Question Type
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: "mcq", label: "MCQ", icon: "🔘", desc: "Multiple Choice" },
                  { id: "subjective", label: "Subjective", icon: "✍️", desc: "Written Answers" },
                  { id: "numerical", label: "Numerical", icon: "🔢", desc: "Math Problems" },
                  { id: "mixed", label: "Mixed", icon: "🎲", desc: "All Types" },
                ].map((type) => (
                  <motion.button
                    key={type.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setQuizType(type.id as QuizType)}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      quizType === type.id
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-dark-700 hover:border-dark-600 bg-dark-800/50"
                    )}
                  >
                    <span className="text-2xl mb-2 block">{type.icon}</span>
                    <span className="font-medium text-dark-200 block">{type.label}</span>
                    <span className="text-xs text-dark-500">{type.desc}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-3">
                Difficulty Level
              </label>
              <div className="flex gap-2">
                {[
                  { id: "easy", label: "Easy", color: "sage" },
                  { id: "medium", label: "Medium", color: "amber" },
                  { id: "hard", label: "Hard", color: "red" },
                  { id: "mixed", label: "Mixed", color: "blue" },
                ].map((diff) => (
                  <motion.button
                    key={diff.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setDifficulty(diff.id as Difficulty)}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl font-medium transition-all",
                      difficulty === diff.id
                        ? diff.color === "sage"
                          ? "bg-sage-500/20 text-sage-400 border border-sage-500/50"
                          : diff.color === "amber"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                          : diff.color === "red"
                          ? "bg-red-500/20 text-red-400 border border-red-500/50"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                        : "bg-dark-800/50 text-dark-400 border border-dark-700 hover:border-dark-600"
                    )}
                  >
                    {diff.label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Question Count */}
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-3">
                Number of Questions: {questionCount}
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="3"
                  max="20"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value))}
                  className="flex-1 h-2 bg-dark-800 rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-5
                    [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-amber-500
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:transition-transform
                    [&::-webkit-slider-thumb]:hover:scale-110"
                />
                <span className="text-lg font-mono text-amber-400 w-8 text-center">
                  {questionCount}
                </span>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              isLoading={isGenerating}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400"
              size="lg"
            >
              <Sparkles className="w-5 h-5 mr-2" />
              {isGenerating ? "Generating Questions..." : "Generate Quiz"}
            </Button>
          </motion.div>
        )}

        {/* Quiz Step */}
        {step === "quiz" && renderQuiz()}

        {/* Results Step */}
        {step === "results" && score !== null && (
          <motion.div
            key="results"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-6 text-center"
          >
            {/* Score Display */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
              className="mb-6"
            >
              <div
                className={cn(
                  "w-32 h-32 rounded-full mx-auto flex items-center justify-center",
                  score >= 80
                    ? "bg-sage-500/20 border-4 border-sage-500"
                    : score >= 50
                    ? "bg-amber-500/20 border-4 border-amber-500"
                    : "bg-red-500/20 border-4 border-red-500"
                )}
              >
                <div className="text-center">
                  <Trophy
                    className={cn(
                      "w-8 h-8 mx-auto mb-1",
                      score >= 80
                        ? "text-sage-400"
                        : score >= 50
                        ? "text-amber-400"
                        : "text-red-400"
                    )}
                  />
                  <span className="text-3xl font-bold text-dark-100">
                    {Math.round(score)}%
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Message */}
            <h3 className="text-2xl font-bold text-dark-100 mb-2">
              {score >= 80
                ? "Excellent! 🎉"
                : score >= 50
                ? "Good Job! 👍"
                : "Keep Practicing! 💪"}
            </h3>
            <p className="text-dark-400 mb-6">
              You answered {" "}
              <span className="font-semibold text-dark-200">
                {Math.round((score / 100) * quiz!.questions.length)}
              </span>{" "}
              out of {" "}
              <span className="font-semibold text-dark-200">
                {quiz!.questions.length}
              </span>{" "}
              questions correctly
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-dark-800/50 rounded-xl">
                <Clock className="w-5 h-5 text-dark-400 mx-auto mb-2" />
                <div className="text-lg font-semibold text-dark-200">
                  {formatTime(timeSpent)}
                </div>
                <div className="text-xs text-dark-500">Time Spent</div>
              </div>
              <div className="p-4 bg-dark-800/50 rounded-xl">
                <Target className="w-5 h-5 text-dark-400 mx-auto mb-2" />
                <div className="text-lg font-semibold text-dark-200">
                  {quiz!.questions.length}
                </div>
                <div className="text-xs text-dark-500">Questions</div>
              </div>
              <div className="p-4 bg-dark-800/50 rounded-xl">
                <Award className="w-5 h-5 text-dark-400 mx-auto mb-2" />
                <div className="text-lg font-semibold text-dark-200">
                  {difficulty}
                </div>
                <div className="text-xs text-dark-500">Difficulty</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={handleRestart}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button onClick={() => setStep("quiz")}>
                Review Answers
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  ;
}

