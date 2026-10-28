"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterSummary, ChatMessage } from "@/types/chat";
import { Avatar } from "./Avatar";
import { BackIcon } from "./icons";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
      </div>
    </div>
  );
}

export function ChatWindow({
  character,
  messages,
  isTyping,
  onBack,
  onOpenProfile,
  onImageClick,
}: {
  character: CharacterSummary;
  messages: ChatMessage[];
  isTyping: boolean;
  onBack: () => void;
  onOpenProfile: () => void;
  onImageClick: (url: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, atBottom]);

  return (
    <div className="flex h-full flex-1 flex-col bg-[#efeae2]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-[#f0f2f5] px-4 py-2.5 shadow-sm">
        <button onClick={onBack} className="rounded-full p-1.5 text-slate-600 hover:bg-slate-200 md:hidden">
          <BackIcon className="h-5 w-5" />
        </button>
        <button onClick={onOpenProfile} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar name={character.name} src={character.avatarUrl} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{character.name}</p>
            <p className="truncate text-xs text-emerald-600">
              {isTyping ? "sedang mengetik..." : "online"}
            </p>
          </div>
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
        }}
        className="flex-1 space-y-1.5 overflow-y-auto px-4 py-4 md:px-10"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.035) 1px, transparent 0)",
          backgroundSize: "18px 18px",
        }}
      >
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`relative max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                m.role === "user"
                  ? "rounded-br-sm bg-[#d9fdd3] text-slate-800"
                  : "rounded-bl-sm bg-white text-slate-800"
              } ${m.pending ? "opacity-60" : ""}`}
            >
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  alt="lampiran"
                  onClick={() => onImageClick(m.imageUrl!)}
                  className="mb-1.5 max-h-64 w-full cursor-pointer rounded-lg object-cover"
                />
              )}
              {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
              <span className="float-right ml-2 mt-1 select-none text-[10px] text-slate-400">
                {formatTime(m.createdAt)}
              </span>
            </div>
          </div>
        ))}
        {isTyping && <TypingBubble />}
      </div>
    </div>
  );
}
