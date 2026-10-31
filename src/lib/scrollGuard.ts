"use client";

import { useEffect } from "react";

/**
 * Kunci posisi geser halaman di iOS supaya header tidak terangkat saat keyboard
 * naik lalu turun.
 */
export function useScrollGuard() {
  useEffect(() => {
    let frame = 0;

    const reset = () => {
      frame = 0;

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

    reset();
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("focusin", schedule, true);
    document.addEventListener("focusout", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("focusin", schedule, true);
      document.removeEventListener("focusout", schedule, true);
      window.visualViewport?.addEventListener("resize", schedule);
    };
  }, []);
}
