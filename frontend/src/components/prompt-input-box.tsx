"use client";

import React from "react";

interface PromptInputBoxProps {
  onSend?: (message: string) => void | Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function PromptInputBox({
  onSend,
  isLoading = false,
  placeholder = "Ask anything...",
  className = "",
}: PromptInputBoxProps) {
  const [input, setInput] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleSubmit = () => {
    const value = input.trim();
    if (!value || isLoading) return;
    void onSend?.(value);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={className}>
      <div className="flex items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={isLoading}
          className="min-h-[44px] flex-1 resize-none border-none bg-transparent px-2 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
