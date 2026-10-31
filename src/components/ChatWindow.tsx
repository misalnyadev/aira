"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CharacterSummary, ChatMessage } from "@/types/chat";
import { lastAssistantId, messageActionsFor } from "@/lib/messageRules";
import {
  DEFAULT_BUBBLE_STYLE,
  bubbleInk,
  bubblePaint,
  type BubbleStyle,
} from "@/lib/bubbleStyle";
import { chatBackgroundProps, type ChatBackground } from "@/lib/chatBackground";
import { getIsDarkSnapshot, subscribeTheme } from "@/lib/theme";
import { Avatar } from "./Avatar";
import { ChatVideoBackground, ChatVideoPanel } from "./ChatVideo";
import {
  BackIcon,
  CheckIcon,
  DoubleCheckIcon,
  SpeakerIcon,
  SpeakerOffIcon,
} from "./icons";
import { MessageActionSheet, useMessageActions, type MessageAction } from "./MessageActions";

const READ_WORDS_PER_SECOND = 2.6;
const READ_MIN_MS = 2000;
const READ_MAX_MS = 45000;

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hari ini";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function Ticks({ pending }: { pending?: boolean }) {
  if (pending) {
    return <CheckIcon className="h-3.5 w-3.5 opacity-60" />;
  }
  return <DoubleCheckIcon className="h-3.5 w-3.5 opacity-85" />;
}

function TypingBubble({ bubble }: { bubble: BubbleStyle }) {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-bubble-in px-4 py-3 shadow-sm"
        style={bubblePaint(bubble, "in")}
      >
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
      </div>
    </div>
  );
}

