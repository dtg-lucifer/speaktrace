"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content text-xs sm:text-sm leading-relaxed space-y-2.5 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base sm:text-lg font-bold text-[var(--foreground)] mt-3 mb-1.5 pb-1 border-b border-[var(--line)]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm sm:text-base font-bold text-[var(--foreground)] mt-2.5 mb-1 text-accent-primary">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] mt-2 mb-1">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mt-1.5 mb-0.5">
              {children}
            </h4>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2 ml-1 text-[var(--foreground)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2 ml-1 text-[var(--foreground)]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-bold text-[var(--foreground)]">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent bg-accent-subtle/50 px-3 py-1.5 rounded-r-lg my-2 italic text-[var(--foreground)]">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 border border-[var(--line)] rounded-lg">
              <table className="w-full text-left text-xs border-collapse divide-y divide-[var(--line)]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--card)] text-[var(--muted)] font-mono font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => <th className="p-2 border-b border-[var(--line)]">{children}</th>,
          td: ({ children }) => <td className="p-2 border-b border-[var(--line)]">{children}</td>,
          hr: () => <hr className="my-3 border-[var(--line)]" />,
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");
            const isInline = !match && !codeString.includes("\n");

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-[var(--card)] border border-[var(--line)] text-accent-primary font-mono text-[11px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock language={match ? match[1] : "text"} code={codeString}>
                {children}
              </CodeBlock>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({
  language,
  code,
  children,
}: {
  language: string;
  code: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-[var(--line)] bg-[var(--card)] font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--background)] border-b border-[var(--line)] text-[10px] text-[var(--muted)] uppercase tracking-wider">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-[var(--foreground)] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed text-[var(--foreground)]">
        <code>{children}</code>
      </pre>
    </div>
  );
}
