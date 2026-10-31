"use client";

import { useState } from "react";
import {
  cleanVoiceId,
  FEMALE_VOICE_PRESETS,
  GEMINI_FEMALE_PRESETS,
  GEMINI_MALE_PRESETS,
  MALE_VOICE_PRESETS,
  type CharacterVoiceConfig,
  type TtsAccountSummary,
} from "@/lib/hdVoice";
import {
  VOICE_TEST_TEXT,
  speak,
  stopSpeaking,
  useIsSpeaking,
  type VoiceSettings,
} from "@/lib/voice";

type UiVoiceChoice =
  | "inherit"
  | "device"
  | "hd_female"
  | "hd_male"
  | "gemini_custom"
  | "eleven_custom";

const OPTIONS: { id: UiVoiceChoice; label: string; hint: string }[] = [
  { id: "inherit", label: "Ikut bawaan", hint: "Mengikuti pilihan mesin di menu Suara" },
  { id: "device", label: "Perangkat", hint: "Suara lokal iPhone/browser (gratis tanpa kuota)" },
  { id: "hd_female", label: "HD Perempuan", hint: "Memakai Slot 1 Perempuan dari menu Suara" },
  { id: "hd_male", label: "HD Laki-laki", hint: "Memakai Slot 2 Laki-laki dari menu Suara" },
  {
    id: "gemini_custom",
    label: "Gemini Khusus",
    hint: "Pilih suara Gemini tersendiri untuk karakter ini",
  },
  {
    id: "eleven_custom",
    label: "ElevenLabs Khusus",
    hint: "Pilih suara atau Voice ID ElevenLabs tersendiri untuk karakter ini",
  },
];

const ALL_GEMINI_PRESETS = [...GEMINI_FEMALE_PRESETS, ...GEMINI_MALE_PRESETS];
const ALL_ELEVEN_PRESETS = [...FEMALE_VOICE_PRESETS, ...MALE_VOICE_PRESETS];

function deriveInitialChoice(
  value: CharacterVoiceConfig | null,
  accountProvider: "gemini" | "elevenlabs"
): UiVoiceChoice {
  if (!value || value.mode === "inherit") return "inherit";
  if (value.mode === "device") return "device";
  if (value.mode === "hd_female") return "hd_female";
  if (value.mode === "hd_male") return "hd_male";
  const prov = value.customProvider ?? accountProvider;
  return prov === "elevenlabs" ? "eleven_custom" : "gemini_custom";
}

