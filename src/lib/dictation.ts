"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Dikte suara: bicara → teks, memakai Web Speech API bawaan browser.
 *
 * iOS Safari punya `webkitSpeechRecognition` sejak iOS 14.5 dan mengirim
 * suaranya ke server Apple, jadi butuh koneksi internet. Mesin ini sering
 * berhenti sendiri setelah pengguna diam sebentar; karena itu selama pengguna
 * belum menekan tombol berhenti, pendengarannya disambung ulang otomatis dan
 * teksnya tetap bersambung.
 *
 * Sengaja tidak memakai rekaman audio sendiri (MediaRecorder + API): dikte
 * bawaan sudah gratis, instan, dan tidak mengirim suara ke pihak lain.
 */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
};
type RecognitionResults = {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
};
type RecognitionEvent = { resultIndex: number; results: RecognitionResults };
type RecognitionErrorEvent = { error: string };

/**
 * Gabungkan hasil baru dari mesin dikte ke teks yang sudah terkumpul.
 *
 * Dipisah dari hook supaya bisa diuji tanpa mikrofon: `results` bersifat
 * kumulatif per sesi, jadi pembacaan harus mulai dari `resultIndex` agar kata
 * yang sama tidak masuk dua kali.
 */
export function appendTranscript(
  finalText: string,
  results: RecognitionResults,
  resultIndex: number
): { final: string; interim: string } {
  let final = finalText;
  let interim = "";
  for (let i = resultIndex; i < results.length; i++) {
    const result = results[i];
    const chunk = result?.[0]?.transcript ?? "";
    if (result.isFinal) final += chunk;
    else interim += chunk;
  }
  return { final, interim };
}

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionLike;

function getRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Batas penyambungan ulang supaya tidak berputar terus saat perangkat menolak. */
const MAX_RESTARTS = 60;

function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Izin dikte ditolak. Aktifkan Mikrofon & Pengenalan Suara untuk Safari di Pengaturan iPhone.";
    case "network":
      return "Dikte butuh koneksi internet.";
    case "audio-capture":
      return "Mikrofon tidak terbaca. Coba lepas earphone lalu ulangi.";
    default:
      return "Dikte berhenti. Coba tekan mikrofon lagi.";
  }
}

const noSubscribe = () => () => {};

/**
 * Apakah pengguna sedang mendikte. Dipakai supaya bacaan otomatis tidak
 * berbunyi saat mikrofon hidup — suara karakter bisa ikut terekam.
 */
let dictating = false;

export function isDictating(): boolean {
  return dictating;
}

export function useDictation({
  onText,
  onError,
}: {
  /** Teks hasil dikte (sudah termasuk bagian yang belum final). */
  onText: (spoken: string) => void;
  onError: (message: string) => void;
}) {
  const [listening, setListening] = useState(false);

  /**
   * Dukungan browser dibaca langsung dari `window` (bukan dari effect) supaya
   * tidak ada setState saat halaman baru dimuat. Di server nilainya selalu
   * false, lalu berubah setelah hidrasi — persis yang diinginkan.
   */
  const supported = useSyncExternalStore(
    noSubscribe,
    () => getRecognition() !== null,
    () => false
  );

  const recognitionRef = useRef<RecognitionLike | null>(null);
  /** Pengguna masih ingin mendengar — dipakai untuk menyambung ulang. */
  const wantRef = useRef(false);
  const restartsRef = useRef(0);
  const finalRef = useRef("");
  const restartTimer = useRef<number | null>(null);
  const handlers = useRef({ onText, onError });

  useEffect(() => {
    handlers.current = { onText, onError };
  }, [onText, onError]);

  const clearRestart = useCallback(() => {
    if (restartTimer.current !== null) {
      window.clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
  }, []);

  const listen = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.start();
    } catch {
      // start() ganda melempar error; abaikan saja.
    }
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    dictating = false;
    clearRestart();
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // sudah berhenti
    }
  }, [clearRestart]);

  const start = useCallback(() => {
    const Ctor = getRecognition();
    if (!Ctor) {
      handlers.current.onError("Browser ini belum mendukung dikte suara.");
      return;
    }

    let rec = recognitionRef.current;
    if (!rec) {
      rec = new Ctor();
      rec.lang = "id-ID";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event) => {
        const merged = appendTranscript(finalRef.current, event.results, event.resultIndex);
        finalRef.current = merged.final;
        handlers.current.onText(`${merged.final}${merged.interim}`.trim());
      };

      rec.onerror = (event) => {
        // Diam sejenak bukan kegagalan — biarkan onend menyambung lagi.
        if (event.error === "no-speech" || event.error === "aborted") return;
        wantRef.current = false;
        dictating = false;
        clearRestart();
        setListening(false);
        handlers.current.onError(errorMessage(event.error));
      };

      rec.onend = () => {
        if (!wantRef.current) {
          setListening(false);
          return;
        }
        if (restartsRef.current >= MAX_RESTARTS) {
          wantRef.current = false;
          dictating = false;
          setListening(false);
          handlers.current.onError("Dikte berhenti setelah cukup lama. Tekan mikrofon lagi ya.");
          return;
        }
        restartsRef.current += 1;
        restartTimer.current = window.setTimeout(listen, 250);
      };

      recognitionRef.current = rec;
    }

    finalRef.current = "";
    restartsRef.current = 0;
    wantRef.current = true;
    dictating = true;
    setListening(true);
    listen();
  }, [clearRestart, listen]);

  // Bersihkan saat halaman ditinggalkan.
  useEffect(() => {
    return () => {
      wantRef.current = false;
      dictating = false;
      if (restartTimer.current !== null) window.clearTimeout(restartTimer.current);
      try {
        recognitionRef.current?.abort();
      } catch {
        // diabaikan
      }
    };
  }, []);

  return { supported, listening, start, stop };
}
