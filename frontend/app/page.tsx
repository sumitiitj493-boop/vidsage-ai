"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Video, FileText, Zap } from "lucide-react";
import { ensureAuthSession, isAuthenticated } from "../lib/auth";

export default function LandingPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const hasToken = await ensureAuthSession();
      const isMember = localStorage.getItem("vidsage_returning_user");
      if (isMember === "true" && hasToken) {
        router.replace("/dashboard");
      } else {
        setIsChecking(false);
      }
    };
    void bootstrap();
  }, [router]);

  const handleStartLearning = () => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }

    localStorage.setItem("vidsage_returning_user", "true");
    router.push("/dashboard");
  };

  if (isChecking) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-500/30">
      {/* Navigation */}
      <header className="absolute top-0 w-full z-50 px-6 py-4 flex justify-between items-center bg-slate-950/40 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Video className="text-slate-900 w-6 h-6" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md">VidSage</span>
        </div>
        <button
          onClick={() => router.push(isAuthenticated() ? "/dashboard" : "/login")}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-50 border border-white/10 hover:border-amber-500/30 rounded-full font-semibold transition-all shadow-xl hover:shadow-amber-500/10"
        >
          {isAuthenticated() ? "Open Dashboard" : "Login"}
        </button>
      </header>

      {/* Hero Section */}
      <main className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden flex flex-col items-center justify-center min-h-screen text-center px-4">
        {/* Decorative background glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-amber-500/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-bold text-amber-200/90 mb-4 tracking-wide shadow-inner">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>AI-Powered Video Intelligence Sandbox</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 leading-[1.1]">
            Extract Wisdom from <br className="hidden md:block"/> Any Video in Seconds
          </h1>
          
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Transform long YouTube videos, lectures, and meetings into interactive knowledge graphs, seamless transcripts, and intelligent chat interfaces.
          </p>

          <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/50 p-5 backdrop-blur-sm">
            <p className="text-sm text-slate-300">
              Authentication is enabled. Sign in first, then continue to your dashboard.
            </p>
            <div className="mt-3 flex justify-center">
              <Link
                href="/login"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Go to Login
              </Link>
            </div>
          </div>

          <div className="pt-8 flex justify-center">
            <button
              onClick={handleStartLearning}
              className="group relative px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 rounded-full font-bold text-lg transition-all shadow-[0_0_40px_rgba(245,158,11,0.3)] hover:shadow-[0_0_60px_rgba(245,158,11,0.5)] overflow-hidden flex items-center gap-3"
            >
              <span>Get Started Now</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 pt-32 max-w-6xl mx-auto text-left relative z-10 px-4 lg:px-0">
          <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 backdrop-blur-sm shadow-xl">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mb-6">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-200">Smart Transcripts</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Automatically extract and structure the exact spoken words into organized paragraphs with precision timestamps.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 backdrop-blur-sm shadow-xl">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center mb-6">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-200">Instant RAG Summaries</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Get the core concepts in seconds without watching hours of footage. Perfect for rapid learning and note-taking.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-slate-900/50 border border-white/5 backdrop-blur-sm shadow-xl">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mb-6">
              <Video className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3 text-slate-200">Interactive Context Chat</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Ask questions directly to the video workspace. The AI will pull exact contexts and playback timestamps for you.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
