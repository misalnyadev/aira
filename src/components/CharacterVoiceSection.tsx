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
  normalizeVoiceNoteMode,
  type VoiceNoteReplyMode,
} from "@/lib/voiceNote";
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

const VN_MODE_OPTIONS: {
  id: VoiceNoteReplyMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "auto",
    label: "Otomatis",
    hint: "Karakter membalas pakai Voice Note saat kamu mengirim pesan suara (🎤).",
  },
  {
    id: "occasional",
    label: "Sesekali",
    hint: "Sesekali membalas pakai Voice Note saat obrolan santai + setiap kamu kirim pesan suara.",
  },
  {
    id: "always",
    label: "Selalu VN",
    hint: "Semua balasan karakter di ruang chat dikirim sebagai Gelembung Voice Note.",
  },
  {
    id: "off",
    label: "Teks Saja",
    hint: "Balasan selalu berupa gelembung teks biasa.",
  },
];

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
  const [customStyle, setCustomStyle] = useState<string>(value?.customStyle ?? "");
  const [vnMode, setVnMode] = useState<VoiceNoteReplyMode>(
    normalizeVoiceNoteMode(value?.voiceNoteMode, "auto")
  );
  const [charTestFeedback, setCharTestFeedback] = useState<{kind: "ok"|"err"; text: string} | null>(null);
  const isSpeaking = useIsSpeaking();

  const geminiHasKey = ttsSummary.hasGeminiKey || ttsSummary.hasSharedGeminiKey;
  const elevenHasKey = ttsSummary.hasKey;

  function buildConfigFor(
    nextChoice: UiVoiceChoice,
    nextVn: VoiceNoteReplyMode,
    overrideCustomId?: string,
    overrideStyle?: string
  ): CharacterVoiceConfig | null {
    const styleVal = (overrideStyle ?? customStyle).trim().slice(0, 180);
    const styleField = styleVal ? { customStyle: styleVal } : {};
    const vnField = nextVn !== "auto" ? { voiceNoteMode: nextVn } : {};

    if (nextChoice === "inherit") {
      return styleField.customStyle || vnField.voiceNoteMode ? { mode: "inherit", ...styleField, ...vnField } : null;
    }
    if (
      nextChoice === "device" ||
      nextChoice === "hd_female" ||
      nextChoice === "hd_male"
    ) {
      return { mode: nextChoice, ...styleField, ...vnField };
    }

    const targetProv = nextChoice === "eleven_custom" ? "elevenlabs" : "gemini";
    const defaultPick =
      targetProv === "gemini"
        ? ALL_GEMINI_PRESETS[0].id
        : ALL_ELEVEN_PRESETS[0].id;
    const rawId = overrideCustomId ?? customId;
    const currentClean = cleanVoiceId(rawId);
    const looksLikeGemini = ALL_GEMINI_PRESETS.some(
      (p) => p.id === currentClean
    );
    const nextVoiceId =
      !currentClean ||
      (targetProv === "elevenlabs" && looksLikeGemini) ||
      (targetProv === "gemini" && currentClean.length >= 16)
        ? defaultPick
        : currentClean;

    return {
      mode: "hd_custom",
      customProvider: targetProv,
      customVoiceId: nextVoiceId,
      ...styleField,
      ...vnField,
    };
  }

  function selectChoice(next: UiVoiceChoice) {
    stopSpeaking();
    setChoice(next);

    const built = buildConfigFor(next, vnMode);
    if (built?.mode === "hd_custom" && built.customVoiceId) {
      setCustomId(built.customVoiceId);
    }
    onChange(built);
  }

  function selectVnMode(nextVn: VoiceNoteReplyMode) {
    setVnMode(nextVn);
    onChange(buildConfigFor(choice, nextVn));
  }

  function handleStyleChange(nextStyle: string) {
    setCustomStyle(nextStyle);
    // debounce save? langsung save agar preview inline
    onChange(buildConfigFor(choice, vnMode, undefined, nextStyle));
  }

  function handlePickPreset(id: string) {
    stopSpeaking();
    const targetProv = choice === "eleven_custom" ? "elevenlabs" : "gemini";
    setCustomId(id);
    const styleField = customStyle.trim() ? { customStyle: customStyle.trim().slice(0,180) } : {};
    onChange({
      mode: "hd_custom",
      customProvider: targetProv,
      customVoiceId: id,
      ...styleField,
      ...(vnMode !== "auto" ? { voiceNoteMode: vnMode } : {}),
    });
  }

  function handleSaveCustom() {
    const cleaned = cleanVoiceId(customId);
    if (!cleaned) {
      onNotice?.("Masukkan nama atau kode suara yang valid (tanpa spasi).");
      return;
    }
    const targetProv = choice === "eleven_custom" ? "elevenlabs" : "gemini";
    const styleField = customStyle.trim() ? { customStyle: customStyle.trim().slice(0,180) } : {};
    onChange({
      mode: "hd_custom",
      customProvider: targetProv,
      customVoiceId: cleaned,
      ...styleField,
      ...(vnMode !== "auto" ? { voiceNoteMode: vnMode } : {}),
    });
    setCharTestFeedback({kind:"ok", text:"Suara & gaya khas karakter disimpan."});
    setTimeout(()=> setCharTestFeedback(null), 2500);
  }

  function handleTestCustom() {
    if (isSpeaking) {
      stopSpeaking();
      setCharTestFeedback(null);
      return;
    }
    const cleaned = cleanVoiceId(customId);
    if (!cleaned) {
      setCharTestFeedback({kind: "err", text: "Pilih atau masukkan suara terlebih dulu."});
      return;
    }
    const targetProv = choice === "eleven_custom" ? "elevenlabs" : "gemini";
    const sample = sampleGreeting?.trim() || VOICE_TEST_TEXT;
    setCharTestFeedback(null);
    speak(sample, voiceSettings, {
      target: {
        kind: "hd",
        slot: "custom",
        customProvider: targetProv,
        customVoiceId: cleaned,
      },
      allowDeviceFallback: false,
      onFallback: (reason) => setCharTestFeedback({kind: "err", text: reason}),
    });
    if (targetProv === "gemini" ? ttsSummary.hasGeminiKey || ttsSummary.hasSharedGeminiKey : ttsSummary.hasKey) {
      setCharTestFeedback({kind: "ok", text: "Memutar tes — cek kuota di Pengaturan Suara (status per key 1/1)."});
    }
  }

  function handleTestSlotCurrent() {
    if (isSpeaking) {
      stopSpeaking();
      setCharTestFeedback(null);
      return;
    }
    const sample = sampleGreeting?.trim() || VOICE_TEST_TEXT;
    let target: any = null;
    if (choice === "hd_female") target = { kind: "hd", slot: "female" } as const;
    else if (choice === "hd_male") target = { kind: "hd", slot: "male" } as const;
    else if (choice === "device") target = { kind: "device" } as const;
    else return handleTestCustom();
    setCharTestFeedback(null);
    speak(sample, voiceSettings, {
      target,
      allowDeviceFallback: false,
      onFallback: (reason) => setCharTestFeedback({kind: "err", text: reason}),
    });
    const hasKey = choice === "hd_female" || choice === "hd_male" ? ttsSummary.hasActiveKey : true;
    if (hasKey) setCharTestFeedback({kind: "ok", text: "Memutar tes — status kuota lihat di Suara → API Key & Model (per key 1/1)."});
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
    <div className="space-y-2.5 rounded-2xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-[#4687fe]/10 dark:bg-[#d5b767]/10 p-3.5">
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
                  ? "border-[#4687fe] dark:border-[#d5b767] bg-brand text-brand-ink"
                  : "border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface text-ink-soft hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-muted">{activeHint}</p>

      {missingKeyNote && (
        <p className="rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
          {missingKeyNote}
        </p>
      )}

      {(choice === "hd_female" || choice === "hd_male" || choice === "device") && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleTestSlotCurrent}
            className="inline-flex items-center gap-1 rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-[#4687fe]/10 dark:hover:bg-[#d5b767]/10"
          >
            {isSpeaking ? "Stop" : "▶ Tes suara ini"}
          </button>
          <span className="text-[11px] text-muted">Tes quota & dengar hasil — status lengkap di Suara → API Key (per key 1/1).</span>
        </div>
      )}

      {charTestFeedback && (
        <p className={`rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${charTestFeedback.kind === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"}`}>{charTestFeedback.text}</p>
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
                      ? "border-[#4687fe] dark:border-[#d5b767] bg-brand text-brand-ink"
                      : "border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface text-ink-soft hover:text-ink"
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
              className="min-w-0 flex-1 rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-[#205ac4] dark:focus:border-[#e8cf75] focus:outline-none"
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
              className="shrink-0 rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-[#4687fe]/10 dark:hover:bg-[#d5b767]/10"
            >
              {isSpeaking ? "Stop" : "Tes"}
            </button>
          </div>
          <div className="space-y-1 pt-1">
            <label className="block text-[11px] font-semibold text-ink-soft">Gaya bicara khas karakter ini (opsional)</label>
            <input
              type="text"
              value={customStyle}
              onChange={(e) => handleStyleChange(e.target.value)}
              placeholder={choice === "gemini_custom" ? "mis. ceria & muda, senyum di suara, tempo ringan" : "mis. hangat & tenang, artikulasi jelas, gaya bercerita"}
              maxLength={180}
              className="w-full rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-[#205ac4] dark:focus:border-[#e8cf75] focus:outline-none"
            />
            <p className="text-[10.5px] leading-relaxed text-muted">Dipakai sebagai instruksi gaya saat karakter ini bicara via Gemini/ElevenLabs. Kosongkan = ikut gaya slot global di Suara.</p>
          </div>
        </div>
      )}

      {/* Gaya Balasan Gelembung Voice Note (VN) */}
      <div className="space-y-1.5 border-t border-[#4687fe]/30 dark:border-[#d5b767]/35 pt-3">
        <span className="block text-xs font-semibold text-[#205ac4] dark:text-[#e8cf75]">
          🎙️ Gelembung Voice Note (VN) di Chat
        </span>
        <div className="flex flex-wrap gap-1.5">
          {VN_MODE_OPTIONS.map((opt) => {
            const active = vnMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectVnMode(opt.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-[#4687fe] dark:border-[#d5b767] bg-brand text-brand-ink"
                    : "border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface text-ink-soft hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          {VN_MODE_OPTIONS.find((o) => o.id === vnMode)?.hint}
        </p>
      </div>
    </div>
  );
}
