"use client";

import { useRef, useState } from "react";
import { PlusIcon, SendIcon, XIcon } from "./icons";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string, imageFile: File | null) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [multiline, setMultiline] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function syncSize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 120);
    el.style.height = `${next}px`;
    setMultiline(next > 46);
  }

  function handlePickFile(file: File) {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed && !imageFile) return;
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

          <div className="relative min-w-0 flex-1">
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
              placeholder="Ketik pesan"
              disabled={disabled}
              autoComplete="off"
              enterKeyHint="send"
              aria-label="Tulis pesan"
              className={`relative top-1 max-h-[120px] w-full resize-none border-none bg-surface px-4 py-2.5 text-base text-ink outline-none ring-1 ring-line transition-[border-radius] duration-150 placeholder:text-muted disabled:opacity-60 sm:text-sm ${
                multiline ? "rounded-2xl" : "rounded-full"
              }`}
            />
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
