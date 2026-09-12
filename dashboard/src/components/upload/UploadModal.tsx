"use client";

import React, { useState } from "react";
import { Upload, FileAudio, Check, AlertCircle, X, Sparkles } from "lucide-react";
import { uploadAudioFile, refreshCurrentUser } from "@/lib/api";

interface UploadModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export function UploadModal({ projectId, isOpen, onClose, onUploadSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [exportFormat, setExportFormat] = useState<"vtt" | "txt" | "custom">("vtt");
  const [customTemplate, setCustomTemplate] = useState("[$SPEAKER] ($START - $END): $TEXT");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an audio file to upload");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      await uploadAudioFile(projectId, file, {
        export_format: exportFormat,
        custom_template: exportFormat === "custom" ? customTemplate : undefined,
      });
      await refreshCurrentUser();
      onUploadSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="brutalist-card bg-[var(--card)] border border-[var(--line)] rounded-xl w-full max-w-lg p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-accent-subtle text-accent-primary border border-accent/40">
              <Upload className="w-4 h-4" />
            </span>
            <h2 className="text-lg font-bold">Upload Audio for Diarization</h2>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="my-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 my-4">
          {/* File Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            className="border-2 border-dashed border-[var(--line)] hover:border-[var(--acid)] rounded-xl p-6 text-center cursor-pointer transition-colors bg-[var(--background)]"
          >
            <input
              type="file"
              id="audio-upload"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setFile(e.target.files[0]);
                }
              }}
            />
            <label htmlFor="audio-upload" className="cursor-pointer">
              <FileAudio className="w-10 h-10 mx-auto text-[var(--acid-text)] mb-2 opacity-80" />
              {file ? (
                <div>
                  <p className="text-sm font-semibold font-mono text-[var(--foreground)]">{file.name}</p>
                  <p className="text-xs text-[var(--muted)] font-mono mt-1">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • Est. cost: ~10-20 tokens
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold">Drop MP3, WAV, M4A, or MP4 here</p>
                  <p className="text-xs text-[var(--muted)] mt-1 font-mono">or click to browse from computer</p>
                </div>
              )}
            </label>
          </div>

          {/* Pricing Info Banner */}
          <div className="p-3 rounded-lg bg-[var(--background)] border border-[var(--line)] flex items-center justify-between text-xs font-mono">
            <span className="text-[var(--muted)]">Processing Rate:</span>
            <span className="text-[var(--acid-text)] font-semibold">10 tokens / min (~5 mins total available)</span>
          </div>

          {/* Desired Output Format */}
          <div>
            <label className="block text-xs font-mono text-[var(--muted)] uppercase tracking-wider mb-1.5">
              Desired Transcription Output Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "vtt", label: "WebVTT (.vtt)" },
                  { id: "txt", label: "Plain Text (.txt)" },
                  { id: "custom", label: "Custom Template" },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setExportFormat(fmt.id)}
                  className={`py-2 px-3 text-xs font-mono rounded border transition-all cursor-pointer ${
                    exportFormat === fmt.id
                      ? "border-[var(--acid)] bg-[var(--acid-subtle)] text-[var(--acid-text)] font-bold"
                      : "border-[var(--line)] bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Template Editor if custom is selected */}
          {exportFormat === "custom" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-mono text-[var(--muted)]">
                Grammar Template (use [$PERSON], $SPEECH, [$START])
              </label>
              <textarea
                rows={3}
                value={customTemplate}
                onChange={(e) => setCustomTemplate(e.target.value)}
                className="w-full text-xs font-mono p-2.5 rounded border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-[var(--acid)]"
              />
            </div>
          )}

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
              disabled={isUploading || !file}
              className="btn-acid px-5 py-2.5 rounded-lg text-xs font-bold tracking-tight flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <span>Uploading to Cloudinary...</span>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start Audio Pipeline</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
