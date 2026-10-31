"use client";

import { useEffect } from "react";

/**
 * Jarak aman atas (tinggi status bar iPhone) sebagai jaring pengaman.
 *
 * Di iOS dengan `black-translucent`, `env(safe-area-inset-top)` kadang terbaca
 * 0 walaupun halaman memakai `viewport-fit=cover`. Tinggi status bar dihitung
 * dari ukuran layar perangkat, lalu diambil yang paling besar antara angka itu
 * dan hasil pengukuran `env()`.
 */
const STATUS_BAR: Record<string, number> = {
  "320x568": 20, // SE (generasi 1)
  "375x667": 20, // SE (2/3), iPhone 8
  "414x736": 20, // 8 Plus
  "375x812": 44, // X, XS, 11 Pro, 12 mini, 13 mini
  "390x844": 47, // 12, 13, 14
  "393x852": 59, // 14 Pro, 15, 15 Pro, 16
  "402x874": 62, // 16 Pro, 17
  "414x896": 48, // XR, 11, 11 Pro Max
  "428x926": 47, // 12/13 Pro Max, 14 Plus
  "430x932": 59, // 14 Pro Max, 15 Plus, 15/16 Pro Max
  "440x956": 62, // 16 Pro Max, 17 Pro Max
};

const NOTCHED_FALLBACK = 59;
const OLD_FALLBACK = 44;

function screenSize(): { w: number; h: number } {
  const w = Math.round(window.screen.width);
  const h = Math.round(window.screen.height);
  return { w: Math.min(w, h), h: Math.max(w, h) };
}

export function deviceStatusBarHeight(): number {
  const { w, h } = screenSize();
  const exact = STATUS_BAR[`${w}x${h}`];
  if (exact) return exact;
  return h >= 800 ? NOTCHED_FALLBACK : OLD_FALLBACK;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

function isAppMode(): boolean {
  if (typeof navigator === "undefined") return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  const mq = (mode: string) => window.matchMedia(`(display-mode: ${mode})`).matches;
  if (mq("standalone") || mq("fullscreen") || mq("minimal-ui")) return true;
  return window.screen.height - window.innerHeight < 100;
}

function readInsetTop(): number {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:env(safe-area-inset-top,0px);" +
    "padding:0;margin:0;border:0;visibility:hidden;pointer-events:none;";
  document.documentElement.appendChild(probe);
  const value = probe.getBoundingClientRect().height;
  probe.remove();
  return value;
}

export function resolveSafeTop(): number {
  const measured = readInsetTop();

  // Kalau browser sudah melaporkan jarak aman yang wajar, percayai itu.
  // Angka tabel hanya dipakai saat env() terbaca 0 — jangan menambah jarak
  // di atas jarak yang sudah ada, karena hasilnya pita kosong di bawah
  // status bar.
  if (measured > 0) return measured;

  if (!isAppMode()) return 0;
  return deviceStatusBarHeight();
}

export function useSafeTop() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      if (!isIOS()) return;
      root.style.setProperty("--safe-top", `${Math.round(resolveSafeTop())}px`);
    };

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);
}
