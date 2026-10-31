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
 * tombol titik tiga. Tekan lama membuka lembar pilihan lebih dulu agar tidak ada
 * pesan yang terhapus tanpa sengaja.
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
      className="fade-in fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="pop-in w-full max-w-sm rounded-t-3xl border border-line bg-surface p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={() => {
              onClose();
              action.onClick();
            }}
            className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition hover:bg-surface-2 ${
              action.danger ? "text-rose-500" : "text-ink"
            }`}
          >
            {action.label}
          </button>
        ))}
        <button
          onClick={onClose}
          className="mt-1 w-full rounded-xl bg-surface-2 px-4 py-3 text-center text-sm font-semibold text-ink-soft transition hover:text-ink"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
