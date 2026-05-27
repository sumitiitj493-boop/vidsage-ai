"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureAuthSession, login, beginGoogleLogin } from "@/lib/auth";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const reason = searchParams.get("reason");
    if (reason === "google_oauth_not_configured") {
      setError("Google sign-in is not configured on the backend yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env, then restart the server.");
      setShowFallback(true);
    }

    const bootstrapSession = async () => {
      const active = await ensureAuthSession();
      if (active) {
        router.replace("/dashboard");
      }
    };
    void bootstrapSession();
  }, [router, searchParams]);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      localStorage.setItem("vidsage_returning_user", "true");
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    beginGoogleLogin("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.08),transparent_28%)]" />

      <div className="relative z-10 bg-[#1a1f2e] p-8 rounded-3xl w-full max-w-md space-y-6 shadow-2xl border border-white/10">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-300/70 font-semibold">VidSage</p>
          <h1 className="text-white text-2xl font-bold">Sign in to VidSage</h1>
          <p className="text-slate-400 text-sm">Use your Google account to continue to the dashboard.</p>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 shadow-lg shadow-black/20"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.652 32.657 29.201 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.158 7.961 3.047l5.657-5.657C34.001 6.053 29.228 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.158 7.961 3.047l5.657-5.657C34.001 6.053 29.228 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
            <path fill="#4CAF50" d="M24 44c5.136 0 9.851-1.968 13.409-5.178l-6.196-5.238C29.137 35.091 26.715 36 24 36c-5.178 0-9.617-3.317-11.279-7.946l-6.522 5.025C9.535 39.556 16.227 44 24 44z"/>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-1.26 3.462-3.707 6.182-6.99 7.584l.003-.002 6.196 5.238C33.699 39.99 40 35 40 24c0-1.341-.138-2.65-.389-3.917z"/>
          </svg>
          <span>Sign in with Google</span>
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          <span>or</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={() => setShowFallback((prev) => !prev)}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          {showFallback ? "Hide email login" : "Use email login"}
        </button>

        {showFallback && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-black/10 p-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[#0f1522] text-white border border-white/10 focus:outline-none focus:border-teal-500"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 rounded-lg bg-[#0f1522] text-white border border-white/10 focus:outline-none focus:border-teal-500"
            />

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-lg transition disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-[#0d1117]" />}
    >
      <LoginContent />
    </Suspense>
  );
}
