"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type {
  BrainstormMessage,
  BrainstormRoomMode,
  CharacterSummary,
} from "@/types/chat";
import type { BubbleStyle } from "@/lib/bubbleStyle";
import { bubblePaint, bubbleInk, DEFAULT_BUBBLE_STYLE } from "@/lib/bubbleStyle";
import { Avatar } from "./Avatar";
import { BackIcon, TrashIcon, SpeakerIcon } from "./icons";
import { useSpeakingMessageId, useIsAudibleSpeaking } from "@/lib/voice";
import { inferEmotionFromIndonesianText } from "@/lib/callEmotion";

function splitBubbles(content: string): string[] {
  if (!content) return [];
  if (!/\[\[\s*NEXT\s*\]\]/i.test(content)) return [content];
  return content
    .split(/\s*\[\[\s*NEXT\s*\]\]\s*/gi)
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function BrainstormRoomView({
  roomTitle,
  mode,
  members,
  messages,
  isTyping,
  typingLabel,
  bubble,
  characters,
  onBack,
  onClear,
  onDeleteRoom,
  onSend,
  onCopy,
  onSpeak,
  onStopSpeaking,
  canSpeak,
}: {
  roomTitle: string;
  mode: BrainstormRoomMode;
  members: { characterId: string; name: string; avatarUrl: string | null; shortBio: string }[];
  messages: BrainstormMessage[];
  isTyping: boolean;
  typingLabel?: string | null;
  bubble?: BubbleStyle | null;
  characters: CharacterSummary[];
  onBack: () => void;
  onClear: () => void;
  onDeleteRoom: () => void;
  onSend: (text: string) => void;
  onCopy: (text: string) => void;
  onSpeak: (text: string, messageId?: string, characterId?: string | null) => void;
  onStopSpeaking: () => void;
  canSpeak: boolean;
}) {
  const bubbleStyle = bubble ?? DEFAULT_BUBBLE_STYLE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const speakingId = useSpeakingMessageId();
  const audible = useIsAudibleSpeaking();

  const memberMap = useMemo(() => {
    const m = new Map<string, { name: string; avatarUrl: string | null; shortBio: string }>();
    for (const mem of members) m.set(mem.characterId, mem);
    return m;
  }, [members]);

  // Auto scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping]);

  function handleSend() {
    const t = input.trim();
    if (!t || isTyping) return;
    onSend(t);
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-app">
      {/* Header */}
      <div className="top-bar z-10 flex items-center gap-2 px-2 pb-2.5 pt-[max(0.625rem,var(--safe-top))] sm:px-4">
        <button onClick={onBack} className="shrink-0 p-[5px] text-ink-soft transition active:opacity-50">
          <BackIcon className="h-[30px] w-[30px]" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{roomTitle}</p>
          <p className="truncate text-xs text-ink-soft">
            {isTyping
              ? typingLabel || (mode === "meetup" ? "sedang berbicara..." : "sedang diskusi...")
              : mode === "meetup"
                ? "Tatap Muka · ruang yang sama"
                : members.map((m) => m.name).join(" · ")}
          </p>
        </div>
        <div className="flex -space-x-2">
          {members.slice(0, 3).map((m) => (
            <div key={m.characterId} className="rounded-full ring-2 ring-header">
              <Avatar name={m.name} src={m.avatarUrl} size={32} />
            </div>
          ))}
        </div>
        <button
          onClick={onClear}
          className="hidden shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-2 hover:text-ink sm:inline-flex"
          title="Hapus obrolan meja"
        >
          Bersihkan
        </button>
        <button
          onClick={() => {
            if (confirm("Hapus meja dan semua obrolannya?")) onDeleteRoom();
          }}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-surface-2 hover:text-ink"
          aria-label="Hapus meja"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Member chips */}
      <div className="shrink-0 border-b border-line/60 bg-surface px-3 py-2 sm:px-4">
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <span key={m.characterId} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink">
              <Avatar name={m.name} src={m.avatarUrl} size={18} />
              {m.name}
            </span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {messages.length === 0 && !isTyping && (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-ink">
                {mode === "meetup" ? "Mulai pertemuan tatap muka" : "Mulai diskusi di meja ini"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {mode === "meetup"
                  ? members.length === 1
                    ? `Kamu dan ${members[0].name} berada di ruangan yang sama. Mulai bicara; tidak ada panggilan video atau telepon.`
                    : `Kamu dan ${members.map((m) => m.name).join(", ")} berada di ruangan yang sama. Mereka akan menanggapi bergiliran.`
                  : `Tulis topik atau pertanyaan — ${members.map((m) => m.name).join(", ")} akan menanggapi satu per satu dengan gaya masing-masing.`}
              </p>
            </div>
          )}
          {messages.map((m) => {
            const isUser = m.role === "user";
            const char = m.characterId ? memberMap.get(m.characterId) : null;
            const parts = splitBubbles(m.content);
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[85%] gap-2 sm:max-w-[78%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                  {!isUser && char && (
                    <div className="shrink-0 self-end">
                      <Avatar name={char.name} src={char.avatarUrl} size={28} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {!isUser && char && (
                      <p className="mb-1 ml-1 text-[11px] font-semibold text-ink-soft">{char.name}</p>
                    )}
                    {parts.map((part, pIdx) => (
                      <div
                        key={`${m.id}-${pIdx}`}
                        className={`rounded-2xl px-3 py-2 text-sm shadow-xs ${isUser ? "rounded-br-sm bg-bubble-out text-bubble-out-ink" : "rounded-bl-sm bg-bubble-in text-bubble-in-ink"}`}
                        style={bubblePaint(bubbleStyle, isUser ? "out" : "in")}
                      >
                        <p className="whitespace-pre-wrap break-words" style={bubbleInk(bubbleStyle, isUser ? "out" : "in")}>
                          {part}
                        </p>
                        {pIdx === parts.length - 1 && (
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <span
                              className={`text-[11px] ${(isUser ? bubbleStyle.textColorOut : bubbleStyle.textColorIn) ? "opacity-75" : "text-ink-soft/70"}`}
                              style={bubbleInk(bubbleStyle, isUser ? "out" : "in")}
                            >
                              {formatTime(m.createdAt)}
                            </span>
                            {!isUser && canSpeak && part && (
                              <button
                                onClick={() => {
                                  if (speakingId === `${m.id}-${pIdx}`) onStopSpeaking();
                                  else {
                                    onSpeak(part, `${m.id}-${pIdx}`, m.characterId);
                                  }
                                }}
                                className={`rounded-full p-1 transition ${speakingId === `${m.id}-${pIdx}` && audible ? "bg-ink text-white" : "text-ink-soft hover:bg-surface-2 hover:text-ink"}`}
                                title="Putar suara karakter"
                              >
                                <SpeakerIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {isUser && pIdx === 0 && (
                              <button
                                onClick={() => onCopy(m.content)}
                                className="text-[11px] text-ink-soft hover:text-ink"
                              >
                                Salin
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-bubble-in px-4 py-3 shadow-sm" style={bubblePaint(bubbleStyle, "in")}>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
                {typingLabel && <span className="ml-2 text-xs text-ink-soft">{typingLabel}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="bottom-bar shrink-0 p-2 sm:p-3">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "meetup" ? "Bicara langsung..." : `Tanya ${members.map((m) => m.name).join(", ")}...`}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="max-h-28 min-h-[42px] flex-1 resize-none rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-muted sm:text-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="grid h-[42px] w-[42px] place-items-center rounded-full bg-brand text-brand-ink transition hover:bg-brand-strong active:scale-95 disabled:opacity-40"
            aria-label="Kirim"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M3.4 20.6 21 12 3.4 3.4 3 10l12 2-12 2z" fill="currentColor" />
            </svg>
          </button>
        </div>
        <p className="mx-auto mt-1 max-w-3xl px-1 text-center text-[11px] text-muted">
          {mode === "meetup"
            ? `Tatap Muka · ${members.length} karakter hadir di ruangan ini. Catatan dan Memori Tim 1 yang diizinkan menjadi konteks.`
            : `Setiap pesanmu akan ditanggapi bergantian oleh ${members.length} karakter.`}
        </p>
      </div>
    </div>
  );
}
