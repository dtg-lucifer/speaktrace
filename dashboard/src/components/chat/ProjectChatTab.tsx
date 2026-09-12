"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Clock,
  Play,
  Pause,
  Plus,
  Trash2,
  FileText,
  Copy,
  Check,
  Square,
  Volume2,
  VolumeX,
  Pin,
  Download,
  Filter,
  Layers,
  FileAudio,
} from "lucide-react";
import {
  RagCitation,
  streamRagChat,
  ProcessingJob,
  Transcript,
} from "@/lib/api";
import { MarkdownRenderer } from "./MarkdownRenderer";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: RagCitation[];
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  notes: string;
  selectedJobId?: string;
}

interface ProjectChatTabProps {
  projectId: string;
  jobs: ProcessingJob[];
  transcripts?: Transcript[];
}

export function ProjectChatTab({ projectId, jobs }: ProjectChatTabProps) {
  // Session & conversation history state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [inputPrompt, setInputPrompt] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeNotesTab, setActiveNotesTab] = useState<"history" | "notes">("history");

  // Audio snippet player state
  const [playingCitationIndex, setPlayingCitationIndex] = useState<{
    msgId: string;
    citeIdx: number;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Storage key
  const storageKey = `speaktrace_chat_sessions_${projectId}`;

  // Initialize or load sessions from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: ChatSession[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Create default initial session
    const initialSession: ChatSession = {
      id: "session_" + Date.now(),
      title: "Conversation 1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: "welcome_msg",
          role: "assistant",
          content:
            "Hello! I am **SpeakTrace AI**, your conversational audio intelligence assistant.\n\nAsk me anything about your recordings: who spoke when, what was discussed, key debate points, or request a complete analytical summary. Every claim includes **playable audio snippet citations**!",
          createdAt: new Date().toISOString(),
        },
      ],
      notes: "# Notes & Takeaways\n\n- Click '+ Pin to Notes' on any citation or message to save quotes here.",
    };
    setSessions([initialSession]);
    setActiveSessionId(initialSession.id);
  }, [projectId]);

  // Persist sessions to localStorage whenever changed
  useEffect(() => {
    if (sessions.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(sessions));
      } catch {
        // ignore
      }
    }
  }, [sessions, storageKey]);

  // Active session
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Auto-scroll when messages update or during streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isStreaming]);

  // Cleanup audio playback on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle creating a new chat session
  const handleNewChat = () => {
    if (isStreaming) return;
    const newSession: ChatSession = {
      id: "session_" + Date.now(),
      title: `Conversation ${sessions.length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: "welcome_" + Date.now(),
          role: "assistant",
          content:
            "New conversation started. Ask questions across all audio recordings or select a specific file from the filter above!",
          createdAt: new Date().toISOString(),
        },
      ],
      notes: "# Notes & Takeaways\n\n",
      selectedJobId,
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  // Delete a chat session
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      // Reset last session instead of deleting
      handleNewChat();
      return;
    }
    const filtered = sessions.filter((s) => s.id !== sessionId);
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      setActiveSessionId(filtered[0].id);
    }
  };

  // Update notes of active session
  const handleNotesChange = (newNotes: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, notes: newNotes, updatedAt: new Date().toISOString() }
          : s
      )
    );
  };

  // Pin a text or quote to notes
  const handlePinToNotes = (textToPin: string) => {
    if (!activeSession) return;
    const addition = `\n\n> "${textToPin.trim()}"\n`;
    const updatedNotes = (activeSession.notes || "") + addition;
    handleNotesChange(updatedNotes);
    setActiveNotesTab("notes");
  };

  // Stop streaming generation
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  };

  // Send message and stream response token by token
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputPrompt.trim();
    if (!prompt || isStreaming || !activeSession) return;

    setInputPrompt("");

    // Create user message
    const userMsg: ChatMessage = {
      id: "msg_user_" + Date.now(),
      role: "user",
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    // Create placeholder assistant message that will stream tokens
    const assistantMsgId = "msg_asst_" + Date.now();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      citations: [],
      createdAt: new Date().toISOString(),
    };

    // Update title of session if it's the first user question
    const isFirstQuestion =
      activeSession.messages.filter((m) => m.role === "user").length === 0;
    const sessionTitle = isFirstQuestion
      ? prompt.slice(0, 32) + (prompt.length > 32 ? "..." : "")
      : activeSession.title;

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            title: sessionTitle,
            updatedAt: new Date().toISOString(),
            messages: [...s.messages, userMsg, assistantMsg],
          };
        }
        return s;
      })
    );

    setIsStreaming(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const historyPayload = activeSession.messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));

      await streamRagChat(
        {
          projectId,
          query: prompt,
          jobId: selectedJobId === "all" ? undefined : selectedJobId,
          history: historyPayload,
        },
        {
          onCitations: (citations) => {
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, citations } : m
                    ),
                  };
                }
                return s;
              })
            );
          },
          onToken: (token) => {
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: m.content + token }
                        : m
                    ),
                  };
                }
                return s;
              })
            );
          },
          onDone: () => {
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
          onError: (err) => {
            setSessions((prev) =>
              prev.map((s) => {
                if (s.id === activeSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content:
                              m.content ||
                              `*Error generating response: ${err.message}*`,
                          }
                        : m
                    ),
                  };
                }
                return s;
              })
            );
            setIsStreaming(false);
          },
        },
        controller.signal
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("abort")) {
        // User aborted
      } else {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === activeSessionId) {
              return {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content:
                          m.content ||
                          `*Query failed. Make sure worker is running on port 8000.*`,
                      }
                    : m
                ),
              };
            }
            return s;
          })
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  // Play / Pause interactive audio snippet for a citation
  const handleTogglePlayCitation = (
    msgId: string,
    citeIdx: number,
    citation: RagCitation
  ) => {
    // If already playing this exact citation, stop it
    if (
      playingCitationIndex &&
      playingCitationIndex.msgId === msgId &&
      playingCitationIndex.citeIdx === citeIdx
    ) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingCitationIndex(null);
      return;
    }

    // Stop any existing playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Resolve audio URL: citation.audio_url or matching job.storage_url
    const matchedJob = jobs.find((j) => j.id === citation.job_id);
    const audioUrl = citation.audio_url || matchedJob?.storage_url;

    if (!audioUrl) {
      alert("Audio file URL for this snippet is not available.");
      return;
    }

    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    const startTime = citation.start_time || 0;
    const endTime = citation.end_time || startTime + 10;

    audio.currentTime = Math.max(0, startTime);

    // Watch playback progress to stop at endTime
    const handleTimeUpdate = () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        setPlayingCitationIndex(null);
      }
    };

    const handleEnded = () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      setPlayingCitationIndex(null);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    audio
      .play()
      .then(() => {
        setPlayingCitationIndex({ msgId, citeIdx });
      })
      .catch((err) => {
        console.error("Audio playback error:", err);
        setPlayingCitationIndex(null);
      });
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export notes as file
  const handleExportNotes = () => {
    if (!activeSession) return;
    const blob = new Blob([activeSession.notes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeSession.title.replace(/\s+/g, "_")}_notes.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-280px)] min-h-[560px]">
      {/* ── Left Column: History & Notes Sidebar ── */}
      <aside className="w-full lg:w-72 shrink-0 flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden">
        {/* Sidebar Header / Tab Switcher */}
        <div className="p-3 border-b border-[var(--line)] flex items-center justify-between bg-[var(--background)]">
          <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-lg border border-[var(--line)]">
            <button
              onClick={() => setActiveNotesTab("history")}
              className={`px-3 py-1 text-[11px] font-mono font-bold rounded cursor-pointer transition-all ${
                activeNotesTab === "history"
                  ? "btn-acid"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              History ({sessions.length})
            </button>
            <button
              onClick={() => setActiveNotesTab("notes")}
              className={`px-3 py-1 text-[11px] font-mono font-bold rounded cursor-pointer transition-all flex items-center gap-1 ${
                activeNotesTab === "notes"
                  ? "btn-acid"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>Notes</span>
            </button>
          </div>

          <button
            onClick={handleNewChat}
            disabled={isStreaming}
            title="Start New Chat"
            className="p-1.5 rounded-lg border border-[var(--line)] bg-[var(--card)] text-accent-primary hover:bg-accent-subtle transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 1: Conversation History */}
        {activeNotesTab === "history" && (
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--line)] p-2 space-y-1">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const dateStr = new Date(session.updatedAt).toLocaleTimeString(
                [],
                { hour: "2-digit", minute: "2-digit" }
              );
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    if (!isStreaming) setActiveSessionId(session.id);
                  }}
                  className={`group p-2.5 rounded-lg text-xs font-mono transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isActive
                      ? "bg-accent-subtle border border-accent text-[var(--foreground)]"
                      : "hover:bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <div className="truncate flex-1">
                    <div className="font-semibold truncate">
                      {session.title || "Untitled Chat"}
                    </div>
                    <div className="text-[10px] text-[var(--muted)] mt-0.5 flex items-center gap-1.5">
                      <span>{dateStr}</span>
                      <span>•</span>
                      <span>{session.messages.length} msgs</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    title="Delete Conversation"
                    className="opacity-0 group-hover:opacity-100 p-1 text-[var(--muted)] hover:text-red-400 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Notes Scratchpad */}
        {activeNotesTab === "notes" && (
          <div className="flex-1 flex flex-col p-3 overflow-hidden">
            <div className="flex items-center justify-between pb-2 text-[11px] font-mono text-[var(--muted)]">
              <span>Session Notes</span>
              <button
                onClick={handleExportNotes}
                title="Download Notes (.md)"
                className="flex items-center gap-1 hover:text-accent-primary transition-colors cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Export</span>
              </button>
            </div>
            <textarea
              value={activeSession?.notes || ""}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Take notes here, or click 'Pin to Notes' on citations to collect evidence..."
              className="flex-1 w-full bg-[var(--background)] border border-[var(--line)] rounded-lg p-2.5 text-xs font-mono text-[var(--foreground)] resize-none focus:outline-none focus:border-accent leading-relaxed"
            />
          </div>
        )}
      </aside>

      {/* ── Right / Main Column: Chat Workspace ── */}
      <section className="flex-1 flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden">
        {/* Workspace Top Bar */}
        <div className="p-3.5 border-b border-[var(--line)] bg-[var(--background)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-accent-subtle text-accent-primary border border-accent/40">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[var(--foreground)] font-mono">
                {activeSession?.title || "AI Audio Intelligence"}
              </h3>
              <p className="text-[10px] text-[var(--muted)] font-mono">
                Conversational RAG with token streaming & audio citations
              </p>
            </div>
          </div>

          {/* Recording Scope Filter Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[var(--muted)]" />
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-[var(--card)] border border-[var(--line)] text-[11px] font-mono text-[var(--foreground)] px-2.5 py-1 rounded-md focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">Query All Recordings ({jobs.length})</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.original_filename || "Recording " + j.id.slice(0, 6)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages Stream Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeSession?.messages.map((msg) => {
            const isAsst = msg.role === "assistant";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-4xl ${
                  isAsst ? "" : "ml-auto justify-end"
                }`}
              >
                {/* Avatar */}
                {isAsst && (
                  <div className="w-7 h-7 rounded-lg bg-[var(--acid-subtle)] border border-[var(--acid-border)] text-[var(--acid-text)] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`space-y-3 ${isAsst ? "flex-1" : "max-w-xl"}`}>
                  {/* Message Bubble */}
                  <div
                    className={`p-4 rounded-xl text-xs sm:text-sm leading-relaxed ${
                      isAsst
                        ? "bg-[var(--background)] border border-[var(--line)] text-[var(--foreground)]"
                        : "btn-acid font-medium font-sans ml-auto"
                    }`}
                  >
                    {/* Assistant header tag */}
                    {isAsst && (
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--line)] text-[10px] font-mono text-[var(--muted)]">
                        <span className="flex items-center gap-1 text-accent-primary font-bold">
                          <Sparkles className="w-3 h-3" />
                          <span>SpeakTrace Intelligence</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(msg.content, msg.id)}
                            title="Copy Response"
                            className="hover:text-[var(--foreground)] transition-colors cursor-pointer flex items-center gap-1"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            <span>Copy</span>
                          </button>
                          <button
                            onClick={() => handlePinToNotes(msg.content)}
                            title="Pin to Notes"
                            className="hover:text-accent-primary transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Pin className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Content text */}
                    <div>
                      {isAsst ? (
                        <MarkdownRenderer content={msg.content} />
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      )}
                      {/* ChatGPT-style streaming cursor */}
                      {isStreaming &&
                        isAsst &&
                        msg ===
                          activeSession.messages[
                            activeSession.messages.length - 1
                          ] && (
                          <span className="inline-block w-2 h-4 ml-1 bg-accent-primary animate-pulse align-middle" />
                        )}
                    </div>
                  </div>

                  {/* Playable Citations Section */}
                  {isAsst && msg.citations && msg.citations.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
                        <Volume2 className="w-3.5 h-3.5 text-accent-primary" />
                        <span>Interactive Citations & Audio Proof ({msg.citations.length})</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {msg.citations.map((cite, cIdx) => {
                          const isPlaying =
                            playingCitationIndex?.msgId === msg.id &&
                            playingCitationIndex?.citeIdx === cIdx;
                          const startSec = cite.start_time || 0;
                          const endSec = cite.end_time || 0;
                          const startMin = Math.floor(startSec / 60);
                          const startRemSec = Math.floor(startSec % 60);
                          const endMin = Math.floor(endSec / 60);
                          const endRemSec = Math.floor(endSec % 60);
                          const timeStr = `${startMin
                            .toString()
                            .padStart(2, "0")}:${startRemSec
                            .toString()
                            .padStart(2, "0")} - ${endMin
                            .toString()
                            .padStart(2, "0")}:${endRemSec
                            .toString()
                            .padStart(2, "0")}`;

                          return (
                            <div
                              key={cIdx}
                              className={`p-3 rounded-lg border transition-all text-xs font-mono flex flex-col justify-between gap-2.5 ${
                                isPlaying
                                  ? "border-accent bg-accent-subtle shadow-sm"
                                  : "border-[var(--line)] bg-[var(--background)] hover:border-accent"
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 pb-1.5 mb-1.5 border-b border-[var(--line)]">
                                  <span className="font-bold text-accent-primary truncate">
                                    {cite.speaker || "Speaker"}
                                  </span>
                                  <span className="text-[10px] text-[var(--muted)] bg-[var(--card)] px-1.5 py-0.5 rounded border border-[var(--line)]">
                                    {timeStr}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[var(--foreground)] italic line-clamp-3">
                                  "{cite.text.replace(/^[^:]+:\s*"?/, "").replace(/"?$/, "")}"
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-1 border-t border-[var(--line)]">
                                {/* Play Audio Snippet Button */}
                                <button
                                  onClick={() =>
                                    handleTogglePlayCitation(msg.id, cIdx, cite)
                                  }
                                  className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                    isPlaying
                                      ? "btn-acid animate-pulse"
                                      : "bg-[var(--card)] border border-[var(--line)] text-[var(--foreground)] hover:border-accent hover:text-accent-primary"
                                  }`}
                                >
                                  {isPlaying ? (
                                    <>
                                      <Pause className="w-3 h-3" />
                                      <span>Playing snippet...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-3 h-3" />
                                      <span>Play snippet</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => handlePinToNotes(cite.text)}
                                  title="Pin quote to session notes"
                                  className="text-[10px] text-[var(--muted)] hover:text-accent-primary flex items-center gap-1 cursor-pointer"
                                >
                                  <Pin className="w-2.5 h-2.5" />
                                  <span>Pin</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* User avatar */}
                {!isAsst && (
                  <div className="w-7 h-7 rounded-lg bg-[var(--line)] text-[var(--foreground)] flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input Bottom Form */}
        <form
          onSubmit={handleSendMessage}
          className="p-3 border-t border-[var(--line)] bg-[var(--background)] flex items-center gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? "Streaming response token-by-token..."
                : "Ask about speakers, motives, quotes, or request an overall summary..."
            }
            className="flex-1 bg-[var(--card)] border border-[var(--line)] rounded-lg px-3.5 py-2.5 text-xs sm:text-sm font-mono text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--acid)] transition-all disabled:opacity-50"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={handleStopStreaming}
              className="px-4 py-2.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputPrompt.trim()}
              className="btn-acid px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
