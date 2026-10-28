"use client";

import { useRef, useState } from "react";
import { PaperclipIcon, SendIcon, XIcon } from "./icons";

export function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string, imageFile: File | null) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div className="border-t border-slate-200 bg-[#f0f2f5] px-3 py-2.5">
      {imagePreview && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative">
            <img src={imagePreview} alt="preview" className="h-16 w-16 rounded-lg object-cover" />
            <button
              onClick={clearImage}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-0.5 text-white"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
          <span className="text-xs text-slate-500">Foto siap dikirim</span>
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
          className="mb-1 shrink-0 rounded-full p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-50"
          title="Kirim foto"
        >
          <PaperclipIcon className="h-5 w-5" />
        </button>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
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
          className="max-h-[120px] flex-1 resize-none rounded-full border-none bg-white px-4 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || (!text.trim() && !imageFile)}
          className="mb-0.5 shrink-0 rounded-full bg-emerald-600 p-2.5 text-white transition hover:bg-emerald-700 disabled:opacity-40"
          title="Kirim"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
