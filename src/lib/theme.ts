"use client";

import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "aisherly-theme";
const listeners = new Set<() => void>();

let currentChoice: ThemeChoice = "system";
let initialized = false;

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "light" || choice === "dark") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDom(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const resolved = resolve(choice);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
    if (saved === "light" || saved === "dark" || saved === "system") {
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
      const next = (e.newValue as ThemeChoice) || "system";
      currentChoice = next;
      applyToDom(next);
      listeners.forEach((fn) => fn());
    }
  });
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
 * Hook tema — reaktif terhadap perubahan manual & preferensi sistem.
 */
export function useTheme() {
  const choice = useSyncExternalStore<ThemeChoice>(subscribe, getChoiceSnapshot, () => "system");
  const resolved = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    getResolvedSnapshot,
    () => "light"
  );

  const toggle = () => {
    setTheme(resolved === "dark" ? "light" : "dark");
  };

  return { choice, resolved, setTheme, toggle };
}

/**
 * Skrip kecil yang dipasang di <head> sebelum aplikasi tampil, supaya saat
 * pengguna memakai mode gelap halaman tidak sempat berkedip putih lebih dulu.
 */
export const THEME_INIT_SCRIPT = `(()=>{try{var t=localStorage.getItem('${STORAGE_KEY}');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d)r.classList.add('dark');r.style.colorScheme=d?'dark':'light';}catch(e){}})();`;
