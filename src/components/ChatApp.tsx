"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CharacterDetail,
  CharacterSummary,
  ChatMessage,
  ProviderSummary,
  QuotaRequestSummary,
} from "@/types/chat";
import {
  DEFAULT_BUBBLE_STYLE,
  type BubbleStyle,
} from "@/lib/bubbleStyle";
import type { CallEmotion } from "@/lib/callEmotion";
import type { CharacterMedia } from "@/lib/characterMedia";
import {
  DEFAULT_CHAT_BACKGROUND,
  type ChatBackground,
} from "@/lib/chatBackground";
import { compressImageFile } from "@/lib/compressImage";
import { isDictating } from "@/lib/dictation";
import {
  DEFAULT_TTS_ACCOUNT_SUMMARY,
  resolveVoiceTarget,
  type CharacterVoiceConfig,
  type TtsAccountSummary,
  type VoiceEngineChoice,
} from "@/lib/hdVoice";
import { useKeyboardPan } from "@/lib/keyboardPan";
import { MAX_CHARACTERS } from "@/lib/limits";
import { shouldAttemptClientCheckIn } from "@/lib/proactiveCheckIn";
import { useSafeTop } from "@/lib/safeTop";
import { useScrollGuard } from "@/lib/scrollGuard";
import {
  getNoteDueStatus,
  type SharedNoteItem,
  type SharedNoteKind,
} from "@/lib/sharedNotes";
import { EMPTY_PROFILE, type UserProfile } from "@/lib/userProfile";
import type { BrainstormMessage, BrainstormRoomSummary } from "@/types/chat";
import {
  loadVoiceSettings,
  prefetchSpeech,
  speak,
  stopSpeaking,
  syncVoiceAccountContext,
  useIsSpeaking,
  useSpeechSupported,
  useSpeechUnlock,
  useVoiceSettings,
} from "@/lib/voice";
import { AddContactModal } from "./AddContactModal";
import { useAuth } from "./AuthGate";
import { Avatar } from "./Avatar";
import { BrainstormRoomView } from "./BrainstormRoomView";
import { BrainstormView } from "./BrainstormView";
import { CallOverlay } from "./CallOverlay";
import { CallsView } from "./CallsView";
import { type MemoryPatch } from "./CharacterMemorySection";
import { CharacterModal } from "./CharacterModal";
import { CharacterProfileModal } from "./CharacterProfileModal";
import { ChatWindow } from "./ChatWindow";
import { Composer } from "./Composer";
import { MobileTabBar, NavRail, type AppView } from "./Navigation";
import { ProfileView, type ProfileTab } from "./ProfileView";
import { SettingsView } from "./SettingsView";
import { SharedNotesDrawer } from "./SharedNotesDrawer";
import { Sidebar } from "./Sidebar";
import { StatusView } from "./StatusView";
import { PlusIcon, SettingsIcon, XIcon } from "./icons";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typingDelayFor(text: string) {
  const base = 450;
  const perChar = 16;
  return Math.min(base + text.length * perChar, 2600);
}

function parseContactThreadId(id: string | null | undefined): string | null {
  if (!id || !id.startsWith("contact:")) return null;
  const raw = id.slice("contact:".length).trim();
  return raw || null;
}

