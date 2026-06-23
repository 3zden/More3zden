"use client";

import { memo } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const panelSurfaceClass =
  "overflow-hidden rounded-[16px] border border-neutral-200/90 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

export type SidebarChat = {
  id: string;
  title: string;
  updatedAt?: string;
};

export type AppSidebarProps = {
  className?: string;
  chats?: SidebarChat[];
  activeChatId?: string;
  onNewChat?: () => void;
  onSelectChat?: (id: string) => void;
  onNavigate?: () => void;
};

const PlusIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

const MessageIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
    <circle cx="12" cy="12" r="3" />
    <path
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      strokeLinecap="round"
    />
  </svg>
);

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left text-[13px] transition-colors duration-150",
        active
          ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-50"
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800/70 dark:hover:text-neutral-100"
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
        {icon}
      </span>
      <span className="truncate font-medium">{label}</span>
    </button>
  );
}

export const AppSidebar = memo(function AppSidebar({
  className,
  chats = [],
  activeChatId,
  onNewChat,
  onSelectChat,
  onNavigate,
}: AppSidebarProps) {
  const displayChats =
    chats.length > 0
      ? chats
      : [
          { id: "demo-1", title: "Portfolio overview" },
          { id: "demo-2", title: "Skills & technologies" },
          { id: "demo-3", title: "Project deep-dive" },
        ];

  return (
    <aside
      className={cn(
        "flex h-full w-[min(280px,88vw)] shrink-0 flex-col sm:w-[260px]",
        panelSurfaceClass,
        className
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-neutral-200/80 px-4 py-4 dark:border-neutral-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-neutral-900 text-[11px] font-semibold text-white dark:bg-white dark:text-neutral-900">
          M
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">
            More3zdenAI
          </p>
          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
            Portfolio assistant
          </p>
        </div>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNewChat?.();
            onNavigate?.();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-neutral-900 px-3 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <PlusIcon />
          New chat
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2">
        <p className="px-2.5 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Recent
        </p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-1 pb-2 scrollbar-thin">
          {displayChats.map((chat) => (
            <NavItem
              key={chat.id}
              active={activeChatId === chat.id}
              icon={<MessageIcon className="w-3.5 h-3.5" />}
              label={chat.title}
              onClick={() => {
                onSelectChat?.(chat.id);
                onNavigate?.();
              }}
            />
          ))}
        </nav>
      </div>

      <div className="border-t border-neutral-200/80 p-2 dark:border-neutral-800">
        <NavItem icon={<SettingsIcon className="w-3.5 h-3.5" />} label="Settings" />
        <div className="mt-1 flex items-center gap-2 rounded-[12px] px-2.5 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 via-pink-500 to-violet-500 text-[10px] font-semibold text-white">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-neutral-800 dark:text-neutral-100">
              Azzeddine
            </p>
            <p className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">
              Free plan
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
});

export default AppSidebar;
