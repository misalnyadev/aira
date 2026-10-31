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
import { Switch } from "./Switch";
import { CheckIcon, SpeakerIcon } from "./icons";

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
        <span className="text-xs font-medium text-ink-soft">{label}</span>
        <span className="text-xs text-muted">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-ink"
      />
    </div>
  );
}

export function VoiceView({
  settings,
  onChange,
}: {
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
}) {
  const supported = useSpeechSupported();
  const voices = useVoices();
  const isSpeaking = useIsSpeaking();

  // Hentikan contoh suara saat berpindah ke tab lain.
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
    <div className="flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="top-bar flex items-center justify-between px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Suara</h1>
          <p className="text-xs text-ink-soft">Suara lokal perangkat, gratis tanpa kuota API</p>
        </div>
        {supported && (
          <button
            type="button"
            onClick={isSpeaking ? stopSpeaking : handleTest}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              isSpeaking
                ? "border border-line bg-surface-2 text-ink hover:bg-line/60"
                : "bg-brand text-brand-ink hover:bg-brand-strong"
            }`}
          >
            {isSpeaking ? "Hentikan" : "Coba suara"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(var(--tabbar-space)+0.75rem)]">
        <div className="mx-auto w-full max-w-2xl space-y-5">
          {!supported && (
            <p className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
              Browser ini belum mendukung suara (Web Speech API). Coba Safari di iPhone atau Chrome
              di Android/desktop.
            </p>
          )}

          {/* Aktifkan */}
          <div className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft ring-1 ring-line">
              <SpeakerIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Bacakan balasan</span>
              <span className="block text-xs text-ink-soft">
                Balasan karakter dibacakan otomatis saat tiba di ruang chat
              </span>
            </div>
            <Switch
              checked={settings.enabled}
              onChange={(next) => update({ enabled: next })}
              label="Bacakan balasan"
            />
          </div>

          {/* Saran suara paling natural */}
          {supported && bestVoice && (
            <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
              <p className="text-xs text-ink-soft">
                Paling natural di perangkat ini:{" "}
                <span className="font-semibold text-ink">{bestVoice.name}</span>
                {isNaturalVoice(bestVoice) ? " (enhanced)" : ""}
              </p>
              {(settings.voiceURI !== bestVoice.voiceURI || settings.voiceURI === "") && (
                <button
                  type="button"
                  onClick={() =>
                    update({ voiceURI: bestVoice.voiceURI, rate: 0.95, pitch: 1, pause: 150 })
                  }
                  className="mt-2 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                >
                  Pakai suara ini
                </button>
              )}
            </div>
          )}

          {/* Tips */}
          <details className="rounded-xl border border-line px-3.5 py-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
              Cara bikin suara lebih natural
            </summary>
            <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-soft">
              <p>
                <b>iPhone:</b> Pengaturan → Aksesibilitas → Konten Terbaca → Suara → Indonesia, lalu
                unduh suara bertanda <i>Enhanced</i>/<i>Premium</i>. Setelah terunduh, suara itu
                muncul di daftar ini dan jauh lebih halus.
              </p>
              <p>
                <b>Android:</b> Pengaturan → Aksesibilitas → Output teks-ke-suara → pasang suara
                bahasa Indonesia dari Google TTS.
              </p>
              <p>
                Lalu: pilih suara berlabel <b>natural</b>, pakai preset <b>Natural</b>, kecepatan
                ±0.95×, dan jeda kalimat 120–180 ms.
              </p>
            </div>
          </details>

          {/* Pilihan suara */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Pilih suara
              </h2>
              <span className="text-xs text-muted">
                {sorted.length} suara{indonesianCount ? ` · ${indonesianCount} Indonesia` : ""}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-line">
              <button
                type="button"
                onClick={() => update({ voiceURI: "" })}
                className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition ${
                  settings.voiceURI === "" ? "bg-ink/[0.06]" : "hover:bg-surface-2"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">Otomatis</span>
                  <span className="block truncate text-xs text-muted">
                    Utamakan bahasa Indonesia paling natural
                  </span>
                </span>
                {settings.voiceURI === "" && <CheckIcon className="h-4 w-4 shrink-0 text-ink" />}
              </button>

              {sorted.length > 0 && (
                <div className="max-h-60 divide-y divide-line overflow-y-auto border-t border-line">
                  {sorted.map((v) => {
                    const active = settings.voiceURI === v.voiceURI;
                    const natural = isNaturalVoice(v);
                    return (
                      <button
                        type="button"
                        key={v.voiceURI}
                        onClick={() => update({ voiceURI: v.voiceURI })}
                        className={`flex w-full items-center gap-2 px-3.5 py-2 text-left transition ${
                          active ? "bg-ink/[0.06]" : "hover:bg-surface-2"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">{v.name}</span>
                          <span className="block truncate text-[11px] text-muted">{v.lang}</span>
                        </span>
                        {natural && (
                          <span className="shrink-0 rounded-full bg-ink/10 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                            natural
                          </span>
                        )}
                        {v.localService && !natural && (
                          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                            lokal
                          </span>
                        )}
                        {active && <CheckIcon className="h-4 w-4 shrink-0 text-ink" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Preset + slider */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Karakter suara
            </h2>

            <div className="grid grid-cols-5 gap-1.5">
              {VOICE_PRESETS.map((preset) => {
                const active = isPresetActive(settings, preset);
                return (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => update({ rate: preset.rate, pitch: preset.pitch })}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      active
                        ? "border-ink bg-surface-2 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-2"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-xl border border-line p-3.5">
              <Slider
                label="Kecepatan"
                value={settings.rate}
                min={0.5}
                max={1.6}
                step={0.05}
                display={`${settings.rate.toFixed(2)}×`}
                onChange={(rate) => update({ rate })}
              />
              <Slider
                label="Nada"
                value={settings.pitch}
                min={0.5}
                max={1.6}
                step={0.05}
                display={settings.pitch.toFixed(2)}
                onChange={(pitch) => update({ pitch })}
              />
              <Slider
                label="Volume"
                value={settings.volume}
                min={0.1}
                max={1}
                step={0.05}
                display={`${Math.round(settings.volume * 100)}%`}
                onChange={(volume) => update({ volume })}
              />
              <Slider
                label="Jeda antar kalimat"
                value={settings.pause}
                min={0}
                max={400}
                step={20}
                display={`${Math.round(settings.pause)} ms`}
                onChange={(pause) => update({ pause })}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
