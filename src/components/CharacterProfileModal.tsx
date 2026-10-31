"use client";

import { useState } from "react";
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Profil Karakter</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col items-center gap-2">
            <Avatar name={character.name} src={character.avatarUrl} size={110} />
            <h3 className="mt-2 text-xl font-bold text-slate-900">{character.name}</h3>
            {character.shortBio && <p className="text-sm text-slate-500">{character.shortBio}</p>}
          </div>

          <div className="mt-5">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tentang karakter
            </h4>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
              {character.personality}
            </p>
          </div>

          {hasBible && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  📖 Bible peran
                </h4>
                <button
                  onClick={() => setShowBible((v) => !v)}
                  className="text-[11px] font-medium text-slate-500 underline decoration-dotted"
                >
                  {showBible ? "Sembunyikan" : "Lihat isi"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                {character.bible.trim().length.toLocaleString("id-ID")} karakter · dipakai sebagai
                acuan utama setiap balasan.
              </p>
              {showBible && (
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-emerald-50/60 p-3 text-xs leading-relaxed text-slate-700">
                  {character.bible}
                </pre>
              )}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              onClick={onEdit}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Edit Karakter
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              <TrashIcon className="h-4 w-4" /> Hapus
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
