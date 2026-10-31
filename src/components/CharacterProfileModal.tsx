"use client";

import { useEffect, useState } from "react";
import type { CharacterDetail } from "@/types/chat";
import { Avatar } from "./Avatar";
import { TrashIcon, XIcon } from "./icons";

export function CharacterProfileModal({
  character,
  onClose,
  onEdit,
  onDelete,
}: {
  character: CharacterDetail;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
        aria-label="Profil Karakter"
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
          <div className="flex flex-col items-center gap-2">
            <Avatar name={character.name} src={character.avatarUrl} size={104} ring />
            <h3 className="mt-2 font-display text-xl font-bold text-ink">{character.name}</h3>
            {character.shortBio && <p className="text-sm text-ink-soft">{character.shortBio}</p>}
          </div>

          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              Tentang karakter
            </h4>
            <p className="whitespace-pre-wrap rounded-2xl bg-surface-2 p-3.5 text-sm leading-relaxed text-ink">
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

          <div className="mt-6 flex gap-2">
            <button
              onClick={onEdit}
              className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98]"
            >
              Edit Karakter
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-rose-500/10"
            >
              <TrashIcon className="h-4 w-4" /> Hapus
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
