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
import { inferEmotionFromIndonesianText, type CallEmotion } from "@/lib/callEmotion";
import {
  isUsingCallClipsInMeetup,
  listUniqueMeetupCallClips,
  resolveActiveCallClip,
  type CallVisualPhase,
} from "@/lib/characterMedia";
import { chatBackgroundProps, type ChatBackground } from "@/lib/chatBackground";
import {
  getDailyStatus,
  getWibAmbient,
  getWibPeriod,
} from "@/lib/dailyPresence";
import { ensureMediaUrl } from "@/lib/mediaClient";
import { getIsDarkSnapshot, subscribeTheme } from "@/lib/theme";
import { useIsAudibleSpeaking, useSpeakingMessageId } from "@/lib/voice";
import { Avatar } from "./Avatar";
import { VoiceNoteBubble } from "./VoiceNoteBubble";
import {
  CallVideoStage,
  ChatCallStagePanel,
  ChatVideoBackground,
  ChatVideoPanel,
} from "./ChatVideo";
import {
  BackIcon,
  CheckIcon,
  ChevronDownIcon,
  DoubleCheckIcon,
  EyeIcon,
  EyeOffIcon,
  NotesBoardIcon,
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
  visualMode = "chat",
  sceneLabel,
  showBackOnDesktop = false,
  composer,
  composerVisible = true,
  onScreenTap,
  onToggleHideChat,
  onBack,
  backLabel = "Kembali ke daftar chat",
  onOpenProfile,
  onOpenVoice,
  onOpenNotes,
  activeNotesCount = 0,
  hasDueTodayNote = false,
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
  /** Chat biasa hanya memakai tema; Tatap Muka juga menampilkan video/ekspresi karakter. */
  visualMode?: "chat" | "meetup";
  /** Status adegan yang ditampilkan di header, misalnya kehadiran langsung saat MeetUp. */
  sceneLabel?: string;
  /** Tampilkan tombol kembali juga di desktop saat tidak ada daftar percakapan di samping. */
  showBackOnDesktop?: boolean;
  /** Latar khusus mode yang sedang dibuka; `default` memakai pola bawaan tema. */
  background?: ChatBackground;
  /** Gaya gelembung pesan (khusus karakter atau bawaan akun). */
  bubble?: BubbleStyle;
  /** Kolom ketik di bagian bawah ruang chat (menyatu di atas latar/video penuh). */
  composer?: ReactNode;
  /** Apakah kolom ketik sedang ditampilkan (pada mode hide muncul saat layar disentuh). */
  composerVisible?: boolean;
  /** Ketukan di layar bersih (dipakai pada mode hide untuk memunculkan/menyembunyikan komposer). */
  onScreenTap?: () => void;
  /** Mengubah visibilitas pesan, khusus mode Tatap Muka. */
  onToggleHideChat?: () => void;
  onBack: () => void;
  backLabel?: string;
  onOpenProfile: () => void;
  onOpenVoice: () => void;
  onOpenNotes?: () => void;
  activeNotesCount?: number;
  hasDueTodayNote?: boolean;
  onVideoCall?: () => void;
  onAudioCall?: () => void;
  onImageClick: (url: string) => void;
  onCopyMessage: (text: string) => void;
  onSpeakMessage: (
    text: string,
    messageId?: string,
    role?: "user" | "assistant"
  ) => void;
  onStopSpeaking: () => void;
  onDeleteMessage: (id: string) => void;
  onRegenerate: () => void;
}) {
  const bubbleStyle = bubble ?? DEFAULT_BUBBLE_STYLE;
  const hideMessages = visualMode === "meetup" && Boolean(bubbleStyle.hideMessages);
  const canToggleHideMessages = visualMode === "meetup" && Boolean(onToggleHideChat);
  const minimalBars = Boolean(bubbleStyle.minimalBars);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const isDark = useSyncExternalStore(subscribeTheme, getIsDarkSnapshot, () => false);
  const backdrop = chatBackgroundProps(background, isDark);

  useEffect(() => {
    const root = rootRef.current;
    const composerElement = composerRef.current;
    if (!root || !composerElement || typeof ResizeObserver === "undefined") return;

    const updateComposerHeight = () => {
      const scroller = scrollRef.current;
      const wasAtBottom =
        !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
      root.style.setProperty(
        "--chat-composer-height",
        `${composerElement.getBoundingClientRect().height}px`
      );
      if (wasAtBottom && scroller) {
        requestAnimationFrame(() => {
          scroller.scrollTop = scroller.scrollHeight;
        });
      }
    };
    updateComposerHeight();

    const observer = new ResizeObserver(updateComposerHeight);
    observer.observe(composerElement);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--chat-composer-height");
    };
  }, []);

  // Aktivitas harian mengikuti jam WIB — diperbarui tiap menit & saat tab kembali aktif.
  const [wibNow, setWibNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setWibNow(new Date());
    const id = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  const wibPeriod = useMemo(() => getWibPeriod(wibNow), [wibNow]);
  const wibAmbient = useMemo(() => getWibAmbient(wibPeriod, isDark), [wibPeriod, isDark]);
  const presenceLine = useMemo(
    () =>
      getDailyStatus(
        {
          id: character.id,
          name: character.name,
          shortBio: character.shortBio,
          personality: (character as unknown as { personality?: string }).personality ?? "",
          bible: (character as unknown as { bible?: string }).bible ?? "",
        },
        wibNow
      ),
    [character.id, character.name, character.shortBio, wibNow]
  );
  const chatMedia = visualMode === "meetup" ? character.media : null;
  const useMeetupExpressions = isUsingCallClipsInMeetup(chatMedia);
  const chatCallClips = useMemo(
    () => (useMeetupExpressions ? listUniqueMeetupCallClips(chatMedia) : []),
    [chatMedia, useMeetupExpressions]
  );
  const callZoom = Math.min(2, Math.max(1, (chatMedia?.callVideoZoom ?? 100) / 100));
  const chatVideo = chatMedia?.chatVideoKey
    ? { videoKey: chatMedia.chatVideoKey, posterUrl: chatMedia.chatVideoPosterUrl }
    : null;
  const hasChatVisual = useMeetupExpressions ? chatCallClips.length > 0 : Boolean(chatVideo);
  const chatVideoFull = Boolean(
    hasChatVisual && ((chatMedia?.chatVideoLayout ?? "tile") === "full" || hideMessages)
  );

  // Siapkan klip dasar dan mendengarkan lebih dulu untuk ekspresi di Tatap Muka.
  useEffect(() => {
    if (!useMeetupExpressions) return;
    const listenKey = chatMedia?.callClips?.listening?.key;
    const idleKey = chatMedia?.callVideoKey;
    if (listenKey) ensureMediaUrl(listenKey);
    if (idleKey) ensureMediaUrl(idleKey);
  }, [
    useMeetupExpressions,
    chatMedia?.callClips?.listening?.key,
    chatMedia?.callVideoKey,
  ]);

  const [reading, setReading] = useState(false);
  const readTimer = useRef(0);
  const startTimer = useRef(0);
  const wasTyping = useRef(false);

  const [composingState, setComposingState] = useState<{
    active: boolean;
    messageCount: number;
  }>({ active: false, messageCount: 0 });
  const composingTimerRef = useRef(0);

  const [manualSpeakOverride, setManualSpeakOverride] = useState<{
    emotion: CallEmotion;
    messageCount: number;
  } | null>(null);

  useEffect(() => () => window.clearTimeout(composingTimerRef.current), []);

  function handleComposerActivity(target: EventTarget | null) {
    window.clearTimeout(composingTimerRef.current);
    if (
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLInputElement
    ) {
      if (!target.value.trim()) {
        setComposingState({ active: false, messageCount: messages.length });
        return;
      }
    }
    setComposingState({ active: true, messageCount: messages.length });
    composingTimerRef.current = window.setTimeout(() => {
      setComposingState((prev) => ({ ...prev, active: false }));
    }, 3500);
  }

  function clearComposerActivity() {
    window.clearTimeout(composingTimerRef.current);
    setComposingState({ active: false, messageCount: messages.length });
  }

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
  const speakingMessageId = useSpeakingMessageId();
  const videoPlaying = audibleSpeaking || (!isSpeaking && reading && !isTyping);

  const latestAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  const activeEmotion: CallEmotion = useMemo(() => {
    if (
      isSpeaking &&
      manualSpeakOverride &&
      manualSpeakOverride.messageCount === messages.length
    ) {
      return manualSpeakOverride.emotion;
    }
    if (!latestAssistant) return "normal";
    return (
      latestAssistant.emotion ??
      inferEmotionFromIndonesianText(latestAssistant.content)
    );
  }, [isSpeaking, latestAssistant, manualSpeakOverride, messages.length]);

  const userComposing =
    composingState.active && composingState.messageCount === messages.length;

  const chatStagePhase: CallVisualPhase = useMemo(() => {
    if (audibleSpeaking) {
      return { kind: "speaking", emotion: activeEmotion };
    }
    if (!isSpeaking && reading && !isTyping) {
      return { kind: "speaking", emotion: activeEmotion };
    }
    if (isTyping || (isSpeaking && !audibleSpeaking)) {
      return { kind: "thinking" };
    }
    if (userComposing) {
      return { kind: "listening" };
    }
    return { kind: "idle" };
  }, [activeEmotion, audibleSpeaking, isSpeaking, isTyping, reading, userComposing]);

  const activeChatCallClip = useMemo(
    () => (useMeetupExpressions ? resolveActiveCallClip(chatMedia, chatStagePhase) : null),
    [chatMedia, chatStagePhase, useMeetupExpressions]
  );

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
    const isSharedContact =
      Boolean(character.threadKind) && character.threadKind !== "owned";
    const rawLabels = messageActionsFor(message, {
      isLastAssistant: message.id === lastAssistant,
      isTyping,
      canSpeak,
    });
    const labels = isSharedContact
      ? rawLabels.filter((l) => l === "Salin teks" || l === "Bacakan")
      : rawLabels;

    return labels.map((label): MessageAction => {
      if (label === "Salin teks") {
        return { label, onClick: () => onCopyMessage(message.content) };
      }
      if (label === "Bacakan") {
        return {
          label,
          onClick: () => {
            const em =
              message.emotion ?? inferEmotionFromIndonesianText(message.content);
            setManualSpeakOverride({
              emotion: em,
              messageCount: messages.length,
            });
            onSpeakMessage(message.content, message.id, message.role);
          },
        };
      }
      if (label === "Ulangi balasan") {
        return { label, onClick: onRegenerate };
      }
      return { label, danger: true, onClick: () => onDeleteMessage(message.id) };
    });
  }

  return (
    <div
      ref={rootRef}
      onClick={onScreenTap}
      className={`chat-wallpaper flex h-full min-h-0 flex-1 flex-col ${backdrop.className}`}
      style={backdrop.style}
    >
      {wibAmbient.opacity > 0 && !chatVideoFull && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 0,
            background: wibAmbient.overlay,
            opacity: wibAmbient.opacity,
            transition: "opacity 900ms ease, background 900ms ease",
          }}
        />
      )}

      {chatVideoFull &&
        (useMeetupExpressions ? (
          <CallVideoStage
            clips={chatCallClips}
            activeKey={activeChatCallClip?.key ?? null}
            playing
            dim={hideMessages ? 0.06 : 0.12}
            zoom={callZoom}
          />
        ) : (
          chatVideo && (
            <ChatVideoBackground
              videoKey={chatVideo.videoKey}
              posterUrl={chatVideo.posterUrl}
              dim={hideMessages ? 0.06 : 0.12}
              playing={videoPlaying}
              restartOnPlay
            />
          )
        ))}

      {/* Header — ikut tersembunyi penuh saat mode hide aktif */}
      {minimalBars ? (
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2.5 pb-2 pt-[max(0.625rem,var(--safe-top))] transition-opacity duration-200 sm:px-4 ${
            visualMode === "meetup" ? "bg-transparent" : "bg-surface/55 backdrop-blur-sm"
          } ${
            hideMessages ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <button
            onClick={onBack}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition active:scale-95 active:opacity-70 ${
              visualMode === "meetup" ? "bg-surface/45 ring-1 ring-white/40 backdrop-blur-sm" : "bg-surface/45 backdrop-blur-md"
            } ${showBackOnDesktop ? "" : "md:hidden"}`}
            aria-label={backLabel}
          >
            <BackIcon className="h-6 w-6" />
          </button>

          <div className="min-w-0 flex-1">
            <button
              onClick={onOpenProfile}
              className={`inline-flex h-[42px] max-w-full items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 text-left transition active:scale-[0.98] active:opacity-80 ${
                visualMode === "meetup"
                  ? "bg-surface/80 hover:bg-surface/85 dark:bg-surface/70 dark:hover:bg-surface/75 backdrop-blur-sm"
                  : "bg-surface/55 backdrop-blur-md hover:bg-surface/65"
              }`}
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
                  title={
                    isTyping || isSpeaking || sceneLabel
                      ? undefined
                      : `${presenceLine} · ${wibAmbient.label} WIB`
                  }
                >
                  {isTyping
                    ? "sedang mengetik..."
                    : isSpeaking
                      ? "sedang berbicara..."
                      : sceneLabel ?? presenceLine}
                </p>
              </div>
            </button>
          </div>

          {isSpeaking && (
            <button
              onClick={onStopSpeaking}
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition active:scale-95 active:opacity-70 ${
                visualMode === "meetup"
                  ? "bg-surface/35 hover:bg-surface/45"
                  : "bg-surface/45 backdrop-blur-md hover:bg-surface/65"
              }`}
              title="Hentikan suara"
              aria-label="Hentikan suara"
            >
              <SpeakerOffIcon className="h-4.5 w-4.5" />
            </button>
          )}

          <button
            onClick={onOpenVoice}
            className={`relative hidden h-10 w-10 shrink-0 place-items-center rounded-full text-ink transition sm:grid ${
              visualMode === "meetup"
                ? "bg-surface/35 hover:bg-surface/45"
                : "bg-surface/45 backdrop-blur-md hover:bg-surface/65"
            }`}
            title="Pengaturan Suara"
            aria-label="Pengaturan Suara"
          >
            <SpeakerIcon className="h-5 w-5" />
            {voiceEnabled && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-ink" />
            )}
          </button>

          {(onVideoCall || onAudioCall) && (
            <div className={`flex shrink-0 items-center gap-1 rounded-full bg-surface/45 p-1 ring-1 ring-white/40 backdrop-blur-md ${
              minimalBars ? "h-[42px]" : "h-10"
            }`}>
              {onVideoCall && (
                <button
                  type="button"
                  onClick={onVideoCall}
                  className={`grid ${minimalBars ? "h-[34px] w-[34px]" : "h-8 w-8"} place-items-center rounded-full text-ink transition hover:bg-surface/20 active:scale-95 active:opacity-70`}
                  aria-label={`Video call dengan ${character.name}`}
                  title="Video call"
                >
                  <VideoCallIcon className="h-7 w-7" />
                </button>
              )}

              {onAudioCall && (
                <button
                  type="button"
                  onClick={onAudioCall}
                  className={`grid ${minimalBars ? "h-[34px] w-[34px]" : "h-8 w-8"} place-items-center rounded-full text-ink transition hover:bg-surface/20 active:scale-95 active:opacity-70`}
                  aria-label={`Panggilan suara dengan ${character.name}`}
                  title="Panggilan suara"
                >
                  <PhoneCallIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2 pb-2.5 pt-[max(0.625rem,var(--safe-top))] transition-opacity duration-200 sm:px-4 ${
            visualMode === "meetup" ? "bg-transparent" : "bg-surface/55 backdrop-blur-sm"
          } ${
            hideMessages ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <button
            onClick={onBack}
            className={`shrink-0 p-[5px] transition active:opacity-50 ${
              visualMode === "meetup"
                ? "rounded-full bg-surface/45 text-ink ring-1 ring-white/40 backdrop-blur-sm"
                : "text-ink-soft"
            } ${showBackOnDesktop ? "" : "md:hidden"}`}
            aria-label={backLabel}
          >
            <BackIcon className="h-[30px] w-[30px]" />
          </button>

          <button
            onClick={onOpenProfile}
            className="flex min-w-0 flex-1 items-center text-left"
            title="Lihat profil karakter"
          >
            <div
              className={`inline-flex min-w-0 max-w-full items-center gap-3 ${
                visualMode === "meetup"
                  ? "rounded-full bg-surface/80 py-1 pl-1 pr-3.5 dark:bg-surface/70 backdrop-blur-sm"
                  : ""
              }`}
            >
              <Avatar name={character.name} src={character.avatarUrl} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{character.name}</p>
                <p
                  className={`truncate text-xs ${isTyping || isSpeaking ? "text-ink" : "text-ink-soft"}`}
                  title={
                    isTyping || isSpeaking || sceneLabel
                      ? undefined
                      : `${presenceLine} · ${wibAmbient.label} WIB`
                  }
                >
                  {isTyping
                    ? "sedang mengetik..."
                    : isSpeaking
                      ? "sedang berbicara..."
                      : sceneLabel ?? presenceLine}
                </p>
              </div>
            </div>
          </button>

          {isSpeaking && (
            <button
              onClick={onStopSpeaking}
              className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-ink transition ${
                visualMode === "meetup"
                  ? "bg-surface/35 hover:bg-surface/45"
                  : "bg-surface/55 backdrop-blur-md hover:bg-surface/70"
              }`}
              title="Hentikan suara"
              aria-label="Hentikan suara"
            >
              <SpeakerOffIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Hentikan</span>
            </button>
          )}

          <button
            onClick={onOpenVoice}
            className={`relative hidden shrink-0 rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink sm:inline-flex ${
              visualMode === "meetup" ? "bg-surface/35" : ""
            }`}
            title="Pengaturan Suara"
            aria-label="Pengaturan Suara"
          >
            <SpeakerIcon className="h-5 w-5" />
            {voiceEnabled && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-ink" />
            )}
          </button>

          {(onVideoCall || onAudioCall) && (
            <div className={`flex shrink-0 items-center gap-1 rounded-full bg-surface/45 p-1 ring-1 ring-white/40 backdrop-blur-md ${
              minimalBars ? "h-[42px]" : "h-10"
            }`}>
              {onVideoCall && (
                <button
                  type="button"
                  onClick={onVideoCall}
                  className={`grid ${minimalBars ? "h-[34px] w-[34px]" : "h-8 w-8"} place-items-center rounded-full text-ink transition hover:bg-surface/20 active:scale-95 active:opacity-70`}
                  aria-label={`Video call dengan ${character.name}`}
                  title="Video call"
                >
                  <VideoCallIcon className="h-7 w-7" />
                </button>
              )}

              {onAudioCall && (
                <button
                  type="button"
                  onClick={onAudioCall}
                  className={`grid ${minimalBars ? "h-[34px] w-[34px]" : "h-8 w-8"} place-items-center rounded-full text-ink transition hover:bg-surface/20 active:scale-95 active:opacity-70`}
                  aria-label={`Panggilan suara dengan ${character.name}`}
                  title="Panggilan suara"
                >
                  <PhoneCallIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!hideMessages && hasChatVisual && !chatVideoFull && (
        <div
          className="px-3 sm:px-4"
          style={{ paddingTop: "calc(max(0.625rem, var(--safe-top)) + 3.875rem)" }}
        >
          <div className="mx-auto w-full max-w-lg">
            {useMeetupExpressions ? (
              <ChatCallStagePanel
                clips={chatCallClips}
                activeKey={activeChatCallClip?.key ?? null}
                dim={0.05}
                name={character.name}
                zoom={callZoom}
              />
            ) : (
              chatVideo && (
                <ChatVideoPanel
                  videoKey={chatVideo.videoKey}
                  posterUrl={chatVideo.posterUrl}
                  dim={0.05}
                  name={character.name}
                />
              )
            )}
          </div>
        </div>
      )}

      {/* Area chat */}
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
            className={`flex-1 overflow-y-auto px-3 sm:px-4 ${
              minimalBars
                ? "[-webkit-mask-image:linear-gradient(to_bottom,transparent,black_16px)] [mask-image:linear-gradient(to_bottom,transparent,black_16px)]"
                : ""
            }`}
            style={{
              paddingTop:
                hasChatVisual && !chatVideoFull
                  ? "0.75rem"
                  : "calc(max(0.625rem, var(--safe-top)) + 3.875rem)",
              paddingBottom: `calc(var(--chat-composer-height, 4.5rem) + ${
                !atBottom
                  ? canToggleHideMessages
                    ? "6rem"
                    : "3rem"
                  : canToggleHideMessages
                    ? "3rem"
                    : "0.75rem"
              })`,
            }}
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
                      {m.isCallError && (
                        <span className="mb-0.5 block text-[10.5px] font-semibold text-amber-600 dark:text-amber-400">
                          Info kuota API
                        </span>
                      )}
                      {character.threadKind === "owner_contact" &&
                        m.senderKind === "character_ai" && (
                          <span className="mb-0.5 block text-[10.5px] font-semibold opacity-70">
                            🤖 Dijawab AI
                          </span>
                        )}
                      {character.threadKind === "owner_contact" &&
                        m.senderKind === "owner_manual" && (
                          <span className="mb-0.5 block text-[10.5px] font-semibold opacity-70">
                            ✍️ Balasan Manual
                          </span>
                        )}
                      {character.threadKind === "guest_contact" &&
                        m.senderKind === "owner_manual" && (
                          <span className="mb-0.5 block text-[10.5px] font-semibold opacity-70">
                            💬 Balasan langsung
                          </span>
                        )}
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
                      {m.isVoiceNote && m.content ? (
                        <VoiceNoteBubble
                          messageId={m.id}
                          text={m.content}
                          isActiveMessage={speakingMessageId === m.id}
                          isAudible={audibleSpeaking}
                          textStyle={bubbleInk(
                            bubbleStyle,
                            m.role === "user" ? "out" : "in"
                          )}
                          timeLabel={formatTime(m.createdAt)}
                          ticksNode={
                            m.role === "user" ? (
                              <Ticks pending={m.pending} />
                            ) : undefined
                          }
                          onTogglePlay={() => {
                            if (speakingMessageId === m.id) {
                              onStopSpeaking();
                              return;
                            }
                            if (m.role === "assistant") {
                              const em =
                                m.emotion ??
                                inferEmotionFromIndonesianText(m.content);
                              setManualSpeakOverride({
                                emotion: em,
                                messageCount: messages.length,
                              });
                            }
                            onSpeakMessage(m.content, m.id, m.role);
                          }}
                        />
                      ) : (
                        <>
                          {m.content && (
                            <p
                              className="whitespace-pre-wrap break-words"
                              style={bubbleInk(
                                bubbleStyle,
                                m.role === "user" ? "out" : "in"
                              )}
                            >
                              {m.content}
                            </p>
                          )}
                          <span
                            className={`float-right ml-2 mt-1 flex translate-y-0.5 select-none items-center gap-1 text-[12px] ${
                              (
                                m.role === "user"
                                  ? bubbleStyle.textColorOut
                                  : bubbleStyle.textColorIn
                              )
                                ? "opacity-75"
                                : "text-ink-soft/80"
                            }`}
                            style={bubbleInk(
                              bubbleStyle,
                              m.role === "user" ? "out" : "in"
                            )}
                          >
                            {formatTime(m.createdAt)}
                            {m.role === "user" && <Ticks pending={m.pending} />}
                          </span>
                        </>
                      )}
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

        {!hideMessages && !atBottom && onOpenNotes && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 px-3 sm:px-4"
            style={{
              top:
                hasChatVisual && !chatVideoFull
                  ? "0.5rem"
                  : "calc(max(0.625rem, var(--safe-top)) + 3.625rem)",
            }}
          >
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <button
                type="button"
                onClick={onOpenNotes}
                aria-label={`Catatan Kita bersama ${character.name}`}
                title="Catatan & Janji Kita"
                className="pointer-events-auto relative grid h-8 w-8 place-items-center rounded-full bg-surface/45 text-ink shadow-md backdrop-blur-md transition hover:bg-surface/60 active:scale-95"
              >
                <NotesBoardIcon className="h-4 w-4" />
                {activeNotesCount > 0 && (
                  <span
                    className={`absolute right-2 top-2 h-2 w-2 rounded-full ${
                      hasDueTodayNote ? "bg-amber-500" : "bg-ink/80"
                    }`}
                  />
                )}
              </button>
            </div>
          </div>
        )}
        {!hideMessages && !atBottom && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 px-3 sm:px-4"
            style={{
              bottom: `calc(var(--chat-composer-height, 4.5rem) + ${
                canToggleHideMessages ? "3.5rem" : "0.5rem"
              })`,
            }}
          >
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <button
                type="button"
                onClick={() => {
                  const el = scrollRef.current;
                  el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                }}
                aria-label="Kembali ke pesan terbaru"
                title="Pesan terbaru"
                className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-surface/45 text-ink shadow-md backdrop-blur-md transition hover:bg-surface/60 active:scale-95"
              >
                <ChevronDownIcon className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
        {canToggleHideMessages && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-20 px-3 transition-opacity sm:px-4 ${
              composerVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            style={{ bottom: "calc(var(--chat-composer-height, 4.5rem) + 0.5rem)" }}
          >
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleHideChat?.();
                }}
                disabled={!composerVisible}
                aria-label={hideMessages ? "Tampilkan pesan" : "Sembunyikan pesan"}
                aria-pressed={hideMessages}
                title={hideMessages ? "Tampilkan pesan" : "Sembunyikan pesan"}
                className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-surface/45 text-ink shadow-md backdrop-blur-md transition hover:bg-surface/60 active:scale-95 disabled:pointer-events-none"
              >
                {hideMessages ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {composer && (
        <div
          ref={composerRef}
          onClick={(e) => e.stopPropagation()}
          onInputCapture={(e) => handleComposerActivity(e.target)}
          onKeyDownCapture={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              clearComposerActivity();
            }
          }}
          className={`absolute inset-x-0 bottom-0 z-30 transition-all duration-200 ${
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
