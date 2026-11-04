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
}: {
  profile: UserProfile;
  characters: CharacterSummary[];
}) {
  const [items, setItems] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
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
  const [reelCommentsFor, setReelCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentRow[]>>({});
  const [commentDraft, setCommentDraft] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [fullScreenId, setFullScreenId] = useState<string | null>(null);
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>({});
  const [fullMuted, setFullMuted] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

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

  const stories = useMemo(() => items.filter((x) => x.kind === "status"), [items]);
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

  function openStoryAt(idx: number) {
    setViewerIdx(idx);
    const s = stories[idx];
    if (s && !s.viewedByMe) {
      fetch(`/api/statuses/${s.id}`, { method: "POST" }).catch(() => undefined);
      setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, viewedByMe: true } : x)));
    }
  }

  // viewer auto advance setelah 5s (foto/teks), video biarkan manual
  useEffect(() => {
    if (viewerIdx === null) return;
    const cur = stories[viewerIdx];
    if (!cur || cur.mediaType === "video") return;
    const t = setTimeout(() => {
      if (viewerIdx < stories.length - 1) setViewerIdx(viewerIdx + 1);
      else setViewerIdx(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [viewerIdx, stories]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-app">
      <div className="top-bar flex shrink-0 items-center justify-between gap-2 px-4 pb-3.5 pt-[max(1rem,var(--safe-top))] sm:px-5">
        <div>
          <h2 className="font-display text-[17px] font-extrabold tracking-tight">Status</h2>
          <p className="text-xs text-ink-soft">Story 24 jam & Reels permanen</p>
        </div>
        <button
          onClick={() => setShowComposer((v) => !v)}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white active:scale-95"
        >
          + Buat
        </button>
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

      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(var(--tabbar-space)+0.75rem)]">
        <div className="mx-auto w-full max-w-[560px]">
          {/* Story bar ala WA */}
          <div className="border-b border-line bg-surface px-2 py-3">
            <div className="flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
              {loading ? (
                <div className="px-3 py-6 text-sm text-muted">Memuat...</div>
              ) : stories.length === 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border-2 border-dashed border-line bg-surface-2">
                      <PlusIcon className="h-5 w-5 text-muted" />
                    </div>
                    <span className="text-[11px] text-muted">Belum ada story</span>
                  </div>
                </div>
              ) : (
                stories.map((s, idx) => {
                  const name = s.characterName || s.userDisplayName || s.userNickname || "Kamu";
                  const avatar = s.characterAvatar || s.userAvatar || undefined;
                  const isUnseen = !s.viewedByMe;
                  return (
                    <button key={s.id} onClick={() => openStoryAt(idx)} className="flex w-[68px] shrink-0 flex-col items-center gap-1">
                      <span className={`rounded-full p-[2px] ${isUnseen ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-violet-500" : "bg-line"}`}>
                        <span className="block rounded-full bg-surface p-[2px]">
                          <Avatar name={name} src={avatar} size={52} />
                        </span>
                      </span>
                      <span className="w-full truncate text-center text-[11px] font-medium leading-tight">{name}</span>
                      <span className="text-[10px] text-muted">{remainingHours(s.expiresAt)}</span>
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
                      <button onClick={() => openComments(it.id)} aria-label="Bagikan" className="p-1 active:scale-90">
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

      {/* Story viewer fullscreen ala WA */}
      {viewerIdx !== null && stories[viewerIdx] && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          {/* progress */}
          <div className="flex gap-1 px-2 pt-[max(0.5rem,var(--safe-top))]">
            {stories.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 overflow-hidden rounded bg-white/30">
                <div className={`h-full bg-white transition-all ${i < (viewerIdx ?? 0) ? "w-full" : i === viewerIdx ? "w-1/2 animate-[pulse_5s_linear]" : "w-0"}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 py-2 text-white">
            <div className="flex items-center gap-2">
              <Avatar
                name={stories[viewerIdx].characterName || stories[viewerIdx].userDisplayName || "User"}
                src={(stories[viewerIdx].characterAvatar || stories[viewerIdx].userAvatar) || undefined}
                size={32}
              />
              <div>
                <div className="text-sm font-semibold">{stories[viewerIdx].characterName || stories[viewerIdx].userDisplayName || "User"}</div>
                <div className="text-xs opacity-70">{timeAgo(stories[viewerIdx].createdAt)}</div>
              </div>
            </div>
            <button onClick={() => setViewerIdx(null)} className="rounded-full bg-white/15 p-2">
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex flex-1 items-center justify-center p-2">
            <button
              onClick={() => setViewerIdx((v) => (v !== null && v > 0 ? v - 1 : v))}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white"
            >
              ‹
            </button>
            <button
              onClick={() => setViewerIdx((v) => (v !== null && v < stories.length - 1 ? v + 1 : null))}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white"
            >
              ›
            </button>

            {stories[viewerIdx].mediaType === "image" && stories[viewerIdx].imageUrl ? (
              <img src={stories[viewerIdx].imageUrl!} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
            ) : stories[viewerIdx].mediaType === "video" && stories[viewerIdx].videoUrl ? (
              <video src={stories[viewerIdx].videoUrl!} autoPlay controls playsInline className="max-h-full max-w-full rounded-2xl" />
            ) : (
              <div className="mx-4 rounded-[28px] bg-gradient-to-br from-violet-500 via-pink-500 to-amber-400 p-8 text-center">
                <p className="whitespace-pre-wrap text-xl font-semibold leading-relaxed text-white">
                  {stories[viewerIdx].content || stories[viewerIdx].caption}
                </p>
              </div>
            )}
          </div>

          <div className="px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 text-center text-sm text-white/80">{stories[viewerIdx].caption || ""}</div>
        </div>
      )}

      {/* Fullscreen IG — video beneran penuh layar, UI overlay di atas video */}
      {fullScreenId && (() => {
        const it = items.find((x) => x.id === fullScreenId);
        if (!it) return null;
        const displayName = it.characterName || it.userDisplayName || it.userNickname || "Anonim";
        const avatar = it.characterAvatar || it.userAvatar || undefined;
        const caption = it.caption || it.content || "";
        return (
          <div className="fixed inset-0 z-[60] bg-black overflow-hidden">
            {/* media full bleed — object-cover nutup layar penuh kayak IG Reels */}
            <div className="absolute inset-0">
              {it.mediaType === "image" && it.imageUrl ? (
                <img
                  src={it.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onClick={() => setFullScreenId(null)}
                />
              ) : it.mediaType === "video" && it.videoUrl ? (
                <video
                  src={it.videoUrl}
                  autoPlay
                  loop
                  playsInline
                  muted={fullMuted}
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
                  <p className="whitespace-pre-wrap text-xl font-semibold text-white">{it.content || it.caption}</p>
                </div>
              )}
            </div>

            {/* gradient atas & bawah biar teks kebaca kayak IG */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

            {/* header overlay */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(0.7rem,var(--safe-top))] pb-3 text-white">
              <button onClick={() => setFullScreenId(null)} className="rounded-full bg-black/25 p-2 backdrop-blur-md border border-white/15 active:scale-90" aria-label="Kembali">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M15 18L9 12l6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded-full bg-white p-[1px]"><Avatar name={displayName} src={avatar} size={22} /></span>
                <span className="truncate text-[14px] font-semibold drop-shadow">{displayName}</span>
                <span className="shrink-0 text-[11px] text-white/70">• {timeAgo(it.createdAt)}</span>
              </div>
              <button onClick={() => setMenuFor(menuFor === it.id ? null : it.id)} className="rounded-full bg-black/25 p-2 backdrop-blur-md border border-white/10 active:scale-90" aria-label="Opsi">
                <IgMoreIcon className="h-5 w-5 text-white" />
              </button>
            </div>

            {/* speaker kanan-bawah di atas video */}
            {it.mediaType === "video" && it.videoUrl && (
              <button
                onClick={() => { setFullMuted((v) => !v); setMutedMap((prev) => ({ ...prev, [it.id]: !fullMuted })); }}
                className="absolute bottom-[158px] right-3 rounded-full bg-black/40 p-2.5 text-white backdrop-blur-md border border-white/15 active:scale-90"
                aria-label="Suara"
              >
                {fullMuted ? <SpeakerOffIcon className="h-5 w-5" /> : <SpeakerIcon className="h-5 w-5" />}
              </button>
            )}

            {/* right vertical action bar — hanya fungsi real app */}
            <div className="absolute bottom-[132px] right-2 flex flex-col items-center gap-4 text-white">
              <button onClick={() => toggleLike(it.id)} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow">
                <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                  <IgHeartIcon filled={it.likedByMe} className={`h-6 w-6 ${it.likedByMe ? "text-red-500 fill-red-500" : "text-white"}`} />
                </span>
                <span className="text-xs font-semibold leading-none drop-shadow">{it.likeCount > 0 ? it.likeCount : 0}</span>
              </button>
              <button onClick={() => openComments(it.id)} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow">
                <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                  <IgCommentIcon className="h-6 w-6 text-white" />
                </span>
                <span className="text-xs font-semibold leading-none drop-shadow">{it.commentCount > 0 ? it.commentCount : 0}</span>
              </button>
              <button onClick={() => openComments(it.id)} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow" title="Bagikan — nanti">
                <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                  <IgShareIcon className="h-6 w-6 text-white" />
                </span>
              </button>
              <button className="flex flex-col items-center gap-1 active:scale-90 opacity-80 drop-shadow" title="Simpan — nanti">
                <IgBookmarkIcon className="h-6 w-6 text-white drop-shadow" />
              </button>
            </div>

            {/* bottom profile + caption overlay di atas video */}
            <div className="absolute inset-x-0 bottom-[56px] px-3 pb-2 pt-2 text-white">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white p-[2px] shadow">
                  <Avatar name={displayName} src={avatar} size={28} />
                </span>
                <span className="text-[13px] font-semibold drop-shadow">{displayName}</span>
                <span className="text-[11px] text-white/70 drop-shadow">• {it.kind === "reel" ? "Reels" : "Status"} • {timeAgo(it.createdAt)}</span>
              </div>
              {caption ? (
                <div className="mt-1.5 line-clamp-2 text-[13px] leading-snug drop-shadow">
                  <span className="font-semibold">{displayName} </span>
                  <span className="text-white/90">{caption}</span>
                  {it.likeCount > 0 ? <span className="ml-2 text-white/60 text-xs">{it.likeCount} suka</span> : null}
                </div>
              ) : null}
            </div>

            {/* comment input bar — nempel bawah */}
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] border-t border-white/10">
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendComment(it.id)}
                placeholder="Tambahkan komentar..."
                className="flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm text-white placeholder:text-white/50 outline-none border border-white/10"
              />
              <button onClick={() => sendComment(it.id)} className="shrink-0 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black active:scale-95">
                Kirim
              </button>
              <button onClick={() => setFullScreenId(null)} className="shrink-0 rounded-full bg-white/10 p-2.5 text-white border border-white/10">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}



