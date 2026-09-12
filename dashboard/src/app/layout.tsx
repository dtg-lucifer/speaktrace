import type { Metadata } from "next";
import { Space_Grotesk, DM_Mono } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const dmMono = DM_Mono({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SpeakTrace — Audio Diarization & Conversation RAG",
  description: "Identify distinct speakers, label voices via playable snippets, export VTT/TXT transcripts, and query conversations with local LLM RAG.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${dmMono.variable} dark`}>
      <body className="min-h-screen flex flex-col selection:bg-[var(--acid)] selection:text-[var(--acid-text-inverse)]">
        {children}
      </body>
    </html>
  );
}
