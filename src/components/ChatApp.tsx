"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterDetail, CharacterSummary, ChatMessage, ProviderSummary } from "@/types/chat";
import {
  DEFAULT_BUBBLE_STYLE,
  type BubbleStyle,
} from "@/lib/bubbleStyle";
import {
  DEFAULT_CHAT_BACKGROUND,
  type ChatBackground,
} from "@/lib/chatBackground";
import { compressImageFile } from "@/lib/compressImage";
import { useKeyboardPan } from "@/lib/keyboardPan";
import { MAX_CHARACTERS } from "@/lib/limits";
import { useSafeTop } from "@/lib/safeTop";
import { useScrollGuard } from "@/lib/scrollGuard";
import { EMPTY_PROFILE, type UserProfile } from "@/lib/userProfile";
import {
  loadVoiceSettings,
  speak,
  stopSpeaking,
  useIsSpeaking,
  useSpeechSupported,
  useSpeechUnlock,
  useVoiceSettings,
} from "@/lib/voice";
import { useAuth } from "./AuthGate";
import { Avatar } from "./Avatar";
import { CharacterModal } from "./CharacterModal";
import { CharacterProfileModal } from "./CharacterProfileModal";
import { CharactersView } from "./CharactersView";
import { ChatWindow } from "./ChatWindow";
import { Composer } from "./Composer";
import { MobileTabBar, NavRail, type AppView } from "./Navigation";
import { ProfileView } from "./ProfileView";
import { SettingsView } from "./SettingsView";
import { Sidebar } from "./Sidebar";
import { VoiceView } from "./VoiceView";
import { PlusIcon, SettingsIcon, XIcon } from "./icons";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typingDelayFor(text: string) {
  const base = 450;
  const perChar = 16;
  return Math.min(base + text.length * perChar, 2600);
}

