"use client";

import { useEffect, type RefObject } from "react";

const EDGE = 20;

/**
 * Menjaga kolom isian di dalam panel scroll tetap terlihat saat keyboard iPhone muncul.
 *
 * Penting di iOS: jangan pernah menggeser `scrollTop` selama jari pengguna masih
 * menempel di layar (`touching === true`), karena menggeser halaman di tengah
 * klik-tahan (long-press ~500 ms) akan langsung menutup popup "Tempel / Paste"
 * bawaan iPhone dan menggeser tombol lain ke bawah jari.
 */
export function useKeepFieldVisible(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    let timer = 0;
    let touching = false;
    let pendingWhileTouching = false;

    function reveal() {
      if (touching) {
        pendingWhileTouching = true;
        return;
      }
      pendingWhileTouching = false;

      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !container) return;
      if (!container.contains(el)) return;
      if (!el.matches("input, textarea, select")) return;

      const vv = window.visualViewport;
      const visibleTop = vv ? vv.offsetTop : 0;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

      const rect = el.getBoundingClientRect();
      const ownRect = container.getBoundingClientRect();
      const top = Math.max(ownRect.top, visibleTop) + EDGE;
      const bottom = Math.min(ownRect.bottom, visibleBottom) - EDGE;

      if (rect.bottom > bottom + 4) {
        container.scrollTop += rect.bottom - bottom;
      } else if (rect.top < top - 4) {
        container.scrollTop -= top - rect.top;
      }
    }

    function schedule(delay: number) {
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, delay);
    }

    function onTouchStart() {
      touching = true;
    }

    function onTouchEnd() {
      touching = false;
      if (pendingWhileTouching) {
        pendingWhileTouching = false;
        schedule(180);
      }
    }

    function onFocusIn(event: FocusEvent) {
      const el = event.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.matches("input, textarea, select")) return;
      schedule(360);
    }

    function onViewportResize() {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select")) {
        schedule(240);
      }
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });
    container.addEventListener("focusin", onFocusIn);
    window.visualViewport?.addEventListener("resize", onViewportResize);

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
      container.removeEventListener("focusin", onFocusIn);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      window.clearTimeout(timer);
    };
  }, [containerRef, active]);
}