export function CharacterVoiceSection({
  value,
  ttsSummary,
  voiceSettings,
  sampleGreeting,
  onChange,
  onNotice,
}: {
  value: CharacterVoiceConfig | null;
  ttsSummary: TtsAccountSummary;
  voiceSettings: VoiceSettings;
  sampleGreeting?: string;
  onChange: (next: CharacterVoiceConfig | null) => void;
  onNotice?: (msg: string) => void;
}) {
  const initialChoice = deriveInitialChoice(value, ttsSummary.provider);
  const [choice, setChoice] = useState<UiVoiceChoice>(initialChoice);
  const [customId, setCustomId] = useState<string>(value?.customVoiceId ?? "");
  const isSpeaking = useIsSpeaking();

  const geminiHasKey = ttsSummary.hasGeminiKey || ttsSummary.hasSharedGeminiKey;
  const elevenHasKey = ttsSummary.hasKey;

  function selectChoice(next: UiVoiceChoice) {
    stopSpeaking();
    setChoice(next);

    if (next === "inherit") {
      onChange(null);
      return;
    }
    if (next === "device" || next === "hd_female" || next === "hd_male") {
      onChange({ mode: next });
      return;
    }

    const targetProv = next === "eleven_custom" ? "elevenlabs" : "gemini";
    const defaultPick =
      targetProv === "gemini" ? ALL_GEMINI_PRESETS[0].id : ALL_ELEVEN_PRESETS[0].id;
    const currentClean = cleanVoiceId(customId);

    // Bila berpindah antar Gemini <-> ElevenLabs, ganti ke contoh bawaan penyedia baru bila ID lama dari penyedia seberang.
    const looksLikeGemini = ALL_GEMINI_PRESETS.some((p) => p.id === currentClean);
    const nextVoiceId =
      !currentClean ||
      (targetProv === "elevenlabs" && looksLikeGemini) ||
      (targetProv === "gemini" && currentClean.length >= 16)
        ? defaultPick
        : currentClean;

    setCustomId(nextVoiceId);
    onChange({
      mode: "hd_custom",
      customProvider: targetProv,
      customVoiceId: nextVoiceId,
    });
  }

  function handlePickPreset(id: string) {
    stopSpeaking();
    const targetProv = choice === "eleven_custom" ? "elevenlabs" : "gemini";
    setCustomId(id);
    onChange({
      mode: "hd_custom",
      customProvider: targetProv,
      customVoiceId: id,
    });
  }

  function handleSaveCustom() {
    const cleaned = cleanVoiceId(customId);
    if (!cleaned) {
      onNotice?.("Masukkan nama atau kode suara yang valid (tanpa spasi).");
      return;
    }
    const targetProv = choice === "eleven_custom" ? "elevenlabs" : "gemini";
    onChange({
      mode: "hd_custom",
      customProvider: targetProv,
      customVoiceId: cleaned,
    });
    onNotice?.("Suara khusus karakter disimpan.");
  }

  function handleTestCustom() {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    const cleaned = cleanVoiceId(customId);
    if (!cleaned) {
      onNotice?.("Pilih atau masukkan suara terlebih dulu.");
      return;
    }
    const targetProv = choice === "eleven_custom" ? "elevenlabs" : "gemini";
    const sample = sampleGreeting?.trim() || VOICE_TEST_TEXT;
    speak(sample, voiceSettings, {
      target: {
        kind: "hd",
        slot: "custom",
        customProvider: targetProv,
        customVoiceId: cleaned,
      },
      allowDeviceFallback: false,
      onFallback: (reason) => onNotice?.(reason),
    });
  }

  const activeHint = OPTIONS.find((o) => o.id === choice)?.hint ?? "";
  const missingKeyNote = (() => {
    if (choice === "gemini_custom" && !geminiHasKey) {
      return "API key Gemini belum ada. Rekaman lama di R2/lokal tetap berbunyi; kalimat baru memakai suara perangkat sampai key diisi.";
    }
    if (choice === "eleven_custom" && !elevenHasKey) {
      return "API key ElevenLabs belum ada. Rekaman lama di R2/lokal tetap berbunyi; kalimat baru memakai suara perangkat sampai key diisi.";
    }
    if ((choice === "hd_female" || choice === "hd_male") && !ttsSummary.hasActiveKey) {
      return "API key penyedia utama belum ada. Rekaman lama di R2/lokal tetap berbunyi; kalimat baru memakai suara perangkat.";
    }
    return null;
  })();

  const presetsToShow = choice === "eleven_custom" ? ALL_ELEVEN_PRESETS : ALL_GEMINI_PRESETS;

  return (
    <div className="space-y-2.5 rounded-2xl border border-line bg-surface-2/60 p-3.5">
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((opt) => {
          const active = choice === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => selectChoice(opt.id)}
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

      {missingKeyNote && (
        <p className="rounded-xl border border-line bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          {missingKeyNote}
        </p>
      )}

      {(choice === "gemini_custom" || choice === "eleven_custom") && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {presetsToShow.map((p) => {
              const selected = customId.trim() === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePickPreset(p.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                    selected
                      ? "border-ink bg-ink text-surface"
                      : "border-line bg-surface text-ink-soft hover:text-ink"
                  }`}
                >
                  {p.label} · {p.hint}
                </button>
              );
            })}
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder={
                choice === "gemini_custom"
                  ? "Nama suara Gemini (mis. Kore, Aoede, Puck)..."
                  : "Tempel Voice ID ElevenLabs..."
              }
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
