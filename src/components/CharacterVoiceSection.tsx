"use client";

import { useState } from "react";
import {
  cleanVoiceId,
  type CharacterVoiceConfig,
  type CharacterVoiceMode,
} from "@/lib/hdVoice";
import { VOICE_TEST_TEXT, speak, stopSpeaking, useIsSpeaking, type VoiceSettings } from "@/lib/voice";

const OPTIONS: { id: CharacterVoiceMode; label: string; hint: string }[] = [
  { id: "inherit", label: "Ikut bawaan", hint: "Mengikuti pilihan mesin di menu Suara" },
  { id: "device", label: "Perangkat", hint: "Suara lokal iPhone/browser (gratis tanpa kuota)" },
  { id: "hd_female", label: "HD Perempuan", hint: "Memakai slot Suara HD Perempuan (ElevenLabs)" },
  { id: "hd_male", label: "HD Laki-laki", hint: "Memakai slot Suara HD Laki-laki (ElevenLabs)" },
  { id: "hd_custom", label: "Voice ID Khusus", hint: "Pakai kode Voice ID ElevenLabs tersendiri" },
];

export function CharacterVoiceSection({
  value,
  hasHdKey,
  voiceSettings,
  sampleGreeting,
  onChange,
  onNotice,
}: {
  value: CharacterVoiceConfig | null;
  hasHdKey: boolean;
  voiceSettings: VoiceSettings;
  sampleGreeting?: string;
  onChange: (next: CharacterVoiceConfig | null) => void;
  onNotice?: (msg: string) => void;
}) {
  const savedMode: CharacterVoiceMode = value?.mode ?? "inherit";
  const [draftMode, setDraftMode] = useState<CharacterVoiceMode>(savedMode);
  const [customId, setCustomId] = useState<string>(value?.customVoiceId ?? "");
  const isSpeaking = useIsSpeaking();

  const activeMode = draftMode === "hd_custom" ? "hd_custom" : savedMode;

  function selectMode(mode: CharacterVoiceMode) {
    stopSpeaking();
    setDraftMode(mode);
    if (mode === "inherit") {
      onChange(null);
      return;
    }
    if (mode === "hd_custom") {
      const cleaned = cleanVoiceId(customId);
      if (cleaned) {
        onChange({ mode: "hd_custom", customVoiceId: cleaned });
      }
      return;
    }
    onChange({ mode });
  }

  function handleSaveCustom() {
    const cleaned = cleanVoiceId(customId);
    if (!cleaned) {
      onNotice?.("Masukkan kode Voice ID ElevenLabs yang valid (tanpa spasi).");
      return;
    }
    onChange({ mode: "hd_custom", customVoiceId: cleaned });
    onNotice?.("Voice ID khusus karakter disimpan.");
  }

  function handleTestCustom() {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    const cleaned = cleanVoiceId(customId);
    if (!cleaned) {
      onNotice?.("Masukkan kode Voice ID terlebih dulu.");
      return;
    }
    if (!hasHdKey) {
      onNotice?.("Isi API key ElevenLabs dulu di menu Suara.");
      return;
    }
    const sample = sampleGreeting?.trim() || VOICE_TEST_TEXT;
    speak(sample, voiceSettings, {
      target: { kind: "hd", slot: "custom", customVoiceId: cleaned },
      allowDeviceFallback: false,
      onFallback: (reason) => onNotice?.(reason),
    });
  }

  const activeHint = OPTIONS.find((o) => o.id === activeMode)?.hint ?? "";
  const needsHdWarning =
    !hasHdKey &&
    (activeMode === "hd_female" || activeMode === "hd_male" || activeMode === "hd_custom");

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((opt) => {
          const active = activeMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => selectMode(opt.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-ink bg-ink text-surface"
                  : "border-line bg-surface text-ink-soft hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">{activeHint}</p>

      {needsHdWarning && (
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          API key ElevenLabs belum diisi di menu <b>Suara</b>. Selama belum diisi, karakter ini
          otomatis memakai suara perangkat.
        </p>
      )}

      {activeMode === "hd_custom" && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-1.5">
            <input
              type="text"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder="Tempel Voice ID ElevenLabs..."
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveCustom}
              className="shrink-0 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
            >
              Simpan
            </button>
            <button
              type="button"
              onClick={handleTestCustom}
              className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-surface-2"
            >
              {isSpeaking ? "Stop" : "Tes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
