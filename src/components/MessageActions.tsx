"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MessageAction = {
  label: string;
  onClick: () => void;
  danger?: boolean;
};

/**
 * Menu aksi per pesan.
 *
 * Di HP dibuka dengan tekan lama (~450 ms), di desktop dengan klik kanan atau
 * titik tiga. Tekan lama sengaja tidak langsung memicu aksi — menu dulu, baru
 * pengguna memilih — supaya tidak ada pesan yang terhapus tanpa sengaja.
 */
export function useMessageActions() {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const startLongPress = useCallback(
    (id: string) => {
      clearTimer();
      longPressed.current = false;
      timer.current = setTimeout(() => {
        longPressed.current = true;
        setOpenFor(id);
      }, 450);
    },
    [clearTimer]
  );

  const cancelLongPress = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  /**
   * Dipakai di onClick: kalau barusan tekan lama, klik yang mengikutinya
   * diabaikan supaya tidak ikut membuka profil atau memperbesar gambar.
   */
  const consumeLongPress = useCallback(() => {
    if (longPressed.current) {
      longPressed.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    openFor,
    setOpenFor,
    startLongPress,
    cancelLongPress,
    consumeLongPress,
  };
}

export function MessageActionSheet({
  actions,
  onClose,
}: {
  actions: MessageAction[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => {
              onClose();
              action.onClick();
            }}
            className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-slate-100 ${
              action.danger ? "text-rose-600" : "text-slate-800"
            }`}
          >
            {action.label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="mt-1 w-full rounded-xl bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-600"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
