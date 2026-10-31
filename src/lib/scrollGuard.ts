"use client";

import { useEffect } from "react";

/**
 * Kunci posisi geser halaman di iOS supaya header tidak terangkat saat keyboard
 * naik lalu turun, tanpa mengganggu long-press "Tempel / Paste" di dalam field.
 */
export function useScrollGuard() {
  useEffect(() => {
    let frame = 0;
    let touchingField = false;

    const reset = () => {
      frame = 0;
      // Jangan memanggil scrollTo di tengah klik-tahan pada input/textarea agar
      // popup "Tempel" iOS tidak ikut tertutup; segera dirapikan saat jari lepas.
      if (touchingField) return;

      const scrolling = document.scrollingElement as HTMLElement | null;
      const shell = document.querySelector<HTMLElement>(".app-shell");

      if (scrolling && scrolling.scrollTop !== 0) scrolling.scrollTop = 0;
      if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
      if (shell && shell.scrollTop !== 0) shell.scrollTop = 0;

      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(reset);
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target;
      touchingField =
        target instanceof HTMLElement &&
        Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };

    const onTouchEnd = () => {
      if (!touchingField) return;
      touchingField = false;
      schedule();
    };

    const onDocumentScroll = (e: Event) => {
      // Abaikan scroll normal di dalam kontainer overflow-y-auto maupun di dalam input teks.
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target !== document.documentElement &&
        target !== document.body &&
        !target.classList.contains("app-shell")
      ) {
        return;
      }
      schedule();
    };

    reset();
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("scroll", onDocumentScroll, true);
    document.addEventListener("focusin", schedule, true);
    document.addEventListener("focusout", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("scroll", onDocumentScroll, true);
      document.removeEventListener("focusin", schedule, true);
      document.removeEventListener("focusout", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, []);
}
