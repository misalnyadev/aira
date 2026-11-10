"use client";

import { useSyncExternalStore } from "react";
import { customAccentPalette, DEFAULT_CUSTOM_THEME, parseCustomTheme, type CustomTheme } from "./customTheme";

export type ThemeChoice = "light" | "dark" | "system" | "custom";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "aisherly-theme";
const CUSTOM_STORAGE_KEY = "aisherly-custom-theme";
const DEFAULT_CUSTOM_SNAPSHOT = JSON.stringify(DEFAULT_CUSTOM_THEME);
let customSnapshot = DEFAULT_CUSTOM_SNAPSHOT;
const listeners = new Set<() => void>();

let currentChoice: ThemeChoice = "system";
let initialized = false;

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "light" || choice === "dark") return choice;
  if (choice === "custom") return parseCustomTheme(customSnapshot).base;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#fafafa",
  dark: "#000000",
};

/**
 * Warnai ulang `<meta name="theme-color">` mengikuti tema yang sedang dipakai.
 *
 * Ini yang membuat bilah status & bilah alat Safari di iPhone ikut berwarna
 * aplikasi. Tanpa ini, orang yang memilih tema gelap di HP bermode terang akan
 * melihat pita terang di atas aplikasi — seperti tampilannya terpotong.
 */
function syncThemeColor(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const color = THEME_COLORS[resolved];
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((el) => el.setAttribute("content", color));
}

/** Warnai sementara area status bar (mis. saat layar panggilan penuh aktif). */
export function setStatusBarColor(color: string) {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((el) => el.setAttribute("content", color));
}

/** Kembalikan warna status bar sesuai tema terang/gelap yang aktif. */
export function resetStatusBarColor() {
  init();
  syncThemeColor(resolve(currentChoice));
}

function applyToDom(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const resolved = resolve(choice);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  if (choice === "custom") {
    const palette = customAccentPalette(parseCustomTheme(customSnapshot).accent);
    root.style.setProperty("--brand", palette.brand);
    root.style.setProperty("--brand-strong", palette.hover);
    root.style.setProperty("--brand-ink", palette.ink);
  } else {
    root.style.removeProperty("--brand");
    root.style.removeProperty("--brand-strong");
    root.style.removeProperty("--brand-ink");
  }
  syncThemeColor(resolved);
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
    customSnapshot = JSON.stringify(parseCustomTheme(localStorage.getItem(CUSTOM_STORAGE_KEY)));
    if (saved === "light" || saved === "dark" || saved === "system" || saved === "custom") {
      currentChoice = saved;
    }
  } catch {
    // abaikan jika localStorage diblokir
  }
  applyToDom(currentChoice);

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (currentChoice === "system") {
      applyToDom("system");
      listeners.forEach((fn) => fn());
    }
  });

  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      const next: ThemeChoice = e.newValue === "light" || e.newValue === "dark" || e.newValue === "custom" ? e.newValue : "system";
      currentChoice = next;
      applyToDom(next);
      listeners.forEach((fn) => fn());
    } else if (e.key === CUSTOM_STORAGE_KEY) {
      customSnapshot = JSON.stringify(parseCustomTheme(e.newValue));
      applyToDom(currentChoice);
      listeners.forEach((fn) => fn());
    }
  });
}

export function setCustomTheme(next: CustomTheme) {
  init();
  customSnapshot = JSON.stringify(parseCustomTheme(JSON.stringify(next)));
  try { localStorage.setItem(CUSTOM_STORAGE_KEY, customSnapshot); } catch { /* storage unavailable */ }
  applyToDom(currentChoice);
  listeners.forEach((fn) => fn());
}

export function setTheme(next: ThemeChoice) {
  init();
  currentChoice = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // abaikan
  }
  applyToDom(next);
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  init();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getChoiceSnapshot(): ThemeChoice {
  init();
  return currentChoice;
}

function getResolvedSnapshot(): ResolvedTheme {
  init();
  return resolve(currentChoice);
}

/**
 * Pembaca tema untuk komponen yang hanya butuh nilainya di dalam render
 * (mis. pratinjau latar), tanpa memakai hook.
 *
 * Dipakai bersama `useSyncExternalStore`: `subscribeTheme` mendaftarkan
 * pendengar, `getIsDarkSnapshot` mengembalikan nilai saat ini. Snapshot harus
 * stabil — karena itu hasilnya boolean, bukan objek baru tiap panggilan.
 */
export function subscribeTheme(fn: () => void) {
  return subscribe(fn);
}

export function getIsDarkSnapshot(): boolean {
  return getResolvedSnapshot() === "dark";
}

/**
 * Hook tema — reaktif terhadap perubahan manual & preferensi sistem.
 */
export function useTheme() {
  const choice = useSyncExternalStore<ThemeChoice>(subscribe, getChoiceSnapshot, () => "system");
  const custom = useSyncExternalStore<string>(subscribe, () => customSnapshot, () => DEFAULT_CUSTOM_SNAPSHOT);
  const resolved = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    getResolvedSnapshot,
    () => "light"
  );

  const toggle = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  return { choice, resolved, setTheme, toggle, customTheme: parseCustomTheme(custom), setCustomTheme };
}

/**
 * Skrip kecil yang dipasang di <head> sebelum aplikasi tampil, supaya saat
 * pengguna memakai mode gelap halaman tidak sempat berkedip putih lebih dulu,
 * sekaligus menandai mode aplikasi layar penuh iPhone (`ios-standalone`) sejak
 * frame pertama agar tinggi `.app-shell` langsung penuh 100vh.
 */
export const THEME_INIT_SCRIPT = `(()=>{try{var t=localStorage.getItem('${STORAGE_KEY}');var custom;try{custom=JSON.parse(localStorage.getItem('${CUSTOM_STORAGE_KEY}')||'null')}catch(e){}if(!custom||!['light','dark'].includes(custom.base)||typeof custom.accent!=='string'||!/^#[0-9a-f]{6}$/i.test(custom.accent))custom={base:'light',accent:'#ad3ebf'};var d=t==='dark'||(t==='custom'&&custom.base==='dark')||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';if(t==='custom'){var a=custom.accent;var ch=[1,3,5].map(function(i){return parseInt(a.slice(i,i+2),16)});var l=ch.map(function(c){var v=c/255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)});var lum=.2126*l[0]+.7152*l[1]+.0722*l[2];var ink=(lum+.05)/.05>=1.05/(lum+.05);var target=ink?255:0;var hover='#'+ch.map(function(c){return Math.round(c*.85+target*.15).toString(16).padStart(2,'0')}).join('');r.style.setProperty('--brand',a);r.style.setProperty('--brand-strong',hover);r.style.setProperty('--brand-ink',ink?'#000000':'#ffffff')}if(navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches)r.classList.add('ios-standalone');var c=d?'#000000':'#fafafa';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',c);});}catch(e){}})();`;
