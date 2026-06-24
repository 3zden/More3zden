"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { synthesizeSpeech, type Message, type Source } from "@/lib/api";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SpeakerIcon = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M11 5 6 9H2v6h4l5 4z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
  </svg>
);

const StopSpeakerIcon = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

const SpinnerIcon = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={cn("animate-spin", className)}>
    <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
  </svg>
);

// Once the LuxTTS cloning service is found unavailable, skip it for the rest of
// the session (avoids a connect delay on every Listen click). Reset on reload.
let luxttsDown = false;

function SpeakButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Fallback: the browser's built-in speech synthesis (generic voice).
  // Used whenever the LuxTTS cloning service isn't available yet.
  const speakViaBrowser = useCallback((value: string) => {
    return new Promise<void>((resolve, reject) => {
      const synth =
        typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!synth) {
        reject(new Error("speechSynthesis unsupported"));
        return;
      }
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(value);
      utter.rate = 1;
      utter.onend = () => resolve();
      utter.onerror = () => reject(new Error("speechSynthesis failed"));
      synth.speak(utter);
    });
  }, []);

  const handleClick = useCallback(async () => {
    if (state === "playing" || state === "loading") {
      cleanup();
      setState("idle");
      return;
    }
    setState("loading");

    // 1) Preferred: LuxTTS cloned voice via the backend (skipped once known down).
    if (!luxttsDown) {
      try {
        const url = await synthesizeSpeech(text);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          cleanup();
          setState("idle");
        };
        audio.onerror = () => {
          cleanup();
          setState("idle");
        };
        await audio.play();
        setState("playing");
        return;
      } catch (err) {
        luxttsDown = true;
        console.warn("LuxTTS unavailable, using browser voice:", (err as Error).message);
      }
    }

    // 2) Fallback: browser speech synthesis.
    try {
      setState("playing");
      await speakViaBrowser(text);
      setState("idle");
    } catch (err) {
      console.warn("No speech available:", (err as Error).message);
      cleanup();
      setState("idle");
    }
  }, [state, text, cleanup, speakViaBrowser]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={state === "playing" ? "Stop speaking" : "Read aloud"}
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500 transition-colors hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100"
    >
      {state === "loading" ? (
        <SpinnerIcon />
      ) : state === "playing" ? (
        <StopSpeakerIcon />
      ) : (
        <SpeakerIcon />
      )}
      {state === "playing" ? "Stop" : "Listen"}
    </button>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span
          key={`${s.section}-${i}`}
          title={s.preview}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200/80 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400"
        >
          {s.section}
        </span>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-500"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isEmptyAssistant =
    !isUser && message.content.length === 0 && message.isStreaming;

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[18px] px-4 py-2.5 text-[15px] leading-[1.6]",
          isUser
            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
            : "border border-neutral-200/90 bg-white text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
        )}
      >
        {isEmptyAssistant ? (
          <TypingDots />
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {!isUser && <SourceList sources={message.sources ?? []} />}
        {!isUser && !message.isStreaming && message.content.trim().length > 0 && (
          <SpeakButton text={message.content} />
        )}
      </div>
    </div>
  );
}

export type MessageListProps = {
  messages: Message[];
  className?: string;
};

export const MessageList = memo(function MessageList({
  messages,
  className,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center", className)}>
        <div className="px-6 text-center">
          <h1 className="text-[22px] font-semibold text-neutral-900 dark:text-neutral-100">
            Ask me about Azzeddine
          </h1>
          <p className="mt-1.5 text-[14px] text-neutral-500 dark:text-neutral-400">
            Skills, projects, experience — grounded in his portfolio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full overflow-y-auto scrollbar-thin", className)}>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-2 py-4 sm:px-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});

export default MessageList;
