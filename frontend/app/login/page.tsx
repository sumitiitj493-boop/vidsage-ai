"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureAuthSession, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const bootstrapSession = async () => {
      const active = await ensureAuthSession();
      if (active) {
        router.replace("/dashboard");
      }
    };
    void bootstrapSession();
  }, [router]);

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

  return (
    <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center px-4">
      <div className="bg-[#111827] p-8 rounded-2xl w-full max-w-md space-y-5 shadow-xl border border-white/10">
        <h1 className="text-white text-2xl font-bold text-center">Sign in to VidSage</h1>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-4 py-3 rounded-lg bg-[#1f2937] text-white border border-gray-700 focus:outline-none focus:border-teal-500"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          className="w-full px-4 py-3 rounded-lg bg-[#1f2937] text-white border border-gray-700 focus:outline-none focus:border-teal-500"
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}
