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
      <header className="absolute top-0 w-full z-50 px-6 py-4 flex justify-between items-center bg-gradient-to-b from-slate-950/80 to-slate-950/0 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Video className="text-slate-900 w-6 h-6" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md">VidSage</span>
        </div>
        <button
          onClick={() => router.push(isAuthenticated() ? "/dashboard" : "/login")}
          className="px-6 py-2.5 bg-slate-800/60 hover:bg-slate-700/80 text-amber-50 border border-white/15 hover:border-amber-500/40 rounded-xl font-semibold transition-all shadow-xl hover:shadow-amber-500/20 hover:shadow-lg"
        >
          {isAuthenticated() ? "Dashboard" : "Login"}
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
            <span>AI-Powered Video Intelligence Platform</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-400 leading-[1.1]">
            Extract Knowledge from <br className="hidden md:block"/>
            Any Video in Seconds
          </h1>
          
          <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Transform YouTube videos, lectures, and meetings into <span className="font-semibold text-white">interactive knowledge graphs</span>, <span className="font-semibold text-white">perfect transcripts</span>, and <span className="font-semibold text-white">intelligent chat</span>.
          </p>

          <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-sm">
            <p className="text-sm text-slate-300 mb-4 font-medium">
              ✓ Login required • Instant processing • AI-powered insights
            </p>
            <div className="flex justify-center">
              <Link
                href="/login"
                className="rounded-xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-bold text-slate-950 transition-all shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
              >
                Sign In Now
              </Link>
            </div>
          </div>

          <div className="pt-8 flex justify-center">
            <button
              onClick={handleStartLearning}
              className="group relative px-8 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 rounded-xl font-bold text-lg transition-all shadow-[0_0_40px_rgba(245,158,11,0.3)] hover:shadow-[0_0_60px_rgba(245,158,11,0.5)] overflow-hidden flex items-center gap-3"
            >
              <span>Get Started →</span>
            </button>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-5 pt-32 max-w-6xl mx-auto text-left relative z-10 px-4 lg:px-0">
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-white/5 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:border-white/10 transition-all">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center mb-6 group-hover:bg-emerald-500/30 transition-colors">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-3 text-slate-100">Perfect Transcripts</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Get accurate word-for-word transcripts with precise timestamps. Never miss a detail again.
            </p>
          </div>
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-white/5 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:border-white/10 transition-all">
            <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center mb-6 group-hover:bg-amber-500/30 transition-colors">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-3 text-slate-100">Instant RAG Summaries</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Extract core concepts in seconds using retrieval-augmented generation. Study smarter.
            </p>
          </div>
          <div className="group p-8 rounded-2xl bg-gradient-to-br from-slate-900/60 to-slate-950/40 border border-white/5 backdrop-blur-sm shadow-xl hover:shadow-2xl hover:border-white/10 transition-all">
            <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-500/30 transition-colors">
              <Video className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold mb-3 text-slate-100">AI Chat Assistant</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Ask questions about any video. Get instant answers with exact timestamps and context.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
