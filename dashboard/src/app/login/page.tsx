"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Zap, Shield, Sparkles } from "lucide-react";
import { signIn } from "@/lib/auth-client";

function GithubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

import { loginWithCredentials } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("test@speaktrace.com");
  const [password, setPassword] = useState("test123456");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGithubSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      });
    } catch (err) {
      setError("GitHub sign in failed: " + (err instanceof Error ? err.message : String(err)));
      setIsLoading(false);
    }
  };

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await loginWithCredentials(email, password);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("Login failed: " + msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 bg-[var(--background)]">
      <div className="w-full max-w-md space-y-6">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--acid-text)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        {/* Card */}
        <div className="brutalist-card rounded-xl p-8 border border-[var(--line)] bg-[var(--card)] shadow-2xl space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold bg-[var(--ink)] text-[var(--paper)] px-2 py-0.5 rounded">
                ST.
              </span>
              <h1 className="text-xl font-bold tracking-tight">SpeakTrace Authentication</h1>
            </div>
            <p className="text-xs text-[var(--muted)] font-mono">
              Sign in with GitHub to access your projects and claim your 50 free tokens.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono">
              {error}
            </div>
          )}

          {/* GitHub OAuth Button */}
          <button
            onClick={handleGithubSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-lg bg-[var(--background)] hover:bg-[var(--acid)] hover:text-[var(--acid-text-inverse)] border border-[var(--line)] font-semibold text-xs tracking-tight flex items-center justify-center gap-2 transition-all cursor-pointer group disabled:opacity-50"
          >
            <GithubIcon className="w-4 h-4" />
            <span>Continue with GitHub (Better Auth)</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-[var(--line)] w-full" />
            <span className="bg-[var(--card)] px-3 text-[10px] font-mono text-[var(--muted)] uppercase tracking-wider relative">
              Or email login
            </span>
          </div>

          {/* Email / Password Fallback */}
          <form onSubmit={handleCredentialsSignIn} className="space-y-3">
            <div>
              <label className="block text-xs font-mono text-[var(--muted)] mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@speaktrace.com"
                className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-[var(--acid)]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[var(--muted)] mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-[var(--acid)]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-dark w-full py-2.5 rounded-lg text-xs font-bold tracking-tight cursor-pointer disabled:opacity-50 mt-2"
            >
              Sign In with Email
            </button>
          </form>

          {/* Free tokens perk badge */}
          <div className="p-3 rounded-lg border border-[var(--acid-border)] bg-[var(--acid-subtle)] flex items-center gap-2 text-xs font-mono text-[var(--acid-text)]">
            <Zap className="w-4 h-4 shrink-0 fill-[var(--acid)] text-[var(--acid)]" />
            <span>50 Free Tokens credited automatically on signup (~5 mins audio)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
