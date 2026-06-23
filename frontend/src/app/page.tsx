"use client";

import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { streamMessage, type Message, type Source } from "@/lib/api";
import { GradientBackground } from "@/components/ui/paper-design-shader-background";
import AppSidebar from "@/components/ui/app-sidebar";
import MessageList from "@/components/ui/message-list";
import InputBar, {
  type AttachedImage,
  type ChatStatus,
} from "@/components/ui/input-bar";

function MenuIcon({ className = "w-5 h-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  const [sessionId, setSessionId] = useState(uuidv4());
  const [activeChatId, setActiveChatId] = useState<string | undefined>("demo-1");
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const updateMessage = useCallback(
    (id: string, patch: Partial<Message> | ((m: Message) => Partial<Message>)) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) }
            : m
        )
      );
    },
    []
  );

  const handleSend = useCallback(
    ({ content }: { role: "user"; content: string }) => {
      if (status === "submitted" || status === "streaming") return;

      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content,
      };
      const assistantId = uuidv4();
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setStatus("submitted");

      eventSourceRef.current = streamMessage(
        content,
        sessionId,
        (token: string) => {
          setStatus("streaming");
          updateMessage(assistantId, (m) => ({ content: m.content + token }));
        },
        (sources: Source[]) => updateMessage(assistantId, { sources }),
        () => {
          updateMessage(assistantId, { isStreaming: false });
          setStatus("ready");
          eventSourceRef.current = null;
        },
        (err: string) => {
          updateMessage(assistantId, (m) => ({
            content: m.content || err,
            isStreaming: false,
          }));
          setStatus("ready");
          eventSourceRef.current = null;
        }
      );
    },
    [status, sessionId, updateMessage]
  );

  const handleStop = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
    );
    setStatus("ready");
  }, []);

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;

      const url = URL.createObjectURL(file);
      setAttachedImages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          filename: file.name,
          url,
          size: file.size,
        },
      ]);
      event.target.value = "";
    },
    []
  );

  const handleRemoveImage = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const removed = prev.find((img) => img.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((img) => img.id !== id);
    });
  }, []);

  const handleNewChat = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setSessionId(uuidv4());
    setActiveChatId(undefined);
    setMessages([]);
    setAttachedImages([]);
    setStatus("ready");
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <GradientBackground />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-black/15" />

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] md:hidden"
          onClick={closeSidebar}
        />
      )}

      <div className="relative z-10 flex min-h-screen gap-2 p-2 sm:gap-3 sm:p-3">
        <div
          className={[
            "fixed inset-y-0 left-0 z-50 flex p-2 transition-transform duration-300 ease-out sm:p-3 md:static md:translate-x-0 md:p-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          ].join(" ")}
        >
          <AppSidebar
            activeChatId={activeChatId}
            onNewChat={handleNewChat}
            onSelectChat={setActiveChatId}
            onNavigate={closeSidebar}
            className="h-[calc(100vh-1rem)] sm:h-[calc(100vh-1.5rem)] md:h-[calc(100vh-1.5rem)]"
          />
        </div>

        <div className="flex min-h-[calc(100vh-1rem)] min-w-0 flex-1 flex-col sm:min-h-[calc(100vh-1.5rem)]">
          <div className="flex items-center px-1 pb-2 pt-1 md:hidden">
            <button
              type="button"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-neutral-200/90 bg-white/95 text-neutral-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <MenuIcon />
            </button>
          </div>

          <main className="min-h-0 flex-1">
            <MessageList messages={messages} />
          </main>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <InputBar
            className="pb-0"
            autoFocus
            status={status}
            placeholder="Ask anything..."
            onSend={handleSend}
            onStop={handleStop}
            onAttach={handleAttach}
            attachedImages={attachedImages}
            onRemoveImage={handleRemoveImage}
          />
        </div>
      </div>
    </div>
  );
}
