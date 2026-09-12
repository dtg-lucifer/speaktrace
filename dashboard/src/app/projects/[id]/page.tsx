"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  Upload,
  Sparkles,
  FileAudio,
  CheckCircle2,
  Clock,
  UserCheck,
  RefreshCw,
  MessageSquare,
  AlertCircle,
  FileText,
  Database,
  Loader2,
  Pencil,
  Check,
  X,
  Play,
  Volume2,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { UploadModal } from "@/components/upload/UploadModal";
import { SpeakerModal } from "@/components/speakers/SpeakerModal";
import { TranscriptViewer } from "@/components/transcript/TranscriptViewer";
import { RagDrawer } from "@/components/rag/RagDrawer";
import { ProjectChatTab } from "@/components/chat/ProjectChatTab";
import { AudioSpectrumVisualizer } from "@/components/audio/AudioSpectrumVisualizer";
import { useRouter } from "next/navigation";
import {
  ProjectDetails,
  ProcessingJob,
  fetchProjectDetails,
  isAuthenticated,
  getCurrentUser,
  refreshCurrentUser,
  renameJobAudio,
} from "@/lib/api";
import { subscribeToProject } from "@/lib/socket";

type WorkspaceTab = "recordings" | "transcripts" | "assistant";

export default function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const projectId = resolvedParams.id;

  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isRagOpen, setIsRagOpen] = useState(false);
  const [activeSpeakerJob, setActiveSpeakerJob] =
    useState<ProcessingJob | null>(null);
  const [activeVisualizerJob, setActiveVisualizerJob] =
    useState<ProcessingJob | null>(null);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [editFilename, setEditFilename] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameSuccessId, setRenameSuccessId] = useState<string | null>(null);
  const [user, setUser] = useState<{
    email: string;
    credits?: number;
    plan?: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("recordings");
  const [ragReadyToast, setRagReadyToast] = useState<string | null>(null);

  const handleSaveRename = async (jobId: string) => {
    if (!editFilename.trim()) return;
    setIsRenaming(true);
    try {
      await renameJobAudio(jobId, editFilename.trim());
      setDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === jobId ? { ...j, original_filename: editFilename.trim() } : j
          ),
        };
      });
      setRenameSuccessId(jobId);
      setTimeout(() => setRenameSuccessId(null), 2500);
      setEditingJobId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Could not rename file: ${msg}`);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setEditingJobId(null);
    setEditFilename("");
  };

  const loadDetails = () => {
    fetchProjectDetails(projectId)
      .then((data) => {
        setDetails(data);
        setError(null);
        // Auto-check if any job is in AWAITING_SPEAKER_MAPPING
        const awaitingJob = data.jobs?.find(
          (j) => j.status === "AWAITING_SPEAKER_MAPPING"
        );
        if (
          awaitingJob &&
          awaitingJob.speakers &&
          awaitingJob.speakers.length > 0
        ) {
          setActiveSpeakerJob(awaitingJob);
        }
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          router.replace(`/login?redirect=/projects/${projectId}`);
          return;
        }
        setError(err.message || "Failed to load project details");
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace(`/login?redirect=/projects/${projectId}`);
      return;
    }
    setUser(getCurrentUser());
    refreshCurrentUser().then((u) => {
      if (u) setUser(u);
    });

    const handleUserUpdated = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail) setUser(ce.detail);
    };
    window.addEventListener("speaktrace_user_updated", handleUserUpdated);

    loadDetails();

    // Real-time live status updates via WebSockets (Socket.IO) - Zero Polling
    const unsubscribe = subscribeToProject(projectId, (event) => {
      // Update job progress reactively in local state
      setDetails((prev) => {
        if (!prev) return prev;
        const updatedJobs = prev.jobs.map((j) => {
          if (j.id === event.jobId) {
            return {
              ...j,
              status: event.status,
              progress_pct: event.progressPct,
              current_stage: event.currentStage || j.current_stage,
            };
          }
          return j;
        });
        return { ...prev, jobs: updatedJobs };
      });

      // Show RAG ready toast when indexing completes
      if (event.status === "COMPLETED") {
        setRagReadyToast("Transcript indexed — RAG Assistant is ready for this file");
        setTimeout(() => setRagReadyToast(null), 5000);
        refreshCurrentUser().then((u) => u && setUser(u));
      }

      // When stages complete or need interaction, reload full details for transcripts / speaker clips
      if (
        event.status === "AWAITING_SPEAKER_MAPPING" ||
        event.status === "COMPLETED" ||
        event.status === "FAILED"
      ) {
        loadDetails();
        refreshCurrentUser().then((u) => u && setUser(u));
      }
    });

    return () => {
      unsubscribe();
      window.removeEventListener("speaktrace_user_updated", handleUserUpdated);
    };
  }, [projectId, router]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="pill-tag bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            Completed
          </span>
        );
      case "AWAITING_SPEAKER_MAPPING":
        return (
          <span className="pill-tag bg-[var(--acid-subtle)] text-[var(--acid-text)] border-[var(--acid-border)] animate-pulse font-bold">
            Awaiting Speaker Labeling
          </span>
        );
      case "RAG_INDEXING_IN_PROGRESS":
        return (
          <span className="pill-tag bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30 flex items-center gap-1">
            <Database className="w-3 h-3" />
            Indexing RAG Memory
          </span>
        );
      case "POSTPROCESSING_IN_PROGRESS":
        return (
          <span className="pill-tag bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Rendering Transcript
          </span>
        );
      case "TRANSCRIPTION_IN_PROGRESS":
        return (
          <span className="pill-tag bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Transcribing Speech
          </span>
        );
      case "DIARIZATION_DONE":
      case "AUDIO_EXTRACTED":
        return (
          <span className="pill-tag bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
            Processing
          </span>
        );
      case "FAILED":
        return (
          <span className="pill-tag bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30">
            Failed
          </span>
        );
      default:
        return (
          <span className="pill-tag text-[var(--muted)]">{status}</span>
        );
    }
  };

  const transcriptCount = details?.transcripts?.length || 0;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      <Navbar tokens={user?.credits ?? 50} maxTokens={user?.credits ?? 50} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Navigation & Header */}
        <div className="space-y-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[var(--muted)] hover:text-[var(--acid-text)] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[var(--line)]">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--foreground)]">
                {details?.project?.name || "Loading Project..."}
              </h1>
              <p className="text-xs font-mono text-[var(--muted)] mt-1">
                {details?.project?.description ||
                  "Audio intelligence workspace"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsUploadOpen(true)}
                className="btn-acid px-4 py-2 rounded-lg text-xs font-bold tracking-tight flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Audio</span>
              </button>

              <button
                onClick={() => setActiveTab("assistant")}
                className="px-4 py-2 rounded-lg text-xs font-mono border border-[var(--acid-border)] text-[var(--acid-text)] bg-[var(--acid-subtle)] hover:bg-[var(--acid)] hover:text-[var(--acid-text-inverse)] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Assistant Tab</span>
              </button>
            </div>
          </div>
        </div>

        {/* Real Error Banner */}
        {error && (
          <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 flex items-center justify-between text-xs font-mono text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadDetails}
              className="underline hover:text-red-300 font-bold ml-4 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* RAG Ready Toast */}
        {ragReadyToast && (
          <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-center gap-2 text-xs font-mono text-emerald-400 animate-in fade-in slide-in-from-top duration-300">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{ragReadyToast}</span>
            <button
              onClick={() => setRagReadyToast(null)}
              className="ml-auto text-emerald-500 hover:text-emerald-300 font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* Diarization Action Banner if any job is awaiting mapping */}
        {details?.jobs?.some(
          (j) => j.status === "AWAITING_SPEAKER_MAPPING"
        ) && (
          <div className="p-4 rounded-xl border border-[var(--acid-border)] bg-[var(--acid-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-[var(--acid)] animate-ping shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-[var(--foreground)]">
                  Speaker Diarization Complete — Action Needed!
                </h4>
                <p className="text-xs text-[var(--muted)] font-mono mt-0.5">
                  The model isolated voices in your audio file. Play the
                  1s–5s snippets to label each person before transcription.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const job = details.jobs.find(
                  (j) => j.status === "AWAITING_SPEAKER_MAPPING"
                );
                if (job) setActiveSpeakerJob(job);
              }}
              className="btn-acid px-4 py-2 rounded-lg text-xs font-bold shrink-0 flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Identify Voices & Assign Names</span>
            </button>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-[var(--line)]">
          <button
            onClick={() => setActiveTab("recordings")}
            className={`px-4 py-2.5 text-xs font-mono font-bold tracking-tight flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === "recordings"
                ? "border-[var(--acid)] text-[var(--acid-text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            <span>Audio Recordings</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === "recordings"
                  ? "bg-[var(--acid-subtle)] text-[var(--acid-text)]"
                  : "bg-[var(--card)] text-[var(--muted)]"
              }`}
            >
              {details?.jobs?.length || 0}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("transcripts")}
            className={`px-4 py-2.5 text-xs font-mono font-bold tracking-tight flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === "transcripts"
                ? "border-[var(--acid)] text-[var(--acid-text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Transcripts</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === "transcripts"
                  ? "bg-[var(--acid-subtle)] text-[var(--acid-text)]"
                  : "bg-[var(--card)] text-[var(--muted)]"
              }`}
            >
              {transcriptCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("assistant")}
            className={`px-4 py-2.5 text-xs font-mono font-bold tracking-tight flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
              activeTab === "assistant"
                ? "border-[var(--acid)] text-[var(--acid-text)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Assistant & Notes</span>
            <span
              className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === "assistant"
                  ? "bg-[var(--acid-subtle)] text-[var(--acid-text)]"
                  : "bg-[var(--card)] text-[var(--muted)]"
              }`}
            >
              RAG
            </span>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "recordings" && (
          <section className="space-y-6">
            {/* Audio Spectrum Visualizer Deck */}
            {activeVisualizerJob && activeVisualizerJob.storage_url && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                <AudioSpectrumVisualizer
                  audioUrl={activeVisualizerJob.storage_url}
                  title={activeVisualizerJob.original_filename || "Audio Stream"}
                  durationSeconds={activeVisualizerJob.duration_seconds}
                  onClose={() => setActiveVisualizerJob(null)}
                />
              </div>
            )}

            <div className="flex items-center justify-between pb-1">
              <h3 className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">
                Audio Recordings ({details?.jobs?.length || 0})
              </h3>
              <button
                onClick={loadDetails}
                className="text-xs font-mono text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            <div className="brutalist-card rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--card)]">
              <div className="divide-y divide-[var(--line)] font-mono text-xs">
                {isLoading ? (
                  <div className="p-8 text-center text-[var(--muted)]">
                    Loading recordings...
                  </div>
                ) : !details?.jobs || details.jobs.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <FileAudio className="w-8 h-8 mx-auto text-[var(--muted)] opacity-50" />
                    <p className="text-xs text-[var(--muted)]">
                      No audio uploaded to this project yet.
                    </p>
                    <button
                      onClick={() => setIsUploadOpen(true)}
                      className="btn-acid px-3 py-1.5 rounded text-xs font-bold mt-2"
                    >
                      Upload Now (10 tokens/min)
                    </button>
                  </div>
                ) : (
                  details.jobs.map((job) => (
                    <div
                      key={job.id}
                      className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                        activeVisualizerJob?.id === job.id
                          ? "bg-[var(--acid-subtle)]/40 border-l-4 border-[var(--acid)]"
                          : "hover:bg-[var(--background)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-[var(--background)] border border-[var(--line)]">
                          <FileAudio className="w-4 h-4 text-[var(--acid-text)]" />
                        </div>
                        <div>
                          {editingJobId === job.id ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editFilename}
                                onChange={(e) => setEditFilename(e.target.value)}
                                className="px-2 py-1 text-xs font-semibold rounded border border-[var(--acid)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none min-w-[200px]"
                                placeholder="Enter filename..."
                                disabled={isRenaming}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveRename(job.id);
                                  if (e.key === "Escape") handleCancelRename();
                                }}
                              />
                              <button
                                onClick={() => handleSaveRename(job.id)}
                                disabled={isRenaming || !editFilename.trim()}
                                className="p-1 text-emerald-600 dark:text-emerald-400 hover:opacity-80 disabled:opacity-50 cursor-pointer"
                                title="Save name"
                              >
                                {isRenaming ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={handleCancelRename}
                                disabled={isRenaming}
                                className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 group">
                              <span className="font-semibold text-[var(--foreground)] truncate max-w-sm">
                                {job.original_filename || "Recorded Session"}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingJobId(job.id);
                                  setEditFilename(job.original_filename || "");
                                }}
                                className="p-1 rounded opacity-60 hover:opacity-100 hover:bg-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)] transition-all cursor-pointer"
                                title="Rename file persistently"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              {renameSuccessId === job.id && (
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-mono animate-in fade-in">
                                  ✓ Saved
                                </span>
                              )}
                            </div>
                          )}

                          <div className="text-[11px] text-[var(--muted)] mt-0.5 flex items-center gap-2">
                            <span>
                              {job.duration_seconds
                                ? `${Math.round(job.duration_seconds)}s duration`
                                : "Audio stream"}
                            </span>
                            <span>•</span>
                            <span>{job.current_stage || "Queued"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Play / Sound Wave Visualizer button */}
                        {job.storage_url && (
                          <button
                            onClick={() =>
                              setActiveVisualizerJob(
                                activeVisualizerJob?.id === job.id ? null : job
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                              activeVisualizerJob?.id === job.id
                                ? "bg-[var(--acid)] text-[var(--acid-text-inverse)] font-bold shadow-sm"
                                : "border border-[var(--line)] bg-[var(--background)] hover:border-[var(--acid)] text-[var(--foreground)]"
                            }`}
                            title="Visualize sound waves & listen to audio"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>
                              {activeVisualizerJob?.id === job.id
                                ? "Playing"
                                : "Visualize"}
                            </span>
                          </button>
                        )}

                        {/* Progress bar */}
                        <div className="w-24 bg-[var(--background)] rounded-full h-1.5 overflow-hidden border border-[var(--line)]">
                          <div
                            className="bg-[var(--acid)] h-full transition-all duration-500"
                            style={{ width: `${job.progress_pct}%` }}
                          />
                        </div>

                        {/* Status */}
                        {getStatusBadge(job.status)}

                        {/* Action if awaiting mapping */}
                        {job.status === "AWAITING_SPEAKER_MAPPING" && (
                          <button
                            onClick={() => setActiveSpeakerJob(job)}
                            className="btn-acid px-3 py-1 rounded text-xs font-bold transition-colors cursor-pointer"
                          >
                            Name Speakers
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "transcripts" && (
          <section className="space-y-4">
            <TranscriptViewer
              transcripts={details?.transcripts || []}
              jobs={details?.jobs || []}
            />
          </section>
        )}

        {activeTab === "assistant" && (
          <section className="space-y-4">
            <ProjectChatTab
              projectId={projectId}
              jobs={details?.jobs || []}
              transcripts={details?.transcripts || []}
            />
          </section>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        projectId={projectId}
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={loadDetails}
      />

      {/* Speaker Identification Modal */}
      {activeSpeakerJob && (
        <SpeakerModal
          jobId={activeSpeakerJob.id}
          speakers={activeSpeakerJob.speakers || []}
          isOpen={Boolean(activeSpeakerJob)}
          onClose={() => setActiveSpeakerJob(null)}
          onSubmitted={loadDetails}
        />
      )}

      {/* Project RAG Chat Assistant Drawer */}
      <RagDrawer
        projectId={projectId}
        isOpen={isRagOpen}
        onClose={() => setIsRagOpen(false)}
      />
    </div>
  );
}