export function ChatWindow({
  character,
  messages,
  isTyping,
  isSpeaking,
  canSpeak,
  voiceEnabled,
  background,
  bubble,
  onBack,
  onOpenProfile,
  onOpenVoice,
  onImageClick,
  onCopyMessage,
  onSpeakMessage,
  onStopSpeaking,
  onDeleteMessage,
  onRegenerate,
}: {
  character: CharacterSummary;
  messages: ChatMessage[];
  isTyping: boolean;
  isSpeaking: boolean;
  canSpeak: boolean;
  voiceEnabled: boolean;
  /** Latar area chat pilihan pengguna; `default` memakai pola bawaan tema. */
  background?: ChatBackground;
  /** Gaya gelembung pesan (khusus karakter atau bawaan akun). */
  bubble?: BubbleStyle;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenVoice: () => void;
  onImageClick: (url: string) => void;
  onCopyMessage: (text: string) => void;
  onSpeakMessage: (text: string) => void;
  onStopSpeaking: () => void;
  onDeleteMessage: (id: string) => void;
  onRegenerate: () => void;
}) {
  const bubbleStyle = bubble ?? DEFAULT_BUBBLE_STYLE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const isDark = useSyncExternalStore(subscribeTheme, getIsDarkSnapshot, () => false);
  const backdrop = chatBackgroundProps(background, isDark);
  const chatMedia = character.media;
  const chatVideo = chatMedia?.chatVideoKey
    ? { videoKey: chatMedia.chatVideoKey, posterUrl: chatMedia.chatVideoPosterUrl }
    : null;
  const chatVideoFull = Boolean(chatVideo && (chatMedia?.chatVideoLayout ?? "tile") === "full");

  const [reading, setReading] = useState(false);
  const readTimer = useRef(0);
  const startTimer = useRef(0);
  const wasTyping = useRef(false);

  useEffect(() => {
    const typingNow = isTyping;
    const typingBefore = wasTyping.current;
    wasTyping.current = typingNow;

    if (!typingBefore || typingNow) return;

    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;

    const words = last.content.trim().split(/\s+/).filter(Boolean).length;
    const ms = Math.min(
      READ_MAX_MS,
      Math.max(READ_MIN_MS, Math.round((words / READ_WORDS_PER_SECOND) * 1000))
    );
    window.clearTimeout(readTimer.current);
    startTimer.current = window.setTimeout(() => {
      setReading(true);
      readTimer.current = window.setTimeout(() => setReading(false), ms);
    }, 0);
    return () => window.clearTimeout(startTimer.current);
  }, [isTyping, messages]);

  useEffect(() => () => window.clearTimeout(readTimer.current), []);

  useEffect(() => {
    if (!isSpeaking) return;
    window.clearTimeout(startTimer.current);
    window.clearTimeout(readTimer.current);
    const id = window.setTimeout(() => setReading(false), 0);
    return () => window.clearTimeout(id);
  }, [isSpeaking]);

  const videoPlaying = isSpeaking || (reading && !isTyping);

  const { openFor, setOpenFor, startLongPress, cancelLongPress, consumeLongPress } =
    useMessageActions();

  useEffect(() => {
    if (atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, atBottom]);

  const lastAssistant = lastAssistantId(messages);
  const openMessage = messages.find((m) => m.id === openFor) ?? null;

  const items = useMemo(
    () =>
      messages.map((message, index) => {
        const label = dayLabel(message.createdAt);
        const previousLabel = index > 0 ? dayLabel(messages[index - 1].createdAt) : null;
        return { message, divider: label && label !== previousLabel ? label : null };
      }),
    [messages]
  );

  function actionsFor(message: ChatMessage): MessageAction[] {
    const labels = messageActionsFor(message, {
      isLastAssistant: message.id === lastAssistant,
      isTyping,
      canSpeak,
    });

    return labels.map((label): MessageAction => {
      if (label === "Salin teks") {
        return { label, onClick: () => onCopyMessage(message.content) };
      }
      if (label === "Bacakan") {
        return { label, onClick: () => onSpeakMessage(message.content) };
      }
      if (label === "Ulangi balasan") {
        return { label, onClick: onRegenerate };
      }
      return { label, danger: true, onClick: () => onDeleteMessage(message.id) };
    });
  }

  return (
    <div
      className={`chat-wallpaper flex h-full min-h-0 flex-1 flex-col ${backdrop.className}`}
      style={backdrop.style}
    >
      {chatVideo && chatVideoFull && (
        <ChatVideoBackground
          videoKey={chatVideo.videoKey}
          posterUrl={chatVideo.posterUrl}
          dim={0.12}
          playing={videoPlaying}
          restartOnPlay
        />
      )}

      {/* Header — kaca, supaya latar chat tetap terlihat sampai status bar */}
      <div className="top-bar z-10 flex items-center gap-2 px-2 pb-2.5 pt-[max(0.625rem,var(--safe-top))] sm:px-4">
        <button
          onClick={onBack}
          className="shrink-0 p-[5px] text-ink-soft transition active:opacity-50 md:hidden"
          aria-label="Kembali ke daftar chat"
        >
          <BackIcon className="h-[30px] w-[30px]" />
        </button>

        <button
          onClick={onOpenProfile}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          title="Lihat profil karakter"
        >
          <Avatar name={character.name} src={character.avatarUrl} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{character.name}</p>
            <p className={`truncate text-xs ${isTyping || isSpeaking ? "text-ink" : "text-ink-soft"}`}>
              {isTyping
                ? "sedang mengetik..."
                : isSpeaking
                  ? "sedang berbicara..."
                  : character.shortBio || "online"}
            </p>
          </div>
        </button>

        {isSpeaking && (
          <button
            onClick={onStopSpeaking}
            className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink ring-1 ring-line transition hover:bg-line/60"
            title="Hentikan suara"
            aria-label="Hentikan suara"
          >
            <SpeakerOffIcon className="h-3.5 w-3.5" />
            <span>Hentikan</span>
          </button>
        )}

        <button
          onClick={onOpenVoice}
          className="relative shrink-0 rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          title="Pengaturan Suara"
          aria-label="Pengaturan Suara"
        >
          <SpeakerIcon className="h-5 w-5" />
          {voiceEnabled && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ink" />
          )}
        </button>
      </div>

      {chatVideo && !chatVideoFull && (
        <div className="px-3 pt-3 sm:px-4">
          <div className="mx-auto w-full max-w-lg">
            <ChatVideoPanel
              videoKey={chatVideo.videoKey}
              posterUrl={chatVideo.posterUrl}
              dim={0.05}
              name={character.name}
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
        }}
        className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4"
      >
        <div className="mx-auto w-full max-w-3xl">
          {items.map(({ message: m, divider }) => (
            <div key={m.id}>
              {divider && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-lg bg-surface/85 px-2.5 py-1 text-[11px] font-medium text-ink-soft shadow-xs ring-1 ring-line/60 backdrop-blur">
                    {divider}
                  </span>
                </div>
              )}

              <div
                className={`group mb-1.5 flex items-end gap-1 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "user" && !m.pending && (
                  <button
                    type="button"
                    onClick={() => setOpenFor(m.id)}
                    aria-label="Menu pesan"
                    className="mb-1 hidden rounded-full p-1 text-muted opacity-0 transition hover:bg-surface-2 hover:text-ink group-hover:opacity-100 md:inline-flex"
                  >
                    <span className="px-1 text-xs leading-none">•••</span>
                  </button>
                )}

                <div
                  onTouchStart={() => startLongPress(m.id)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setOpenFor(m.id);
                  }}
                  onClick={(e) => {
                    if (consumeLongPress()) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  className={`bubble-in relative max-w-[85%] cursor-default rounded-2xl px-3 py-2 text-sm shadow-xs max-md:select-none sm:max-w-[75%] ${
                    m.role === "user"
                      ? "rounded-br-sm bg-bubble-out text-bubble-out-ink"
                      : "rounded-bl-sm bg-bubble-in text-bubble-in-ink"
                  } ${m.pending ? "opacity-60" : ""}`}
                  style={bubblePaint(bubbleStyle, m.role === "user" ? "out" : "in")}
                >
                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="lampiran foto"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (consumeLongPress()) return;
                        onImageClick(m.imageUrl!);
                      }}
                      className="mb-1.5 max-h-64 w-full cursor-pointer rounded-lg object-cover transition hover:opacity-90"
                    />
                  )}
                  {m.content && (
                    <p
                      className="whitespace-pre-wrap break-words"
                      style={bubbleInk(bubbleStyle, m.role === "user" ? "out" : "in")}
                    >
                      {m.content}
                    </p>
                  )}
                  <span
                    className={`float-right ml-2 mt-1 flex translate-y-0.5 select-none items-center gap-1 text-[11px] ${
                      (m.role === "user" ? bubbleStyle.textColorOut : bubbleStyle.textColorIn)
                        ? "opacity-75"
                        : "text-ink-soft/80"
                    }`}
                    style={bubbleInk(bubbleStyle, m.role === "user" ? "out" : "in")}
                  >
                    {formatTime(m.createdAt)}
                    {m.role === "user" && <Ticks pending={m.pending} />}
                  </span>
                </div>

                {m.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => setOpenFor(m.id)}
                    aria-label="Menu pesan"
                    className="mb-1 hidden rounded-full p-1 text-muted opacity-0 transition hover:bg-surface-2 hover:text-ink group-hover:opacity-100 md:inline-flex"
                  >
                    <span className="px-1 text-xs leading-none">•••</span>
                  </button>
                )}
              </div>
            </div>
          ))}

          {isTyping && <TypingBubble bubble={bubbleStyle} />}
        </div>
      </div>

      {openMessage && (
        <MessageActionSheet
          actions={actionsFor(openMessage)}
          onClose={() => setOpenFor(null)}
        />
      )}
    </div>
  );
}