export function ChatApp() {
  const { user, expire } = useAuth();
  const [voice, setVoice] = useVoiceSettings(user.id);
  const speechSupported = useSpeechSupported();
  const isSpeaking = useIsSpeaking();

  // Jaga jarak aman status bar, kunci posisi halaman, dan selaraskan keyboard iPhone.
  useSafeTop();
  useScrollGuard();
  useKeyboardPan();
  useSpeechUnlock();

  const [view, setView] = useState<AppView>("chats");
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [autoFallback, setAutoFallback] = useState(true);
  const [chatBackground, setChatBackground] = useState<ChatBackground>(DEFAULT_CHAT_BACKGROUND);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>(DEFAULT_BUBBLE_STYLE);
  const [limit, setLimit] = useState<number>(MAX_CHARACTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [typingFor, setTypingFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editDetail, setEditDetail] = useState<CharacterDetail | null>(null);
  const [profileDetail, setProfileDetail] = useState<CharacterDetail | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Hentikan suara saat keluar dari akun atau sesi berakhir.
  useEffect(() => () => stopSpeaking(), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  /**
   * Semua permintaan lewat sini supaya 401 ditangani di satu tempat.
   * Kalau sesi sudah berakhir, layar masuk ditampilkan lagi.
   */
  const api = useCallback(
    async (input: string, init?: RequestInit) => {
      const res = await fetch(input, init);
      if (res.status === 401) expire();
      return res;
    },
    [expire]
  );

  const fetchCharacters = useCallback(async () => {
    const res = await api("/api/characters");
    if (!res.ok) return;
    const data = await res.json();
    setCharacters(data.characters ?? []);
    if (typeof data.limit === "number") setLimit(data.limit);
  }, [api]);

  const fetchProviders = useCallback(async () => {
    const res = await api("/api/providers");
    if (!res.ok) return;
    const data = await res.json();
    setProviders(data.providers ?? []);
    if (typeof data.autoFallback === "boolean") setAutoFallback(data.autoFallback);
  }, [api]);

  const fetchAppearance = useCallback(async () => {
    const res = await api("/api/appearance");
    if (!res.ok) return;
    const data = await res.json();
    if (data.chatBackground) setChatBackground(data.chatBackground);
    if (data.bubbleStyle) setBubbleStyle(data.bubbleStyle);
  }, [api]);

  const fetchProfile = useCallback(async () => {
    const res = await api("/api/profile");
    if (!res.ok) return;
    const data = await res.json();
    if (data.profile) setProfile(data.profile);
  }, [api]);

  useEffect(() => {
    Promise.all([
      fetchCharacters(),
      fetchProviders(),
      fetchProfile(),
      fetchAppearance(),
    ]).finally(() => setLoaded(true));
  }, [fetchCharacters, fetchProviders, fetchProfile, fetchAppearance]);

  const fetchMessages = useCallback(
    async (characterId: string) => {
      const res = await api(`/api/characters/${characterId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessagesMap((prev) => ({ ...prev, [characterId]: data.messages ?? [] }));
    },
    [api]
  );

  function handleViewChange(next: AppView) {
    if (next !== "chats") stopSpeaking();
    setView(next);
    if (next === "chats") setMobileShowChat(false);
  }

  function handleSelect(id: string) {
    if (id !== activeId) stopSpeaking();
    setView("chats");
    setActiveId(id);
    setMobileShowChat(true);
    if (!messagesMap[id]) fetchMessages(id);
  }

  async function handleSend(text: string, imageFile: File | null) {
    if (!activeId) return;
    const target = activeId;
    stopSpeaking();

    let imageUrl: string | null = null;
    if (imageFile) {
      const compressed = await compressImageFile(imageFile);
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await api("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Gagal mengunggah gambar.");
        return;
      }
      imageUrl = data.url;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      characterId: target,
      role: "user",
      content: text,
      imageUrl,
      status: "sent",
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessagesMap((prev) => ({
      ...prev,
      [target]: [...(prev[target] ?? []), optimisticMsg],
    }));

    setTypingFor(target);

    try {
      const res = await api("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: target, content: text, imageUrl }),
      });
      const data = await res.json();

      setMessagesMap((prev) => {
        const list = (prev[target] ?? []).map((m) =>
          m.id === tempId ? (data.userMessage ?? { ...m, pending: false }) : m
        );
        return { ...prev, [target]: list };
      });

      if (!res.ok) {
        setTypingFor(null);
        showToast(data.error || "Gagal mendapatkan balasan. Cek Setelan API key.");
        return;
      }

      if (data.fallbackUsed && data.providerLabel) {
        showToast(
          `Auto-fallback: memakai ${data.providerLabel} karena ${data.primaryLabel || "provider utama"} kena limit.`
        );
      }
      if (data.keyRotated) {
        void fetchProviders();
      }

      const bubbles: ChatMessage[] = data.assistantMessages ?? [];
      for (let i = 0; i < bubbles.length; i++) {
        setTypingFor(target);
        await sleep(typingDelayFor(bubbles[i].content));
        setMessagesMap((prev) => ({
          ...prev,
          [target]: [...(prev[target] ?? []), bubbles[i]],
        }));
        const currentVoice = loadVoiceSettings(user.id);
        if (currentVoice.enabled && activeIdRef.current === target) {
          speak(bubbles[i].content, currentVoice, { append: i > 0 });
        }
        if (i < bubbles.length - 1) await sleep(350);
      }
      setTypingFor(null);
      fetchCharacters();
    } catch {
      setTypingFor(null);
      showToast("Koneksi gagal. Coba lagi.");
    }
  }

  async function handleCopyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Teks disalin.");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        showToast("Teks disalin.");
      } catch {
        showToast("Gagal menyalin. Salin manual saja.");
      }
      document.body.removeChild(area);
    }
  }

  async function handleDeleteMessage(id: string) {
    if (!confirm("Hapus pesan ini?")) return;
    stopSpeaking();

    const res = await api(`/api/messages/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Gagal menghapus pesan.");
      return;
    }

    setMessagesMap((prev) => {
      const next: Record<string, ChatMessage[]> = {};
      for (const [key, list] of Object.entries(prev)) {
        next[key] = list.filter((m) => m.id !== id);
      }
      return next;
    });
    fetchCharacters();
  }

  function handleSpeakMessage(text: string) {
    if (!speak(text, voice)) {
      showToast("Pesan ini tidak bisa dibacakan di browser ini.");
    }
  }

  async function handleRegenerate() {
    if (!activeId || typingFor === activeId) return;

    const target = activeId;
    stopSpeaking();
    setTypingFor(target);

    try {
      const res = await api(`/api/characters/${target}/regenerate`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setTypingFor(null);
        showToast(data.error || "Gagal mengulang balasan.");
        return;
      }

      if (data.fallbackUsed && data.providerLabel) {
        showToast(
          `Auto-fallback: memakai ${data.providerLabel} karena ${data.primaryLabel || "provider utama"} kena limit.`
        );
      }
      if (data.keyRotated) {
        void fetchProviders();
      }

      const removed: string[] = data.removedIds ?? [];
      setMessagesMap((prev) => ({
        ...prev,
        [target]: (prev[target] ?? []).filter((m) => !removed.includes(m.id)),
      }));

      const bubbles: ChatMessage[] = data.assistantMessages ?? [];
      for (let i = 0; i < bubbles.length; i++) {
        setTypingFor(target);
        await sleep(typingDelayFor(bubbles[i].content));
        setMessagesMap((prev) => ({
          ...prev,
          [target]: [...(prev[target] ?? []), bubbles[i]],
        }));
        const currentVoice = loadVoiceSettings(user.id);
        if (currentVoice.enabled && activeIdRef.current === target) {
          speak(bubbles[i].content, currentVoice, { append: i > 0 });
        }
        if (i < bubbles.length - 1) await sleep(350);
      }
      setTypingFor(null);
      fetchCharacters();
    } catch {
      setTypingFor(null);
      showToast("Koneksi gagal. Coba lagi.");
    }
  }

  async function openProfile(id: string) {
    const res = await api(`/api/characters/${id}`);
    const data = await res.json();
    if (res.ok) {
      setProfileDetail(data.character);
      setShowProfile(true);
    }
  }

  async function openEdit(id: string) {
    const res = await api(`/api/characters/${id}`);
    const data = await res.json();
    if (res.ok) {
      setEditDetail(data.character);
    } else {
      showToast(data.error || "Gagal memuat data karakter.");
    }
  }

  async function handleDeleteCharacter(id: string) {
    if (!confirm("Hapus karakter ini beserta seluruh riwayat chat?")) return;
    await api(`/api/characters/${id}`, { method: "DELETE" });
    setShowProfile(false);
    setEditDetail(null);
    if (activeId === id) {
      stopSpeaking();
      setActiveId(null);
      setMobileShowChat(false);
    }
    fetchCharacters();
  }

  async function handleClearChat(id: string) {
    if (!confirm("Hapus seluruh riwayat chat dengan karakter ini?")) return;
    stopSpeaking();
    const res = await api(`/api/characters/${id}/messages`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || "Gagal menghapus riwayat chat.");
      return;
    }
    setMessagesMap((prev) => ({ ...prev, [id]: data.messages ?? [] }));
    setShowProfile(false);
    fetchCharacters();
  }

  async function handleCharacterBackground(id: string, next: ChatBackground | null) {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, chatBackground: next } : c))
    );
    setProfileDetail((cur) => (cur && cur.id === id ? { ...cur, chatBackground: next } : cur));

    try {
      const res = await api(`/api/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatBackground: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast("Gagal menyimpan latar karakter.");
      fetchCharacters();
    }
  }

  async function handleCharacterBubble(id: string, next: BubbleStyle | null) {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, bubbleStyle: next } : c))
    );
    setProfileDetail((cur) => (cur && cur.id === id ? { ...cur, bubbleStyle: next } : cur));

    try {
      const res = await api(`/api/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bubbleStyle: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast("Gagal menyimpan gelembung karakter.");
      fetchCharacters();
    }
  }

  const profileProviderLabel = (() => {
    if (!profileDetail) return "";
    const chosen = profileDetail.providerId
      ? providers.find((p) => p.id === profileDetail.providerId)
      : providers.find((p) => p.isDefault) ?? providers[0];
    if (!chosen) return "Belum ada provider";
    const modelName = profileDetail.model || chosen.model;
    return `${chosen.label} · ${modelName}`;
  })();

  const activeCharacter = characters.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? messagesMap[activeId] ?? [] : [];
  const hasProviders = providers.some((p) => p.hasKey || p.type === "custom");
  const showMobileTabBar = !(view === "chats" && mobileShowChat);

  if (!loaded) {
    return (
      <div className="app-shell flex items-center justify-center bg-app text-sm text-muted">
        Memuat Aisherly...
      </div>
    );
  }

  return (
    <div className="app-shell flex bg-app text-ink">
      <NavRail view={view} onChange={handleViewChange} profile={profile} />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {view === "chats" && (
            <>
              <div className={`${mobileShowChat ? "hidden" : "flex"} min-h-0 w-full md:w-auto md:flex`}>
                <Sidebar
                  characters={characters}
                  activeId={activeId}
                  profile={profile}
                  onSelect={handleSelect}
                  onNewCharacter={() => setShowCreate(true)}
                  onOpenSettings={() => handleViewChange("settings")}
                  onOpenProfile={() => handleViewChange("profile")}
                  hasProviders={hasProviders}
                  limit={limit}
                />
              </div>

              <div className={`${mobileShowChat ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
                {activeCharacter ? (
                  <>
                    <ChatWindow
                      character={activeCharacter}
                      messages={activeMessages}
                      isTyping={typingFor === activeId}
                      isSpeaking={isSpeaking}
                      canSpeak={speechSupported}
                      voiceEnabled={voice.enabled}
                      background={activeCharacter.chatBackground ?? chatBackground}
                      bubble={activeCharacter.bubbleStyle ?? bubbleStyle}
                      onBack={() => {
                        stopSpeaking();
                        setMobileShowChat(false);
                      }}
                      onOpenProfile={() => openProfile(activeCharacter.id)}
                      onOpenVoice={() => handleViewChange("voice")}
                      onImageClick={(url) => setLightbox(url)}
                      onCopyMessage={handleCopyMessage}
                      onSpeakMessage={handleSpeakMessage}
                      onStopSpeaking={stopSpeaking}
                      onDeleteMessage={handleDeleteMessage}
                      onRegenerate={handleRegenerate}
                    />
                    <Composer onSend={handleSend} disabled={typingFor === activeId} />
                  </>
                ) : (
                  <div className="dot-grid relative flex h-full flex-1 flex-col items-center justify-center overflow-y-auto bg-app px-5 py-10 text-center">
                    <div className="fade-in w-full max-w-md">
                      {characters.length > 0 && (
                        <div className="mb-5 flex justify-center -space-x-3">
                          {characters.slice(0, 3).map((c, i) => (
                            <div
                              key={c.id}
                              style={{ zIndex: 3 - i }}
                              className="rounded-full ring-4 ring-app"
                            >
                              <Avatar name={c.name} src={c.avatarUrl} size={56} />
                            </div>
                          ))}
                        </div>
                      )}

                      <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">
                        Aisherly<span className="text-muted">.</span>
                      </h2>
                      <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
                        Pilih karakter di sebelah kiri untuk mulai ngobrol, atau buat karaktermu
                        sendiri lalu impor bible perannya.
                      </p>

                      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() => handleViewChange("settings")}
                          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98]"
                        >
                          <SettingsIcon className="h-4 w-4" /> Atur API Key
                        </button>
                        <button
                          onClick={() => setShowCreate(true)}
                          disabled={characters.length >= limit}
                          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <PlusIcon className="h-4 w-4" /> Buat Karakter
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "voice" && <VoiceView settings={voice} onChange={setVoice} />}

          {view === "characters" && (
            <CharactersView
              characters={characters}
              limit={limit}
              onChat={handleSelect}
              onNew={() => setShowCreate(true)}
              onEdit={openEdit}
              onDelete={handleDeleteCharacter}
            />
          )}

          {view === "profile" && (
            <ProfileView
              key={`${profile.displayName}|${profile.nickname}|${profile.age ?? ""}|${profile.occupation}|${profile.about}|${profile.avatarUrl ?? ""}`}
              profile={profile}
              onSaved={setProfile}
            />
          )}

          {view === "settings" && (
            <SettingsView
              providers={providers}
              autoFallback={autoFallback}
              onAutoFallbackChange={setAutoFallback}
              chatBackground={chatBackground}
              onChatBackgroundChange={setChatBackground}
              bubbleStyle={bubbleStyle}
              onBubbleStyleChange={setBubbleStyle}
              onChanged={fetchProviders}
            />
          )}
        </div>

        {showMobileTabBar && <MobileTabBar view={view} onChange={handleViewChange} />}
      </div>

      {showCreate && (
        <CharacterModal
          providers={providers}
          onClose={() => setShowCreate(false)}
          onSaved={fetchCharacters}
        />
      )}

      {editDetail && (
        <CharacterModal
          initial={editDetail}
          providers={providers}
          onClose={() => setEditDetail(null)}
          onSaved={async () => {
            await fetchCharacters();
            setShowProfile(false);
          }}
        />
      )}

      {showProfile && profileDetail && (
        <CharacterProfileModal
          character={profileDetail}
          providerLabel={profileProviderLabel}
          bubbleFallback={bubbleStyle}
          onClose={() => setShowProfile(false)}
          onEdit={() => {
            setEditDetail(profileDetail);
            setShowProfile(false);
          }}
          onClearChat={() => handleClearChat(profileDetail.id)}
          onDelete={() => handleDeleteCharacter(profileDetail.id)}
          onBackgroundChange={(next) => handleCharacterBackground(profileDetail.id, next)}
          onBubbleChange={(next) => handleCharacterBubble(profileDetail.id, next)}
        />
      )}

      {lightbox && (
        <div
          className="fade-in fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            onClick={() => setLightbox(null)}
            aria-label="Tutup gambar"
          >
            <XIcon className="h-7 w-7" />
          </button>
          <img
            src={lightbox}
            alt="preview"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
          />
        </div>
      )}

      {toast && (
        <div
          className={`fixed left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 rounded-full bg-brand px-4 py-2 text-center text-xs font-medium text-brand-ink shadow-lg ${
            showMobileTabBar
              ? "bottom-[calc(var(--tabbar-space)+0.25rem)] md:bottom-6"
              : "bottom-20 md:bottom-6"
          }`}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
