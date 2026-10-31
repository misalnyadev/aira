"use client";

import { useEffect, type RefObject } from "react";

const EDGE = 20;

/**
 * Menjaga kolom isian di dalam panel scroll tetap terlihat saat keyboard iPhone muncul.
 */
export function useKeepFieldVisible(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;

    let timer = 0;

    function reveal() {
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

      if (rect.bottom > bottom) {
        container.scrollTop += rect.bottom - bottom;
      } else if (rect.top < top) {
        container.scrollTop -= top - rect.top;
      }
    }

    function schedule(delay: number) {
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, delay);
    }

    function onFocusIn(event: FocusEvent) {
      const el = event.target;
      if (!(el instanceof HTMLElement)) return;
      if (!el.matches("input, textarea, select")) return;
      schedule(320);
      schedule(560);
    }

    function onViewportResize() {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select")) schedule(260);
    }

    container.addEventListener("focusin", onFocusIn);
    window.visualViewport?.addEventListener("resize", onViewportResize);

    return () => {
      container.removeEventListener("focusin", onFocusIn);
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      window.clearTimeout(timer);
    };
  }, [containerRef, active]);
}
