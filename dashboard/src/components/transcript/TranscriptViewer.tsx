"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Download,
  FileText,
  Search,
  FileAudio,
  Clock,
  ChevronRight,
  FolderOpen,
  Copy,
  Check,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Transcript, ProcessingJob } from "@/lib/api";

export interface TranscriptCue {
  sequenceNumber: number;
  timestamp: string; // e.g. "00:01:14"
  startSeconds: number;
  endSeconds?: number;
  speaker: string; // e.g. "Sarah (Host)"
  text: string;
}

interface TranscriptViewerProps {
  transcripts: Transcript[];
  jobs: ProcessingJob[];
  activeTimestamp?: number;
  onSeekAudio?: (sec: number) => void;
}

function parseTimestampSeconds(ts: string): number {
  const match = ts.match(/(?:(\d+):)?(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) return 0;
  const hrs = match[1] ? parseInt(match[1], 10) : 0;
  const mins = parseInt(match[2], 10);
  const secs = parseInt(match[3], 10);
  const millis = match[4] ? parseFloat("0." + match[4]) : 0;
  return hrs * 3600 + mins * 60 + secs + millis;
}

function formatDisplayTimestamp(ts: string): string {
  const match = ts.match(/(?:(\d+):)?(\d{2}):(\d{2})/);
  if (!match) return ts.split(".")[0] || ts;
  const hrs = match[1] ? match[1].padStart(2, "0") : "00";
  const mins = match[2].padStart(2, "0");
  const secs = match[3].padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

export function parseTranscriptToCues(text: string): TranscriptCue[] {
  if (!text || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  const cues: TranscriptCue[] = [];
  let currentCue: TranscriptCue | null = null;
  let seq = 1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      currentCue = null;
      continue;
    }
    if (rawLine === "WEBVTT" || rawLine.startsWith("NOTE")) {
      currentCue = null;
      continue;
    }

    // WebVTT timing line: 00:00:00.000 --> 00:00:07.000
    if (rawLine.includes("-->")) {
      const [startRaw, endRaw] = rawLine.split("-->").map((s) => s.trim().split(" ")[0]);
      currentCue = {
        sequenceNumber: seq++,
        timestamp: formatDisplayTimestamp(startRaw),
        startSeconds: parseTimestampSeconds(startRaw),
        endSeconds: endRaw ? parseTimestampSeconds(endRaw) : undefined,
        speaker: "",
        text: "",
      };
      cues.push(currentCue);
      continue;
    }

    // Cue sequence index line before timestamp: "1", "2"
    if (/^\d+$/.test(rawLine)) {
      currentCue = null;
      continue;
    }

    if (currentCue) {
      // Check for <v Speaker Name>Text</v> voice tags
      const vMatch = rawLine.match(/^<v\s+([^>]+)>(.*)$/i);
      if (vMatch) {
        currentCue.speaker = vMatch[1].trim();
        const content = vMatch[2].replace(/<\/v>/gi, "").trim();
        currentCue.text = currentCue.text ? `${currentCue.text} ${content}` : content;
      } else if (!currentCue.speaker) {
        const colonMatch = rawLine.match(/^([^:\->]+)[:\->]\s*(.+)$/);
        if (colonMatch) {
          currentCue.speaker = colonMatch[1].trim();
          const content = colonMatch[2].replace(/<\/v>/gi, "").trim();
          currentCue.text = currentCue.text ? `${currentCue.text} ${content}` : content;
        } else {
          const content = rawLine.replace(/<\/v>/gi, "").trim();
          currentCue.text = currentCue.text ? `${currentCue.text} ${content}` : content;
        }
      } else {
        const content = rawLine.replace(/<\/v>/gi, "").trim();
        if (content) {
          currentCue.text = currentCue.text ? `${currentCue.text} ${content}` : content;
        }
      }
    } else {
      // Plain text or template formats: "[00:01:14] Speaker: Text" or "Speaker -> Text"
      const timestampMatch = rawLine.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:([^:\->]+)[:\->]\s*)?(.+)$/);
      const arrowMatch = rawLine.match(/^([^:\->]+)\s*->\s*(.+)$/);

      if (timestampMatch) {
        const ts = timestampMatch[1];
        cues.push({
          sequenceNumber: seq++,
          timestamp: formatDisplayTimestamp(ts),
          startSeconds: parseTimestampSeconds(ts),
          speaker: (timestampMatch[2] || "Speaker").trim(),
          text: timestampMatch[3].trim(),
        });
      } else if (arrowMatch) {
        cues.push({
          sequenceNumber: seq++,
          timestamp: "00:00:00",
          startSeconds: 0,
          speaker: arrowMatch[1].trim(),
          text: arrowMatch[2].trim(),
        });
      } else {
        const colonMatch = rawLine.match(/^([^:\->]+)[:\->]\s*(.+)$/);
        if (colonMatch) {
          cues.push({
            sequenceNumber: seq++,
            timestamp: "00:00:00",
            startSeconds: 0,
            speaker: colonMatch[1].trim(),
            text: colonMatch[2].trim(),
          });
        } else {
          cues.push({
            sequenceNumber: seq++,
            timestamp: "00:00:00",
            startSeconds: 0,
            speaker: "Speaker",
            text: rawLine,
          });
        }
      }
    }
  }

  // Cleanup: ensure speaker is non-empty and clean colon at the end
  cues.forEach((c, idx) => {
    if (!c.speaker || c.speaker.trim() === "") {
      c.speaker = `Speaker ${idx + 1}`;
    }
    c.speaker = c.speaker.replace(/:$/, "").trim();
  });

  return cues;
}

