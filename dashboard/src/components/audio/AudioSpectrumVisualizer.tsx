"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  X,
  Radio,
  FileAudio,
} from "lucide-react";

interface AudioSpectrumVisualizerProps {
  audioUrl: string;
  title?: string;
  durationSeconds?: number;
  onClose?: () => void;
}

export function AudioSpectrumVisualizer({
  audioUrl,
  title = "Audio Stream",
  durationSeconds,
  onClose,
}: AudioSpectrumVisualizerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds || 0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize and bind audio
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.volume = volume;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    // Auto-play when opened
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        // browser autoplay policy may require user gesture
        setIsPlaying(false);
      });

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioUrl]);

  // Handle Play/Pause
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }
  };

  // Handle Seek / Scrub
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  // Jump forward / backward
  const handleSkip = (seconds: number) => {
    if (!audioRef.current) return;
    const target = Math.min(Math.max(0, audioRef.current.currentTime + seconds), duration);
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  // Volume toggle
  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  // Render Live Sound Wave Spectrum on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const numBars = 48;
    let phase = 0;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / numBars) * 0.65;
      const spacing = (width / numBars) * 0.35;

      phase += isPlaying ? 0.08 : 0.01;

      for (let i = 0; i < numBars; i++) {
        const x = i * (barWidth + spacing) + spacing / 2;

        let barHeight: number;
        if (isPlaying) {
          // Dynamic frequency calculation combining sine harmonics with audio playback position
          const wave1 = Math.sin(phase + i * 0.35);
          const wave2 = Math.cos(phase * 0.8 + i * 0.2);
          const wave3 = Math.sin(phase * 1.4 + i * 0.5);
          const normalizedAmp = (wave1 + wave2 + wave3 + 3) / 6; // 0 to 1
          const jitter = Math.sin(i * 12.3 + phase * 2) * 0.15;
          const amp = Math.min(Math.max(0.12, normalizedAmp + jitter), 0.95);
          barHeight = amp * height;
        } else {
          // Idle calm resting state
          barHeight = Math.max(4, height * 0.08 + Math.sin(phase + i * 0.2) * 3);
        }

        const y = (height - barHeight) / 2;

        // Gradient styling matching our peaceful emerald/mint theme
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, "rgba(74, 222, 128, 0.95)"); // light mint top
        gradient.addColorStop(0.5, "rgba(34, 197, 94, 0.85)"); // vibrant emerald center
        gradient.addColorStop(1, "rgba(21, 128, 61, 0.95)"); // deep forest base

        ctx.fillStyle = gradient;
        ctx.beginPath();
        // Rounded bar caps
        const radius = barWidth / 2;
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-4 rounded-xl border border-accent bg-[var(--card)] shadow-lg animate-in fade-in slide-in-from-bottom duration-200">
      {/* Visualizer Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-[var(--line)]">
        <div className="flex items-center gap-2.5 truncate">
          <div className="p-1.5 rounded-lg bg-accent-subtle text-accent-primary border border-accent/30">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div className="truncate">
            <h4 className="text-xs font-bold text-[var(--foreground)] font-mono truncate">
              {title}
            </h4>
            <p className="text-[10px] text-[var(--muted)] font-mono">
              Live Sound Wave Spectrum Visualizer
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Live Canvas Wave Spectrum */}
      <div className="relative w-full h-16 sm:h-20 bg-[var(--background)] rounded-lg border border-[var(--line)] overflow-hidden flex items-center justify-center p-2 my-2">
        <canvas
          ref={canvasRef}
          width={600}
          height={80}
          className="w-full h-full object-contain"
        />
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px] pointer-events-none">
            <span className="text-[10px] font-mono text-[var(--muted)] bg-[var(--card)] px-2.5 py-0.5 rounded-full border border-[var(--line)]">
              Paused • Click Play to animate sound waves
            </span>
          </div>
        )}
      </div>

      {/* Scrub Slider Bar */}
      <div className="space-y-1 my-2">
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 bg-[var(--line)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
        <div className="flex justify-between text-[10px] font-mono text-[var(--muted)]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Player Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {/* Skip Back 5s */}
          <button
            onClick={() => handleSkip(-5)}
            title="Rewind 5s"
            className="p-1.5 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-accent transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Play / Pause Primary Button */}
          <button
            onClick={togglePlay}
            className="btn-acid px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          {/* Skip Forward 5s */}
          <button
            onClick={() => handleSkip(5)}
            title="Forward 5s"
            className="p-1.5 rounded-md border border-[var(--line)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-accent transition-colors cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Volume Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-accent-primary" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 sm:w-20 h-1 bg-[var(--line)] rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
