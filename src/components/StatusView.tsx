"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterSummary } from "@/types/chat";
import type { UserProfile } from "@/lib/userProfile";
import { compressImageFile } from "@/lib/compressImage";
import { Avatar } from "./Avatar";
import {
  TrashIcon,
  XIcon,
  SendIcon,
  CameraIcon,
  FilmIcon,
  PlusIcon,
  PencilIcon,
  IgHeartIcon,
  IgCommentIcon,
  IgShareIcon,
  IgBookmarkIcon,
  IgMoreIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  RefreshIcon,
} from "./icons";

type StatusItem = {
  id: string;
  userId: string;
  characterId: string | null;
  kind: "status" | "reel";
  mediaType: "text" | "image" | "video";
  caption: string;
  content: string;
  imageUrl: string | null;
  videoKey: string | null;
  videoUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  characterName: string | null;
  characterAvatar: string | null;
  userDisplayName: string | null;
  userNickname: string | null;
  userAvatar: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  viewedByMe: boolean;
};

type CommentRow = {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  displayName: string | null;
  nickname: string | null;
  avatarUrl: string | null;
};

function FeedVideo({
  src,
  aspect,
  muted,
  onToggleMute,
  onClickMedia,
}: {
  src: string;
  aspect: string;
  muted?: boolean;
  onToggleMute?: () => void;
  onClickMedia?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const isMuted = muted ?? true;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = isMuted;
  }, [isMuted, src]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.play().catch(() => {});
          } else {
            el.pause();
          }
        });
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);
  return (
    <>
      <video
        ref={ref}
        src={src}
        autoPlay
        muted={isMuted}
        loop
        playsInline
        preload="metadata"
        className={`block w-full object-cover ${aspect} cursor-pointer`}
        onClick={() => {
          if (onClickMedia) onClickMedia();
          else {
            const v = ref.current;
            if (!v) return;
            if (v.paused) v.play().catch(() => {});
            else v.pause();
          }
        }}
      />
      {onToggleMute ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
            const v = ref.current;
            if (v) { v.muted = !isMuted; if (!isMuted) v.muted = true; }
          }}
          aria-label={isMuted ? "Nyalakan suara" : "Matikan suara"}
          className="absolute bottom-3 right-3 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm active:scale-90 border border-white/15"
        >
          {isMuted ? <SpeakerOffIcon className="h-4 w-4" /> : <SpeakerIcon className="h-4 w-4" />}
        </button>
      ) : null}
    </>
  );
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "baru saja";
  if (diff < 3_600_000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600000)}j`;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function remainingHours(exp: string | null) {
  if (!exp) return null;
  const ms = new Date(exp).getTime() - Date.now();
  if (ms <= 0) return "habis";
  const h = Math.ceil(ms / 3600000);
  return `${h}j lagi`;
}

export function StatusView({
  profile,
  characters,
  sharedStatusId,
  onSharedStatusHandled,
}: {
  profile: UserProfile;
  characters: CharacterSummary[];
  sharedStatusId?: string | null;
  onSharedStatusHandled?: () => void;
}) {
  const [items, setItems] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [editingItem, setEditingItem] = useState<StatusItem | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [composeKind, setComposeKind] = useState<"status" | "reel">("status");
  const [composeMedia, setComposeMedia] = useState<"text" | "image" | "video">("text");
  const [composeCharId, setComposeCharId] = useState<string>("");
  const [composeText, setComposeText] = useState("");
  const [composeCaption, setComposeCaption] = useState("");
  const [composeImageUrl, setComposeImageUrl] = useState<string | null>(null);
  const [composeVideoKey, setComposeVideoKey] = useState<string | null>(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeErr, setComposeErr] = useState<string | null>(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const [viewerProfileKey, setViewerProfileKey] = useState<string | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);
  const [reelCommentsFor, setReelCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [fullScreenId, setFullScreenId] = useState<string | null>(null);
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>({});
  const [fullMuted, setFullMuted] = useState(true);
  const [showFullscreenComments, setShowFullscreenComments] = useState(false);
  const [kbOffset, setKbOffset] = useState(0);
  const [activeFsId, setActiveFsId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fsCommentInputRef = useRef<HTMLInputElement>(null);
  const fsScrollRef = useRef<HTMLDivElement>(null);
  const handledSharedStatusRef = useRef<string | null>(null);
  const requestedSharedStatusRef = useRef<string | null>(null);
  const viewedStoryIdsRef = useRef(new Set<string>());
  const viewerStoriesRef = useRef<StatusItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/statuses", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.statuses)) setItems(data.statuses);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!sharedStatusId || loading || handledSharedStatusRef.current === sharedStatusId) return;
    const openSharedItem = (sharedItem: StatusItem) => {
      handledSharedStatusRef.current = sharedStatusId;
      setFullMuted(mutedMap[sharedItem.id] ?? true);
      setFullScreenId(sharedItem.id);
      onSharedStatusHandled?.();
    };

    const sharedItem = items.find((item) => item.id === sharedStatusId);
    if (sharedItem) {
      openSharedItem(sharedItem);
      return;
    }
    if (requestedSharedStatusRef.current === sharedStatusId) return;
    requestedSharedStatusRef.current = sharedStatusId;
    fetch(`/api/statuses?id=${encodeURIComponent(sharedStatusId)}`, { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        const target = Array.isArray(data?.statuses) ? data.statuses[0] as StatusItem | undefined : undefined;
        if (target) setItems((prev) => prev.some((item) => item.id === target.id) ? prev : [target, ...prev]);
        else {
          handledSharedStatusRef.current = sharedStatusId;
          onSharedStatusHandled?.();
        }
      })
      .catch(() => {
        handledSharedStatusRef.current = sharedStatusId;
        onSharedStatusHandled?.();
      });
  }, [sharedStatusId, loading, items, mutedMap, onSharedStatusHandled]);

  const stories = useMemo(() => items.filter((x) => x.kind === "status"), [items]);
  const storyProfiles = useMemo(() => {
    const profiles = new Map<string, StatusItem[]>();
    stories.forEach((story) => {
      const key = story.characterId ? `character:${story.characterId}` : `user:${story.userId}`;
      const profileStories = profiles.get(key);
      if (profileStories) profileStories.push(story);
      else profiles.set(key, [story]);
    });

    return Array.from(profiles.entries()).map(([key, profileStories]) => {
      const latestStory = profileStories[0];
      return {
        key,
        story: latestStory,
        stories: profileStories,
        hasUnseen: profileStories.some((story) => !story.viewedByMe),
      };
    });
  }, [stories]);
  const viewerStories = useMemo(
    () => storyProfiles.find((profileStory) => profileStory.key === viewerProfileKey)?.stories ?? [],
    [storyProfiles, viewerProfileKey]
  );
  viewerStoriesRef.current = viewerStories;
  const currentViewerStory = viewerIdx === null ? undefined : viewerStories[viewerIdx];
  const currentStoryId = currentViewerStory?.id;
  const currentStoryUsesVideoDuration = currentViewerStory?.mediaType === "video" && Boolean(currentViewerStory.videoUrl);
  const reels = useMemo(() => items.filter((x) => x.kind === "reel"), [items]);

  async function handleCreate() {
    setComposeErr(null);
    if (composeMedia === "text" && !composeText.trim() && !composeCaption.trim()) {
      setComposeErr("Tulis isi status dulu ya");
      return;
    }
    if (composeMedia === "image" && !composeImageUrl) {
      setComposeErr("Pilih gambar dulu");
      return;
    }
    if (composeMedia === "video" && !composeVideoKey) {
      setComposeErr("Upload video dulu");
      return;
    }
    setComposeBusy(true);
    try {
      const res = await fetch("/api/statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: composeCharId || undefined,
          kind: composeKind,
          mediaType: composeMedia,
          caption: composeCaption,
          content: composeText,
          imageUrl: composeImageUrl,
          videoKey: composeVideoKey,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Gagal posting");
      setShowComposer(false);
      setComposeText("");
      setComposeCaption("");
      setComposeImageUrl(null);
      setComposeVideoKey(null);
      await load();
    } catch (e: any) {
      setComposeErr(e?.message || "Gagal posting");
    } finally {
      setComposeBusy(false);
    }
  }

  async function handlePickImage(file: File) {
    setComposeErr(null);
    setComposeBusy(true);
    try {
      const compressed = await compressImageFile(file, { maxSize: 1280, quality: 0.82 });
      const fd = new FormData();
      fd.append("file", compressed, compressed.name || "image.jpg");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Upload gagal");
      setComposeImageUrl(data.url);
    } catch (e: any) {
      setComposeErr(e?.message || "Upload gagal");
    } finally {
      setComposeBusy(false);
    }
  }

  async function handlePickVideo(file: File) {
    setComposeErr(null);
    setComposeBusy(true);
    try {
      const pres = await fetch("/api/statuses/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type || "video/mp4",
          bytes: file.size,
          filename: file.name,
          kind: composeKind,
        }),
      });
      const pd = await pres.json().catch(() => null);
      if (!pres.ok) throw new Error(pd?.error || "Gagal minta upload tiket");
      const put = await fetch(pd.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "video/mp4" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload ke R2 gagal");
      setComposeVideoKey(pd.key);
    } catch (e: any) {
      setComposeErr(e?.message || "Upload video gagal");
    } finally {
      setComposeBusy(false);
    }
  }

  async function toggleLike(id: string) {
    // optimistik
    setItems((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              likedByMe: !x.likedByMe,
              likeCount: x.likedByMe ? Math.max(0, x.likeCount - 1) : x.likeCount + 1,
            }
          : x
      )
    );
    try {
      const res = await fetch(`/api/statuses/${id}/like`, { method: "POST" });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setItems((prev) =>
          prev.map((x) => (x.id === id ? { ...x, likedByMe: !!d.liked, likeCount: Number(d.likeCount ?? x.likeCount) } : x))
        );
      }
    } catch {}
  }

  async function handleShare(item: StatusItem) {
    const displayName = item.characterName || item.userDisplayName || item.userNickname || "Teman";
    const detail = (item.caption || item.content || "").trim();
    const appLink = new URL(window.location.href);
    appLink.searchParams.set("statusId", item.id);
    const shareUrl = appLink.toString();
    const text = [`${displayName} membagikan ${item.kind === "reel" ? "Reel" : "Story"} di StoryTalent.`, detail]
      .filter(Boolean)
      .join("\n\n");
    const title = `${displayName} • StoryTalent`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${text}\n${shareUrl}`)}`;
    const popup = window.open(whatsappUrl, "_blank");
    if (popup) popup.opener = null;
    else window.location.assign(whatsappUrl);
  }

  async function openComments(id: string) {
    setReelCommentsFor((cur) => (cur === id ? null : id));
    if (comments[id]) return;
    try {
      const res = await fetch(`/api/statuses/${id}/comments`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (res.ok && Array.isArray(d?.comments)) setComments((p) => ({ ...p, [id]: d.comments }));
    } catch {}
  }

  async function sendComment(id: string) {
    const t = commentDraft.trim();
    if (!t) return;
    setCommentDraft("");
    try {
      const res = await fetch(`/api/statuses/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: t }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.comment) {
        // reload comments
        const res2 = await fetch(`/api/statuses/${id}/comments`, { cache: "no-store" });
        const d2 = await res2.json().catch(() => null);
        if (res2.ok && Array.isArray(d2?.comments)) setComments((p) => ({ ...p, [id]: d2.comments }));
        setItems((prev) => prev.map((x) => (x.id === id ? { ...x, commentCount: x.commentCount + 1 } : x)));
      }
    } catch {}
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus status ini?")) return;
    try {
      const res = await fetch(`/api/statuses/${id}`, { method: "DELETE" });
      if (res.ok) setItems((p) => p.filter((x) => x.id !== id));
    } catch {}
  }

  function beginEditStatus(item: StatusItem) {
    setMenuFor(null);
    setEditingItem(item);
    setEditCaption(item.caption || "");
    setEditContent(item.content || "");
    setEditErr(null);
  }

  async function handleSaveEdit() {
    if (!editingItem) return;
    const content = editContent.trim().slice(0, 700);
    const caption = editCaption.trim().slice(0, 500);
    if (editingItem.mediaType === "text" && !content && !caption) {
      setEditErr("Isi status tidak boleh kosong.");
      return;
    }

    setEditBusy(true);
    setEditErr(null);
    try {
      const res = await fetch(`/api/statuses/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, caption }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan perubahan.");
      setItems((prev) => prev.map((item) => (
        item.id === editingItem.id ? { ...item, content, caption } : item
      )));
      setEditingItem(null);
    } catch (error) {
      setEditErr(error instanceof Error ? error.message : "Gagal menyimpan perubahan.");
    } finally {
      setEditBusy(false);
    }
  }

  const markStoryViewed = useCallback((story: StatusItem) => {
    if (story.viewedByMe || viewedStoryIdsRef.current.has(story.id)) return;
    viewedStoryIdsRef.current.add(story.id);
    fetch(`/api/statuses/${story.id}`, { method: "POST" }).catch(() => undefined);
    setItems((prev) => prev.map((item) => (item.id === story.id ? { ...item, viewedByMe: true } : item)));
  }, []);

  const openStoryProfile = useCallback((profileKey: string) => {
    const selectedProfile = storyProfiles.find((profileStory) => profileStory.key === profileKey);
    if (!selectedProfile) return;
    const unseenIndex = selectedProfile.stories.findIndex((story) => !story.viewedByMe);
    const startIndex = unseenIndex >= 0 ? unseenIndex : 0;
    setViewerProfileKey(selectedProfile.key);
    setViewerIdx(startIndex);
    setStoryProgress(0);
    markStoryViewed(selectedProfile.stories[startIndex]);
  }, [storyProfiles, markStoryViewed]);

  const moveStoryTo = useCallback((index: number) => {
    const story = viewerStoriesRef.current[index];
    if (!story) {
      setViewerIdx(null);
      setViewerProfileKey(null);
      setStoryProgress(0);
      return;
    }
    setViewerIdx(index);
    setStoryProgress(0);
    markStoryViewed(story);
  }, [markStoryViewed]);

  const finishCurrentStory = useCallback(() => {
    if (viewerIdx === null) return;
    if (viewerIdx < viewerStories.length - 1) moveStoryTo(viewerIdx + 1);
    else {
      setViewerIdx(null);
      setViewerProfileKey(null);
      setStoryProgress(0);
    }
  }, [viewerIdx, viewerStories.length, moveStoryTo]);

  // foto/teks berjalan 5 detik; video mengikuti currentTime/duration dan selesai saat ended
  useEffect(() => {
    if (viewerIdx === null || !currentStoryId || currentStoryUsesVideoDuration) return;

    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const nextProgress = Math.min((performance.now() - startedAt) / 5000, 1);
      setStoryProgress(nextProgress);
      if (nextProgress >= 1) {
        window.clearInterval(timer);
        finishCurrentStory();
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [viewerIdx, currentStoryId, currentStoryUsesVideoDuration, finishCurrentStory]);

  // keyboard offset biar input naik di atas keyboard — lebih sensitif untuk iPhone
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const calc = () => {
      if (vv) {
        const off = window.innerHeight - vv.height - vv.offsetTop;
        // iPhone keyboard biasanya 260-350px, kasih threshold 20 biar gak false
        if (off > 20) setKbOffset(off);
        else {
          const ae = document.activeElement as HTMLElement | null;
          const isInput = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");
          if (isInput && off <= 20 && window.innerWidth < 1024) {
            // fallback estimasi keyboard iPhone biar gak ketutup pas vv lag (120ms)
            setKbOffset(290);
          } else {
            setKbOffset(0);
          }
        }
      } else {
        setKbOffset(0);
      }
    };
    const onFocusIn = () => setTimeout(calc, 120);
    const onFocusOut = () => setTimeout(() => setKbOffset(0), 120);
    if (vv) {
      vv.addEventListener("resize", calc);
      vv.addEventListener("scroll", calc);
    }
    window.addEventListener("resize", calc);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", calc);
        vv.removeEventListener("scroll", calc);
      }
      window.removeEventListener("resize", calc);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // tutup sheet komentar pas keluar fullscreen
  useEffect(() => {
    if (!fullScreenId) setShowFullscreenComments(false);
  }, [fullScreenId]);

  // preload komentar pas buka sheet fullscreen
  useEffect(() => {
    if (!showFullscreenComments || !fullScreenId) return;
    const id = showFullscreenComments ? (activeFsId || fullScreenId) : fullScreenId;
    if (!id || comments[id] !== undefined) return;
    fetch(`/api/statuses/${id}/comments`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((d) => {
        if (Array.isArray(d?.comments)) setComments((prev) => ({ ...prev, [id]: d.comments }));
      })
      .catch(() => {});
  }, [showFullscreenComments, fullScreenId, activeFsId]);

  const fsItems = useMemo(() => items, [items]);

  // sinkron activeFsId pas buka fullscreen
  useEffect(() => {
    if (fullScreenId) setActiveFsId(fullScreenId);
    else setActiveFsId(null);
  }, [fullScreenId]);

  // scroll ke item yang di-tap pas buka fullscreen
  useEffect(() => {
    if (!fullScreenId || !fsScrollRef.current) return;
    const idx = fsItems.findIndex((x) => x.id === fullScreenId);
    if (idx >= 0) {
      setTimeout(() => {
        fsScrollRef.current?.children[idx]?.scrollIntoView({ behavior: "instant" as any });
      }, 40);
    }
  }, [fullScreenId, fsItems]);

  // update activeFsId pas scroll vertikal
  const handleFsScroll = useCallback(() => {
    const el = fsScrollRef.current;
    if (!el) return;
    const h = el.clientHeight;
    if (!h) return;
    const idx = Math.round(el.scrollTop / h);
    const it = fsItems[idx];
    if (it && it.id !== activeFsId) {
      setActiveFsId(it.id);
      const m = mutedMap[it.id];
      if (m !== undefined) setFullMuted(m);
      else setFullMuted(true);
    }
  }, [fsItems, activeFsId, mutedMap]);

  // hanya 1 video on-top yang play di fullscreen, yang lain pause biar gak double suara
  useEffect(() => {
    if (!fsScrollRef.current || !activeFsId) return;
    const container = fsScrollRef.current;
    const vids = container.querySelectorAll("video");
    vids.forEach((v) => {
      const page = v.closest("[data-id]") as HTMLElement | null;
      const vid = page?.getAttribute("data-id");
      if (vid === activeFsId) {
        // yang di layar nyala
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [activeFsId, fullScreenId]);

  // pause video feed di belakang pas fullscreen buka biar gak double sama yang di fullscreen
  useEffect(() => {
    if (!fullScreenId) return;
    // delay biar fullscreen container sudah mount
    const t = setTimeout(() => {
      document.querySelectorAll("video").forEach((v) => {
        if (fsScrollRef.current?.contains(v)) return; // ini video di fullscreen, jangan di-pause di sini
        v.pause();
      });
    }, 80);
    return () => clearTimeout(t);
  }, [fullScreenId]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-app">
      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(var(--tabbar-space)+0.75rem)]">
      <div
        className="top-bar sticky top-0 z-30 flex shrink-0 items-center gap-2 px-4 pb-2 pt-[max(1rem,var(--safe-top))] sm:px-5"
        style={{
          borderBottom: "none",
          backgroundColor: "color-mix(in srgb, var(--surface) 58%, transparent)",
          backdropFilter: "saturate(180%) blur(22px)",
          WebkitBackdropFilter: "saturate(180%) blur(22px)",
        }}
      >
        <button
          type="button"
          onClick={() => setShowComposer((v) => !v)}
          aria-label="Buat status"
          className="flex h-10 w-10 shrink-0 items-center justify-start text-ink active:scale-90"
        >
          <PlusIcon className="h-8 w-8" />
        </button>
        <h1 className="min-w-0 flex-1 text-center font-display text-[21px] font-extrabold tracking-tight text-ink">
          StoryTalent
        </h1>
        <span role="img" aria-label="Notifikasi" className="flex h-10 w-10 shrink-0 items-center justify-end text-ink">
          <IgHeartIcon className="h-7 w-7" />
        </span>
      </div>

      {showComposer && (
        <div className="border-b border-line bg-surface p-3">
          <div className="mx-auto w-full max-w-[560px] space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setComposeKind("status")}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${composeKind === "status" ? "bg-ink text-white" : "bg-surface-2 text-ink-soft"}`}
              >
                Story 24j
              </button>
              <button
                onClick={() => setComposeKind("reel")}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${composeKind === "reel" ? "bg-ink text-white" : "bg-surface-2 text-ink-soft"}`}
              >
                Reels permanen
              </button>
            </div>

            <div className="flex gap-2">
              <select
                value={composeCharId}
                onChange={(e) => setComposeCharId(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm"
              >
                <option value="">Atas nama: Kamu ({profile.displayName || profile.nickname || "Akun"})</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-1 rounded-full bg-surface-2 p-1">
              {(["text", "image", "video"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setComposeMedia(k)}
                  className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold capitalize ${composeMedia === k ? "bg-white shadow text-ink" : "text-ink-soft"}`}
                >
                  {k === "text" ? "Teks" : k === "image" ? "Foto" : "Video"}
                </button>
              ))}
            </div>

            {composeMedia === "text" && (
              <textarea
                value={composeText}
                onChange={(e) => setComposeText(e.target.value.slice(0, 700))}
                placeholder="Apa yang kamu pikirkan? (maks 700)"
                rows={3}
                className="w-full rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-ink/30"
              />
            )}

            {composeMedia === "image" && (
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handlePickImage(e.target.files[0])} />
                <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface-2 px-3 py-3 text-sm font-medium">
                  <CameraIcon className="h-4 w-4" /> Pilih foto
                </button>
                {composeImageUrl && <img src={composeImageUrl} alt="preview" className="max-h-64 w-full rounded-2xl object-cover" />}
              </div>
            )}

            {composeMedia === "video" && (
              <div className="space-y-2">
                <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => e.target.files?.[0] && handlePickVideo(e.target.files[0])} />
                <button onClick={() => videoRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface-2 px-3 py-3 text-sm font-medium">
                  <FilmIcon className="h-4 w-4" /> Pilih video (max 40MB)
                </button>
                {composeVideoKey && <div className="rounded-xl bg-ink px-3 py-2 text-xs text-white">Video siap ✓ {composeVideoKey.slice(0, 28)}…</div>}
              </div>
            )}

            <input
              value={composeCaption}
              onChange={(e) => setComposeCaption(e.target.value.slice(0, 500))}
              placeholder={composeMedia === "text" ? "Caption (opsional)" : "Tulis caption..."}
              className="w-full rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-ink/30"
            />

            {composeErr && <div className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600">{composeErr}</div>}

            <div className="flex gap-2">
              <button onClick={() => setShowComposer(false)} className="flex-1 rounded-full border border-line bg-surface px-3 py-2.5 text-sm font-semibold">
                Batal
              </button>
              <button
                disabled={composeBusy}
                onClick={handleCreate}
                className="flex-1 rounded-full bg-ink px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {composeBusy ? "Menyimpan..." : `Posting ${composeKind === "reel" ? "Reel" : "Story"}`}
              </button>
            </div>
          </div>
        </div>
      )}

        <div className="mx-auto w-full max-w-[560px]">
          {/* Story strip ala IG — empat profil terlihat dalam satu layar */}
          <div className="border-b border-line bg-surface px-2 py-3">
            <div className="flex snap-x snap-mandatory gap-0 overflow-x-auto px-1 pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
              {loading ? (
                <div className="px-3 py-6 text-sm text-muted">Memuat...</div>
              ) : storyProfiles.length === 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border-2 border-dashed border-line bg-surface-2">
                      <PlusIcon className="h-5 w-5 text-muted" />
                    </div>
                    <span className="text-[11px] text-muted">Belum ada story</span>
                  </div>
                </div>
              ) : (
                storyProfiles.map((profileStory) => {
                  const s = profileStory.story;
                  const name = s.characterName || s.userDisplayName || s.userNickname || "Kamu";
                  const avatar = s.characterAvatar || s.userAvatar || undefined;
                  return (
                    <button key={profileStory.key} onClick={() => openStoryProfile(profileStory.key)} className="flex w-1/4 shrink-0 snap-start flex-col items-center gap-1">
                      <span className={`rounded-full p-[2px] ${profileStory.hasUnseen ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-violet-500" : "bg-line"}`}>
                        <span className="block rounded-full bg-surface p-[2px]">
                          <Avatar name={name} src={avatar} size={56} />
                        </span>
                      </span>
                      <span className="w-full truncate text-center text-[12px] font-medium leading-tight">{name}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Reels / feed */}
          <div className="divide-y divide-line bg-surface">
            {reels.length === 0 && stories.length === 0 && !loading ? (
              <div className="px-6 py-12 text-center text-sm text-muted">Belum ada status. Tap + Buat untuk posting Story 24j atau Reel permanen ✨</div>
            ) : null}

            {(reels.length ? reels : items.filter((x) => x.kind === "status")).map((it) => {
              const displayName = it.characterName || it.userDisplayName || it.userNickname || "Anonim";
              const avatar = it.characterAvatar || it.userAvatar || undefined;
              return (
                <article key={it.id} className="bg-surface">
                  {/* media + banner transparan ala IG di atas konten — tap buka fullscreen */}
                  <div className="relative w-full overflow-hidden bg-black cursor-pointer" onClick={() => { if (it.mediaType === "image" || it.mediaType === "video") { setFullScreenId(it.id); const fm = mutedMap[it.id]; if (fm !== undefined) setFullMuted(fm); else setFullMuted(true); } }}>
                    {it.mediaType === "image" && it.imageUrl ? (
                      <img
                        src={it.imageUrl}
                        alt=""
                        className={`block w-full cursor-pointer object-cover ${it.kind === "reel" ? "aspect-[9/16]" : "aspect-[4/5]"}`}
                        loading="lazy"
                      />
                    ) : it.mediaType === "video" && it.videoUrl ? (
                      <FeedVideo
                        src={it.videoUrl}
                        aspect={it.kind === "reel" ? "aspect-[9/16]" : "aspect-[4/5]"}
                        muted={mutedMap[it.id] ?? true}
                        onToggleMute={() => setMutedMap((prev) => ({ ...prev, [it.id]: !(prev[it.id] ?? true) }))}
                        onClickMedia={() => { setFullScreenId(it.id); const fm = mutedMap[it.id]; if (fm !== undefined) setFullMuted(fm); else setFullMuted(true); }}
                      />
                    ) : (
                      <div className={`w-full cursor-pointer bg-gradient-to-br from-violet-500 via-pink-500 to-amber-400 px-6 py-10 ${it.kind === "reel" ? "aspect-[9/16] flex items-center justify-center" : ""}`}>
                        <p className="whitespace-pre-wrap text-center text-[18px] font-semibold leading-relaxed text-white drop-shadow">{it.content || it.caption || "—"}</p>
                      </div>
                    )}

                    {/* Banner transparan IG: avatar + nama di atas konten, burger kanan */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent px-3 pb-8 pt-2.5">
                      <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
                        <span className="rounded-full bg-white p-[2px] shadow-sm">
                          <Avatar name={displayName} src={avatar} size={32} />
                        </span>
                        <div className="min-w-0 leading-none">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-white drop-shadow">{displayName}</span>
                            <span className="shrink-0 text-[11px] font-normal text-white/80">• {timeAgo(it.createdAt)}</span>
                          </div>
                          <div className="truncate text-[11px] text-white/80 drop-shadow">{it.kind === "reel" ? "Reels" : "Status"} {it.expiresAt ? `• ${remainingHours(it.expiresAt)}` : ""}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => setMenuFor(menuFor === it.id ? null : it.id)}
                        className="pointer-events-auto -mr-1 rounded-full p-2 text-white active:scale-90"
                        aria-label="Opsi"
                      >
                        <IgMoreIcon className="h-5 w-5 text-white drop-shadow" />
                      </button>
                    </div>

                    {/* Popover opsi burger */}
                    {menuFor === it.id && (
                      <div className="absolute right-2 top-11 z-20 min-w-[160px] overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-xl">
                        <button
                          onClick={() => beginEditStatus(it)}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium text-ink hover:bg-surface-2"
                        >
                          <PencilIcon className="h-4 w-4" /> Edit
                        </button>
                        <button
                          onClick={() => {
                            setMenuFor(null);
                            handleDelete(it.id);
                          }}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-surface-2"
                        >
                          <TrashIcon className="h-4 w-4" /> Hapus
                        </button>
                        <button
                          onClick={() => setMenuFor(null)}
                          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-ink-soft hover:bg-surface-2"
                        >
                          <XIcon className="h-4 w-4" /> Tutup
                        </button>
                      </div>
                    )}
                    {/* tap backdrop tutup menu */}
                    {menuFor === it.id && (
                      <button
                        aria-label="Tutup menu"
                        onClick={() => setMenuFor(null)}
                        className="absolute inset-0 z-10 bg-transparent"
                      />
                    )}
                  </div>

                  {/* IG-style action bar */}
                  <div className="flex items-center justify-between px-2 py-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleLike(it.id)}
                        aria-label={it.likedByMe ? "Batal suka" : "Suka"}
                        className="p-1 active:scale-90 transition"
                      >
                        <IgHeartIcon
                          filled={it.likedByMe}
                          className={`h-[24px] w-[24px] ${it.likedByMe ? "text-red-500 fill-red-500" : "text-ink"}`}
                        />
                      </button>
                      <button onClick={() => openComments(it.id)} aria-label="Komentar" className="p-1 active:scale-90">
                        <IgCommentIcon className="h-[24px] w-[24px] text-ink" />
                      </button>
                      <button onClick={() => handleShare(it)} aria-label="Bagikan" className="p-1 active:scale-90">
                        <IgShareIcon className="h-[24px] w-[24px] text-ink" />
                      </button>
                    </div>
                    <button aria-label="Simpan" className="p-1">
                      <IgBookmarkIcon className="h-[24px] w-[24px] text-ink" />
                    </button>
                  </div>

                  {it.likeCount > 0 && (
                    <div className="px-3 pb-1 text-[14px] font-semibold leading-none">
                      {it.likeCount.toLocaleString("id-ID")} suka
                    </div>
                  )}

                  {(it.caption || it.content) && it.mediaType !== "text" ? (
                    <div className="px-3 pb-1 text-[14px] leading-[18px]">
                      <span className="font-semibold">{displayName} </span>
                      <span className="text-ink">{it.caption || it.content}</span>
                    </div>
                  ) : null}
                  {it.commentCount > 0 && reelCommentsFor !== it.id && (
                    <button onClick={() => openComments(it.id)} className="px-3 pb-1 text-left text-[14px] text-muted">
                      Lihat {it.commentCount} komentar
                    </button>
                  )}
                  <div className="px-3 pb-3 text-[11px] uppercase tracking-wide text-muted">
                    {timeAgo(it.createdAt)} • {it.kind === "reel" ? "Reels" : "Status"}
                  </div>

                  {reelCommentsFor === it.id && (
                    <div className="border-t border-line bg-surface-2/60 px-3 py-2">
                      <div className="max-h-40 space-y-2 overflow-auto py-1">
                        {(comments[it.id] || []).length === 0 ? (
                          <div className="py-2 text-center text-xs text-muted">Belum ada komentar — jadi yang pertama ✨</div>
                        ) : (
                          (comments[it.id] || []).map((c) => (
                            <div key={c.id} className="flex gap-2">
                              <Avatar name={c.displayName || c.nickname || "User"} src={c.avatarUrl || undefined} size={24} />
                              <div className="min-w-0 rounded-2xl bg-white px-3 py-1.5 shadow-sm">
                                <div className="text-xs font-semibold">{c.displayName || c.nickname || "User"}</div>
                                <div className="text-sm leading-snug">{c.content}</div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2 pt-2">
                        <input
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && sendComment(it.id)}
                          placeholder="Tulis komentar..."
                          className="flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none"
                        />
                        <button onClick={() => sendComment(it.id)} className="rounded-full bg-ink p-2.5 text-white">
                          <SendIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="h-6" />
        </div>
      </div>

      {editingItem && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 px-0 pb-0 pt-[max(0.5rem,var(--safe-top))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => { if (!editBusy) setEditingItem(null); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="status-edit-title"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] border border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 sm:rounded-2xl"
            style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" />
            <div className="flex items-center justify-between gap-3">
              <h2 id="status-edit-title" className="text-base font-bold text-ink">Edit postingan</h2>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                disabled={editBusy}
                aria-label="Tutup edit"
                className="rounded-full p-2 text-ink-soft hover:bg-surface-2 disabled:opacity-50"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {editingItem.mediaType === "text" && (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value.slice(0, 700))}
                  placeholder="Isi status..."
                  rows={5}
                  className="w-full resize-y rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-ink/30"
                />
              )}
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value.slice(0, 500))}
                placeholder={editingItem.mediaType === "text" ? "Caption (opsional)" : "Edit caption..."}
                rows={3}
                className="w-full resize-y rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-ink/30"
              />
              {editErr && <div className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">{editErr}</div>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  disabled={editBusy}
                  className="flex-1 rounded-full border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={editBusy}
                  className="flex-1 rounded-full bg-ink px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {editBusy ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Story viewer fullscreen — hanya postingan profil yang dipilih */}
      {viewerIdx !== null && viewerStories[viewerIdx] && (() => {
        const currentStory = viewerStories[viewerIdx];
        const displayName = currentStory.characterName || currentStory.userDisplayName || currentStory.userNickname || "User";
        const avatar = currentStory.characterAvatar || currentStory.userAvatar || undefined;
        const closeViewer = () => {
          setViewerIdx(null);
          setViewerProfileKey(null);
          setStoryProgress(0);
        };
        return (
          <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
            {currentStory.mediaType === "image" && currentStory.imageUrl ? (
              <img src={currentStory.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : currentStory.mediaType === "video" && currentStory.videoUrl ? (
              <video
                key={currentStory.id}
                src={currentStory.videoUrl}
                autoPlay
                controls
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget;
                  if (Number.isFinite(video.duration) && video.duration > 0) {
                    setStoryProgress(Math.min(video.currentTime / video.duration, 1));
                  }
                }}
                onTimeUpdate={(e) => {
                  const video = e.currentTarget;
                  if (Number.isFinite(video.duration) && video.duration > 0) {
                    setStoryProgress(Math.min(video.currentTime / video.duration, 1));
                  }
                }}
                onEnded={() => {
                  setStoryProgress(1);
                  finishCurrentStory();
                }}
                onError={finishCurrentStory}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-violet-500 via-pink-500 to-amber-400 px-8 py-28 text-center">
                <p className="whitespace-pre-wrap text-xl font-semibold leading-relaxed text-white drop-shadow-lg">
                  {currentStory.content || currentStory.caption}
                </p>
              </div>
            )}

            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/55 via-transparent to-black/45" />

            <div className="absolute inset-x-0 top-0 z-20 px-2 pt-[max(0.5rem,var(--safe-top))]">
              <div className="flex gap-1">
                {viewerStories.map((story, i) => (
                  <div key={story.id} className="h-0.5 flex-1 overflow-hidden rounded bg-white/30">
                    <div
                      className="h-full bg-white transition-[width] duration-100 ease-linear"
                      style={{
                        width: i < viewerIdx ? "100%" : i === viewerIdx ? `${Math.min(storyProgress, 1) * 100}%` : "0%",
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between px-1">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar name={displayName} src={avatar} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{displayName}</div>
                    <div className="text-xs text-white/75">{timeAgo(currentStory.createdAt)}</div>
                  </div>
                </div>
                <button onClick={closeViewer} className="rounded-full bg-black/30 p-2 backdrop-blur-md" aria-label="Tutup status">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <button
              onClick={() => viewerIdx > 0 && moveStoryTo(viewerIdx - 1)}
              disabled={viewerIdx === 0}
              className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/25 p-2 text-white backdrop-blur-sm disabled:opacity-35"
              aria-label="Status sebelumnya"
            >
              ‹
            </button>
            <button
              onClick={() => moveStoryTo(viewerIdx + 1)}
              className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/25 p-2 text-white backdrop-blur-sm"
              aria-label={viewerIdx === viewerStories.length - 1 ? "Tutup status" : "Status berikutnya"}
            >
              ›
            </button>

            {currentStory.caption && currentStory.caption !== currentStory.content && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-20 text-center text-sm text-white/90 drop-shadow">
                {currentStory.caption}
              </div>
            )}
          </div>
        );
      })()}

      {/* Fullscreen IG — scroll vertikal pindah status kayak IG, tanpa nama tengah */}
      {fullScreenId && (() => {
        if (!fsItems.length) return null;
        const activeIt = fsItems.find((x) => x.id === (activeFsId || fullScreenId)) || fsItems.find((x) => x.id === fullScreenId) || fsItems[0];
        return (
          <div className="fixed inset-0 z-[60] bg-black overflow-hidden">
            {/* header global — cuma back + opsi */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(0.7rem,var(--safe-top))] pb-3 text-white z-30 pointer-events-none">
              <button onClick={() => setFullScreenId(null)} className="pointer-events-auto rounded-full bg-black/25 p-2 backdrop-blur-md border border-white/15 active:scale-90" aria-label="Kembali">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M15 18L9 12l6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button onClick={() => { const id = activeFsId || fullScreenId; setMenuFor((prev) => prev === id ? null : id); }} className="pointer-events-auto rounded-full bg-black/25 p-2 backdrop-blur-md border border-white/10 active:scale-90" aria-label="Opsi">
                <IgMoreIcon className="h-5 w-5 text-white" />
              </button>
            </div>
            {menuFor === activeIt.id && (
              <div
                className="absolute right-3 z-40 min-w-[160px] overflow-hidden rounded-2xl border border-white/10 bg-[#121212]/95 py-1 text-white shadow-xl backdrop-blur-xl"
                style={{ top: "calc(var(--safe-top) + 3.75rem)" }}
              >
                <button onClick={() => beginEditStatus(activeIt)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-white/10">
                  <PencilIcon className="h-4 w-4" /> Edit
                </button>
                <button
                  onClick={() => { setMenuFor(null); handleDelete(activeIt.id); }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-red-400 hover:bg-white/10"
                >
                  <TrashIcon className="h-4 w-4" /> Hapus
                </button>
                <button onClick={() => setMenuFor(null)} className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-white/75 hover:bg-white/10">
                  <XIcon className="h-4 w-4" /> Tutup
                </button>
              </div>
            )}

            {/* scroll vertikal snap — swipe atas/bawah ganti status */}
            <div ref={fsScrollRef} onScroll={handleFsScroll} className="h-full w-full overflow-y-auto snap-y snap-mandatory scrollbar-none overscroll-contain" style={{ scrollbarWidth: "none" }}>
              {fsItems.map((item) => {
                const dName = item.characterName || item.userDisplayName || item.userNickname || "Anonim";
                const av = item.characterAvatar || item.userAvatar || undefined;
                const cap = item.caption || item.content || "";
                const isMuted = mutedMap[item.id] ?? true;
                return (
                  <div key={item.id} data-id={item.id} className="relative h-[100dvh] w-full snap-start snap-always shrink-0 overflow-hidden bg-black">
                    {/* media full bleed */}
                    <div className="absolute inset-0">
                      {item.mediaType === "image" && item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : item.mediaType === "video" && item.videoUrl ? (
                        <video
                          src={item.videoUrl}
                          autoPlay
                          loop
                          playsInline
                          muted={isMuted}
                          controls={false}
                          className="h-full w-full object-cover"
                          onClick={(e) => {
                            const v = e.currentTarget;
                            if (v.paused) v.play().catch(() => {});
                            else v.pause();
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 via-pink-500 to-amber-400 p-8 text-center">
                          <p className="whitespace-pre-wrap text-xl font-semibold text-white">{item.content || item.caption}</p>
                        </div>
                      )}
                    </div>
                    {/* gradients */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                    {/* right vertical action bar per item */}
                    <div className="absolute bottom-[138px] right-2.5 flex flex-col items-center gap-3.5 text-white">
                      <button onClick={() => toggleLike(item.id)} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow">
                        <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                          <IgHeartIcon filled={item.likedByMe} className={`h-6 w-6 ${item.likedByMe ? "text-red-500 fill-red-500" : "text-white"}`} />
                        </span>
                        <span className="text-[11px] font-semibold leading-none drop-shadow">{item.likeCount > 0 ? item.likeCount : 0}</span>
                      </button>
                      <button onClick={() => { setActiveFsId(item.id); setShowFullscreenComments(true); }} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow">
                        <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                          <IgCommentIcon className="h-6 w-6 text-white" />
                        </span>
                        <span className="text-[11px] font-semibold leading-none drop-shadow">{item.commentCount > 0 ? item.commentCount : 0}</span>
                      </button>
                      <button onClick={() => handleShare(item)} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow" title="Bagikan">
                        <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                          <IgShareIcon className="h-6 w-6 text-white" />
                        </span>
                      </button>
                      {item.mediaType === "video" && item.videoUrl ? (
                        <button onClick={() => { const cur = mutedMap[item.id] ?? true; setMutedMap((prev) => ({ ...prev, [item.id]: !cur })); setFullMuted(!cur); }} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow" aria-label="Suara">
                          <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                            {(mutedMap[item.id] ?? true) ? <SpeakerOffIcon className="h-[22px] w-[22px] text-white" /> : <SpeakerIcon className="h-[22px] w-[22px] text-white" />}
                          </span>
                        </button>
                      ) : null}
                      <button className="flex flex-col items-center gap-1 active:scale-90 opacity-90 drop-shadow" title="Simpan">
                        <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                          <IgBookmarkIcon className="h-[22px] w-[22px] text-white drop-shadow" />
                        </span>
                      </button>
                    </div>
                    {/* bottom profile per item */}
                    <div className="absolute inset-x-0 bottom-[96px] px-3 pb-2 pt-2 text-white pr-14">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white p-[2px] shadow">
                          <Avatar name={dName} src={av} size={28} />
                        </span>
                        <span className="text-[13px] font-semibold drop-shadow">{dName}</span>
                        <span className="text-[11px] text-white/70 drop-shadow">• {item.kind === "reel" ? "Reels" : "Status"} • {timeAgo(item.createdAt)}</span>
                        <span className="ml-1 rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-[11px] font-semibold">Ikuti</span>
                      </div>
                      {(cap?.trim() || (item.content || "").trim()) ? (
                        <div className="mt-1.5 text-[13px] leading-snug drop-shadow pr-2">
                          <span className="font-semibold">{dName} </span>
                          <span className="text-white/90 break-words">{(cap || item.content || "").trim()}</span>
                          {item.likeCount > 0 ? <span className="ml-2 text-white/60 text-xs">{item.likeCount} suka</span> : null}
                        </div>
                      ) : (
                        <div className="mt-1 text-[12px] text-white/60 drop-shadow">—</div>
                      )}
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-white/70 drop-shadow">
                        <span>♫</span>
                        <span className="truncate">{dName} • audio asli</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* global comment bar — cuma shortcut ke modal, tanpa Kirim/X karena back < sudah ada di atas */}
            <div className="absolute inset-x-0 bottom-0 flex items-center bg-black px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] border-t border-white/10 z-30" style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}>
              <button onClick={() => { setShowFullscreenComments(true); setTimeout(() => fsCommentInputRef.current?.focus(), 80); }} className="flex flex-1 items-center rounded-full bg-white/10 border border-white/10 px-4 py-2.5 text-left text-sm text-white/50">
                Tambahkan komentar...
              </button>
            </div>

            {/* sheet komen untuk item aktif */}
            {showFullscreenComments && activeIt && (
              <>
                <button aria-label="Tutup komentar" onClick={() => setShowFullscreenComments(false)} className="absolute inset-0 bg-black/55 backdrop-blur-[1px] z-30" />
                <div className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-[20px] bg-[#121212] shadow-2xl z-40 transition-transform duration-200" style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}>
                  <div className="flex shrink-0 justify-center pt-2.5 pb-1">
                    <span className="h-1 w-10 rounded-full bg-white/25" />
                  </div>
                  <div className="flex-1 overflow-y-auto px-3">
                    <div className="max-h-[42dvh] space-y-3.5 overflow-y-auto py-2">
                      {(comments[activeIt.id] || []).length === 0 ? (
                        <div className="py-8 text-center text-sm text-white/50">Belum ada komentar — jadi yang pertama ✨</div>
                      ) : (
                        (comments[activeIt.id] || []).map((c) => (
                          <div key={c.id} className="flex gap-2.5">
                            <Avatar name={c.displayName || c.nickname || "User"} src={c.avatarUrl || undefined} size={32} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[13px] font-semibold text-white">{c.displayName || c.nickname || "Anonim"}</span>
                                <span className="text-[11px] text-white/40">{timeAgo(c.createdAt)}</span>
                              </div>
                              <div className="text-[13px] leading-snug text-white/90">{c.content}</div>
                              <button className="mt-1 text-xs font-semibold text-white/40">Balas</button>
                            </div>
                            <button className="shrink-0 self-start p-1.5 text-white/40">
                              <IgHeartIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto py-3 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                      {["❤️","🙌","🔥","👏","😢","😍","😲","😂"].map((e) => (
                        <button key={e} onClick={() => setCommentDraft((p) => p + e)} className="shrink-0 rounded-full bg-white/[0.08] px-3 py-2 text-[18px] active:scale-90 border border-white/10">
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 border-t border-white/10 bg-[#121212] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <Avatar name={profile.displayName || profile.nickname || "Kamu"} src={profile.avatarUrl || undefined} size={30} />
                    <div className="flex flex-1 items-center gap-1 rounded-full bg-white/10 border border-white/10 pl-3 pr-1 py-1">
                      <input
                        ref={fsCommentInputRef}
                        autoFocus
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") sendComment(activeIt.id); }}
                        placeholder="Apa pendapat Anda tenta..."
                        className="flex-1 bg-transparent py-1.5 text-sm text-white placeholder:text-white/40 outline-none"
                      />
                      {commentDraft.trim() ? (
                        <button onClick={() => sendComment(activeIt.id)} className="shrink-0 rounded-full bg-white p-1.5 text-black active:scale-90" aria-label="Kirim komentar">
                          <SendIcon className="h-5 w-5" />
                        </button>
                      ) : (
                        <>
                          <button className="shrink-0 p-1 text-white/50" title="Foto">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="h-5 w-5"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 16l4-4 4 4 3-3 3 3"/></svg>
                          </button>
                          <button className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[11px] font-bold text-white/70">GIF</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

    </div>
  );
}



