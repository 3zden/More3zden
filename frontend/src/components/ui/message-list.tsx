"use client";

import { memo, useEffect, useRef } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Message, Source } from "@/lib/api";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
