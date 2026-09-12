"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Sparkles, X, Bot, User, Clock } from "lucide-react";
import { queryRag } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ speaker?: string; start_time?: number; end_time?: number; text: string }>;
}

export function RagDrawer({
  projectId,
  isOpen,
  onClose,
  onJumpToTimestamp,
}: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onJumpToTimestamp?: (sec: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I am your SpeakTrace RAG conversational assistant powered by local Ollama LLM. You can ask me anything about the dialogues, testimonies, or speakers across all audio files in this project.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const prompt = textToSend || query;
    if (!prompt.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setIsLoading(true);

    try {
      const response = await queryRag(projectId, prompt);
      const botMsg: Message = {
        role: "assistant",
        content: response.answer,
        citations: response.citations,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error querying the RAG pipeline. Please ensure the ML service is running.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--card)] border-l border-[var(--line)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-[var(--acid-subtle)] text-[var(--acid-text)]">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <h3 className="font-bold text-sm">Project RAG Assistant</h3>
            <p className="text-[11px] text-[var(--muted)] font-mono">Ollama LLM • Vector Memory</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)] cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex gap-3 text-xs ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {m.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-[var(--acid-subtle)] text-[var(--acid-text)] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg p-3 ${
                m.role === "user"
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--background)] border border-[var(--line)]"
              }`}
            >
              <p className="leading-relaxed whitespace-pre-line">{m.content}</p>

              {/* Citations with jump buttons */}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-[var(--line)] space-y-1.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--muted)] block">
                    Timestamp Citations:
                  </span>
                  {m.citations.slice(0, 3).map((cit, cIdx) => (
                    <button
                      key={cIdx}
                      onClick={() => cit.start_time !== undefined && onJumpToTimestamp?.(cit.start_time)}
                      className="w-full text-left p-1.5 rounded bg-[var(--card)] hover:border-[var(--acid)] border border-transparent flex items-center justify-between text-[11px] font-mono group transition-colors cursor-pointer"
                    >
                      <span className="truncate text-[var(--muted)] group-hover:text-[var(--foreground)]">
                        {cit.text}
                      </span>
                      <span className="text-[var(--acid-text)] flex items-center shrink-0 ml-1">
                        <Clock className="w-3 h-3 mr-0.5" />
                        {cit.start_time}s
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-[var(--card)] border border-[var(--line)] flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 items-center text-xs text-[var(--muted)] font-mono">
            <span className="w-2 h-2 rounded-full bg-[var(--acid)] animate-ping" />
            <span>Ollama reasoning over transcripts...</span>
          </div>
        )}

        {/* Auto-scroll sentinel */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="p-3 border-t border-[var(--line)] bg-[var(--card)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask question about this conversation..."
            className="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-[var(--line)] bg-[var(--background)] focus:outline-none focus:border-[var(--acid)]"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="btn-acid p-2 rounded-lg cursor-pointer disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
