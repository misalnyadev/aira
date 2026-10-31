"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterDetail, CharacterSummary, ChatMessage, ProviderSummary } from "@/types/chat";
import { compressImageFile } from "@/lib/compressImage";
import { MAX_CHARACTERS } from "@/lib/limits";
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
import { Sidebar } from "./Sidebar";
import { ChatWindow } from "./ChatWindow";
import { Composer } from "./Composer";
import { SettingsModal } from "./SettingsModal";
import { VoiceModal } from "./VoiceModal";
import { CharacterModal } from "./CharacterModal";
import { CharacterProfileModal } from "./CharacterProfileModal";
import { XIcon } from "./icons";

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

  // iOS Safari: buka mesin suara pada sentuhan pertama supaya auto-baca tidak dibungkam.
  useSpeechUnlock();

  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [autoFallback, setAutoFallback] = useState(true);
  const [limit, setLimit] = useState<number>(MAX_CHARACTERS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [typingFor, setTypingFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
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
   * Kalau sesi sudah berakhir, layar masuk ditampilkan lagi — bukan diam-diam
   * gagal dengan daftar kosong yang membingungkan.
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

  useEffect(() => {
    Promise.all([fetchCharacters(), fetchProviders()]).finally(() => setLoaded(true));
  }, [fetchCharacters, fetchProviders]);

  const fetchMessages = useCallback(
    async (characterId: string) => {
      const res = await api(`/api/characters/${characterId}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      setMessagesMap((prev) => ({ ...prev, [characterId]: data.messages ?? [] }));
    },
    [api]
  );

  function handleSelect(id: string) {
    if (id !== activeId) stopSpeaking();
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
        showToast(data.error || "Gagal mendapatkan balasan. Cek Pengaturan API key.");
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

  /** Salin teks pesan ke papan klip, dengan cadangan untuk browser lama. */
  async function handleCopyMessage(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Teks disalin.");
    } catch {
      // Safari lama / bukan HTTPS: pakai textarea sementara.
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

    // Buang dari layar tanpa memuat ulang seluruh riwayat.
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

  async function handleToggleAutoFallback(next: boolean) {
    setAutoFallback(next);
    const res = await api("/api/providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoFallback: next }),
    });
    if (!res.ok) {
      setAutoFallback(!next);
      showToast("Gagal menyimpan pengaturan fallback.");
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

  const activeCharacter = characters.find((c) => c.id === activeId) ?? null;
  const activeMessages = activeId ? messagesMap[activeId] ?? [] : [];
  const hasProviders = providers.length > 0;

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400">
        Memuat Aisherly...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100">
      <div className={`${mobileShowChat ? "hidden" : "flex"} w-full md:flex`}>
        <Sidebar
          characters={characters}
          activeId={activeId}
          onSelect={handleSelect}
          onNewCharacter={() => setShowCreate(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenVoice={() => setShowVoice(true)}
          hasProviders={hasProviders}
          voiceEnabled={voice.enabled}
          limit={limit}
        />
      </div>

      <div className={`${mobileShowChat ? "flex" : "hidden"} w-full flex-1 flex-col md:flex`}>
        {activeCharacter ? (
          <>
            <ChatWindow
              character={activeCharacter}
              messages={activeMessages}
              isTyping={typingFor === activeId}
              isSpeaking={isSpeaking}
              canSpeak={speechSupported}
              voiceEnabled={voice.enabled}
              onBack={() => {
                stopSpeaking();
                setMobileShowChat(false);
              }}
              onOpenProfile={() => openProfile(activeCharacter.id)}
              onOpenVoice={() => setShowVoice(true)}
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
          <div className="flex h-full flex-1 flex-col items-center justify-center bg-[#f7f8fa] px-6 text-center">
            <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-4xl">
              💬
            </div>
            <h2 className="text-xl font-semibold text-slate-800">Aisherly</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-500">
              Pilih karakter di sebelah kiri untuk mulai ngobrol, atau buat karaktermu sendiri lalu
              impor bible perannya.
            </p>
            {!hasProviders && (
              <button
                onClick={() => setShowSettings(true)}
                className="mt-4 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Atur API Key Dulu
              </button>
            )}
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          providers={providers}
          autoFallback={autoFallback}
          onToggleAutoFallback={handleToggleAutoFallback}
          onClose={() => setShowSettings(false)}
          onRefresh={fetchProviders}
          onOpenVoice={() => {
            setShowSettings(false);
            setShowVoice(true);
          }}
        />
      )}

      {showVoice && (
        <VoiceModal
          settings={voice}
          onChange={setVoice}
          onClose={() => setShowVoice(false)}
        />
      )}

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
          onClose={() => setShowProfile(false)}
          onEdit={() => {
            setEditDetail(profileDetail);
            setShowProfile(false);
          }}
          onDelete={() => handleDeleteCharacter(profileDetail.id)}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button className="absolute right-5 top-5 text-white" onClick={() => setLightbox(null)}>
            <XIcon className="h-7 w-7" />
          </button>
          <img src={lightbox} alt="preview" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