export function ChatApp({ initialSharedStatusId = null }: { initialSharedStatusId?: string | null }) {
  const { user, expire } = useAuth();
  const [voice, setVoice] = useVoiceSettings(user.id);
  const speechSupported = useSpeechSupported();
  const isSpeaking = useIsSpeaking();

  // Jaga jarak aman status bar, kunci posisi halaman, dan selaraskan keyboard iPhone.
  useSafeTop();
  useScrollGuard();
  useKeyboardPan();
  useSpeechUnlock();

  const [view, setView] = useState<AppView>(initialSharedStatusId ? "status" : "chats");
  const [sharedStatusId, setSharedStatusId] = useState<string | null>(initialSharedStatusId);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [contactThreads, setContactThreads] = useState<CharacterSummary[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [autoFallback, setAutoFallback] = useState(true);
  const [chatBackground, setChatBackground] = useState<ChatBackground>(DEFAULT_CHAT_BACKGROUND);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>(DEFAULT_BUBBLE_STYLE);
  const [ttsSummary, setTtsSummary] = useState<TtsAccountSummary>(DEFAULT_TTS_ACCOUNT_SUMMARY);
  const [limit, setLimit] = useState<number>(
    user.isAdmin ? 50 : user.characterQuota ?? MAX_CHARACTERS
  );
  const [isAdmin, setIsAdmin] = useState<boolean>(Boolean(user.isAdmin));
  const [latestQuotaRequest, setLatestQuotaRequest] =
    useState<QuotaRequestSummary | null>(null);
  const [pendingQuotaRequestsCount, setPendingQuotaRequestsCount] =
    useState<number>(0);
  const [pendingOwnerContactsCount, setPendingOwnerContactsCount] =
    useState<number>(0);
  const [pendingAdminContactsCount, setPendingAdminContactsCount] =
    useState<number>(0);
  const [profileTab, setProfileTab] = useState<ProfileTab>("identity");
  const [focusVoiceSettings, setFocusVoiceSettings] = useState(false);
  const [chatOriginView, setChatOriginView] = useState<"chats" | "calls">("chats");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Record<string, ChatMessage[]>>({});
  const [typingFor, setTypingFor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const handleSharedStatusHandled = useCallback(() => setSharedStatusId(null), []);

  const [showCreate, setShowCreate] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [notesMap, setNotesMap] = useState<Record<string, SharedNoteItem[]>>({});
  const [notesLoadingFor, setNotesLoadingFor] = useState<string | null>(null);
  const notesLoadedRef = useRef<Set<string>>(new Set());
  const [editDetail, setEditDetail] = useState<CharacterDetail | null>(null);
  const [profileDetail, setProfileDetail] = useState<CharacterDetail | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [call, setCall] = useState<{ characterId: string; mode: "video" | "audio" } | null>(null);
  const [peekCharId, setPeekCharId] = useState<string | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [wakeTick, setWakeTick] = useState(0);
  const proactiveCheckedRef = useRef<Set<string>>(new Set());
  const deliverBubblesRef = useRef<
    ((target: string, bubbles: ChatMessage[]) => Promise<void>) | null
  >(null);

  // Brainstorm Room state
  const [brainstormRooms, setBrainstormRooms] = useState<BrainstormRoomSummary[]>([]);
  const [activeBrainstormId, setActiveBrainstormId] = useState<string | null>(null);
  const [activeMeetupCharacterId, setActiveMeetupCharacterId] = useState<string | null>(null);
  const [brainstormMessages, setBrainstormMessages] = useState<Record<string, BrainstormMessage[]>>({});
  const [brainstormTyping, setBrainstormTyping] = useState<string | null>(null);
  const [brainstormTypingLabel, setBrainstormTypingLabel] = useState<string | null>(null);

  const allThreads = useMemo(() => {
    if (contactThreads.length === 0) return characters;
    return [...characters, ...contactThreads].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [characters, contactThreads]);
  const chatThreads = useMemo(
    () => allThreads.filter((thread) => thread.threadKind !== "owner_contact"),
    [allThreads]
  );

  const activeIdRef = useRef<string | null>(null);
  const charactersRef = useRef<CharacterSummary[]>([]);
  const bubbleStyleRef = useRef<BubbleStyle>(DEFAULT_BUBBLE_STYLE);
  const ttsSummaryRef = useRef<TtsAccountSummary>(DEFAULT_TTS_ACCOUNT_SUMMARY);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    charactersRef.current = allThreads;
  }, [allThreads]);

  useEffect(() => {
    bubbleStyleRef.current = bubbleStyle;
  }, [bubbleStyle]);

  useEffect(() => {
    ttsSummaryRef.current = ttsSummary;
    syncVoiceAccountContext(user.id, ttsSummary);
  }, [user.id, ttsSummary]);

  function voiceTargetFor(characterId: string | null, engineChoice: VoiceEngineChoice) {
    const charObj = characterId
      ? charactersRef.current.find((c) => c.id === characterId)
      : undefined;
    return resolveVoiceTarget(
      charObj?.voiceConfig,
      engineChoice,
      ttsSummaryRef.current.hasActiveKey
    );
  }

  /**
   * Balasan karakter dibacakan bila suara otomatis hidup ATAU bila tulisan
   * Tatap Muka sedang disembunyikan, selama pengguna tidak sedang mendikte.
   */
  function shouldSpeakReply(targetId: string, voiceEnabled: boolean): boolean {
    if (isDictating() || activeIdRef.current !== targetId) return false;
    if (voiceEnabled) return true;
    const charObj = charactersRef.current.find((c) => c.id === targetId);
    const effective = charObj?.bubbleStyle ?? bubbleStyleRef.current;
    return Boolean(
      view === "brainstorm" &&
        activeMeetupCharacterId === targetId &&
        effective.hideMessages
    );
  }

  // Hentikan suara saat keluar dari akun atau sesi berakhir.
  useEffect(() => () => stopSpeaking(), []);

  // Popup notifikasi mengambang dinonaktifkan agar tampilan chat & video selalu bersih.
  const showToast = useCallback((msg: string) => {
    void msg;
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
    if (Array.isArray(data.contactThreads)) {
      setContactThreads(data.contactThreads);
    }
    if (typeof data.limit === "number") setLimit(data.limit);
    if (typeof data.isAdmin === "boolean") setIsAdmin(data.isAdmin);
    setLatestQuotaRequest(data.latestQuotaRequest ?? null);
    if (typeof data.pendingQuotaRequestsCount === "number") {
      setPendingQuotaRequestsCount(data.pendingQuotaRequestsCount);
    }
    if (typeof data.pendingOwnerContactsCount === "number") {
      setPendingOwnerContactsCount(data.pendingOwnerContactsCount);
    }
    if (typeof data.pendingAdminContactsCount === "number") {
      setPendingAdminContactsCount(data.pendingAdminContactsCount);
    }
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

  const fetchTtsSettings = useCallback(async () => {
    const res = await api("/api/tts/settings");
    if (!res.ok) return;
    const data = await res.json();
    if (data.tts) setTtsSummary(data.tts);
  }, [api]);

  const handleSaveTts = useCallback(
    async (patch: Record<string, unknown>): Promise<TtsAccountSummary | null> => {
      try {
        const res = await api("/api/tts/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || "Gagal menyimpan pengaturan Suara HD.");
          return null;
        }
        if (data.tts) {
          setTtsSummary(data.tts);
          return data.tts as TtsAccountSummary;
        }
        return null;
      } catch {
        showToast("Koneksi gagal saat menyimpan Suara HD.");
        return null;
      }
    },
    [api, showToast]
  );

  const fetchMessages = useCallback(
    async (characterId: string) => {
      const contactId = parseContactThreadId(characterId);
      const endpoint = contactId
        ? `/api/contacts/${contactId}/messages`
        : `/api/characters/${characterId}/messages`;
      const res = await api(endpoint);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: ChatMessage[] = data.messages ?? [];
      setMessagesMap((prev) => {
        const current = prev[characterId];
        if (
          current &&
          current.length === incoming.length &&
          current[current.length - 1]?.id === incoming[incoming.length - 1]?.id &&
          !current.some((m) => m.pending)
        ) {
          return prev;
        }
        return { ...prev, [characterId]: incoming };
      });
      if (contactId && typeof data.aiAutoReply === "boolean") {
        setContactThreads((prev) =>
          prev.map((t) =>
            t.contactId === contactId && t.aiAutoReply !== data.aiAutoReply
              ? { ...t, aiAutoReply: data.aiAutoReply }
              : t
          )
        );
      }
    },
    [api]
  );

  const fetchBrainstormRooms = useCallback(async () => {
    const res = await api("/api/brainstorm");
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (Array.isArray(data?.rooms)) setBrainstormRooms(data.rooms);
  }, [api]);

  const fetchBrainstormMessages = useCallback(
    async (roomId: string) => {
      const res = await api(`/api/brainstorm/${encodeURIComponent(roomId)}/messages`);
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.messages)) setBrainstormMessages((prev) => ({ ...prev, [roomId]: data.messages }));
    },
    [api]
  );

  const fetchSharedNotes = useCallback(
    async (targetId: string) => {
      const res = await api(
        `/api/characters/${encodeURIComponent(targetId)}/notes`
      );
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.notes)) {
        setNotesMap((prev) => ({ ...prev, [targetId]: data.notes }));
      }
    },
    [api]
  );

  useEffect(() => {
    Promise.all([
      fetchCharacters(),
      fetchProviders(),
      fetchProfile(),
      fetchAppearance(),
      fetchTtsSettings(),
      fetchBrainstormRooms(),
    ]).finally(() => setLoaded(true));
  }, [fetchCharacters, fetchProviders, fetchProfile, fetchAppearance, fetchTtsSettings, fetchBrainstormRooms]);

  useEffect(() => {
    if (!activeId || notesLoadedRef.current.has(activeId)) return;
    notesLoadedRef.current.add(activeId);
    void fetchSharedNotes(activeId);
  }, [activeId, fetchSharedNotes]);

  function handleOpenNotes(targetId: string) {
    setShowNotesDrawer(true);
    if (!notesMap[targetId]) {
      setNotesLoadingFor(targetId);
    }
    void fetchSharedNotes(targetId).finally(() => {
      setNotesLoadingFor((cur) => (cur === targetId ? null : cur));
    });
  }

  async function handleAddSharedNote(
    targetId: string,
    input: {
      kind: SharedNoteKind;
      title: string;
      dueDate: string | null;
      url: string | null;
    }
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await api(
        `/api/characters/${encodeURIComponent(targetId)}/notes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.note) {
        return { ok: false, error: data?.error || "Gagal menambah catatan." };
      }
      setNotesMap((prev) => ({
        ...prev,
        [targetId]: [data.note, ...(prev[targetId] ?? [])],
      }));
      return { ok: true };
    } catch {
      return { ok: false, error: "Koneksi gagal saat menyimpan catatan." };
    }
  }

  async function handleToggleSharedNote(
    targetId: string,
    noteId: string,
    nextDone: boolean
  ) {
    setNotesMap((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] ?? []).map((n) =>
        n.id === noteId ? { ...n, done: nextDone } : n
      ),
    }));
    try {
      const res = await api(
        `/api/characters/${encodeURIComponent(targetId)}/notes/${encodeURIComponent(noteId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: nextDone }),
        }
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.note) {
        setNotesMap((prev) => ({
          ...prev,
          [targetId]: (prev[targetId] ?? []).map((n) =>
            n.id === noteId ? data.note : n
          ),
        }));
      }
    } catch {
      // Biarkan perubahan optimis atau disinkronkan saat dibuka kembali.
    }
  }

  async function handleDeleteSharedNote(targetId: string, noteId: string) {
    setNotesMap((prev) => ({
      ...prev,
      [targetId]: (prev[targetId] ?? []).filter((n) => n.id !== noteId),
    }));
    try {
      await api(
        `/api/characters/${encodeURIComponent(targetId)}/notes/${encodeURIComponent(noteId)}`,
        { method: "DELETE" }
      );
    } catch {
      // Abaikan kegagalan jaringan senyap.
    }
  }

  async function handleCreateBrainstorm(
    title: string,
    characterIds: string[],
    mode: "brainstorm" | "scene",
    sceneCanonical: boolean
  ): Promise<boolean> {
    try {
      const res = await api("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, characterIds, mode, sceneCanonical }),
      });
      if (!res.ok) return false;
      await fetchBrainstormRooms();
      return true;
    } catch {
      return false;
    }
  }

  async function handleDeleteBrainstorm(roomId: string) {
    try {
      await api(`/api/brainstorm/${encodeURIComponent(roomId)}`, { method: "DELETE" });
      setBrainstormRooms((prev) => prev.filter((r) => r.id !== roomId));
      if (activeBrainstormId === roomId) setActiveBrainstormId(null);
    } catch {}
  }

  async function handleClearBrainstorm(roomId: string) {
    try {
      await api(`/api/brainstorm/${encodeURIComponent(roomId)}/messages`, { method: "DELETE" });
      setBrainstormMessages((prev) => ({ ...prev, [roomId]: [] }));
      fetchBrainstormRooms();
    } catch {}
  }

  function handleOpenBrainstorm(roomId: string) {
    setPeekCharId(null);
    setActiveMeetupCharacterId(null);
    setActiveBrainstormId(roomId);
    setView("brainstorm");
    fetchBrainstormMessages(roomId);
  }

  function handleOpenMeetup(characterId: string) {
    if (activeId !== characterId) stopSpeaking();
    setPeekCharId(null);
    setChatOriginView("chats");
    setActiveBrainstormId(null);
    setActiveMeetupCharacterId(characterId);
    setActiveId(characterId);
    setView("brainstorm");
    if (!messagesMap[characterId]) void fetchMessages(characterId);
  }

  async function handleSendBrainstorm(text: string) {
    if (!activeBrainstormId) return;
    const roomId = activeBrainstormId;
    const activeRoom = brainstormRooms.find((r) => r.id === roomId);
    const tempId = `temp-${Date.now()}`;
    const optimistic: BrainstormMessage = {
      id: tempId,
      roomId,
      role: "user",
      characterId: null,
      content: text,
      imageUrl: null,
      createdAt: new Date().toISOString(),
    };
    setBrainstormMessages((prev) => ({ ...prev, [roomId]: [...(prev[roomId] ?? []), optimistic] }));
    setBrainstormTyping(roomId);
    // Tampilkan label bergiliran
    const memberNames = activeRoom?.members.map((m) => m.name) ?? [];
    let labelIdx = 0;
    setBrainstormTypingLabel(memberNames[0] ? `${memberNames[0]} mengetik...` : "Mengetik...");

    const labelInterval = memberNames.length > 1 ? window.setInterval(() => {
      labelIdx = (labelIdx + 1) % memberNames.length;
      setBrainstormTypingLabel(`${memberNames[labelIdx]} mengetik...`);
    }, 2200) : null;

    try {
      const res = await api(`/api/brainstorm/${encodeURIComponent(roomId)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json().catch(() => null);
      if (labelInterval) window.clearInterval(labelInterval);
      setBrainstormTyping(null);
      setBrainstormTypingLabel(null);

      if (!res.ok) {
        setBrainstormMessages((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] ?? []).filter((m) => m.id !== tempId),
        }));
        return;
      }
      // Ganti optimistic dengan real userMessage dari server
      setBrainstormMessages((prev) => {
        const cur = prev[roomId] ?? [];
        const replaced = cur.map((m) => (m.id === tempId ? (data.userMessage ?? { ...m, id: data.userMessage?.id ?? m.id, pending: false }) : m));
        return { ...prev, [roomId]: replaced };
      });
      const assistants: BrainstormMessage[] = data.assistantMessages ?? [];
      // Deliver sequential with delay + TTS prefetch
      for (let i = 0; i < assistants.length; i++) {
        const msg = assistants[i];
        // prefetch voice
        const charObj = characters.find((c) => c.id === msg.characterId);
        if (charObj) {
          const target = resolveVoiceTarget(charObj.voiceConfig, voice.engine, ttsSummaryRef.current.hasActiveKey);
          prefetchSpeech(msg.content, target);
        }
        await new Promise((r) => setTimeout(r, typingDelayFor(msg.content)));
        setBrainstormMessages((prev) => ({ ...prev, [roomId]: [...(prev[roomId] ?? []), msg] }));
        // auto speak jika voice enabled
        if (voice.enabled && charObj) {
          const currVoice = loadVoiceSettings(user.id);
          const target = resolveVoiceTarget(charObj.voiceConfig, currVoice.engine, ttsSummaryRef.current.hasActiveKey);
          speak(msg.content, currVoice, { messageId: msg.id, target });
          if (i < assistants.length - 1) await new Promise((r) => setTimeout(r, 600));
        } else if (i < assistants.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      fetchBrainstormRooms();
    } catch {
      if (labelInterval) window.clearInterval(labelInterval);
      setBrainstormTyping(null);
      setBrainstormTypingLabel(null);
    }
  }

  function handleSpeakBrainstorm(text: string, messageId?: string, characterId?: string | null) {
    const charObj = characterId ? characters.find((c) => c.id === characterId) : null;
    const target = charObj ? resolveVoiceTarget(charObj.voiceConfig, voice.engine, ttsSummaryRef.current.hasActiveKey) : { kind: "device" as const };
    if (!speak(text, voice, { messageId, target, onFallback: (r) => showToast(`${r} Beralih ke suara perangkat.`) })) {
      showToast("Pesan ini tidak bisa dibacakan di browser ini.");
    }
  }

  // Sinkronisasi berkala 2 arah saat ruang chat kontak sedang dibuka & diam.
  useEffect(() => {
    const contactId = parseContactThreadId(activeId);
    if (!activeId || !contactId || view !== "chats") return;
    const timer = window.setInterval(() => {
      if (document.hidden || typingFor === activeId) return;
      void fetchMessages(activeId);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [activeId, view, typingFor, fetchMessages]);

  function handleViewChange(next: AppView) {
    if (next !== "chats") stopSpeaking();
    if (next !== "settings") setFocusVoiceSettings(false);
    if (
      next === "chats" &&
      contactThreads.some(
        (thread) => thread.id === activeId && thread.threadKind === "owner_contact"
      )
    ) {
      setActiveId(null);
    }
    setChatOriginView("chats");
    setActiveMeetupCharacterId(null);
    setPeekCharId(null);
    setView(next);
    if (next === "chats") setMobileShowChat(false);
    if (next === "calls") void fetchCharacters();
  }

  function handleSelect(id: string) {
    if (id !== activeId) stopSpeaking();
    setPeekCharId(null);
    const selectedThread = allThreads.find((thread) => thread.id === id);
    setChatOriginView(
      selectedThread?.threadKind === "owner_contact" ? "calls" : "chats"
    );
    setView("chats");
    setActiveId(id);
    setMobileShowChat(true);
    if (!messagesMap[id]) fetchMessages(id);
  }

  function handleChatBack() {
    const returnToCalls = chatOriginView === "calls";
    setChatOriginView("chats");
    stopSpeaking();
    setMobileShowChat(false);
    if (returnToCalls) {
      setView("calls");
      void fetchCharacters();
    }
  }

  async function deliverAssistantBubbles(target: string, bubbles: ChatMessage[]) {
    for (let i = 0; i < bubbles.length; i++) {
      setTypingFor(target);
      const plannedVoice = loadVoiceSettings(user.id);
      if (bubbles[i].isVoiceNote || shouldSpeakReply(target, plannedVoice.enabled)) {
        prefetchSpeech(bubbles[i].content, voiceTargetFor(target, plannedVoice.engine));
      }
      await sleep(typingDelayFor(bubbles[i].content));
      setMessagesMap((prev) => ({
        ...prev,
        [target]: [...(prev[target] ?? []), bubbles[i]],
      }));
      const currentVoice = loadVoiceSettings(user.id);
      if (shouldSpeakReply(target, currentVoice.enabled)) {
        speak(bubbles[i].content, currentVoice, {
          append: i > 0,
          messageId: bubbles[i].id,
          target: voiceTargetFor(target, currentVoice.engine),
          onFallback: (reason) => showToast(`${reason} Beralih ke suara perangkat.`),
        });
      }
      if (i < bubbles.length - 1) await sleep(350);
    }
  }

  async function handleSend(
    text: string,
    imageFile: File | null,
    isVoiceNote = false
  ) {
    if (!activeId) return;
    const target = activeId;
    const interactionMode =
      view === "brainstorm" && activeMeetupCharacterId === target ? "meetup" : undefined;
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

    const contactId = parseContactThreadId(target);
    const targetObj = charactersRef.current.find((c) => c.id === target);
    const isOwnerManualSend = targetObj?.threadKind === "owner_contact";
    const sendAsVoiceNote = Boolean(isVoiceNote && text && !imageUrl);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      characterId: target,
      role: "user",
      senderKind: isOwnerManualSend
        ? "owner_manual"
        : contactId
          ? "guest"
          : undefined,
      content: text,
      imageUrl,
      isVoiceNote: sendAsVoiceNote,
      status: "sent",
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessagesMap((prev) => ({
      ...prev,
      [target]: [...(prev[target] ?? []), optimisticMsg],
    }));

    if (!isOwnerManualSend) {
      setTypingFor(target);
    }

    try {
      const endpoint = contactId
        ? `/api/contacts/${contactId}/chat`
        : "/api/chat";
      const payload = contactId
        ? { content: text, imageUrl, isVoiceNote: sendAsVoiceNote }
        : {
            characterId: target,
            content: text,
            imageUrl,
            isVoiceNote: sendAsVoiceNote,
            ...(interactionMode ? { interactionMode } : {}),
          };
      const res = await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

      if (Array.isArray(data.capturedNotes) && data.capturedNotes.length > 0) {
        const fresh: SharedNoteItem[] = data.capturedNotes;
        setNotesMap((prev) => {
          const cur = prev[target] ?? [];
          const existingIds = new Set(cur.map((n) => n.id));
          const uniqueFresh = fresh.filter((n) => !existingIds.has(n.id));
          return uniqueFresh.length > 0
            ? { ...prev, [target]: [...uniqueFresh, ...cur] }
            : prev;
        });
      }

      if (data.fallbackUsed && data.providerLabel) {
        showToast(
          `Auto-fallback: memakai ${data.providerLabel} karena ${data.primaryLabel || "provider utama"} kena limit.`
        );
      }
      if (data.keyRotated) {
        void fetchProviders();
      }

      const replies: ChatMessage[] = data.assistantMessages ?? [];
      if (replies.length > 0) {
        await deliverAssistantBubbles(target, replies);
      }
      setTypingFor(null);
      fetchCharacters();
    } catch {
      setTypingFor(null);
      showToast("Koneksi gagal. Coba lagi.");
    }
  }

  async function handleCallTurn(
    characterId: string,
    spokenText: string,
    callMode: "video" | "audio"
  ): Promise<{ text: string; emotion?: CallEmotion; error?: string; endCall?: boolean } | null> {
    const trimmed = spokenText.trim();
    if (!trimmed) return null;

    const appendQuotaErrorToChat = (errorText: string) => {
      const errorMessage: ChatMessage = {
        id: `temp-call-error-${Date.now()}`,
        characterId,
        role: "assistant",
        content: errorText,
        imageUrl: null,
        status: "error",
        createdAt: new Date().toISOString(),
        isCallError: true,
      };
      setMessagesMap((prev) => ({
        ...prev,
        [characterId]: [...(prev[characterId] ?? []), errorMessage],
      }));
    };

    const tempId = `temp-call-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      characterId,
      role: "user",
      content: trimmed,
      imageUrl: null,
      status: "sent",
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessagesMap((prev) => ({
      ...prev,
      [characterId]: [...(prev[characterId] ?? []), optimisticMsg],
    }));

    try {
      const contactId = parseContactThreadId(characterId);
      const endpoint = contactId
        ? `/api/contacts/${contactId}/chat`
        : "/api/chat";
      const payload = contactId
        ? { content: trimmed, imageUrl: null, callMode }
        : {
            characterId,
            content: trimmed,
            imageUrl: null,
            callMode,
          };
      const res = await api(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      setMessagesMap((prev) => {
        const list = (prev[characterId] ?? []).map((m) =>
          m.id === tempId ? (data.userMessage ?? { ...m, pending: false }) : m
        );
        return { ...prev, [characterId]: list };
      });

      if (!res.ok) {
        const errorText =
          typeof data.error === "string"
            ? data.error
            : "Gagal mendapatkan balasan panggilan.";
        const quotaOrCreditError =
          /quota|kuota|credit|kredit|saldo|limit|resource_exhausted|insufficient|(?:^|\D)(?:402|429)(?:\D|$)/i.test(
            errorText
          );
        if (quotaOrCreditError) {
          appendQuotaErrorToChat(errorText);
          return { text: "", error: errorText, endCall: true };
        }
        return { text: "", error: errorText };
      }

      if (data.fallbackUsed && data.providerLabel) {
        showToast(
          `Auto-fallback: memakai ${data.providerLabel} karena ${data.primaryLabel || "provider utama"} kena limit.`
        );
      }
      if (data.keyRotated) {
        void fetchProviders();
      }

      const replies: ChatMessage[] = data.assistantMessages ?? [];
      if (replies.length > 0) {
        setMessagesMap((prev) => ({
          ...prev,
          [characterId]: [...(prev[characterId] ?? []), ...replies],
        }));
      }
      fetchCharacters();

      const replyLine = replies
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!replyLine) {
        return {
          text: "",
          error: "Balasan karakter kosong. Coba kirim ulang atau lanjutkan lewat chat.",
        };
      }
      return {
        text: replyLine,
        emotion: data.callEmotion as CallEmotion | undefined,
      };
    } catch {
      return {
        text: "",
        error: "Koneksi terputus saat panggilan. Coba bicara lagi.",
      };
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

  function handleSpeakMessage(
    text: string,
    messageId?: string,
    role?: "user" | "assistant"
  ) {
    const resolved =
      role === "user"
        ? ({ kind: "device" } as const)
        : voiceTargetFor(activeId, voice.engine);
    if (
      !speak(text, voice, {
        messageId,
        target: resolved,
        onFallback: (reason) => showToast(`${reason} Beralih ke suara perangkat.`),
      })
    ) {
      showToast("Pesan ini tidak bisa dibacakan di browser ini.");
    }
  }

  async function handleRegenerate() {
    if (!activeId || typingFor === activeId) return;

    const target = activeId;
    const interactionMode =
      view === "brainstorm" && activeMeetupCharacterId === target ? "meetup" : "chat";
    stopSpeaking();
    setTypingFor(target);

    try {
      const res = await api(`/api/characters/${target}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionMode }),
      });
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

      await deliverAssistantBubbles(target, data.assistantMessages ?? []);
      setTypingFor(null);
      fetchCharacters();
    } catch {
      setTypingFor(null);
      showToast("Koneksi gagal. Coba lagi.");
    }
  }

  async function openProfile(id: string) {
    if (parseContactThreadId(id)) {
      setShowAddContact(true);
      return;
    }
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
    if (activeMeetupCharacterId === id) setActiveMeetupCharacterId(null);
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

  async function handleCharacterMedia(id: string, next: CharacterMedia | null) {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, media: next } : c)));
    setProfileDetail((cur) => (cur && cur.id === id ? { ...cur, media: next } : cur));

    try {
      const res = await api(`/api/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast("Gagal menyimpan pengaturan media karakter.");
      fetchCharacters();
    }
  }

  async function handleCharacterVoice(id: string, next: CharacterVoiceConfig | null) {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, voiceConfig: next } : c)));
    setProfileDetail((cur) => (cur && cur.id === id ? { ...cur, voiceConfig: next } : cur));

    try {
      const res = await api(`/api/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceConfig: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast("Gagal menyimpan pilihan suara karakter.");
      fetchCharacters();
    }
  }

  function handleCharacterMemorySync(id: string, next: MemoryPatch) {
    setCharacters((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              memoryEnabled: next.memoryEnabled,
              browsingEnabled: next.browsingEnabled,
              proactiveEnabled: next.proactiveEnabled,
            }
          : c
      )
    );
    setProfileDetail((cur) =>
      cur && cur.id === id
        ? {
            ...cur,
            memoryEnabled: next.memoryEnabled,
            memorySummary: next.memorySummary,
            memoryUpdatedAt: next.memoryUpdatedAt,
            browsingEnabled: next.browsingEnabled,
            proactiveEnabled: next.proactiveEnabled,
          }
        : cur
    );
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

  const activeCharacter = allThreads.find((c) => c.id === activeId) ?? null;
  const activeMeetupCharacter =
    characters.find((character) => character.id === activeMeetupCharacterId) ?? null;
  const isMeetupConversation = view === "brainstorm" && Boolean(activeMeetupCharacterId);
  const activeBubble = isMeetupConversation
    ? activeMeetupCharacter?.bubbleStyle ?? bubbleStyle
    : activeCharacter?.bubbleStyle ?? bubbleStyle;
  const isHiddenMode = Boolean(
    isMeetupConversation &&
      activeMeetupCharacter?.id === activeMeetupCharacterId &&
      activeBubble.hideMessages
  );
  const composerRevealed = Boolean(
    isHiddenMode && activeMeetupCharacterId && peekCharId === activeMeetupCharacterId
  );
  const composerVisible = !isHiddenMode || composerRevealed;
  const callCharacter = call ? (allThreads.find((c) => c.id === call.characterId) ?? null) : null;
  const callVoiceTarget = useMemo(
    () =>
      callCharacter
        ? resolveVoiceTarget(callCharacter.voiceConfig, voice.engine, ttsSummary.hasActiveKey)
        : undefined,
    [callCharacter, voice.engine, ttsSummary.hasActiveKey]
  );
  const hasProviders = providers.some((p) => p.hasKey || p.type === "custom");
  const chatOpenedFromCalls = view === "chats" && chatOriginView === "calls";
  const navigationView: AppView = chatOpenedFromCalls ? "calls" : view;
  const showMobileTabBar =
    !(view === "chats" && mobileShowChat) &&
    !(view === "brainstorm" && Boolean(activeBrainstormId || activeMeetupCharacterId));

  useEffect(() => {
    if (!isHiddenMode || !composerRevealed || composerBusy) return;
    const id = window.setTimeout(() => setPeekCharId(null), 8000);
    return () => window.clearTimeout(id);
  }, [isHiddenMode, composerRevealed, composerBusy]);

  useEffect(() => {
    deliverBubblesRef.current = deliverAssistantBubbles;
  });

  // Bangunkan pemeriksa waktu saat aplikasi kembali aktif dari latar belakang.
  useEffect(() => {
    function onVis() {
      if (document.visibilityState === "visible") {
        setWakeTick((n) => n + 1);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Karakter menyapa duluan secara alami saat ruang chat dibuka setelah jeda lama.
  useEffect(() => {
    if (view !== "chats" || !activeCharacter) return;
    if (parseContactThreadId(activeCharacter.id)) return;
    if (!activeCharacter.proactiveEnabled || !hasProviders) return;
    if (typingFor || call) return;

    const isVisibleRoom =
      mobileShowChat ||
      (typeof window !== "undefined" &&
        window.matchMedia("(min-width: 768px)").matches);
    if (!isVisibleRoom) return;

    const msgs = messagesMap[activeCharacter.id];
    if (!msgs || !shouldAttemptClientCheckIn(msgs)) return;

    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg) return;

    const attemptKey = `${activeCharacter.id}:${lastMsg.id}`;
    if (proactiveCheckedRef.current.has(attemptKey)) return;

    const targetId = activeCharacter.id;
    let timerCancelled = false;
    const timer = window.setTimeout(async () => {
      if (timerCancelled || proactiveCheckedRef.current.has(attemptKey)) return;
      proactiveCheckedRef.current.add(attemptKey);

      try {
        const res = await api(`/api/characters/${targetId}/check-in`, {
          method: "POST",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const incoming: ChatMessage[] = Array.isArray(data?.assistantMessages)
          ? data.assistantMessages
          : [];
        if (!data?.triggered || incoming.length === 0) return;

        if (activeIdRef.current === targetId && deliverBubblesRef.current) {
          await deliverBubblesRef.current(targetId, incoming);
          setTypingFor((cur) => (cur === targetId ? null : cur));
        } else {
          setMessagesMap((prev) => ({
            ...prev,
            [targetId]: [...(prev[targetId] ?? []), ...incoming],
          }));
        }

        const finalBubble = incoming[incoming.length - 1];
        if (finalBubble) {
          setCharacters((prev) =>
            prev.map((c) =>
              c.id === targetId
                ? {
                    ...c,
                    preview: finalBubble.content,
                    updatedAt: finalBubble.createdAt,
                  }
                : c
            )
          );
        }
      } catch {
        // Diam-diam abaikan kegagalan jaringan sapaan otomatis agar bebas gangguan.
      }
    }, 900);

    return () => {
      timerCancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    view,
    activeCharacter,
    hasProviders,
    typingFor,
    call,
    mobileShowChat,
    messagesMap,
    wakeTick,
    api,
  ]);

  function handleHiddenScreenTap(characterId: string) {
    if (activeMeetupCharacterId !== characterId || !isHiddenMode) return;
    if (composerVisible) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setPeekCharId(null);
    } else {
      setPeekCharId(characterId);
    }
  }

  function handleToggleHideChat(character: CharacterSummary) {
    const characterBubble = character.bubbleStyle ?? bubbleStyle;
    setPeekCharId(null);
    void handleCharacterBubble(character.id, {
      ...characterBubble,
      hideMessages: !characterBubble.hideMessages,
    });
  }

  function renderCharacterConversation(
    character: CharacterSummary,
    options: {
      mode: "chat" | "meetup";
      onBack: () => void;
      backLabel: string;
    }
  ) {
    const isMeetup = options.mode === "meetup";
    const characterBubble = character.bubbleStyle ?? bubbleStyle;
    const characterHidden = isMeetup && Boolean(characterBubble.hideMessages);
    return (
      <ChatWindow
        key={character.id}
        character={character}
        messages={messagesMap[character.id] ?? []}
        isTyping={typingFor === character.id}
        isSpeaking={isSpeaking}
        canSpeak={speechSupported || ttsSummary.hasActiveKey}
        voiceEnabled={voice.enabled}
        background={character.chatBackground ?? chatBackground}
        bubble={characterBubble}
        visualMode={options.mode}
        sceneLabel={isMeetup ? "Tatap Muka · kalian berdua hadir langsung" : undefined}
        showBackOnDesktop={isMeetup}
        composerVisible={!characterHidden || peekCharId === character.id}
        onScreenTap={characterHidden ? () => handleHiddenScreenTap(character.id) : undefined}
        onToggleHideChat={isMeetup ? () => handleToggleHideChat(character) : undefined}
        onBack={options.onBack}
        backLabel={options.backLabel}
        onOpenProfile={() => openProfile(character.id)}
        onOpenVoice={() => {
          setFocusVoiceSettings(true);
          handleViewChange("settings");
        }}
        onOpenNotes={() => handleOpenNotes(character.id)}
        activeNotesCount={(notesMap[character.id] ?? []).filter((note) => !note.done).length}
        hasDueTodayNote={(notesMap[character.id] ?? []).some((note) => {
          const status = getNoteDueStatus(note.dueDate, note.done);
          return status === "today" || status === "overdue";
        })}
        onVideoCall={
          !isMeetup && character.threadKind !== "owner_contact"
            ? () => setCall({ characterId: character.id, mode: "video" })
            : undefined
        }
        onAudioCall={
          !isMeetup && character.threadKind !== "owner_contact"
            ? () => setCall({ characterId: character.id, mode: "audio" })
            : undefined
        }
        onImageClick={(url) => setLightbox(url)}
        onCopyMessage={handleCopyMessage}
        onSpeakMessage={handleSpeakMessage}
        onStopSpeaking={stopSpeaking}
        onDeleteMessage={handleDeleteMessage}
        onRegenerate={handleRegenerate}
        composer={
          <Composer
            key={character.id}
            onSend={handleSend}
            disabled={typingFor === character.id}
            transparent={Boolean(characterBubble.minimalBars || characterHidden)}
            blurOnSend={characterHidden}
            onSent={() => setPeekCharId(null)}
            onWake={() => setPeekCharId(character.id)}
            onActivityChange={setComposerBusy}
            onNotice={showToast}
          />
        }
      />
    );
  }

  if (!loaded) {
    return (
      <div className="app-shell flex items-center justify-center bg-app text-sm text-muted">
        Memuat HeyTalent...
      </div>
    );
  }

  const adminTotalPending =
    pendingQuotaRequestsCount + pendingAdminContactsCount;

  return (
    <div className="app-shell flex bg-app text-ink">
      <NavRail
        view={navigationView}
        onChange={handleViewChange}
        profile={profile}
        profileBadgeCount={isAdmin ? adminTotalPending : 0}
      />

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {view === "chats" && (
            <>
              {!chatOpenedFromCalls && (
                <div className={`${mobileShowChat ? "hidden" : "flex"} min-h-0 w-full md:w-auto md:flex`}>
                  <Sidebar
                    characters={chatThreads}
                    activeId={activeId}
                    profile={profile}
                    onSelect={handleSelect}
                    onAddContact={() => setShowAddContact(true)}
                    onOpenSettings={() => handleViewChange("settings")}
                    hasProviders={hasProviders}
                    pendingContactsCount={pendingOwnerContactsCount}
                  />
                </div>
              )}

              <div className={`${chatOpenedFromCalls || mobileShowChat ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col md:flex`}>
                {activeCharacter ? (
                  renderCharacterConversation(activeCharacter, {
                    mode: "chat",
                    onBack: handleChatBack,
                    backLabel: chatOpenedFromCalls
                      ? "Kembali ke Panggilan"
                      : "Kembali ke daftar chat",
                  })
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
                        HeyTalent
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
                          onClick={() => {
                            if (!isAdmin && characters.length >= limit) {
                              setProfileTab("account");
                              handleViewChange("profile");
                            } else {
                              setShowCreate(true);
                            }
                          }}
                          disabled={isAdmin && characters.length >= limit}
                          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <PlusIcon className="h-4 w-4" />{" "}
                          {!isAdmin && characters.length >= limit
                            ? "Minta Tambah Slot"
                            : "Buat Karakter"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {view === "calls" && (
            <CallsView
              threads={contactThreads}
              activeId={activeId}
              onSelect={handleSelect}
              onManageContacts={() => setShowAddContact(true)}
              onRefresh={() => void fetchCharacters()}
            />
          )}

          {view === "profile" && (
            <ProfileView
              key={`${profileTab}|${profile.displayName}|${profile.nickname}|${profile.age ?? ""}|${profile.occupation}|${profile.about}|${profile.avatarUrl ?? ""}|${characters.length}|${limit}`}
              profile={profile}
              onSaved={setProfile}
              onOpenSettings={() => handleViewChange("settings")}
              initialTab={profileTab}
              onTabChange={setProfileTab}
              isAdmin={isAdmin}
              characterCount={characters.length}
              characterLimit={limit}
              latestQuotaRequest={latestQuotaRequest}
              pendingQuotaRequestsCount={adminTotalPending}
              pendingOwnerContactsCount={pendingOwnerContactsCount}
              characters={characters}
              onQuotaChanged={fetchCharacters}
              onChatCharacter={handleSelect}
              onNewCharacter={() => setShowCreate(true)}
              onOpenCharacterProfile={openProfile}
              onEditCharacter={openEdit}
              onDeleteCharacter={handleDeleteCharacter}
              onOpenContactsModal={() => setShowAddContact(true)}
            />
          )}

          {view === "settings" && (
            <SettingsView
              providers={providers}
              voiceSettings={voice}
              onVoiceChange={setVoice}
              ttsSummary={ttsSummary}
              onSaveTts={handleSaveTts}
              onVoiceNotice={showToast}
              openVoiceInitially={focusVoiceSettings}
              autoFallback={autoFallback}
              onAutoFallbackChange={setAutoFallback}
              chatBackground={chatBackground}
              onChatBackgroundChange={setChatBackground}
              bubbleStyle={bubbleStyle}
              onBubbleStyleChange={setBubbleStyle}
              isAdmin={isAdmin}
              onOpenAccountManagement={() => {
                setProfileTab(isAdmin ? "admin" : "account");
                handleViewChange("profile");
              }}
              onChanged={async () => {
                await Promise.all([fetchProviders(), fetchTtsSettings()]);
              }}
            />
          )}

          {view === "brainstorm" && !activeBrainstormId && !activeMeetupCharacterId && (
            <BrainstormView
              rooms={brainstormRooms}
              characters={characters}
              onOpenMeetup={handleOpenMeetup}
              onOpenRoom={handleOpenBrainstorm}
              onCreateBrainstorm={handleCreateBrainstorm}
              onDeleteRoom={handleDeleteBrainstorm}
              onNeedCharacters={() => {
                setProfileTab("account");
                handleViewChange("profile");
              }}
            />
          )}

          {view === "brainstorm" && activeBrainstormId && (
            (() => {
              const room = brainstormRooms.find((r) => r.id === activeBrainstormId);
              if (!room) return null;
              return (
                <BrainstormRoomView
                  key={activeBrainstormId}
                  roomTitle={room.title}
                  mode={room.mode}
                  sceneCanonical={room.sceneCanonical}
                  members={room.members}
                  messages={brainstormMessages[activeBrainstormId] ?? []}
                  isTyping={brainstormTyping === activeBrainstormId}
                  typingLabel={brainstormTypingLabel}
                  bubble={bubbleStyle}
                  characters={characters}
                  onBack={() => {
                    setActiveBrainstormId(null);
                    fetchBrainstormRooms();
                  }}
                  onClear={() => handleClearBrainstorm(activeBrainstormId)}
                  onDeleteRoom={() => handleDeleteBrainstorm(activeBrainstormId)}
                  onSend={handleSendBrainstorm}
                  onCopy={handleCopyMessage}
                  onSpeak={handleSpeakBrainstorm}
                  onStopSpeaking={stopSpeaking}
                  canSpeak={speechSupported || ttsSummary.hasActiveKey}
                />
              );
            })()
          )}

          {view === "brainstorm" && activeMeetupCharacterId && activeMeetupCharacter && (
            renderCharacterConversation(activeMeetupCharacter, {
              mode: "meetup",
              onBack: () => {
                stopSpeaking();
                setPeekCharId(null);
                setActiveMeetupCharacterId(null);
              },
              backLabel: "Kembali ke daftar karakter",
            })
          )}

          {view === "status" && (
            <StatusView
              profile={profile}
              characters={characters}
              sharedStatusId={sharedStatusId}
              onSharedStatusHandled={handleSharedStatusHandled}
            />
          )}
        </div>

        {showMobileTabBar && (
          <MobileTabBar
            view={navigationView}
            onChange={handleViewChange}
            profile={profile}
            profileBadgeCount={isAdmin ? adminTotalPending : 0}
          />
        )}
      </div>

      {showAddContact && (
        <AddContactModal
          onClose={() => setShowAddContact(false)}
          onUpdated={fetchCharacters}
          onOpenCharactersView={() => {
            setProfileTab("account");
            handleViewChange("profile");
          }}
          onOpenChatThread={(contactId) => handleSelect(`contact:${contactId}`)}
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

      {showNotesDrawer && activeCharacter && (
        <SharedNotesDrawer
          characterName={activeCharacter.name}
          notes={notesMap[activeCharacter.id] ?? []}
          loading={notesLoadingFor === activeCharacter.id}
          onClose={() => setShowNotesDrawer(false)}
          onAddNote={(input) => handleAddSharedNote(activeCharacter.id, input)}
          onToggleDone={(noteId, nextDone) =>
            handleToggleSharedNote(activeCharacter.id, noteId, nextDone)
          }
          onDeleteNote={(noteId) =>
            handleDeleteSharedNote(activeCharacter.id, noteId)
          }
        />
      )}

      {showProfile && profileDetail && (
        <CharacterProfileModal
          character={profileDetail}
          providerLabel={profileProviderLabel}
          bubbleFallback={bubbleStyle}
          ttsSummary={ttsSummary}
          voiceSettings={voice}
          onClose={() => setShowProfile(false)}
          onEdit={() => {
            setEditDetail(profileDetail);
            setShowProfile(false);
          }}
          onClearChat={() => handleClearChat(profileDetail.id)}
          onDelete={() => handleDeleteCharacter(profileDetail.id)}
          onBackgroundChange={(next) => handleCharacterBackground(profileDetail.id, next)}
          onBubbleChange={(next) => handleCharacterBubble(profileDetail.id, next)}
          onVoiceChange={(next) => handleCharacterVoice(profileDetail.id, next)}
          onMediaChange={(next) => handleCharacterMedia(profileDetail.id, next)}
          onMemoryChange={(next) => handleCharacterMemorySync(profileDetail.id, next)}
          onNotice={showToast}
        />
      )}

      {call && callCharacter && (
        <CallOverlay
          character={callCharacter}
          mode={call.mode}
          voice={voice}
          voiceTarget={callVoiceTarget}
          onSendTurn={(spoken, callMode) =>
            handleCallTurn(callCharacter.id, spoken, callMode)
          }
          onClose={() => setCall(null)}
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
    </div>
  );
}
