"use client";

import { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendMessage } from "@/lib/api";
import { GradientBackground } from "@/components/ui/paper-design-shader-background";
import InputBar, {
  type AttachedImage,
  type ChatStatus,
} from "@/components/ui/input-bar";

export default function Home() {
  const [sessionId] = useState(uuidv4());
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(
    async ({ content }: { role: "user"; content: string }) => {
      if (status === "submitted" || status === "streaming") return;

      setStatus("submitted");
      abortRef.current = new AbortController();

      try {
        await sendMessage(content, sessionId);
        setStatus("ready");
      } catch {
        setStatus("ready");
      } finally {
        abortRef.current = null;
      }
    },
    [sessionId, status]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
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

  return (
    <div className="relative min-h-screen overflow-hidden">
      <GradientBackground />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-black/15" />

      <div className="relative z-10 flex min-h-screen items-end">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <InputBar
          className="pb-6"
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
  );
}
