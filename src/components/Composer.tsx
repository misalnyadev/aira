"use client";

import { useCallback, useRef, useState } from "react";
import { useDictation } from "@/lib/dictation";
import { stopSpeaking } from "@/lib/voice";
import { MicIcon, PlusIcon, SendIcon, XIcon } from "./icons";

export function Composer({
  onSend,
  disabled,
  onNotice,
}: {
  onSend: (text: string, imageFile: File | null) => void;
  disabled?: boolean;
  /** Pesan singkat untuk pengguna (mis. izin mikrofon ditolak). */
  onNotice?: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [multiline, setMultiline] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Tulisan yang sudah ada saat mikrofon ditekan — hasil dikte menyambung di belakangnya. */
  const dictationBase = useRef("");
  /** Setelah pesan dikirim, sisa hasil dikte yang telat datang diabaikan. */
  const dictationOff = useRef(false);

  /**
   * Sesuaikan tinggi textarea dengan isinya, sekaligus deteksi apakah tulisan
   * sudah turun ke baris kedua. Kalau iya, kotak berubah jadi petak (rounded-2xl)
   * supaya teks tidak terpotong lengkungan kapsul.
   */
  const syncSize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    const styles = window.getComputedStyle(el);
    const lineHeight = parseFloat(styles.lineHeight) || 24;
    const padding =
      (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    setMultiline(el.scrollHeight - padding > lineHeight * 1.3);
  }, []);

  /**
   * Hasil dikte masuk ke kolom tulis. Tinggi kotak disesuaikan setelah React
   * memperbarui isinya, makanya ditunda satu tick.
   */
  const handleDictation = useCallback(
    (spoken: string) => {
      if (dictationOff.current) return;
      const base = dictationBase.current;
      setText(spoken ? (base ? `${base} ${spoken}` : spoken) : base);
      window.setTimeout(() => {
        if (textareaRef.current) syncSize(textareaRef.current);
      }, 0);
    },
    [syncSize]
  );

  const handleDictationError = useCallback(
    (message: string) => onNotice?.(message),
    [onNotice]
  );

  const dictation = useDictation({ onText: handleDictation, onError: handleDictationError });

  function handleMic() {
    if (dictation.listening) {
      dictation.stop();
      return;
    }
    // Suara karakter yang sedang dibacakan jangan sampai ikut terekam.
    stopSpeaking();
    dictationOff.current = false;
    dictationBase.current = text.trim();
    dictation.start();
  }

  function handlePickFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed && !imageFile) return;
    dictationOff.current = true;
    if (dictation.listening) dictation.stop();
    dictationBase.current = "";
    onSend(trimmed, imageFile);
    setText("");
    clearImage();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      setMultiline(false);
    }
  }

  return (
    <div className="composer-bar bg-header px-2.5 py-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.625rem))] sm:px-3 sm:py-2.5">
      <div className="mx-auto w-full max-w-3xl">
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative">
              <img
                src={imagePreview}
                alt="preview"
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-line"
              />
              <button
                onClick={clearImage}
                aria-label="Batalkan foto"
                className="absolute -right-1.5 -top-1.5 rounded-full bg-brand p-0.5 text-brand-ink shadow"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
            <span className="text-xs text-ink-soft">Foto siap dikirim</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handlePickFile(file);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="mb-0.5 shrink-0 p-[5px] text-ink-soft transition active:opacity-50 disabled:opacity-50"
            title="Kirim foto"
            aria-label="Lampirkan foto"
          >
            <PlusIcon className="h-[30px] w-[30px]" />
          </button>

          <div className="relative min-w-0 w-full flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                syncSize(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              rows={1}
              placeholder={dictation.listening ? "Mendengarkan…" : "Ketik pesan"}
              disabled={disabled}
              autoComplete="off"
              enterKeyHint="send"
              aria-label="Tulis pesan"
              className={`relative top-1 max-h-[120px] w-full resize-none border-none bg-surface px-4 py-2.5 pr-11 text-base text-ink outline-none ring-1 ring-line transition-[border-radius] duration-150 placeholder:text-muted disabled:opacity-60 sm:text-sm ${
                multiline ? "rounded-2xl" : "rounded-full"
              }`}
            />
            {dictation.supported && (
              <button
                type="button"
                onClick={handleMic}
                disabled={disabled}
                aria-label={dictation.listening ? "Hentikan dikte" : "Bicara untuk menulis"}
                aria-pressed={dictation.listening}
                title={dictation.listening ? "Hentikan dikte" : "Bicara untuk menulis"}
                className={`absolute bottom-1.5 right-1.5 rounded-full p-1 transition active:opacity-50 disabled:opacity-40 ${
                  dictation.listening ? "text-rose-600 dark:text-rose-400" : "text-ink-soft"
                }`}
              >
                <MicIcon className="h-6 w-6" />
              </button>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={disabled || (!text.trim() && !imageFile)}
            className="mb-0.5 shrink-0 rounded-full bg-brand p-2.5 text-brand-ink transition hover:bg-brand-strong disabled:opacity-40"
            title="Kirim"
            aria-label="Kirim pesan"
          >
            <SendIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
