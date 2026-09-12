"use client";

import React, { useState, useRef } from "react";
import { Play, Pause, Volume2, UserCheck, Check, Sparkles } from "lucide-react";
import { SpeakerSnippet, submitSpeakerNames } from "@/lib/api";

interface SpeakerModalProps {
  jobId: string;
  speakers: SpeakerSnippet[];
  isOpen: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function SpeakerModal({ jobId, speakers, isOpen, onClose, onSubmitted }: SpeakerModalProps) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [playingSnippet, setPlayingSnippet] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  if (!isOpen) return null;

  const handlePlayToggle = (tag: string) => {
    const audio = audioRefs.current[tag];
    if (!audio) return;

    if (playingSnippet === tag) {
      audio.pause();
      setPlayingSnippet(null);
    } else {
      // Pause any previously playing snippet
      Object.values(audioRefs.current).forEach((a) => a.pause());
      audio.currentTime = 0;
      audio.play().catch(() => {});
      setPlayingSnippet(tag);
      audio.onended = () => setPlayingSnippet(null);
    }
  };

  const handleNameChange = (tag: string, value: string) => {
    setNames((prev) => ({ ...prev, [tag]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Build mapping with defaults if blank
      const finalMappings: Record<string, string> = {};
      speakers.forEach((s) => {
        finalMappings[s.speaker_tag] = names[s.speaker_tag]?.trim() || s.speaker_tag;
      });

      await submitSpeakerNames(jobId, finalMappings);
      onSubmitted();
      onClose();
    } catch (err) {
      alert("Failed to submit speaker mappings: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="brutalist-card bg-[var(--card)] border border-[var(--acid-border)] rounded-xl w-full max-w-lg p-6 shadow-2xl relative">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--acid)] animate-ping" />
              <h2 className="text-xl font-bold tracking-tight">Identify Speakers</h2>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1 font-mono">
              Listen to the 1s–5s isolated voice snippet for each person detected and enter their real name.
            </p>
          </div>
          <span className="pill-tag bg-[var(--acid-subtle)] text-[var(--acid-text)] border-[var(--acid-border)]">
            {speakers.length} Voices Detected
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 my-4">
          {speakers.map((spk) => {
            const isPlaying = playingSnippet === spk.speaker_tag;
            return (
              <div
                key={spk.speaker_tag}
                className="p-3.5 rounded-lg border border-[var(--line)] bg-[var(--background)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors hover:border-[var(--acid-border)]"
              >
                {/* Speaker Audio Clip */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handlePlayToggle(spk.speaker_tag)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isPlaying
                        ? "bg-[var(--acid)] text-[var(--acid-text-inverse)] scale-105 shadow-md"
                        : "bg-[var(--card)] border border-[var(--line)] hover:border-[var(--acid)] text-[var(--foreground)]"
                    }`}
                    title="Play 2-4s voice snippet"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>

                  <div>
                    <div className="text-sm font-semibold font-mono flex items-center gap-1.5">
                      <span>{spk.speaker_tag}</span>
                      {isPlaying && <Volume2 className="w-3.5 h-3.5 text-[var(--acid-text)] animate-bounce" />}
                    </div>
                    <span className="text-[11px] text-[var(--muted)] font-mono">
                      {spk.duration_seconds}s voice snippet
                    </span>
                  </div>

                  {/* Hidden Audio element for snippet */}
                  <audio
                    ref={(el) => {
                      if (el) audioRefs.current[spk.speaker_tag] = el;
                    }}
                    src={spk.snippet_url}
                    preload="auto"
                  />
                </div>

                {/* Name Input Field */}
                <div className="flex-1 max-w-[200px]">
                  <input
                    type="text"
                    value={names[spk.speaker_tag] || ""}
                    onChange={(e) => handleNameChange(spk.speaker_tag, e.target.value)}
                    placeholder="e.g. Piush, Host..."
                    className="w-full text-xs font-mono px-3 py-2 rounded border border-[var(--line)] bg-[var(--card)] focus:outline-none focus:border-[var(--acid)] text-[var(--foreground)] placeholder:text-[var(--muted)]"
                  />
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t border-[var(--line)] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-acid px-5 py-2.5 rounded-lg text-xs font-bold tracking-tight flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Submitting mappings...</span>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Names & Resume Transcription</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
