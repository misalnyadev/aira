"use client";

import { useEffect, useState } from "react";
import type { BubbleStyle } from "@/lib/bubbleStyle";
import type { CharacterMedia } from "@/lib/characterMedia";
import type { ChatBackground } from "@/lib/chatBackground";
import type { CharacterVoiceConfig } from "@/lib/hdVoice";
import type { VoiceSettings } from "@/lib/voice";
import type { CharacterDetail } from "@/types/chat";
import { Avatar } from "./Avatar";
import { BubbleStyleControls } from "./BubbleStyleControls";
import { CharacterMediaSection } from "./CharacterMediaSection";
import { CharacterVoiceSection } from "./CharacterVoiceSection";
import { ChatBackgroundPicker } from "./ChatBackgroundPicker";
import { PencilIcon, TrashIcon, XIcon } from "./icons";

export function CharacterProfileModal({
  character,
  providerLabel,
  bubbleFallback,
  hasHdKey,
  voiceSettings,
  onClose,
  onEdit,
  onClearChat,
  onDelete,
  onBackgroundChange,
  onBubbleChange,
  onVoiceChange,
  onMediaChange,
  onNotice,
}: {
  character: CharacterDetail;
  providerLabel: string;
  bubbleFallback: BubbleStyle;
  hasHdKey: boolean;
  voiceSettings: VoiceSettings;
  onClose: () => void;
  onEdit: () => void;
  onClearChat: () => void;
  onDelete: () => void;
  onBackgroundChange: (next: ChatBackground | null) => void;
  onBubbleChange: (next: BubbleStyle | null) => void;
  onVoiceChange: (next: CharacterVoiceConfig | null) => void;
  onMediaChange: (next: CharacterMedia | null) => void;
  onNotice?: (msg: string) => void;
}) {
  const [showBible, setShowBible] = useState(false);
  const hasBible = Boolean(character.bible?.trim());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="pop-in flex max-h-[85vh] w-full max-w-md flex-col rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Profil ${character.name}`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">Profil Karakter</h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar name={character.name} src={character.avatarUrl} size={104} ring />
            <h3 className="mt-2 font-display text-xl font-bold text-ink">{character.name}</h3>
            {character.shortBio && <p className="text-sm text-ink-soft">{character.shortBio}</p>}
            {providerLabel && (
              <span className="rounded-full bg-surface-2 px-3 py-1 text-[12px] font-medium text-ink-soft">
                {providerLabel}
              </span>
            )}
          </div>

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Tentang karakter
            </h4>
            <p className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-3.5 text-sm leading-relaxed text-ink">
              {character.personality}
            </p>
          </div>

          {hasBible && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">
                  📖 Bible peran
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
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink">
                  {character.bible}
                </pre>
              )}
            </div>
          )}

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Latar chat
            </h4>
            <ChatBackgroundPicker
              allowInherit
              value={character.chatBackground}
              onChange={onBackgroundChange}
            />
          </div>

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Tampilan & gelembung chat
            </h4>
            <BubbleStyleControls
              allowInherit
              value={character.bubbleStyle}
              fallback={bubbleFallback}
              onChange={onBubbleChange}
            />
          </div>

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Suara karakter
            </h4>
            <CharacterVoiceSection
              key={`${character.id}|${character.voiceConfig?.mode ?? "inherit"}|${character.voiceConfig?.customVoiceId ?? ""}`}
              value={character.voiceConfig}
              hasHdKey={hasHdKey}
              voiceSettings={voiceSettings}
              sampleGreeting={character.greeting}
              onChange={onVoiceChange}
              onNotice={onNotice}
            />
          </div>

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Media karakter
            </h4>
            <CharacterMediaSection
              characterId={character.id}
              media={character.media}
              onChange={onMediaChange}
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
              className="rounded-xl border border-line py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink active:scale-[0.98]"
            >
              Hapus Riwayat Chat
            </button>
          </div>

          <button
            onClick={onDelete}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-rose-500/10"
          >
            <TrashIcon className="h-4 w-4" /> Hapus Karakter
          </button>
        </div>
      </div>
    </div>
  );
}