export function TranscriptViewer({
  transcripts,
  jobs,
  activeTimestamp,
  onSeekAudio,
}: TranscriptViewerProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCueId, setCopiedCueId] = useState<number | null>(null);

  // Audio player state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  if (!transcripts || transcripts.length === 0) {
    return (
      <div className="p-8 text-center border border-[var(--line)] rounded-xl bg-[var(--card)]">
        <FileText className="w-10 h-10 mx-auto text-[var(--muted)] mb-2 opacity-50" />
        <h4 className="text-sm font-semibold">No transcriptions available yet</h4>
        <p className="text-xs text-[var(--muted)] font-mono mt-1">
          Upload an audio file and submit speaker names to generate aligned
          transcripts.
        </p>
      </div>
    );
  }

  // Group transcripts by job_id
  const transcriptsByJob: Record<string, Transcript[]> = {};
  for (const t of transcripts) {
    if (!transcriptsByJob[t.job_id]) {
      transcriptsByJob[t.job_id] = [];
    }
    transcriptsByJob[t.job_id].push(t);
  }

  const jobIds = Object.keys(transcriptsByJob);

  // Default to first job if none selected or if selected is invalid
  const activeJobId =
    selectedJobId && transcriptsByJob[selectedJobId]
      ? selectedJobId
      : jobIds[0];
  const activeTranscripts = transcriptsByJob[activeJobId] || [];
  const activeTranscript = activeTranscripts[0];
  const activeJob = jobs.find((j) => j.id === activeJobId);

  // Resolve filename and metadata from jobs data
  const getFilename = (jobId: string): string => {
    const job = jobs.find((j) => j.id === jobId);
    return job?.original_filename || "Audio Recording";
  };

  const getDuration = (jobId: string): number | null => {
    const job = jobs.find((j) => j.id === jobId);
    return job?.duration_seconds ?? null;
  };

  const getCreatedAt = (jobId: string): string => {
    const t = transcriptsByJob[jobId]?.[0];
    if (!t) return "";
    return new Date(t.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  const formatAudioTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleDownload = (format: "vtt" | "txt") => {
    if (!activeTranscript) return;
    const blob = new Blob([activeTranscript.content_text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `speaktrace_transcript_${activeTranscript.job_id}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Parse cues from transcript text
  const cues = useMemo(() => {
    if (!activeTranscript?.content_text) return [];
    return parseTranscriptToCues(activeTranscript.content_text);
  }, [activeTranscript?.content_text]);

  // Filter cues based on search term
  const filteredCues = useMemo(() => {
    if (!searchTerm.trim()) return cues;
    const q = searchTerm.toLowerCase();
    return cues.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        c.speaker.toLowerCase().includes(q) ||
        c.timestamp.includes(q)
    );
  }, [cues, searchTerm]);

  // Handle seek audio to cue
  const handleSeek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
    if (onSeekAudio) {
      onSeekAudio(seconds);
    }
  };

  // Toggle play/pause
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Handle copy all
  const handleCopyAll = () => {
    if (!activeTranscript?.content_text) return;
    const plainText = cues
      .map((c) => `[${c.timestamp}] ${c.speaker}: ${c.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(plainText || activeTranscript.content_text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Handle copy single cue
  const handleCopyCue = (cue: TranscriptCue) => {
    const text = `[${cue.timestamp}] ${cue.speaker}: ${cue.text}`;
    navigator.clipboard.writeText(text);
    setCopiedCueId(cue.sequenceNumber);
    setTimeout(() => setCopiedCueId(null), 1800);
  };

  const effectiveCurrentTime = activeTimestamp !== undefined ? activeTimestamp : audioCurrentTime;

  return (
    <div className="brutalist-card rounded-xl border border-[var(--line)] bg-[var(--card)] overflow-hidden shadow-sm">
      <div className="flex flex-col md:flex-row" style={{ minHeight: "480px" }}>
        {/* ─── Left Panel: File Explorer Sidebar ─── */}
        <div className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[var(--line)] bg-[var(--background)] flex flex-col">
          {/* Sidebar Header */}
          <div className="px-3 py-3 border-b border-[var(--line)] flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--muted)] font-bold">
              Transcripts ({jobIds.length})
            </span>
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto py-1 max-h-56 md:max-h-none">
            {jobIds.map((jobId) => {
              const isActive = jobId === activeJobId;
              const filename = getFilename(jobId);
              const duration = getDuration(jobId);
              const date = getCreatedAt(jobId);
              const transcriptCount = transcriptsByJob[jobId].length;

              return (
                <button
                  key={jobId}
                  onClick={() => {
                    setSelectedJobId(jobId);
                    setSearchTerm("");
                    setIsPlaying(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-all group cursor-pointer ${
                    isActive
                      ? "bg-emerald-500/10 border-l-2 border-emerald-500"
                      : "hover:bg-[var(--card)] border-l-2 border-transparent"
                  }`}
                >
                  <div
                    className={`p-1.5 rounded shrink-0 mt-0.5 ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-[var(--card)] text-[var(--muted)] group-hover:text-[var(--foreground)]"
                    }`}
                  >
                    <FileAudio className="w-3.5 h-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-xs font-semibold truncate ${
                        isActive
                          ? "text-emerald-600 dark:text-emerald-400 font-bold"
                          : "text-[var(--foreground)] group-hover:text-[var(--foreground)]"
                      }`}
                    >
                      {filename}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[10px] text-[var(--muted)] font-mono">
                      {duration && (
                        <>
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formatDuration(duration)}</span>
                          <span>•</span>
                        </>
                      )}
                      <span>
                        {transcriptCount}{" "}
                        {transcriptCount === 1 ? "transcript" : "transcripts"}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--muted)] font-mono mt-0.5 truncate">
                      {date}
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-3 h-3 shrink-0 mt-1 transition-transform ${
                      isActive
                        ? "text-emerald-500 translate-x-0"
                        : "text-[var(--muted)] opacity-0 group-hover:opacity-100"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Right Panel: Transcript Content ─── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--card)]">
          {/* Top Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-[var(--line)]">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight truncate">
                    {getFilename(activeJobId)}
                  </h3>
                  <span className="pill-tag text-[10px] text-[var(--muted)] shrink-0">
                    {activeTranscript?.format?.toUpperCase() || "VTT"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              {/* Search box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter dialogue or speaker..."
                  className="text-xs font-mono pl-8 pr-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-emerald-500 w-36 sm:w-48"
                />
              </div>

              {/* Copy all transcript */}
              <button
                onClick={handleCopyAll}
                className="px-2.5 py-1.5 rounded text-xs font-mono border border-[var(--line)] hover:border-emerald-500 hover:text-emerald-500 flex items-center gap-1 transition-colors cursor-pointer"
                title="Copy entire transcript text"
              >
                {copiedAll ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {/* Download VTT */}
              <button
                onClick={() => handleDownload("vtt")}
                className="px-2.5 py-1.5 rounded text-xs font-mono border border-[var(--line)] hover:border-emerald-500 hover:text-emerald-500 flex items-center gap-1 transition-colors cursor-pointer"
                title="Download WebVTT subtitle file"
              >
                <Download className="w-3 h-3" />
                <span>.vtt</span>
              </button>

              {/* Download TXT */}
              <button
                onClick={() => handleDownload("txt")}
                className="px-2.5 py-1.5 rounded text-xs font-mono border border-[var(--line)] hover:border-emerald-500 hover:text-emerald-500 flex items-center gap-1 transition-colors cursor-pointer"
                title="Download Plain Text transcript"
              >
                <Download className="w-3 h-3" />
                <span>.txt</span>
              </button>
            </div>
          </div>

          {/* Optional Audio Playback Bar if audio is present */}
          {activeJob?.storage_url && (
            <div className="px-4 py-2.5 bg-[var(--background)] border-b border-[var(--line)] flex items-center gap-3 font-mono text-xs">
              <audio
                ref={audioRef}
                src={activeJob.storage_url}
                onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
              />

              <button
                onClick={togglePlayAudio}
                className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors shrink-0 cursor-pointer shadow-sm"
                title={isPlaying ? "Pause audio" : "Play audio"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>

              <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] font-mono shrink-0">
                <span className="text-[var(--foreground)] font-semibold">{formatAudioTime(audioCurrentTime)}</span>
                <span>/</span>
                <span>{formatAudioTime(audioDuration || (activeJob.duration_seconds ?? 0))}</span>
              </div>

              {/* Progress seeker */}
              <input
                type="range"
                min={0}
                max={audioDuration || (activeJob.duration_seconds ?? 100)}
                step={0.1}
                value={audioCurrentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setAudioCurrentTime(val);
                  if (audioRef.current) audioRef.current.currentTime = val;
                }}
                className="flex-1 accent-emerald-500 h-1.5 bg-[var(--line)] rounded-lg cursor-pointer"
              />

              <button
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.muted = !isMuted;
                    setIsMuted(!isMuted);
                  }
                }}
                className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors p-1"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          {/* Transcript Subheader matching Landing Page Preview Banner */}
          <div className="px-5 pt-4 pb-2 flex items-center justify-between font-mono text-xs">
            <span className="text-[11px] text-[var(--muted)] font-bold tracking-wider uppercase">
              RESULTING TRANSCRIPT WITH LABELS
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                Ready to Export
              </span>
            </div>
          </div>

          {/* Transcript Dialogue Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {filteredCues.length === 0 ? (
              <div className="text-center py-12 text-[var(--muted)] text-xs font-mono">
                {searchTerm ? (
                  <p>No dialogue cues match &ldquo;{searchTerm}&rdquo;</p>
                ) : (
                  <p>No transcript cues available for this recording.</p>
                )}
              </div>
            ) : (
              filteredCues.map((cue) => {
                // Active cue highlight if audio is currently playing in this time window
                const isActiveCue =
                  effectiveCurrentTime > 0 &&
                  cue.startSeconds <= effectiveCurrentTime &&
                  (cue.endSeconds !== undefined
                    ? effectiveCurrentTime < cue.endSeconds
                    : effectiveCurrentTime < cue.startSeconds + 5);

                const isCopied = copiedCueId === cue.sequenceNumber;

                return (
                  <div
                    key={cue.sequenceNumber}
                    className={`group relative p-3.5 rounded-xl border transition-all space-y-2 ${
                      isActiveCue
                        ? "bg-emerald-500/10 border-emerald-500/60 ring-1 ring-emerald-500/40"
                        : "border-[var(--line)] bg-[var(--background)] hover:border-emerald-500/30"
                    }`}
                  >
                    {/* Header: First Timestamp, then Person Name, then Sequence Number at the very end */}
                    <div className="flex items-center gap-2">
                      {/* 1. First Timestamp pill */}
                      <button
                        onClick={() => handleSeek(cue.startSeconds)}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 dark:bg-emerald-500/15 px-2 py-0.5 rounded font-mono flex items-center gap-1 hover:bg-emerald-500/25 transition-colors cursor-pointer shrink-0"
                        title="Click to seek audio here"
                      >
                        <Clock className="w-2.5 h-2.5 opacity-70" />
                        <span>{cue.timestamp}</span>
                      </button>

                      {/* 2. Then Person Name */}
                      <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 font-sans tracking-tight">
                        {cue.speaker}:
                      </span>

                      {/* 3. Sequence Number at the very end */}
                      <div className="ml-auto flex items-center gap-2">
                        {/* Quick copy single cue button (visible on hover) */}
                        <button
                          onClick={() => handleCopyCue(cue)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[var(--muted)] hover:text-emerald-500 rounded"
                          title="Copy line"
                        >
                          {isCopied ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>

                        <span className="text-[10px] font-mono text-[var(--muted)] font-semibold bg-[var(--card)] border border-[var(--line)] px-1.5 py-0.5 rounded">
                          #{String(cue.sequenceNumber).padStart(2, "0")}
                        </span>
                      </div>
                    </div>

                    {/* Speech dialogue text with left border */}
                    <p className="text-[var(--foreground)] text-xs sm:text-[13px] pl-3 border-l-2 border-emerald-500/35 dark:border-emerald-400/40 font-sans leading-relaxed">
                      {cue.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
