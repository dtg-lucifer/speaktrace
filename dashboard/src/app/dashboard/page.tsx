"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Folder,
  Plus,
  ArrowRight,
  AudioWaveform,
  Clock,
  Layers,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import {
  Project,
  fetchProjects,
  createProject,
  isAuthenticated,
  getCurrentUser,
  refreshCurrentUser,
} from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<{ email: string; credits?: number; plan?: string } | null>(null);

  useEffect(() => {
    // Check authentication
    if (!isAuthenticated()) {
      router.replace("/login?redirect=/dashboard");
      return;
    }

    const currentUser = getCurrentUser();
    setUser(currentUser);
    refreshCurrentUser().then((u) => {
      if (u) setUser(u);
    });

    const handleUserUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setUser(customEvent.detail);
      }
    };

    window.addEventListener("speaktrace_user_updated", handleUserUpdated);
    loadProjects();

    return () => {
      window.removeEventListener("speaktrace_user_updated", handleUserUpdated);
    };
  }, [router]);

  const loadProjects = () => {
    setIsLoading(true);
    setError(null);
    fetchProjects()
      .then((data) => setProjects(data))
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          router.replace("/login?redirect=/dashboard");
          return;
        }
        setError(err.message || "Failed to load projects from backend API");
      })
      .finally(() => setIsLoading(false));
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await createProject(newProjectName, newProjectDesc);
      setProjects((prev) => [created, ...prev]);
      setNewProjectName("");
      setNewProjectDesc("");
      setIsNewProjectOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Could not create project: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--acid)] selection:text-[var(--acid-text-inverse)]">
      <Navbar tokens={user?.credits ?? 50} maxTokens={user?.credits ?? 50} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
        {/* Header */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[var(--muted)]">
            <span className="pill-tag bg-[var(--acid-subtle)] text-[var(--acid-text)] border-[var(--acid-border)]">
              AUTHENTICATED WORKSPACE
            </span>
            <span>•</span>
            <span className="text-[var(--foreground)]">{user?.email}</span>
            <span>•</span>
            <span>PLAN: {user?.plan?.toUpperCase() || "FREE"}</span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[var(--line)]">
            <div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--foreground)]">
                Projects &amp;{" "}
                <span className="font-serif italic font-normal text-[var(--acid-text)]">
                  Audio Transcripts
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xl font-sans mt-2">
                Manage your speech diarization projects, upload multi-speaker audio recordings, and run semantic conversational RAG queries.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={loadProjects}
                disabled={isLoading}
                className="p-2.5 rounded-lg border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--acid)] transition-all cursor-pointer disabled:opacity-50"
                title="Refresh projects"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>

              <button
                onClick={() => setIsNewProjectOpen(true)}
                className="btn-acid px-4 py-2.5 rounded-lg text-xs font-bold tracking-tight flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Project</span>
              </button>
            </div>
          </div>
        </section>

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-between text-xs font-mono text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadProjects}
              className="underline hover:text-red-300 font-bold ml-4 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Projects Grid / Empty State */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--muted)]">
              All Active Projects ({projects.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="brutalist-card rounded-xl p-6 h-48 border border-[var(--line)] bg-[var(--card)] animate-pulse flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="w-1/3 h-4 bg-[var(--line)] rounded" />
                    <div className="w-2/3 h-3 bg-[var(--line)] rounded" />
                  </div>
                  <div className="w-1/4 h-3 bg-[var(--line)] rounded" />
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--card)] space-y-4">
              <Folder className="w-10 h-10 text-[var(--muted)] mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[var(--foreground)]">No projects created yet</h3>
                <p className="text-xs text-[var(--muted)] font-mono max-w-sm mx-auto">
                  Create your first project to upload audio files, isolate speaker snippets, and generate transcripts.
                </p>
              </div>
              <button
                onClick={() => setIsNewProjectOpen(true)}
                className="btn-acid px-4 py-2 rounded-lg text-xs font-bold tracking-tight inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Your First Project</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((proj) => (
                <Link
                  key={proj.id}
                  href={`/projects/${proj.id}`}
                  className="group brutalist-card rounded-xl p-6 border border-[var(--line)] bg-[var(--card)] hover:border-[var(--acid)] transition-all flex flex-col justify-between space-y-6"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono text-[var(--muted)]">
                      <span className="pill-tag">PROJECT</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(proj.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold tracking-tight group-hover:text-[var(--acid-text)] transition-colors">
                      {proj.name}
                    </h3>
                    <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">
                      {proj.description || "No description provided for this project."}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-[var(--muted)]">
                      <AudioWaveform className="w-3.5 h-3.5 text-[var(--acid-text)]" />
                      <span>{proj.media_count || 0} Media Files</span>
                    </div>
                    <span className="flex items-center gap-1 text-[var(--acid-text)] font-semibold group-hover:translate-x-0.5 transition-transform">
                      Workspace <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* New Project Modal */}
      {isNewProjectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="brutalist-card rounded-xl p-6 sm:p-8 max-w-md w-full border border-[var(--line)] bg-[var(--card)] shadow-2xl space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-bold tracking-tight">Create New Project</h3>
              <p className="text-xs text-[var(--muted)] font-mono">
                Group audio recordings and conversation RAG contexts together.
              </p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[var(--muted)] mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Founders Podcast Q3"
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-[var(--acid)]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[var(--muted)] mb-1">
                  Description (optional)
                </label>
                <textarea
                  rows={3}
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Brief summary of recording contents..."
                  className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-[var(--acid)] resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewProjectOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-mono text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newProjectName.trim()}
                  className="btn-acid px-4 py-2 rounded-lg text-xs font-bold tracking-tight cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
