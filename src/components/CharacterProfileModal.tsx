"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BUBBLE_STYLE, type BubbleStyle } from "@/lib/bubbleStyle";
import type { CharacterMedia } from "@/lib/characterMedia";
import { DEFAULT_CHAT_BACKGROUND, type ChatBackground } from "@/lib/chatBackground";
import type { CharacterVoiceConfig, TtsAccountSummary } from "@/lib/hdVoice";
import type { VoiceSettings } from "@/lib/voice";
import { genderLabel } from "@/lib/gender";
import type { CharacterDetail } from "@/types/chat";
import type { CharacterStoryFrequency } from "@/lib/characterStoryAuto";
import { Avatar } from "./Avatar";
import { BubbleStyleControls } from "./BubbleStyleControls";
import { CharacterMediaSection } from "./CharacterMediaSection";
import { CharacterMemorySection, type MemoryPatch } from "./CharacterMemorySection";
import { CharacterStoryAutoSection } from "./CharacterStoryAutoSection";
import { CharacterVoiceSection } from "./CharacterVoiceSection";
import { ChatBackgroundPicker } from "./ChatBackgroundPicker";
import { BibleOutlineIcon, PencilIcon, TrashIcon, XIcon } from "./icons";

export function CharacterProfileModal({
  character,
  mode,
  providerLabel,
  hasProvider,
  ttsSummary,
  voiceSettings,
  onClose,
  onEdit,
  onClearChat,
  onDelete,
  onBackgroundChange,
  onBubbleChange,
  onMeetupBackgroundChange,
  onMeetupBubbleChange,
  onVoiceChange,
  onMediaChange,
  onMemoryChange,
  onStoryAutoChange,
  onNotice,
}: {
  character: CharacterDetail;
  mode: "chat" | "meetup";
  providerLabel: string;
  hasProvider: boolean;
  ttsSummary: TtsAccountSummary;
  voiceSettings: VoiceSettings;
  onClose: () => void;
  onEdit: () => void;
  onClearChat: () => void;
  onDelete: () => void;
  onBackgroundChange: (next: ChatBackground) => void;
  onBubbleChange: (next: BubbleStyle) => void;
  onMeetupBackgroundChange: (next: ChatBackground) => void;
  onMeetupBubbleChange: (next: BubbleStyle) => void;
  onVoiceChange: (next: CharacterVoiceConfig | null) => void;
  onMediaChange: (next: CharacterMedia | null) => void;
  onMemoryChange: (next: MemoryPatch) => void;
  onStoryAutoChange: (next: { enabled: boolean; frequency: CharacterStoryFrequency }) => void;
  onNotice?: (msg: string) => void;
}) {
  const [showBible, setShowBible] = useState(false);
  const hasBible = Boolean(character.bible?.trim());
  const characterGenderLabel = genderLabel(character.gender);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fade-in modal-overlay absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,var(--safe-top))] backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="pop-in flex max-h-[min(85dvh,100%)] min-h-0 w-full max-w-md flex-col rounded-3xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Profil ${character.name} · ${mode === "meetup" ? "Tatap Muka" : "Chat"}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#4687fe]/30 dark:border-[#d5b767]/35 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-display text-lg font-bold text-[#205ac4] dark:text-[#e8cf75]">Profil Karakter</h2>
            <span className="shrink-0 rounded-full bg-[#4687fe]/10 dark:bg-[#d5b767]/10 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
              {mode === "meetup" ? "Tatap Muka" : "Chat"}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-[#4687fe]/10 dark:hover:bg-[#d5b767]/10 hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="rounded-full ring-2 ring-[#4687fe]/35 ring-offset-2 ring-offset-surface dark:ring-[#d5b767]/40"><Avatar name={character.name} src={character.avatarUrl} size={104} /></span>
            <h3 className="mt-2 font-display text-xl font-bold text-[#205ac4] dark:text-[#e8cf75]">{character.name}</h3>
            {character.shortBio && <p className="text-sm text-ink-soft">{character.shortBio}</p>}
            {characterGenderLabel && (
              <p className="text-xs text-muted">Jenis kelamin / gender: {characterGenderLabel}</p>
            )}
            {providerLabel && (
              <span className="rounded-full bg-[#4687fe]/10 dark:bg-[#d5b767]/10 px-3 py-1 text-[12px] font-medium text-ink-soft">
                {providerLabel}
              </span>
            )}
          </div>

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
              Tentang karakter
            </h4>
            <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-[#4687fe]/10 dark:bg-[#d5b767]/10 p-3.5 text-sm leading-relaxed text-ink">
              {character.personality}
            </p>
          </div>

          {hasBible && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h4 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
                  <BibleOutlineIcon className="h-4 w-4 text-ink" /> Bible peran
                </h4>
                <button
                  onClick={() => setShowBible((v) => !v)}
                  className="text-[11px] font-medium text-ink-soft underline decoration-dotted hover:text-ink"
                >
                  {showBible ? "Sembunyikan" : "Lihat isi"}
                </button>
              </div>
              <p className="text-[11px] text-muted">
                {character.bible.trim().length.toLocaleString("id-ID")} karakter · dipakai sebagai
                acuan utama setiap balasan.
              </p>
              {showBible && (
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-[#4687fe]/10 dark:bg-[#d5b767]/10 p-3 text-xs leading-relaxed text-ink">
                  {character.bible}
                </pre>
              )}
            </div>
          )}

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
              Ingatan, sapaan &amp; internet
            </h4>
            <CharacterMemorySection
              key={`${character.id}|${character.memoryUpdatedAt ?? ""}`}
              characterId={character.id}
              characterName={character.name}
              memoryEnabled={character.memoryEnabled}
              memorySummary={character.memorySummary}
              memoryUpdatedAt={character.memoryUpdatedAt}
              browsingEnabled={character.browsingEnabled}
              proactiveEnabled={character.proactiveEnabled}
              onChange={onMemoryChange}
              onNotice={onNotice}
            />
            <div className="mt-3">
              <CharacterStoryAutoSection
                characterId={character.id}
                characterName={character.name}
                enabled={character.storyAutoEnabled}
                frequency={character.storyAutoFrequency}
                hasProvider={hasProvider}
                onChange={onStoryAutoChange}
              />
            </div>
          </div>

          {mode === "chat" ? (
            <>
              <div className="mt-5">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
                  Latar Chat
                </h4>
                <ChatBackgroundPicker
                  value={character.chatBackground ?? DEFAULT_CHAT_BACKGROUND}
                  onChange={onBackgroundChange}
                />
              </div>

              <div className="mt-5">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
                  Tampilan Chat
                </h4>
                <BubbleStyleControls
                  mode="chat"
                  value={character.bubbleStyle ?? DEFAULT_BUBBLE_STYLE}
                  onChange={onBubbleChange}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mt-5">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
                  Latar Tatap Muka
                </h4>
                <ChatBackgroundPicker
                  value={character.meetupBackground ?? DEFAULT_CHAT_BACKGROUND}
                  onChange={onMeetupBackgroundChange}
                />
              </div>

              <div className="mt-5">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
                  Tampilan Tatap Muka
                </h4>
                <BubbleStyleControls
                  mode="meetup"
                  value={character.meetupBubbleStyle ?? DEFAULT_BUBBLE_STYLE}
                  onChange={onMeetupBubbleChange}
                />
              </div>

              <div className="mt-5">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
                  Media karakter
                </h4>
                <CharacterMediaSection
                  characterId={character.id}
                  media={character.media}
                  fallbackVoiceSlot={voiceSettings.engine === "hd_male" ? "male" : "female"}
                  onChange={onMediaChange}
                />
              </div>
            </>
          )}

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#205ac4] dark:text-[#e8cf75]">
              Suara karakter
            </h4>
            <CharacterVoiceSection
              key={`${character.id}|${ttsSummary.provider}|${character.voiceConfig?.mode ?? "inherit"}|${character.voiceConfig?.customProvider ?? ""}|${character.voiceConfig?.customVoiceId ?? ""}|${character.voiceConfig?.voiceNoteMode ?? "auto"}`}
              value={character.voiceConfig}
              ttsSummary={ttsSummary}
              voiceSettings={voiceSettings}
              sampleGreeting={character.greeting}
              onChange={onVoiceChange}
              onNotice={onNotice}
            />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              onClick={onEdit}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98]"
            >
              <PencilIcon className="h-4 w-4" /> Edit Karakter
            </button>
            <button
              onClick={onClearChat}
              className="rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-[#4687fe]/10 dark:hover:bg-[#d5b767]/10 hover:text-ink active:scale-[0.98]"
            >
              Hapus Riwayat Chat
            </button>
          </div>

          <button
            onClick={onDelete}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 py-2.5 text-sm font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-rose-500/10"
          >
            <TrashIcon className="h-4 w-4" /> Hapus Karakter
          </button>
        </div>
      </div>
    </div>
  );
}
