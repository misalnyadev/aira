"use client";

import { useEffect } from "react";

const CLASS = "kb-panned";
const MIN_GAP = 4;
const MAX_CORRECTION = 140;
const SAFE_MARGIN = 12;
const KEYBOARD_MIN = 120;

/**
 * Menetralkan geseran halaman oleh iOS saat keyboard muncul agar header chat
 * tidak ikut terdorong naik dan kotak ketik tetap berada tepat di atas keyboard.
 */
export function useKeyboardPan() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const threshold = standalone ? 1 : 24;

    let frame = 0;
    let baseHeight = Math.max(window.innerHeight, Math.round(vv.height));
    let lastTop = -1;
    let lastHeight = -1;
    let settleTimer = 0;
    let watchTimer = 0;
    let applied = 0;

    const clamp = (value: number) =>
      Math.max(-MAX_CORRECTION, Math.min(MAX_CORRECTION, value));

    const isKeyboardUp = () => {
      if (vv.offsetTop > threshold) return true;
      if (Math.abs(vv.scale - 1) > 0.01) return false;
      return baseHeight - Math.round(vv.height) > KEYBOARD_MIN;
    };

    const clear = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      window.clearTimeout(settleTimer);
      window.clearInterval(watchTimer);
      settleTimer = 0;
      watchTimer = 0;
      lastTop = -1;
      lastHeight = -1;
      applied = 0;
      if (Math.abs(vv.scale - 1) < 0.01 && Math.round(vv.height) > baseHeight) {
        baseHeight = Math.round(vv.height);
      }
      root.classList.remove(CLASS);
      root.style.removeProperty("--vv-top");
      root.style.removeProperty("--vv-height");
      root.style.removeProperty("--kb-gap");
    };

    const measureGap = () => {
      if (!root.classList.contains(CLASS)) return;
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
      root.style.setProperty("--kb-gap", `${Math.abs(next) < MIN_GAP ? 0 : next}px`);

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
      [320, 700, 1100].forEach((delay) => {
        window.setTimeout(() => {
          if (root.classList.contains(CLASS)) measureGap();
        }, delay);
      });
      let ticks = 0;
      watchTimer = window.setInterval(() => {
        if (!root.classList.contains(CLASS)) {
          window.clearInterval(watchTimer);
          return;
        }
        measureGap();
        if (++ticks >= 8) window.clearInterval(watchTimer);
      }, 250);
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
      if (top !== lastTop || height !== lastHeight) {
        lastTop = top;
        lastHeight = height;
        root.classList.add(CLASS);
        root.style.setProperty("--vv-top", `${top}px`);
        root.style.setProperty("--vv-height", `${height}px`);
        scheduleMeasures();
      }

      frame = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    vv.addEventListener("resize", start);
    vv.addEventListener("scroll", start);
    start();

    return () => {
      vv.removeEventListener("resize", start);
      vv.removeEventListener("scroll", start);
      clear();
    };
  }, []);
}
