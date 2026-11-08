"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Image from "next/image";
import { isSupportedDocumentFile } from "@/lib/chatAttachmentTypes";
import type {
  BrainstormMessage,
  BrainstormRoomMode,
  CharacterSummary,
} from "@/types/chat";
import type { BubbleStyle } from "@/lib/bubbleStyle";
import { bubblePaint, bubbleInk, DEFAULT_BUBBLE_STYLE } from "@/lib/bubbleStyle";
import { Avatar } from "./Avatar";
import { BackIcon, ChevronDownIcon, PaperclipIcon, PlusIcon, SendIcon, TrashIcon, SpeakerIcon, XIcon } from "./icons";
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
  return `${d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  })} WIB`;
}

export function BrainstormRoomView({
  roomTitle,
  mode,
  sceneCanonical,
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
  onImageClick,
  onCopy,
  onSpeak,
  onStopSpeaking,
  canSpeak,
}: {
  roomTitle: string;
  mode: BrainstormRoomMode;
  sceneCanonical: boolean;
  members: { characterId: string; name: string; avatarUrl: string | null; shortBio: string }[];
  messages: BrainstormMessage[];
  isTyping: boolean;
  typingLabel?: string | null;
  bubble?: BubbleStyle | null;
  characters: CharacterSummary[];
  onBack: () => void;
  onClear: () => void;
  onDeleteRoom: () => void;
  onSend: (text: string, attachmentFile: File | null) => Promise<string | null>;
  onImageClick: (url: string) => void;
  onCopy: (text: string) => void;
  onSpeak: (text: string, messageId?: string, characterId?: string | null) => void;
  onStopSpeaking: () => void;
  canSpeak: boolean;
}) {
  const bubbleStyle = bubble ?? DEFAULT_BUBBLE_STYLE;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [input, setInput] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [multiline, setMultiline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speakingId = useSpeakingMessageId();
  const audible = useIsAudibleSpeaking();

  const memberMap = useMemo(() => {
    const m = new Map<string, { name: string; avatarUrl: string | null; shortBio: string }>();
    for (const mem of members) m.set(mem.characterId, mem);
    return m;
  }, [members]);

  // Ikuti pesan terbaru selama pengguna memang berada di bagian bawah.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping, atBottom]);

  useEffect(() => {
    if (!imagePreview) return;
    return () => URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  function syncInputSize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
    const styles = window.getComputedStyle(element);
    const lineHeight = parseFloat(styles.lineHeight) || 24;
    const padding =
      (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    setMultiline(element.scrollHeight - padding > lineHeight * 1.3);
  }

  function clearAttachment() {
    setAttachmentFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSend() {
    const t = input.trim();
    if ((!t && !attachmentFile) || isTyping || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const error = await onSend(t, attachmentFile);
      if (error) {
        setSendError(error);
        return;
      }
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        setMultiline(false);
      }
      clearAttachment();
    } catch {
      setSendError("Gagal mengirim. Coba lagi.");
    } finally {
      setSending(false);
    }
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
              ? typingLabel || (mode === "meetup" ? "sedang berbicara..." : mode === "scene" ? "sedang bermain adegan..." : "sedang diskusi...")
              : mode === "meetup"
                ? "Tatap Muka · ruang yang sama"
                : mode === "scene"
                  ? `Reka Adegan · ${sceneCanonical ? "Canon" : "Latihan"}`
                  : "Brainstorm · diskusi bersama"}
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

      {/* Messages */}
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
          }}
          className={`min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 ${
            !atBottom ? "pb-14 sm:pb-14" : ""
          }`}
        >
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {messages.length === 0 && !isTyping && (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-ink">
                  {mode === "meetup"
                    ? "Mulai pertemuan tatap muka"
                    : mode === "scene"
                      ? "Mulai Reka Adegan"
                      : "Mulai diskusi di meja ini"}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                  {mode === "meetup"
                    ? members.length === 1
                      ? `Kamu dan ${members[0].name} berada di ruangan yang sama. Mulai bicara; tidak ada panggilan video atau telepon.`
                      : `Kamu dan ${members.map((m) => m.name).join(", ")} berada di ruangan yang sama. Mereka akan menanggapi bergiliran.`
                    : mode === "scene"
                      ? `${sceneCanonical ? "Adegan ini bagian cerita utama." : "Ini latihan; peristiwa fiksinya bukan canon."} Mulai dengan arahan atau dialog untuk melanjutkan adegan.`
                      : "Tulis topik atau pertanyaan untuk memulai diskusi. Karakter di meja ini akan menanggapi satu per satu dengan gaya masing-masing."}
                </p>
              </div>
            )}
            {messages.map((m) => {
              const isUser = m.role === "user";
              const char = m.characterId ? memberMap.get(m.characterId) : null;
              const parts = splitBubbles(m.content);
              const displayParts =
                parts.length > 0 ? parts : m.imageUrl || m.attachmentName ? [""] : [];
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
                      {displayParts.map((part, pIdx) => (
                        <div
                          key={`${m.id}-${pIdx}`}
                          className={`rounded-2xl px-3 py-2 text-sm shadow-xs ${isUser ? "rounded-br-sm bg-bubble-out text-bubble-out-ink" : "rounded-bl-sm bg-bubble-in text-bubble-in-ink"}`}
                          style={bubblePaint(bubbleStyle, isUser ? "out" : "in")}
                        >
                          {pIdx === 0 && m.imageUrl && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onImageClick(m.imageUrl!);
                              }}
                              aria-label="Buka gambar"
                              className="mb-1 block overflow-hidden rounded-lg"
                            >
                              <Image
                                src={m.imageUrl}
                                alt="Lampiran gambar"
                                width={640}
                                height={480}
                                unoptimized
                                className="max-h-64 max-w-full cursor-zoom-in rounded-lg object-contain"
                              />
                            </button>
                          )}
                          {pIdx === 0 && m.attachmentName && (
                            <div className="mb-1 rounded-lg bg-surface/60 p-2">
                              <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
                                <PaperclipIcon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{m.attachmentName}</span>
                              </div>
                              {m.attachmentText && (
                                <details className="mt-1.5 text-xs">
                                  <summary className="cursor-pointer text-ink-soft hover:text-ink">
                                    Lihat teks yang dibaca
                                  </summary>
                                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface/70 p-2 font-sans text-[11px]">
                                    {m.attachmentText}
                                  </pre>
                                </details>
                              )}
                            </div>
                          )}
                          {part && (
                            <p className="whitespace-pre-wrap break-words" style={bubbleInk(bubbleStyle, isUser ? "out" : "in")}>
                              {part}
                            </p>
                          )}
                          {pIdx === displayParts.length - 1 && (
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
                              {isUser && pIdx === 0 && m.content && (
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
        {!atBottom && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 px-3 sm:px-4">
            <div className="mx-auto flex w-full max-w-3xl justify-end">
              <button
                type="button"
                onClick={() => {
                  const el = scrollRef.current;
                  el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                }}
                aria-label="Kembali ke pesan terbaru"
                title="Pesan terbaru"
                className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-surface/90 text-ink shadow-md ring-1 ring-line/70 backdrop-blur-md transition hover:bg-surface active:scale-95"
              >
                <ChevronDownIcon className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="composer-bar bottom-bar shrink-0 px-2.5 py-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.625rem))] sm:px-3 sm:py-2.5">
        <div className="mx-auto w-full max-w-3xl">
          {attachmentFile && (
            <div className="mb-2 flex items-center gap-2">
              <div className="relative">
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt="Pratinjau gambar"
                    width={64}
                    height={64}
                    unoptimized
                    className="h-16 w-16 rounded-lg object-cover ring-1 ring-line"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-lg bg-surface-2 text-ink-soft ring-1 ring-line">
                    <PaperclipIcon className="h-6 w-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={clearAttachment}
                  aria-label="Batalkan lampiran"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-ink shadow ring-1 ring-line"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
              <span className="min-w-0 truncate text-xs text-ink-soft">
                {attachmentFile.name}
              </span>
            </div>
          )}
          {sendError && (
            <p role="alert" className="mb-2 px-1 text-xs text-rose-600 dark:text-rose-400">
              {sendError}
            </p>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                if (file.type.startsWith("image/") || isSupportedDocumentFile(file.name)) {
                  setAttachmentFile(file);
                  setImagePreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
                  setSendError(null);
                } else {
                  clearAttachment();
                  setSendError("Format didukung: gambar, PDF, TXT, MD, CSV, dan JSON.");
                }
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={isTyping || sending}
              aria-label="Lampirkan gambar atau file"
              title="Kirim gambar atau file"
              className="mb-0.5 shrink-0 p-[5px] text-ink-soft transition active:opacity-50 disabled:opacity-50"
            >
              <PlusIcon className="h-[30px] w-[30px]" />
            </button>
            <div className="relative min-w-0 w-full flex-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setSendError(null);
                  syncInputSize(event.currentTarget);
                }}
                placeholder={
                  mode === "meetup"
                    ? "Bicara langsung..."
                    : mode === "scene"
                      ? "Lanjutkan adegan..."
                      : "Tanya di meja ini..."
                }
                rows={1}
                disabled={isTyping || sending}
                autoComplete="off"
                enterKeyHint="send"
                aria-label="Tulis pesan"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                className={`relative top-1 max-h-[120px] w-full resize-none border-none bg-surface/75 px-4 py-2.5 text-base text-ink outline-none ring-1 ring-line/70 transition-[border-radius] duration-150 placeholder:text-muted disabled:opacity-60 sm:text-sm dark:bg-surface/40 dark:ring-line/40 ${
                  multiline ? "rounded-2xl" : "rounded-full"
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={isTyping || sending || (!input.trim() && !attachmentFile)}
              className="mb-0.5 shrink-0 rounded-full bg-surface/75 p-2.5 text-ink ring-1 ring-line/70 transition hover:bg-surface/90 active:scale-95 disabled:opacity-40 dark:bg-surface/40 dark:ring-line/40 dark:hover:bg-surface/60"
              aria-label="Kirim"
              title="Kirim"
            >
              <SendIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
