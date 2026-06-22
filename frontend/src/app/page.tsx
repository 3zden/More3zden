"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendMessage, Message, Source } from "@/lib/api";
import { PromptInputBox } from "@/components/prompt-input-box";
import { GradientBackground } from "@/components/ui/paper-design-shader-background";

const SUGGESTED_QUESTIONS = [
  "What technologies does Azzeddine work with?",
  "Tell me about the More3zdenAI project",
  "What services does Azzeddine offer?",
  "Is Azzeddine available for hire?",
  "What is Azzeddine's experience?",
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm More3zdenAI 👋 Ask me anything about Azzeddine's skills, projects, experience, or how to get in touch.",
    },
  ]);
  const [sessionId] = useState(uuidv4());
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (question?: string) => {
      const q = (question || "").trim();
      if (!q || loading) return;

      const userMsg: Message = { id: uuidv4(), role: "user", content: q };
      const placeholderId = uuidv4();
      const placeholder: Message = {
        id: placeholderId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, placeholder]);
      setLoading(true);

      try {
        const res = await sendMessage(q, sessionId);
        setMessages((prev) =>
          prev.map((message) =>
            message.id === placeholderId
              ? {
                  ...message,
                  content: res.answer,
                  sources: res.sources,
                  cached: res.cached,
                  latency_ms: res.latency_ms,
                  isStreaming: false,
                }
              : message
          )
        );
      } catch {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === placeholderId
              ? {
                  ...message,
                  content: "Sorry, something went wrong. Please try again.",
                  isStreaming: false,
                }
              : message
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [loading, sessionId]
  );

  return (
    <div className="relative min-h-screen overflow-hidden text-gray-100">
      <GradientBackground />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-black/15" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 bg-black/20 px-6 py-4 backdrop-blur-md">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold">
            M
          </div>
          <div>
            <h1 className="font-semibold text-white">More3zdenAI</h1>
            <p className="text-xs text-gray-400">Powered by Ollama · RAG · FAISS</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-400">Online</span>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 overflow-y-auto px-4 py-8">
          <div className="w-full">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {messages.length === 1 && (
              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    onClick={() => handleSend(question)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-gray-200 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        <footer className="border-t border-white/10 bg-black/20 px-4 py-4 backdrop-blur-md">
          <div className="mx-auto max-w-4xl">
            <PromptInputBox
              onSend={(message) => handleSend(message)}
              isLoading={loading}
              placeholder="Ask me about Morad's skills, projects, experience..."
              className="w-full"
            />
            <p className="mt-3 text-center text-xs text-white/40">
              Answers are grounded in Azzeddine's actual portfolio data via RAG
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`mb-6 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "order-2" : "order-1"}`}>
        {!isUser && (
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold">
              M
            </div>
            <span className="text-xs text-gray-500">More3zdenAI</span>
            {message.cached && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-500">
                cached
              </span>
            )}
            {message.latency_ms && <span className="text-xs text-gray-600">{message.latency_ms}ms</span>}
          </div>
        )}

        <div
          className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-lg backdrop-blur ${
            isUser
              ? "rounded-tr-sm border-violet-500/30 bg-violet-600/90 text-white"
              : "rounded-tl-sm border-white/8 bg-white/5 text-gray-100"
          }`}
        >
          {message.isStreaming ? (
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "300ms" }} />
            </span>
          ) : (
            message.content
          )}
        </div>

        {message.sources && message.sources.length > 0 && <SourcesList sources={message.sources} />}
      </div>
    </div>
  );
}

function SourcesList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1 text-xs text-gray-500 transition hover:text-gray-300"
      >
        <span>{open ? "▲" : "▼"}</span>
        {sources.length} source{sources.length !== 1 ? "s" : ""}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {sources.map((source, index) => (
            <div key={index} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs backdrop-blur-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium text-violet-400">{source.section}</span>
                <span className="text-gray-500">score: {source.score.toFixed(2)}</span>
              </div>
              <p className="leading-relaxed text-gray-400">{source.preview}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
