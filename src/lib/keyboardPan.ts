"use client";

import { useEffect } from "react";

const CLASS = "kb-panned";
const MIN_GAP = 4;
const MAX_CORRECTION = 140;
const SAFE_MARGIN = 12;
const KEYBOARD_MIN = 120;
/** Abaikan goyangan mikro 1-2 px saat callout Paste / bar saran kata iOS muncul. */
const JITTER_PX = 2;

const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable='true']";

function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll") &&
      node.scrollHeight > node.clientHeight + 2
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Menetralkan geseran halaman oleh iOS saat keyboard muncul agar header chat
 * tidak ikut terdorong naik, kotak ketik tetap berada tepat di atas keyboard,
 * serta kolom isian di form pendaftaran / modal otomatis digulir ke atas keyboard.
 */
export function useKeyboardPan() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const threshold = standalone ? 1 : 24;

    let frame = 0;
    let settledFrames = 0;
    const rawInitialHeight = Math.max(window.innerHeight, Math.round(vv.height));
    const portraitScreenH = Math.max(window.screen.width, window.screen.height);
    let baseHeight =
      window.innerHeight < window.innerWidth
        ? rawInitialHeight
        : rawInitialHeight < portraitScreenH * 0.7
          ? Math.round(portraitScreenH * 0.85)
          : rawInitialHeight;
    let lastTop = -1;
    let lastHeight = -1;
    let settleTimer = 0;
    let watchTimer = 0;
    let blurTimer = 0;
    let scrollTimerA = 0;
    let scrollTimerB = 0;
    let applied = 0;
    let lastFocusedEl: HTMLElement | null = null;

    const clamp = (value: number) =>
      Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, value));

    const getFocusedEditable = (): HTMLElement | null => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement)) return null;
      const matched = el.closest<HTMLElement>(EDITABLE_SELECTOR);
      if (!matched) return null;
      if (
        matched instanceof HTMLInputElement &&
        (matched.type === "file" ||
          matched.type === "checkbox" ||
          matched.type === "radio" ||
          matched.type === "range")
      ) {
        return null;
      }
      return matched;
    };

    const hasFocusedInput = () => Boolean(getFocusedEditable());

    const isFocusedInComposer = () => {
      const el = getFocusedEditable();
      return Boolean(el && el.closest(".composer-bar"));
    };

    const isKeyboardUp = () => {
      if (!hasFocusedInput()) return false;
      if (vv.offsetTop > threshold) return true;
      if (Math.abs(vv.scale - 1) > 0.01) return false;
      return baseHeight - Math.round(vv.height) > KEYBOARD_MIN;
    };

    const scrollFieldIntoView = () => {
      const el = getFocusedEditable();
      if (!el || !el.isConnected || el.closest(".composer-bar")) return;

      const scroller = findScrollContainer(el);
      if (!scroller) return;

      const scrollerRect = scroller.getBoundingClientRect();
      const fieldRect = el.getBoundingClientRect();
      if (scrollerRect.height <= 0) return;

      const padTop = 20;
      const padBottom = 24;
      const isTallField = fieldRect.height > scrollerRect.height * 0.45;

      const clippedTop = fieldRect.top < scrollerRect.top + padTop;
      const clippedBottom = fieldRect.bottom > scrollerRect.bottom - padBottom;
      if (!clippedTop && !clippedBottom) return;

      let delta = 0;
      if (isTallField) {
        delta = fieldRect.top - (scrollerRect.top + 26);
      } else {
        const idealTop =
          scrollerRect.top + Math.min(96, scrollerRect.height * 0.3);
        delta = fieldRect.top - idealTop;
      }

      if (Math.abs(delta) < 4) return;
      const maxScroll = Math.max(
        0,
        scroller.scrollHeight - scroller.clientHeight
      );
      const nextTop = Math.max(
        0,
        Math.min(maxScroll, scroller.scrollTop + delta)
      );
      scroller.scrollTo({ top: nextTop, behavior: "smooth" });
    };

    const scheduleFieldScroll = () => {
      if (isFocusedInComposer()) return;
      window.clearTimeout(scrollTimerA);
      window.clearTimeout(scrollTimerB);
      scrollTimerA = window.setTimeout(() => {
        if (root.classList.contains(CLASS)) scrollFieldIntoView();
      }, 90);
      scrollTimerB = window.setTimeout(() => {
        if (root.classList.contains(CLASS)) scrollFieldIntoView();
      }, 280);
    };

    const clear = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      settledFrames = 0;
      window.clearTimeout(settleTimer);
      window.clearInterval(watchTimer);
      window.clearTimeout(scrollTimerA);
      window.clearTimeout(scrollTimerB);
      settleTimer = 0;
      watchTimer = 0;
      scrollTimerA = 0;
      scrollTimerB = 0;
      lastTop = -1;
      lastHeight = -1;
      applied = 0;
      if (Math.abs(vv.scale - 1) < 0.01 && Math.round(vv.height) > baseHeight) {
        baseHeight = Math.round(vv.height);
      }
      root.classList.remove(CLASS);
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-transform");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--kb-gap");

      if (!hasFocusedInput() && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const measureGap = () => {
      if (!root.classList.contains(CLASS)) return;
      if (!isFocusedInComposer()) {
        if (applied !== 0) {
          applied = 0;
          root.style.removeProperty("--kb-gap");
        }
        return;
      }

      const bar = document.querySelector<HTMLElement>(".composer-bar");
      if (!bar) return;

      const bottom = bar.getBoundingClientRect().bottom;
      if (!Number.isFinite(bottom)) return;

      const candidates = [vv.height - bottom, vv.offsetTop + vv.height - bottom];
      const gap = candidates.reduce((best, value) =>
        Math.abs(value) < Math.abs(best) ? value : best
      );
      if (Math.abs(gap) > 200) return;

      const delta = gap - SAFE_MARGIN;
      const step = Math.max(-60, Math.min(60, delta));
      const next = Math.round(clamp(applied + step));
      if (next === applied) return;

      applied = next;
      root.style.setProperty(
        "--kb-gap",
        `${Math.abs(next) < MIN_GAP ? 0 : next}px`
      );

      const after = document.querySelector<HTMLElement>(".composer-bar");
      if (!after) return;
      const overflow = after.getBoundingClientRect().bottom - vv.height;
      if (overflow > 8) {
        applied = 0;
        root.style.removeProperty("--kb-gap");
      }
    };

    const scheduleMeasures = () => {
      window.clearTimeout(settleTimer);
      window.clearInterval(watchTimer);
      if (!isFocusedInComposer() || !document.querySelector(".composer-bar")) {
        if (applied !== 0) {
          applied = 0;
          root.style.removeProperty("--kb-gap");
        }
        return;
      }

      settleTimer = window.setTimeout(() => {
        if (root.classList.contains(CLASS)) measureGap();
      }, 320);

      let ticks = 0;
      watchTimer = window.setInterval(() => {
        if (
          !root.classList.contains(CLASS) ||
          !isFocusedInComposer() ||
          !document.querySelector(".composer-bar")
        ) {
          window.clearInterval(watchTimer);
          return;
        }
        measureGap();
        if (++ticks >= 6) window.clearInterval(watchTimer);
      }, 280);
    };

    const tick = () => {
      frame = 0;

      if (Math.abs(vv.scale - 1) > 0.01) {
        clear();
        return;
      }

      if (!isKeyboardUp()) {
        clear();
        return;
      }

      const top = Math.round(vv.offsetTop);
      const height = Math.round(vv.height);
      const alreadyActive = root.classList.contains(CLASS);
      const topChanged = !alreadyActive || Math.abs(top - lastTop) > JITTER_PX;
      const heightChanged =
        !alreadyActive || Math.abs(height - lastHeight) > JITTER_PX;

      if (topChanged || heightChanged) {
        settledFrames = 0;
        lastTop = top;
        lastHeight = height;
        root.classList.add(CLASS);
        root.style.setProperty("--vv-top", `${top}px`);
        root.style.setProperty(
          "--vv-transform",
          top > 0 ? `translate3d(0, ${top}px, 0)` : "none"
        );
        root.style.setProperty("--vv-height", `${height}px`);
        scheduleMeasures();
        scheduleFieldScroll();
      } else {
        settledFrames += 1;
      }

      // Berhenti memutar rAF setelah animasi keyboard selesai dan tenang;
      // event `resize`/`scroll` pada visualViewport akan membangunkan lagi bila perlu.
      if (settledFrames < 5) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const start = () => {
      settledFrames = 0;
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    const onFocusIn = () => {
      const current = getFocusedEditable();
      const changedField = current && current !== lastFocusedEl;
      lastFocusedEl = current;
      start();
      if (changedField) {
        scheduleFieldScroll();
      }
    };

    const onFocusOut = () => {
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (!hasFocusedInput()) {
          lastFocusedEl = null;
          clear();
          window.scrollTo(0, 0);
        } else {
          start();
        }
      }, 80);
    };

    vv.addEventListener("resize", start);
    vv.addEventListener("scroll", start);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    start();

    return () => {
      window.clearTimeout(blurTimer);
      vv.removeEventListener("resize", start);
      vv.removeEventListener("scroll", start);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      clear();
    };
  }, []);
}
