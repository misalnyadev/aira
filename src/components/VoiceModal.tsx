"use client";

import { useEffect, useMemo } from "react";
import {
  VOICE_PRESETS,
  VOICE_TEST_TEXT,
  isNaturalVoice,
  isPresetActive,
  sortVoices,
  speak,
  stopSpeaking,
  useIsSpeaking,
  useSpeechSupported,
  useVoices,
  type VoiceSettings,
} from "@/lib/voice";
import { CheckIcon, SpeakerIcon, XIcon } from "./icons";

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="text-xs text-slate-400">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-emerald-600"
      />
    </div>
  );
}

export function VoiceModal({
  settings,
  onChange,
  onClose,
}: {
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  onClose: () => void;
}) {
  const supported = useSpeechSupported();
  const voices = useVoices();
  const isSpeaking = useIsSpeaking();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Hentikan bacaan contoh saat jendela pengaturan suara ditutup.
  useEffect(() => () => stopSpeaking(), []);

  const sorted = useMemo(() => sortVoices(voices), [voices]);
  const indonesianCount = useMemo(
    () => sorted.filter((v) => v.lang?.toLowerCase().startsWith("id")).length,
    [sorted]
  );
  const bestVoice = sorted[0] ?? null;

  function update(patch: Partial<VoiceSettings>) {
    onChange({ ...settings, ...patch });
  }

  function handleTest() {
    speak(VOICE_TEST_TEXT, settings);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Suara Karakter</h2>
          <div className="flex items-center gap-2">
            {supported && (
              <button
                type="button"
                onClick={isSpeaking ? stopSpeaking : handleTest}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  isSpeaking
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {isSpeaking ? "Hentikan" : "Coba suara"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Tutup"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!supported && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
              Browser ini belum mendukung suara (Web Speech API). Coba Safari di iPhone atau Chrome
              di Android maupun desktop.
            </p>
          )}

          {/* Sakelar auto-baca */}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 hover:bg-slate-50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <SpeakerIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">Bacakan balasan</span>
              <span className="block text-xs text-slate-500">
                Setiap balasan baru karakter dibacakan otomatis
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
            />
          </label>

          {/* Saran suara paling natural di perangkat ini */}
          {supported && bestVoice && (
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <p className="text-xs text-emerald-900">
                Paling natural di perangkat ini:{" "}
                <span className="font-semibold">{bestVoice.name}</span>
                {isNaturalVoice(bestVoice) ? " (enhanced)" : ""}
              </p>
              {settings.voiceURI !== bestVoice.voiceURI && (
                <button
                  type="button"
                  onClick={() =>
                    update({ voiceURI: bestVoice.voiceURI, rate: 0.95, pitch: 1.0, pause: 150 })
                  }
                  className="mt-2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-emerald-700"
                >
                  Pakai suara ini
                </button>
              )}
            </div>
          )}

          {/* Panduan suara natural */}
          <details className="rounded-xl border border-slate-200 px-3 py-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">
              Cara bikin suara lebih natural
            </summary>
            <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500">
              <p>
                <b className="text-slate-700">iPhone:</b> Pengaturan → Aksesibilitas → Konten
                Terbaca → Suara → Indonesia, lalu unduh suara bertanda <i>Enhanced</i> atau{" "}
                <i>Premium</i>. Setelah terunduh, suaranya muncul di daftar bawah dan jauh lebih
                halus.
              </p>
              <p>
                <b className="text-slate-700">Android:</b> Pengaturan → Aksesibilitas → Output
                teks-ke-suara → pasang suara bahasa Indonesia dari Google TTS.
              </p>
              <p>
                Lalu pilih suara berlabel <b className="text-slate-700">natural</b>, pakai preset{" "}
                <b className="text-slate-700">Natural</b>, kecepatan ±0.95×, dan jeda kalimat
                120–180 ms.
              </p>
            </div>
          </details>

          {/* Pilihan suara */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pilih suara
              </h3>
              <span className="text-xs text-slate-400">
                {sorted.length} suara{indonesianCount ? ` · ${indonesianCount} Indonesia` : ""}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => update({ voiceURI: "" })}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${
                  settings.voiceURI === "" ? "bg-emerald-50/70" : "hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    Otomatis
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    Utamakan bahasa Indonesia & suara natural
                  </span>
                </span>
                {settings.voiceURI === "" && (
                  <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
              </button>

              {sorted.length > 0 && (
                <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto border-t border-slate-200">
                  {sorted.map((voice) => {
                    const active = settings.voiceURI === voice.voiceURI;
                    return (
                      <button
                        type="button"
                        key={voice.voiceURI}
                        onClick={() => update({ voiceURI: voice.voiceURI })}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
                          active ? "bg-emerald-50/70" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="min-w-0">
                            <span className="block truncate text-sm text-slate-800">
                              {voice.name}
                            </span>
                            <span className="block truncate text-[11px] uppercase text-slate-400">
                              {voice.lang}
                            </span>
                          </span>
                          {isNaturalVoice(voice) && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              natural
                            </span>
                          )}
                        </span>
                        {active && <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Karakter suara: preset + slider */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Karakter suara
            </h3>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {VOICE_PRESETS.map((preset) => {
                const active = isPresetActive(settings, preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => update({ rate: preset.rate, pitch: preset.pitch })}
                    title={preset.hint}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 px-3 py-3">
              <Slider
                label="Kecepatan"
                value={settings.rate}
                min={0.6}
                max={1.5}
                step={0.01}
                display={`${settings.rate.toFixed(2)}×`}
                onChange={(rate) => update({ rate })}
              />
              <Slider
                label="Nada"
                value={settings.pitch}
                min={0.6}
                max={1.4}
                step={0.01}
                display={settings.pitch.toFixed(2)}
                onChange={(pitch) => update({ pitch })}
              />
              <Slider
                label="Volume"
                value={settings.volume}
                min={0.2}
                max={1}
                step={0.05}
                display={`${Math.round(settings.volume * 100)}%`}
                onChange={(volume) => update({ volume })}
              />
              <Slider
                label="Jeda antar kalimat"
                value={settings.pause}
                min={0}
                max={500}
                step={20}
                display={`${settings.pause} ms`}
                onChange={(pause) => update({ pause })}
              />
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={!supported}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Coba suara
              </button>
              <button
                type="button"
                onClick={stopSpeaking}
                disabled={!supported || !isSpeaking}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Hentikan
              </button>
            </div>
          </section>

          <p className="pb-1 text-xs leading-relaxed text-slate-400">
            Suara dihasilkan langsung oleh browser di perangkat ini — gratis, tanpa API key, dan
            tidak dikirim ke mana pun. Daftar suara mengikuti perangkatmu.
          </p>
        </div>
      </div>
    </div>
  );
}
