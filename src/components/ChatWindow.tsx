"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
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
import { useIsAudibleSpeaking } from "@/lib/voice";
import { Avatar } from "./Avatar";
import { ChatVideoBackground, ChatVideoPanel } from "./ChatVideo";
import {
  BackIcon,
  CheckIcon,
  DoubleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  PhoneCallIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  VideoCallIcon,
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
  composer,
  composerVisible = true,
  onScreenTap,
  onBack,
  onOpenProfile,
  onOpenVoice,
  onToggleHideChat,
  onVideoCall,
  onAudioCall,
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
  /** Kolom ketik di bagian bawah ruang chat (menyatu di atas latar/video penuh). */
  composer?: ReactNode;
  /** Apakah kolom ketik sedang ditampilkan (pada mode hide muncul saat layar disentuh). */
  composerVisible?: boolean;
  /** Ketukan di layar bersih (dipakai pada mode hide untuk memunculkan/menyembunyikan komposer). */
  onScreenTap?: () => void;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenVoice: () => void;
  onToggleHideChat?: () => void;
  onVideoCall?: () => void;
  onAudioCall?: () => void;
  onImageClick: (url: string) => void;
  onCopyMessage: (text: string) => void;
  onSpeakMessage: (text: string) => void;
  onStopSpeaking: () => void;
  onDeleteMessage: (id: string) => void;
  onRegenerate: () => void;
}) {
  const bubbleStyle = bubble ?? DEFAULT_BUBBLE_STYLE;
  const hideMessages = Boolean(bubbleStyle.hideMessages);
  const minimalBars = Boolean(bubbleStyle.minimalBars);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const isDark = useSyncExternalStore(subscribeTheme, getIsDarkSnapshot, () => false);
  const backdrop = chatBackgroundProps(background, isDark);
  const chatMedia = character.media;
  const chatVideo = chatMedia?.chatVideoKey
    ? { videoKey: chatMedia.chatVideoKey, posterUrl: chatMedia.chatVideoPosterUrl }
    : null;
  const chatVideoFull = Boolean(
    chatVideo && ((chatMedia?.chatVideoLayout ?? "tile") === "full" || hideMessages)
  );

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

  const audibleSpeaking = useIsAudibleSpeaking();
  const videoPlaying = audibleSpeaking || (!isSpeaking && reading && !isTyping);

  const { openFor, setOpenFor, startLongPress, cancelLongPress, consumeLongPress } =
    useMessageActions();

  useEffect(() => {
    if (!hideMessages && atBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, atBottom, hideMessages]);

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
      onClick={onScreenTap}
      className={`chat-wallpaper flex h-full min-h-0 flex-1 flex-col ${backdrop.className}`}
      style={backdrop.style}
    >
      {chatVideo && chatVideoFull && (
        <ChatVideoBackground
          videoKey={chatVideo.videoKey}
          posterUrl={chatVideo.posterUrl}
          dim={hideMessages ? 0.06 : 0.12}
          playing={videoPlaying}
          restartOnPlay
        />
      )}

      {/* Header — ikut tersembunyi penuh saat mode hide aktif */}
      {minimalBars ? (
        <div
          className={`z-10 flex items-center gap-2 bg-transparent px-2.5 pb-2 pt-[max(0.625rem,var(--safe-top))] transition-opacity duration-200 sm:px-4 ${
            hideMessages ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <button
            onClick={onBack}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface/65 text-ink ring-1 ring-line/65 backdrop-blur-md transition active:scale-95 active:opacity-70 md:hidden"
            aria-label="Kembali ke daftar chat"
          >
            <BackIcon className="h-6 w-6" />
          </button>

          <div className="min-w-0 flex-1">
            <button
              onClick={onOpenProfile}
              className="inline-flex h-[42px] max-w-full items-center gap-2.5 rounded-full bg-surface/75 py-1 pl-1 pr-3.5 text-left ring-1 ring-line/70 backdrop-blur-md transition hover:bg-surface/85 active:scale-[0.98] active:opacity-80"
              aria-label={`Pengaturan ${character.name}`}
              title={`Pengaturan ${character.name}`}
            >
              <Avatar name={character.name} src={character.avatarUrl} size={34} />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold leading-tight text-ink">
                  {character.name}
                </p>
                <p
                  className={`truncate text-[11px] leading-tight ${
                    isTyping || isSpeaking ? "text-ink" : "text-ink/70"
                  }`}
                >
                  {isTyping
                    ? "sedang mengetik..."
                    : isSpeaking
                      ? "sedang berbicara..."
                      : character.shortBio || "online"}
                </p>
              </div>
            </button>
          </div>

          {isSpeaking && (
            <button
              onClick={onStopSpeaking}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface/65 text-ink ring-1 ring-line/65 backdrop-blur-md transition hover:bg-surface/80 active:scale-95 active:opacity-70"
              title="Hentikan suara"
              aria-label="Hentikan suara"
            >
              <SpeakerOffIcon className="h-4.5 w-4.5" />
            </button>
          )}

          <button
            onClick={onOpenVoice}
            className="relative hidden h-10 w-10 shrink-0 place-items-center rounded-full bg-surface/65 text-ink ring-1 ring-line/65 backdrop-blur-md transition hover:bg-surface/80 sm:grid"
            title="Pengaturan Suara"
            aria-label="Pengaturan Suara"
          >
            <SpeakerIcon className="h-5 w-5" />
            {voiceEnabled && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ink" />
            )}
          </button>

          {onVideoCall && (
            <button
              onClick={onVideoCall}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface/65 text-ink ring-1 ring-line/65 backdrop-blur-md transition hover:bg-surface/80 active:scale-95 active:opacity-70"
              aria-label={`Video call dengan ${character.name}`}
              title="Video call"
            >
              <VideoCallIcon className="h-7 w-7" />
            </button>
          )}

          {onAudioCall && (
            <button
              onClick={onAudioCall}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface/65 text-ink ring-1 ring-line/65 backdrop-blur-md transition hover:bg-surface/80 active:scale-95 active:opacity-70"
              aria-label={`Panggilan suara dengan ${character.name}`}
              title="Panggilan suara"
            >
              <PhoneCallIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <div
          className={`top-bar z-10 flex items-center gap-2 px-2 pb-2.5 pt-[max(0.625rem,var(--safe-top))] transition-opacity duration-200 sm:px-4 ${
            hideMessages ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
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
              <span className="hidden sm:inline">Hentikan</span>
            </button>
          )}

          <button
            onClick={onOpenVoice}
            className="relative hidden shrink-0 rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink sm:inline-flex"
            title="Pengaturan Suara"
            aria-label="Pengaturan Suara"
          >
            <SpeakerIcon className="h-5 w-5" />
            {voiceEnabled && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ink" />
            )}
          </button>

          {onVideoCall && (
            <button
              onClick={onVideoCall}
              className="shrink-0 rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink active:opacity-60"
              aria-label={`Video call dengan ${character.name}`}
              title="Video call"
            >
              <VideoCallIcon className="h-8 w-8" />
            </button>
          )}

          {onAudioCall && (
            <button
              onClick={onAudioCall}
              className="shrink-0 rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink active:opacity-60"
              aria-label={`Panggilan suara dengan ${character.name}`}
              title="Panggilan suara"
            >
              <PhoneCallIcon className="h-6 w-6" />
            </button>
          )}
        </div>
      )}

      {!hideMessages && chatVideo && !chatVideoFull && (
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

      {/* Area chat + tombol mengambang sembunyikan chat di atas tombol kirim */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {hideMessages ? (
          <div className="min-h-0 flex-1" aria-hidden="true" />
        ) : (
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
            }}
            className={`flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 ${
              onToggleHideChat ? "pb-12 sm:pb-12" : ""
            } ${
              minimalBars
                ? "[-webkit-mask-image:linear-gradient(to_bottom,transparent,black_16px)] [mask-image:linear-gradient(to_bottom,transparent,black_16px)]"
                : ""
            }`}
          >
            <div className="mx-auto w-full max-w-3xl">
              {items.map(({ message: m, divider }) => (
                <div key={m.id}>
                  {divider && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-surface/85 px-2.5 py-1 text-[12px] font-medium text-ink-soft shadow-xs ring-1 ring-line/60 backdrop-blur">
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
                        className={`float-right ml-2 mt-1 flex translate-y-0.5 select-none items-center gap-1 text-[12px] ${
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
        )}

        {onToggleHideChat && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-2 z-10 px-2.5 transition-all duration-200 sm:px-3 ${
              !hideMessages || composerVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0"
            }`}
          >
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <div className="flex w-10 justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleHideChat();
                  }}
                  aria-pressed={hideMessages}
                  aria-label={hideMessages ? "Tampilkan tulisan chat" : "Sembunyikan tulisan chat"}
                  title={hideMessages ? "Tampilkan tulisan chat" : "Sembunyikan tulisan chat"}
                  className={`${
                    !hideMessages || composerVisible ? "pointer-events-auto" : "pointer-events-none"
                  } grid h-9 w-9 place-items-center rounded-full bg-surface/45 text-ink/70 ring-1 ring-line/50 backdrop-blur-md transition hover:bg-surface/70 hover:text-ink active:scale-95 active:opacity-70`}
                >
                  {hideMessages ? (
                    <EyeOffIcon className="h-[18px] w-[18px]" />
                  ) : (
                    <EyeIcon className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {composer && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`z-10 shrink-0 transition-all duration-200 ${
            composerVisible
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          {composer}
        </div>
      )}

      {!hideMessages && openMessage && (
        <MessageActionSheet
          actions={actionsFor(openMessage)}
          onClose={() => setOpenFor(null)}
        />
      )}
    </div>
  );
}
