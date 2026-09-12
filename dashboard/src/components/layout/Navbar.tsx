"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Zap, Moon, Sun, Radio } from "lucide-react";
import { getCurrentUser, refreshCurrentUser } from "@/lib/api";

function GithubIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

export function Navbar({ tokens: propTokens, maxTokens: propMaxTokens }: { tokens?: number; maxTokens?: number }) {
  const [isDark, setIsDark] = useState(true);
  const [user, setUser] = useState<{ email: string; credits?: number; plan?: string } | null>(null);

  useEffect(() => {
    // Initial read
    const local = getCurrentUser();
    if (local) setUser(local);

    // Refresh live credits from API
    refreshCurrentUser().then((refreshed) => {
      if (refreshed) setUser(refreshed);
    });

    // Listen for live update events across the app
    const handleUserUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setUser(customEvent.detail);
      } else {
        const u = getCurrentUser();
        if (u) setUser(u);
      }
    };

    window.addEventListener("speaktrace_user_updated", handleUserUpdated);
    return () => {
      window.removeEventListener("speaktrace_user_updated", handleUserUpdated);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("speaktrace_token");
    localStorage.removeItem("speaktrace_user");
    setUser(null);
    window.location.href = "/login";
  };

  const currentTokens = user?.credits !== undefined ? user.credits : (propTokens ?? 50);

  const toggleTheme = () => {
    setIsDark(!isDark);
    if (document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  };

  return (
    <header className="border-b border-[var(--line)] bg-[var(--background)] sticky top-0 z-40 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="font-mono text-xl font-bold tracking-tighter bg-[var(--ink)] text-[var(--paper)] px-2 py-0.5 rounded group-hover:bg-accent-subtle group-hover:text-accent-primary transition-colors">
              ST.
            </span>
            <span className="font-semibold text-lg tracking-tight">SpeakTrace</span>
          </Link>
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono border border-[var(--line)] text-[var(--muted)]">
            <Radio className="w-3 h-3 text-accent-primary animate-pulse" />
            Audio Intelligence SaaS
          </span>
        </div>

        {/* Right actions: Tokens + Theme + GitHub/Email Auth */}
        <div className="flex items-center gap-3">
          {/* Token balance pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--line)] bg-[var(--card)] text-xs font-mono shadow-xs">
            <Zap className="w-3.5 h-3.5 text-accent-primary fill-current" />
            <span className="font-bold text-[var(--foreground)]">{currentTokens.toLocaleString()}</span>
            <span className="text-[var(--muted)] hidden sm:inline">Credits ({Math.floor(currentTokens / 10)}m audio)</span>
          </div>

          {/* Dark/Light toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-accent transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-accent-primary" /> : <Moon className="w-4 h-4 text-accent-primary" />}
          </button>

          {/* Auth Button */}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[var(--muted)] hidden sm:inline truncate max-w-[140px]">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-[var(--line)] hover:border-red-500/50 bg-[var(--card)] hover:text-red-400 transition-all cursor-pointer"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="btn-acid inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
            >
              <GithubIcon className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
