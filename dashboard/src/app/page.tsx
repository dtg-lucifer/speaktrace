"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Play,
  Volume2,
  FileText,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  ChevronDown,
  UserCheck,
  Search,
  Headphones,
  Mic,
  Clock,
  HelpCircle,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { isAuthenticated } from "@/lib/api";

export default function LandingPage() {
  const [audioMinutes, setAudioMinutes] = useState(15);
  const [isAuth, setIsAuth] = useState(false);
  const [activeSnippet, setActiveSnippet] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setIsAuth(isAuthenticated());
  }, []);

  const tokenCost = audioMinutes * 10;
  const hoursSaved = (audioMinutes * 4) / 60;

  const faqs = [
    {
      q: "Why is SpeakTrace different from regular transcription tools?",
      a: "Most transcription services output an ambiguous wall of text labeled 'Speaker 1' and 'Speaker 2', leaving you to guess who actually said what. SpeakTrace isolates short 1–5 second voice clips for each speaker. You listen to their voice directly in your browser, type their real names with 100% certainty, and your entire transcript is automatically labeled with their real names.",
    },
    {
      q: "What can I do with the 50 free signup credits?",
      a: "Every new account receives 50 free credits immediately upon signup — no credit card required. Since audio processing costs a flat 10 credits per minute, you can process up to 5 minutes of multi-speaker audio with full voice separation, snippet generation, transcription, and conversational search included.",
    },
    {
      q: "How does the conversation search and chat assistant work?",
      a: "Once your recording is transcribed, it is indexed into a local conversational search engine. You can ask questions in plain English like 'What did Sarah propose regarding the launch date?' and receive an immediate answer backed by clickable timestamp citations (e.g., [03:14]) that jump straight to that moment.",
    },
    {
      q: "Can I export transcripts in custom formats?",
      a: "Yes. You can download industry-standard WebVTT (.vtt) subtitles, clean dialogue text files (.txt), or define your own custom grammar templates like [$SPEAKER ($TIMESTAMP)] -> \"$SPEECH\" to feed downstream AI pipelines or internal databases.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--acid)] selection:text-[var(--acid-text-inverse)]">
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-16 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-b border-[var(--line)]">
        <div className="max-w-4xl space-y-8">
          {/* Tag Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border border-[var(--line)] bg-[var(--card)] text-[var(--muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--acid)] animate-pulse" />
            <span className="text-[var(--foreground)] font-semibold">SPEAKTRACE AUDIO INTELLIGENCE</span>
            <span>•</span>
            <span className="text-[var(--acid-text)]">50 FREE CREDITS ON SIGNUP</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--foreground)] leading-[1.08]">
            Turn multi-speaker audio into dialogue you can{" "}
            <span className="font-serif italic font-normal text-[var(--acid-text)]">
              verify, search, and interrogate.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-[var(--muted)] max-w-2xl leading-relaxed font-sans">
            Stop guessing who &ldquo;Speaker 1&rdquo; and &ldquo;Speaker 2&rdquo; are. SpeakTrace isolates short voice snippets so you can identify each speaker by ear in seconds, creates crystal-clear transcripts, and lets you ask questions with verifiable timestamp proof.
          </p>

          {/* Primary & Secondary Actions */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={isAuth ? "/dashboard" : "/login"}
              className="btn-acid px-7 py-3.5 rounded-lg text-sm font-bold tracking-tight flex items-center gap-2.5 shadow-xl hover:shadow-[var(--acid-subtle)] transition-all cursor-pointer"
            >
              <span>{isAuth ? "Go to Dashboard" : "Claim 50 Free Credits"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <a
              href="#demo"
              className="btn-dark px-6 py-3.5 rounded-lg text-sm font-semibold tracking-tight transition-all cursor-pointer flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current text-[var(--acid-text)]" />
              <span>See How It Works</span>
            </a>
          </div>

          {/* Metric Badges */}
          <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs font-mono text-[var(--muted)] border-t border-[var(--line)]">
            <div>
              <div className="text-lg font-bold text-[var(--foreground)]">3-Second</div>
              <span>Voice snippet auditing</span>
            </div>
            <div>
              <div className="text-lg font-bold text-[var(--foreground)]">100%</div>
              <span>Accurate speaker tagging</span>
            </div>
            <div>
              <div className="text-lg font-bold text-[var(--foreground)]">Clickable</div>
              <span>Timestamp citations</span>
            </div>
            <div>
              <div className="text-lg font-bold text-[var(--acid-text)]">50 Credits</div>
              <span>Free on signup (~5 mins)</span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Product Simulation Showcase */}
      <section id="demo" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-b border-[var(--line)]">
        <div className="space-y-3 mb-10">
          <span className="pill-tag text-xs font-mono">PRODUCT PREVIEW</span>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
            The secret: We let you{" "}
            <span className="font-serif italic font-normal text-[var(--acid-text)]">listen</span> to the speakers before transcribing.
          </h2>
          <p className="text-xs sm:text-sm text-[var(--muted)] max-w-2xl font-sans">
            Instead of giving you a confusing transcription with anonymous tags, SpeakTrace extracts short voice snippets. Click a snippet to listen, name the speaker once, and the entire document is labeled forever.
          </p>
        </div>

        {/* Mock App Interface Card */}
        <div className="brutalist-card rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-2xl overflow-hidden">
          {/* Window Header */}
          <div className="px-6 py-3 border-b border-[var(--line)] bg-[var(--background)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
              <span className="ml-2 font-mono text-xs text-[var(--muted)]">
                recording_session_q3_strategy.mp3
              </span>
            </div>
            <span className="pill-tag bg-[var(--acid-subtle)] text-[var(--acid-text)] border-[var(--acid-border)] text-[11px] font-bold">
              3 SPEAKERS DETECTED
            </span>
          </div>

          <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Waveform & Snippet Labeling */}
            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-[var(--muted)]">Speaker Timeline Bands</span>
                  <span className="text-[var(--acid-text)] font-bold">03:45 Duration</span>
                </div>
                {/* Timeline visual representation */}
                <div className="h-6 w-full rounded-md border border-[var(--line)] bg-[var(--background)] flex overflow-hidden p-0.5 gap-0.5">
                  <div className="h-full bg-emerald-500/70 rounded-sm w-[35%]" title="Sarah (Host)" />
                  <div className="h-full bg-[var(--acid)] rounded-sm w-[40%]" title="David (Founder)" />
                  <div className="h-full bg-sky-500/70 rounded-sm w-[25%]" title="Elena (Architect)" />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-[var(--muted)]">
                  <span className="text-emerald-500">■ Sarah (0:00 - 1:18)</span>
                  <span className="text-[var(--acid-text)]">■ David (1:18 - 2:48)</span>
                  <span className="text-sky-500">■ Elena (2:48 - 3:45)</span>
                </div>
              </div>

              {/* Snippet Card */}
              <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--background)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--muted)]">
                    Step 1: Audit Voice Snippet
                  </span>
                  <span className="text-[10px] font-mono text-[var(--muted)]">Isolated 2.8s Audio</span>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--acid-border)] bg-[var(--acid-subtle)]">
                  <button
                    onClick={() => setActiveSnippet(activeSnippet === 1 ? null : 1)}
                    className="w-9 h-9 rounded-full bg-[var(--acid)] text-[var(--acid-text-inverse)] flex items-center justify-center shrink-0 hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-[var(--foreground)] truncate">
                      Speaker 01 (Audio Sample)
                    </div>
                    <div className="text-[11px] font-mono text-[var(--muted)] truncate">
                      &ldquo;Yes, we saw a 40% reduction in database latency...&rdquo;
                    </div>
                  </div>
                </div>

                <div className="pt-1">
                  <label className="block text-[11px] font-mono text-[var(--muted)] mb-1">
                    Assign Human Name:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value="David (Founder)"
                      className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                    />
                    <button className="btn-acid px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
                      Confirmed ✓
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Finished Transcript & RAG Search */}
            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono text-[var(--muted)]">
                  <span>RESULTING TRANSCRIPT WITH LABELS</span>
                  <span className="text-emerald-500 font-semibold">Ready to Export</span>
                </div>

                <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--background)] space-y-3 font-mono text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                        00:01:14
                      </span>
                      <span className="font-bold text-emerald-500">Sarah (Host):</span>
                    </div>
                    <p className="text-[var(--muted)] text-[11px] pl-2 border-l border-emerald-500/30">
                      David, how did the transition to distributed queues affect your API responsiveness?
                    </p>
                  </div>

                  <div className="space-y-1 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--acid-text)] font-bold bg-[var(--acid-subtle)] px-1.5 py-0.5 rounded">
                        00:01:22
                      </span>
                      <span className="font-bold text-[var(--acid-text)]">David (Founder):</span>
                    </div>
                    <p className="text-[var(--foreground)] text-[11px] pl-2 border-l border-[var(--acid-border)]">
                      Yes, we saw a 40% reduction in database latency, and our background processing no longer blocks HTTP workers.
                    </p>
                  </div>
                </div>
              </div>

              {/* RAG Assistant Query Box */}
              <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--background)] space-y-2">
                <div className="flex items-center gap-2 text-xs font-mono text-[var(--acid-text)] font-bold">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Ask Conversation Anything</span>
                </div>
                <div className="text-xs font-mono text-[var(--muted)]">
                  &ldquo;What did David say about database latency?&rdquo;
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--card)] border border-[var(--line)] text-xs font-sans text-[var(--foreground)]">
                  David confirmed a{" "}
                  <strong className="text-[var(--acid-text)]">40% reduction in database latency</strong>{" "}
                  after shifting background tasks to distributed queues{" "}
                  <span className="px-1.5 py-0.5 rounded bg-[var(--acid-subtle)] text-[var(--acid-text)] font-mono text-[10px] font-bold">
                    [00:01:22]
                  </span>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The 4-Step Processing Pipeline */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-b border-[var(--line)]">
        <div className="space-y-3 mb-16 text-center max-w-2xl mx-auto">
          <span className="pill-tag text-xs font-mono">STEP-BY-STEP WORKFLOW</span>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
            How SpeakTrace works.
          </h2>
          <p className="text-xs sm:text-sm text-[var(--muted)] font-sans">
            A frictionless, 4-step pipeline that transforms raw audio recordings into searchable, speaker-verified intelligence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Step 1 */}
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center font-mono font-bold text-sm border border-[var(--line)]">
              01
            </div>
            <h3 className="text-lg font-bold">Upload Your Recording</h3>
            <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed font-sans">
              Drop any meeting, interview, podcast episode, or courtroom recording. We support all common audio formats with instant cloud storage.
            </p>
          </div>

          {/* Step 2 */}
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center font-mono font-bold text-sm border border-[var(--line)]">
              02
            </div>
            <h3 className="text-lg font-bold">Voice Separation</h3>
            <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed font-sans">
              Our acoustic engine analyzes voice frequencies and separates every distinct speaker across the conversation with millisecond accuracy.
            </p>
          </div>

          {/* Step 3 */}
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--acid)] text-[var(--acid-text-inverse)] flex items-center justify-center font-mono font-bold text-sm border border-black/20">
              03
            </div>
            <h3 className="text-lg font-bold text-[var(--foreground)]">The 3-Second Audit</h3>
            <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed font-sans">
              Listen to a 3-second audio clip of each isolated speaker. Type their real names once, eliminating confusing &ldquo;Speaker 1&rdquo; tags forever.
            </p>
          </div>

          {/* Step 4 */}
          <div className="space-y-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center font-mono font-bold text-sm border border-[var(--line)]">
              04
            </div>
            <h3 className="text-lg font-bold">Export &amp; Interrogate</h3>
            <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed font-sans">
              Download clean subtitles or custom transcripts. Ask conversational questions and get answers with verifiable timestamp citations.
            </p>
          </div>
        </div>
      </section>

      {/* Built For Teams (Use Cases) */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-b border-[var(--line)]">
        <div className="space-y-3 mb-12">
          <span className="pill-tag text-xs font-mono">USE CASES</span>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
            Built for people who deal with{" "}
            <span className="font-serif italic font-normal text-[var(--acid-text)]">
              hours of audio
            </span>.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="brutalist-card p-6 rounded-xl border border-[var(--line)] bg-[var(--card)] space-y-3">
            <Headphones className="w-6 h-6 text-[var(--acid-text)]" />
            <h3 className="text-base font-bold">Podcasters &amp; Creators</h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Generate perfectly labeled transcripts for show notes, blog posts, and subtitles without re-listening to hours of talk.
            </p>
          </div>

          <div className="brutalist-card p-6 rounded-xl border border-[var(--line)] bg-[var(--card)] space-y-3">
            <ShieldCheck className="w-6 h-6 text-[var(--acid-text)]" />
            <h3 className="text-base font-bold">Legal &amp; Compliance</h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Verifiable courtroom depositions with unmistakable speaker attribution and timestamp proof for every sentence spoken.
            </p>
          </div>

          <div className="brutalist-card p-6 rounded-xl border border-[var(--line)] bg-[var(--card)] space-y-3">
            <Search className="w-6 h-6 text-[var(--acid-text)]" />
            <h3 className="text-base font-bold">User Research &amp; Product</h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Interrogate 20 customer interviews in seconds. Ask &ldquo;What did users complain about in onboarding?&rdquo; and get exact clips.
            </p>
          </div>

          <div className="brutalist-card p-6 rounded-xl border border-[var(--line)] bg-[var(--card)] space-y-3">
            <FileText className="w-6 h-6 text-[var(--acid-text)]" />
            <h3 className="text-base font-bold">Journalists &amp; Media</h3>
            <p className="text-xs text-[var(--muted)] leading-relaxed">
              Pull accurate, verified quotes in record time. Never rewind a recorded call 10 times to verify who made a statement.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Credit & ROI Estimator */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full border-b border-[var(--line)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <span className="pill-tag text-xs font-mono">TRANSPARENT PRICING</span>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
              Simple, predictable credits. No monthly subscriptions required.
            </h2>
            <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed font-sans">
              Every newly registered user gets 50 free credits right away. Audio processing costs a flat 10 credits per minute of recording, covering speaker separation, snippet generation, transcription, and conversational search.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[var(--muted)]">Audio File Length:</span>
                <span className="font-bold text-base text-[var(--foreground)]">{audioMinutes} Minutes</span>
              </div>
              <input
                type="range"
                min="1"
                max="60"
                value={audioMinutes}
                onChange={(e) => setAudioMinutes(Number(e.target.value))}
                className="w-full h-2 bg-[var(--line)] rounded-lg appearance-none cursor-pointer accent-[var(--acid)]"
              />
              <div className="flex justify-between text-[11px] font-mono text-[var(--muted)]">
                <span>1 min</span>
                <span>15 mins</span>
                <span>30 mins</span>
                <span>60 mins</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="brutalist-card rounded-2xl p-6 sm:p-8 space-y-6 border border-[var(--line)] bg-[var(--card)] shadow-xl">
              <div className="flex items-center justify-between pb-4 border-b border-[var(--line)]">
                <span className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Credit &amp; Value Breakdown
                </span>
                <span className="pill-tag bg-[var(--acid-subtle)] text-[var(--acid-text)] border-[var(--acid-border)] font-bold">
                  10 Credits / Minute
                </span>
              </div>

              <div className="space-y-4 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">Audio Duration:</span>
                  <span className="font-semibold text-sm">{audioMinutes} minutes</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">Estimated Time Saved:</span>
                  <span className="text-emerald-500 font-semibold">~{hoursSaved.toFixed(1)} hours of manual work</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">Voice Snippet Player:</span>
                  <span className="text-emerald-500">Included</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)]">Conversational Search:</span>
                  <span className="text-emerald-500">Included</span>
                </div>

                <div className="pt-4 border-t border-[var(--line)] flex justify-between items-baseline">
                  <span className="text-sm font-bold">Total Credits Required:</span>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-[var(--acid-text)]">{tokenCost}</span>
                    <span className="text-xs text-[var(--muted)] ml-1">Credits</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--background)] border border-[var(--line)] text-xs font-mono">
                {tokenCost <= 50 ? (
                  <span className="text-emerald-500 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    100% Free! Covered by your 50 signup credits.
                  </span>
                ) : (
                  <span className="text-[var(--muted)]">
                    Uses your 50 free credits + {tokenCost - 50} additional credits.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto w-full border-b border-[var(--line)] space-y-8">
        <div className="space-y-2 text-center">
          <span className="pill-tag text-xs font-mono">QUESTIONS &amp; ANSWERS</span>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
            Frequently asked questions.
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="brutalist-card rounded-xl border border-[var(--line)] bg-[var(--card)] overflow-hidden transition-all"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-sm hover:text-[var(--acid-text)] transition-colors cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform ${openFaq === i ? "rotate-180 text-[var(--acid-text)]" : "text-[var(--muted)]"}`}
                />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-[var(--muted)] leading-relaxed border-t border-[var(--line)]/50 font-sans">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Closing High-Impact CTA Banner */}
      <footer className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full text-center space-y-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--foreground)]">
            Stop rewinding audio.{" "}
            <span className="font-serif italic font-normal text-[var(--acid-text)]">
              Start understanding conversations.
            </span>
          </h2>
          <p className="text-xs sm:text-base text-[var(--muted)] font-sans max-w-xl mx-auto">
            Claim your 50 free credits now and experience speaker-accurate transcription and conversation recall.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4">
          <Link
            href={isAuth ? "/dashboard" : "/login"}
            className="btn-acid px-8 py-4 rounded-xl text-sm font-bold tracking-tight inline-flex items-center gap-2.5 shadow-2xl hover:scale-105 transition-all cursor-pointer"
          >
            <span>{isAuth ? "Enter Your Dashboard" : "Claim 50 Free Credits Now"}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="pt-16 text-xs font-mono text-[var(--muted)] flex flex-wrap items-center justify-center gap-6 border-t border-[var(--line)]">
          <span>SpeakTrace Audio Intelligence</span>
          <span>•</span>
          <span>Privacy-First Speech Processing</span>
          <span>•</span>
          <span>Verifiable Citations</span>
          <span>•</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}
