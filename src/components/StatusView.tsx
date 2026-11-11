"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { CharacterSummary } from "@/types/chat";
import type { UserProfile } from "@/lib/userProfile";
import { compressImageFile } from "@/lib/compressImage";
import { useAuth } from "./AuthGate";
import { Avatar } from "./Avatar";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
import {
  TrashIcon,
  XIcon,
  SendIcon,
  CameraIcon,
  FilmIcon,
  PlusIcon,
  ChatSquareIcon,
  PencilIcon,
  IgHeartIcon,
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
  characterBio: string | null;
  userBio: string | null;
  characterAvatar: string | null;
  userDisplayName: string | null;
  userNickname: string | null;
  userAvatar: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
  followingByMe: boolean;
  followerCount: number;
  accountFollowerCount: number;
  followingAccountByMe: boolean;
  accountFollowsMe: boolean;
  canFollow: boolean;
  viewedByMe: boolean;
};

function statusProfileKey(item: Pick<StatusItem, "userId" | "characterId">) {
  return item.characterId ? `character:${item.characterId}` : `user:${item.userId}`;
}

type CommentRow = {
  id: string;
  content: string;
  imageUrl: string | null;
  parentCommentId: string | null;
  createdAt: string;
  userId: string;
  displayName: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  likeCount: number;
  likedByMe: boolean;
};

type CommentReplyTarget = {
  statusId: string;
  commentId: string;
  displayName: string;
};

type CommentImageDraft = {
  statusId: string;
  url: string;
};

function groupCommentThreads(rows: CommentRow[]) {
  const repliesByComment = new Map<string, CommentRow[]>();
  for (const row of rows) {
    if (!row.parentCommentId) continue;
    const replies = repliesByComment.get(row.parentCommentId) || [];
    replies.push(row);
    repliesByComment.set(row.parentCommentId, replies);
  }
  return rows
    .filter((row) => !row.parentCommentId)
    .map((comment) => ({ comment, replies: repliesByComment.get(comment.id) || [] }));
}

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

function ExpandableCaption({
  author,
  text,
  className = "",
}: {
  author: string;
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const captionRef = useRef<HTMLSpanElement>(null);
  const caption = text.trim();

  useEffect(() => {
    if (expanded) return;
    const element = captionRef.current;
    if (!element) return;

    const measureOverflow = () => {
      setHasOverflow(element.scrollWidth > element.clientWidth + 1);
    };
    const frame = window.requestAnimationFrame(measureOverflow);
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [author, expanded, caption]);

  if (!caption) return null;

  return (
    <div className={className}>
      {expanded ? (
        <div className="whitespace-pre-wrap break-words">
          <span className="font-medium">{author} </span>
          <span className="font-normal">{caption}</span>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded="true"
            className="ml-1 whitespace-nowrap font-medium text-ink-soft hover:text-ink"
          >
            Lebih sedikit
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 items-baseline gap-1">
          <span className="max-w-[40%] shrink-0 truncate font-medium">{author}</span>
          <span ref={captionRef} className="min-w-0 flex-1 truncate font-normal">
            {caption}
          </span>
          {hasOverflow ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded="false"
              className="shrink-0 whitespace-nowrap font-medium text-ink-soft hover:text-ink"
            >
              Selengkapnya
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function StatusView({
  profile,
  characters,
  sharedStatusId,
  sharedStatusFromChat = false,
  onSharedStatusHandled,
  chatCharacterIds = [],
  onOpenCharacterChat,
  onReturnToChat,
}: {
  profile: UserProfile;
  characters: CharacterSummary[];
  sharedStatusId?: string | null;
  sharedStatusFromChat?: boolean;
  onSharedStatusHandled?: () => void;
  chatCharacterIds?: string[];
  onOpenCharacterChat?: (characterId: string) => void;
  onReturnToChat?: () => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<StatusItem[]>([]);
  const [returnToChat, setReturnToChat] = useState(false);
  const [profileItem, setProfileItem] = useState<StatusItem | null>(null);
  const [profilePosts, setProfilePosts] = useState<StatusItem[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const profileRequestRef = useRef(0);
  const [bookmarkBusyIds, setBookmarkBusyIds] = useState<Record<string, boolean>>({});
  const [followError, setFollowError] = useState<string | null>(null);
  const [followBusyKeys, setFollowBusyKeys] = useState<Record<string, boolean>>({});
  const [commentLikeBusyIds, setCommentLikeBusyIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [showOwnReelGallery, setShowOwnReelGallery] = useState(false);
  const [ownReels, setOwnReels] = useState<StatusItem[]>([]);
  const [ownReelsLoading, setOwnReelsLoading] = useState(false);
  const [ownReelsError, setOwnReelsError] = useState<string | null>(null);
  const [ownReelActionError, setOwnReelActionError] = useState<string | null>(null);
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
  const [commentImage, setCommentImage] = useState<CommentImageDraft | null>(null);
  const [commentUploadBusy, setCommentUploadBusy] = useState(false);
  const [commentErr, setCommentErr] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentReplyTarget | null>(null);
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
  const commentPhotoRef = useRef<HTMLInputElement>(null);
  const fsScrollRef = useRef<HTMLDivElement>(null);
  const handledSharedStatusRef = useRef<string | null>(null);
  const requestedSharedStatusRef = useRef<string | null>(null);
  const requestedChatStoryRef = useRef<string | null>(null);
  const viewedStoryIdsRef = useRef(new Set<string>());
  const bookmarkBusyIdsRef = useRef(new Set<string>());
  const followBusyKeysRef = useRef(new Set<string>());
  const commentLikeBusyIdsRef = useRef(new Set<string>());
  const viewerStoriesRef = useRef<StatusItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/statuses", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.statuses)) setItems(data.statuses);
    } catch {}
    setLoading(false);
  }, []);

  async function openTalentProfile(item: StatusItem) {
    const request = ++profileRequestRef.current;
    setProfileItem(item);
    setProfilePosts([]);
    setProfileLoading(true);
    setProfileError(null);
    setInviteMessage(null);
    try {
      const key = item.characterId ? "characterId" : "userId";
      const id = item.characterId || item.userId;
      const res = await fetch(`/api/statuses?${key}=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.statuses)) throw new Error(data?.error || "Profil belum dapat dimuat.");
      if (profileRequestRef.current !== request) return;
      setProfilePosts(data.statuses);
      if (data.statuses.length) setProfileItem(data.statuses[0]);
    } catch (error) {
      if (profileRequestRef.current === request) setProfileError(error instanceof Error ? error.message : "Profil belum dapat dimuat.");
    } finally {
      if (profileRequestRef.current === request) setProfileLoading(false);
    }
  }

  function closeTalentProfile() {
    profileRequestRef.current++;
    setProfileItem(null);
  }

  async function inviteFromProfile(item: StatusItem) {
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      const res = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statusId: item.id }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Undangan belum dapat dikirim.");
      setInviteMessage("Undangan terkirim. Menunggu persetujuan pemilik karakter.");
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : "Undangan belum dapat dikirim.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function openOwnReelGallery() {
    setShowComposer(false);
    setShowOwnReelGallery(true);
    setOwnReels([]);
    setOwnReelsLoading(true);
    setOwnReelsError(null);
    setOwnReelActionError(null);
    try {
      const res = await fetch("/api/statuses?mine=reels", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data?.reels)) {
        throw new Error(data?.error || "Galeri reels tidak dapat dimuat.");
      }
      setOwnReels(
        data.reels.filter((item: StatusItem) =>
          item.kind === "reel" && item.userId === user.id && item.characterId === null
        )
      );
    } catch (error) {
      setOwnReelsError(error instanceof Error ? error.message : "Galeri reels tidak dapat dimuat.");
    } finally {
      setOwnReelsLoading(false);
    }
  }

  function openOwnStoryComposer() {
    setShowOwnReelGallery(false);
    setComposeKind("status");
    setComposeCharId("");
    setShowComposer(true);
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!replyingTo) return;
    const focusTimer = window.setTimeout(() => fsCommentInputRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [replyingTo]);

  const markStoryViewed = useCallback((story: StatusItem) => {
    if (story.viewedByMe || viewedStoryIdsRef.current.has(story.id)) return;
    viewedStoryIdsRef.current.add(story.id);
    void fetch(`/api/statuses/${story.id}`, { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("Gagal menyimpan status dilihat.");
        setItems((prev) => prev.map((item) => item.id === story.id ? { ...item, viewedByMe: true } : item));
      })
      .catch(() => { viewedStoryIdsRef.current.delete(story.id); });
  }, []);

  useEffect(() => {
    if (!sharedStatusId || loading || handledSharedStatusRef.current === sharedStatusId) return;
    const openSharedItem = (sharedItem: StatusItem) => {
      if (sharedStatusFromChat) setReturnToChat(true);
      if (sharedStatusFromChat && sharedItem.kind === "status" && sharedItem.characterId) {
        if (requestedChatStoryRef.current === sharedStatusId) return;
        requestedChatStoryRef.current = sharedStatusId;
        const selectedId = sharedStatusId;
        fetch(`/api/statuses?characterId=${encodeURIComponent(sharedItem.characterId)}`, { cache: "no-store" })
          .then((res) => res.ok ? res.json() : null)
          .catch(() => null)
          .then((data) => {
            const posts: StatusItem[] = Array.isArray(data?.statuses) ? data.statuses : [];
            const combined = [...items, ...posts.filter((post) => !items.some((item) => item.id === post.id))];
            const profileStories = combined.filter((post) => post.kind === "status" && post.characterId === sharedItem.characterId);
            const index = profileStories.findIndex((post) => post.id === sharedItem.id);
            if (index < 0) return;
            setItems(combined);
            setViewerProfileKey(statusProfileKey(sharedItem));
            setViewerIdx(index);
            setStoryProgress(0);
            markStoryViewed(sharedItem);
            handledSharedStatusRef.current = selectedId;
            onSharedStatusHandled?.();
          });
        return;
      }
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
  }, [sharedStatusId, sharedStatusFromChat, loading, items, mutedMap, onSharedStatusHandled, markStoryViewed]);

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
  const ownStoryProfileKey = `user:${user.id}`;
  const ownStoryProfile = storyProfiles.find((profileStory) => profileStory.key === ownStoryProfileKey);
  const otherStoryProfiles = storyProfiles.filter((profileStory) => profileStory.key !== ownStoryProfileKey);
  const viewerStories = useMemo(
    () => storyProfiles.find((profileStory) => profileStory.key === viewerProfileKey)?.stories ?? [],
    [storyProfiles, viewerProfileKey]
  );
  viewerStoriesRef.current = viewerStories;
  const currentViewerStory = viewerIdx === null ? undefined : viewerStories[viewerIdx];
  const currentStoryId = currentViewerStory?.id;
  const currentStoryUsesVideoDuration = currentViewerStory?.mediaType === "video" && Boolean(currentViewerStory.videoUrl);
  const reels = useMemo(() => items.filter((x) => x.kind === "reel"), [items]);
  const canManageStatus = (item: Pick<StatusItem, "userId">) =>
    item.userId === user.id || Boolean(user.isAdmin);

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

  async function toggleBookmark(id: string) {
    if (bookmarkBusyIdsRef.current.has(id)) return;
    const current = items.find((item) => item.id === id);
    if (!current) return;

    const nextBookmarked = !current.bookmarkedByMe;
    bookmarkBusyIdsRef.current.add(id);
    setBookmarkBusyIds((prev) => ({ ...prev, [id]: true }));
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, bookmarkedByMe: nextBookmarked } : item)));

    try {
      const res = await fetch(`/api/statuses/${id}/bookmark`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.bookmarked !== "boolean") {
        throw new Error(data?.error || "Gagal menyimpan status.");
      }
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, bookmarkedByMe: data.bookmarked } : item)));
    } catch {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, bookmarkedByMe: current.bookmarkedByMe } : item)));
    } finally {
      bookmarkBusyIdsRef.current.delete(id);
      setBookmarkBusyIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

  async function toggleFollow(item: StatusItem, account = false) {
    if (!item.canFollow) return;
    const key = account ? `account:${item.userId}` : statusProfileKey(item);
    if (followBusyKeysRef.current.has(key)) return;

    setFollowError(null);
    followBusyKeysRef.current.add(key);
    setFollowBusyKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/statuses/${item.id}/follow${account ? "?target=account" : ""}`, { method: "POST" });
      if (!res.ok) throw new Error("Gagal memperbarui ikuti.");
      await load();
    } catch {
      setFollowError("Gagal memperbarui ikuti. Coba lagi.");
    } finally {
      followBusyKeysRef.current.delete(key);
      setFollowBusyKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
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
    setReplyingTo(null);
    setCommentImage(null);
    setCommentErr(null);
    setReelCommentsFor((cur) => (cur === id ? null : id));
    if (comments[id]) return;
    try {
      const res = await fetch(`/api/statuses/${id}/comments`, { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (res.ok && Array.isArray(d?.comments)) setComments((p) => ({ ...p, [id]: d.comments }));
    } catch {}
  }

  function openFullscreenComments(id: string) {
    setActiveFsId(id);
    setReplyingTo(null);
    setCommentImage((current) => (current?.statusId === id ? current : null));
    setCommentErr(null);
    setShowFullscreenComments(true);
  }

  function beginCommentReply(statusId: string, comment: CommentRow) {
    setReplyingTo({
      statusId,
      commentId: comment.id,
      displayName: comment.displayName || comment.nickname || "pengguna",
    });
  }

  async function handlePickCommentImage(file: File, statusId: string) {
    setCommentErr(null);
    if (!file.type.startsWith("image/") || file.type === "image/gif") {
      setCommentErr("Pilih foto yang valid. GIF belum didukung.");
      return;
    }

    setCommentUploadBusy(true);
    try {
      const compressed = await compressImageFile(file, { maxSize: 1280, quality: 0.82 });
      const formData = new FormData();
      formData.append("file", compressed, compressed.name || "comment.jpg");
      formData.append("protected", "true");
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") {
        throw new Error(data?.error || "Gagal mengunggah foto.");
      }
      setCommentImage({ statusId, url: data.url });
    } catch (error) {
      setCommentErr(error instanceof Error ? error.message : "Gagal mengunggah foto.");
    } finally {
      setCommentUploadBusy(false);
    }
  }

  async function toggleCommentLike(statusId: string, commentId: string) {
    if (commentLikeBusyIdsRef.current.has(commentId)) return;
    const current = comments[statusId]?.find((comment) => comment.id === commentId);
    if (!current) return;

    const nextLiked = !current.likedByMe;
    const nextCount = Math.max(0, current.likeCount + (nextLiked ? 1 : -1));
    commentLikeBusyIdsRef.current.add(commentId);
    setCommentLikeBusyIds((prev) => ({ ...prev, [commentId]: true }));
    setComments((prev) => ({
      ...prev,
      [statusId]: (prev[statusId] || []).map((comment) =>
        comment.id === commentId ? { ...comment, likedByMe: nextLiked, likeCount: nextCount } : comment
      ),
    }));

    try {
      const res = await fetch(`/api/statuses/${statusId}/comments/${commentId}/like`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.liked !== "boolean" || typeof data?.likeCount !== "number") {
        throw new Error(data?.error || "Gagal menyukai komentar.");
      }
      setComments((prev) => ({
        ...prev,
        [statusId]: (prev[statusId] || []).map((comment) =>
          comment.id === commentId ? { ...comment, likedByMe: data.liked, likeCount: data.likeCount } : comment
        ),
      }));
    } catch {
      setComments((prev) => ({
        ...prev,
        [statusId]: (prev[statusId] || []).map((comment) =>
          comment.id === commentId ? { ...comment, likedByMe: current.likedByMe, likeCount: current.likeCount } : comment
        ),
      }));
    } finally {
      commentLikeBusyIdsRef.current.delete(commentId);
      setCommentLikeBusyIds((prev) => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
    }
  }

  async function sendComment(id: string) {
    const t = commentDraft.trim();
    const imageUrl = commentImage?.statusId === id ? commentImage.url : null;
    if ((!t && !imageUrl) || commentUploadBusy) return;
    const replyTarget = replyingTo?.statusId === id ? replyingTo : null;
    setCommentErr(null);
    try {
      const res = await fetch(`/api/statuses/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: t, imageUrl, parentCommentId: replyTarget?.commentId ?? null }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.comment) {
        setCommentErr(d?.error || "Gagal mengirim komentar.");
        return;
      }
      setCommentDraft("");
      setCommentImage((current) => (current?.statusId === id ? null : current));
      setReplyingTo(null);
      const res2 = await fetch(`/api/statuses/${id}/comments`, { cache: "no-store" });
      const d2 = await res2.json().catch(() => null);
      if (res2.ok && Array.isArray(d2?.comments)) setComments((p) => ({ ...p, [id]: d2.comments }));
      setItems((prev) => prev.map((x) => (x.id === id ? { ...x, commentCount: x.commentCount + 1 } : x)));
    } catch {
      setCommentErr("Gagal mengirim komentar. Coba lagi.");
    }
  }

  async function handleDelete(id: string, showGalleryError = false) {
    const itemToDelete = ownReels.find((item) => item.id === id) || items.find((item) => item.id === id);
    const confirmLabel = itemToDelete?.kind === "reel" ? "Hapus reel ini?" : "Hapus status ini?";
    if (!confirm(confirmLabel)) return;
    if (showGalleryError) setOwnReelActionError(null);
    try {
      const res = await fetch(`/api/statuses/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (showGalleryError) setOwnReelActionError(data?.error || "Gagal menghapus postingan.");
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
      setOwnReels((prev) => prev.filter((item) => item.id !== id));
    } catch {
      if (showGalleryError) setOwnReelActionError("Gagal menghapus postingan. Coba lagi.");
    }
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
      setOwnReels((prev) => prev.map((item) => (
        item.id === editingItem.id ? { ...item, content, caption } : item
      )));
      setEditingItem(null);
    } catch (error) {
      setEditErr(error instanceof Error ? error.message : "Gagal menyimpan perubahan.");
    } finally {
      setEditBusy(false);
    }
  }


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
      if (returnToChat && !profileItem) onReturnToChat?.();
      return;
    }
    setViewerIdx(index);
    setStoryProgress(0);
    markStoryViewed(story);
  }, [markStoryViewed, returnToChat, profileItem, onReturnToChat]);

  const finishCurrentStory = useCallback(() => {
    if (viewerIdx === null) return;
    if (viewerIdx < viewerStories.length - 1) moveStoryTo(viewerIdx + 1);
    else {
      setViewerIdx(null);
      setViewerProfileKey(null);
      setStoryProgress(0);
      if (returnToChat && !profileItem) onReturnToChat?.();
    }
  }, [viewerIdx, viewerStories.length, moveStoryTo, returnToChat, profileItem, onReturnToChat]);

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

  useEffect(() => {
    if (!fullScreenId) return;
    const opened = items.find((item) => item.id === fullScreenId);
    if (opened) markStoryViewed(opened);
  }, [fullScreenId, items, markStoryViewed]);

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
      markStoryViewed(it);
      setActiveFsId(it.id);
      setReplyingTo(null);
      setCommentImage(null);
      setCommentErr(null);
      const m = mutedMap[it.id];
      if (m !== undefined) setFullMuted(m);
      else setFullMuted(true);
    }
  }, [fsItems, activeFsId, mutedMap, markStoryViewed]);

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
        {followError && <div role="alert" className="px-4 py-2 text-sm text-red-600">{followError}</div>}
        <MenuHeader
          title="StoryTalent"
          description="Cerita dan reels terbaru"
          className="sticky top-0 z-30"
          style={{
            borderBottom: "none",
            backgroundColor: "color-mix(in srgb, var(--surface) 58%, transparent)",
            backdropFilter: "saturate(180%) blur(22px)",
            WebkitBackdropFilter: "saturate(180%) blur(22px)",
          }}
          actions={
            <>
              <span
                role="img"
                aria-label="Notifikasi"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-text ring-1 ring-accent/50 dark:ring-accent/60"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
                  <path d="m12 2.8 2.84 5.75 6.35.92-4.59 4.48 1.08 6.32L12 17.29l-5.68 2.98 1.08-6.32-4.59-4.48 6.35-.92L12 2.8Z" />
                </svg>
              </span>
              <MenuHeaderIconButton
                onClick={() => setShowComposer((value) => !value)}
                aria-label="Buat status"
                title="Buat status"
              >
                <PlusIcon className="h-5 w-5" />
              </MenuHeaderIconButton>
            </>
          }
        />

      {showComposer && (
        <div className="border-b border-line bg-surface p-3">
          <div className="mx-auto w-full max-w-[560px] space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setComposeKind("status")}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${composeKind === "status" ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-soft"}`}
              >
                Story 24j
              </button>
              <button
                onClick={() => setComposeKind("reel")}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${composeKind === "reel" ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-soft"}`}
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
                className="w-full rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-copy outline-none focus:border-ink/30"
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
                {composeVideoKey && <div className="rounded-xl bg-brand px-3 py-2 text-xs text-brand-ink">Video siap ✓ {composeVideoKey.slice(0, 28)}…</div>}
              </div>
            )}

            <input
              value={composeCaption}
              onChange={(e) => setComposeCaption(e.target.value.slice(0, 500))}
              placeholder={composeMedia === "text" ? "Caption (opsional)" : "Tulis caption..."}
              className="w-full rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm text-copy outline-none focus:border-ink/30"
            />

            {composeErr && <div className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600">{composeErr}</div>}

            <div className="flex gap-2">
              <button onClick={() => setShowComposer(false)} className="flex-1 rounded-full border border-line bg-surface px-3 py-2.5 text-sm font-semibold">
                Batal
              </button>
              <button
                disabled={composeBusy}
                onClick={handleCreate}
                className="flex-1 rounded-full bg-brand px-3 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
              >
                {composeBusy ? "Menyimpan..." : `Posting ${composeKind === "reel" ? "Reel" : "Story"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOwnReelGallery && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 px-0 pt-[max(0.5rem,var(--safe-top))] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowOwnReelGallery(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="own-reel-gallery-title"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[min(88dvh,100%)] min-h-0 w-full max-w-[560px] flex-col overflow-hidden rounded-t-[24px] border border-line bg-surface shadow-2xl sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3.5">
              <div className="min-w-0">
                <h2 id="own-reel-gallery-title" className="truncate text-base font-bold text-accent-text">
                  Galeri Reels Anda
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {ownReelsLoading ? "Memuat..." : `${ownReels.length} reels pribadi`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOwnReelGallery(false)}
                aria-label="Tutup galeri reels"
                className="shrink-0 rounded-full p-2 text-ink-soft hover:bg-surface-2"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {ownStoryProfile?.stories.length ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowOwnReelGallery(false);
                    openStoryProfile(ownStoryProfile.key);
                  }}
                  className="mb-3 flex w-full items-center justify-between rounded-2xl border border-line bg-surface-2 px-3.5 py-3 text-left text-sm font-semibold text-ink"
                >
                  <span>Lihat story aktif</span>
                  <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink-soft">
                    {ownStoryProfile.stories.length}
                  </span>
                </button>
              ) : null}

              {ownReelsError ? (
                <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">
                  <span>{ownReelsError}</span>
                  <button type="button" onClick={() => void openOwnReelGallery()} className="shrink-0 font-semibold underline">
                    Coba lagi
                  </button>
                </div>
              ) : null}
              {ownReelActionError ? (
                <div role="alert" className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600">
                  {ownReelActionError}
                </div>
              ) : null}

              {ownReelsLoading ? (
                <div className="px-4 py-12 text-center text-sm text-muted">Memuat galeri reels...</div>
              ) : ownReelsError ? null : ownReels.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-12 text-center">
                  <FilmIcon className="h-8 w-8 text-muted" />
                  <p className="mt-3 text-sm font-semibold text-accent-text">Belum ada reels pribadi</p>
                  <p className="mt-1 text-xs text-muted">Reels yang kamu posting atas nama akunmu akan muncul di sini.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOwnReelGallery(false);
                      setComposeKind("reel");
                      setComposeCharId("");
                      setShowComposer(true);
                    }}
                    className="mt-4 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink"
                  >
                    Buat Reel
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {ownReels.map((reel) => {
                    const reelCaption = reel.caption || reel.content || "Reel";
                    return (
                      <article key={reel.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface-2">
                        <div className="relative aspect-[3/4] overflow-hidden bg-black">
                          {reel.mediaType === "image" && reel.imageUrl ? (
                            <Image src={reel.imageUrl} alt="" fill sizes="(max-width: 560px) 33vw, 180px" unoptimized className="object-cover" />
                          ) : reel.mediaType === "video" && reel.videoUrl ? (
                            <FeedVideo src={reel.videoUrl} aspect="absolute inset-0 h-full w-full" muted />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0d1a35] via-[#1c3e75] to-[#2c5ba0] dark:from-[#1b150b] dark:via-[#4b3717] dark:to-[#705426] p-2">
                              <p className="line-clamp-5 whitespace-pre-wrap text-center text-xs font-semibold text-white drop-shadow">
                                {reel.content || reel.caption || "Reel"}
                              </p>
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/75 to-transparent px-2 pb-2 pt-8">
                            <p className="truncate text-left text-[10px] font-medium text-white">{reelCaption}</p>
                          </div>
                          {reel.mediaType === "video" ? (
                            <span className="pointer-events-none absolute right-1.5 top-1.5 z-[3] rounded-full bg-black/50 p-1 text-white">
                              <FilmIcon className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center justify-between gap-1 px-1.5 py-1.5">
                          <span className="min-w-0 truncate text-[10px] text-muted">{timeAgo(reel.createdAt)}</span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setShowOwnReelGallery(false);
                                beginEditStatus(reel);
                              }}
                              aria-label={`Edit reel: ${reelCaption}`}
                              title="Edit reel"
                              className="grid h-7 w-7 place-items-center rounded-full text-ink-soft hover:bg-surface hover:text-ink"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(reel.id, true)}
                              aria-label={`Hapus reel: ${reelCaption}`}
                              title="Hapus reel"
                              className="grid h-7 w-7 place-items-center rounded-full text-red-600 hover:bg-surface"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

        <div className="mx-auto w-full max-w-[560px]">
          {/* Story strip ala IG — empat profil terlihat dalam satu layar */}
          <div className="border-b border-line bg-surface px-2 py-3">
            <div className="flex snap-x snap-mandatory gap-0 overflow-x-auto px-1 pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
              <div className="flex w-1/4 shrink-0 snap-start flex-col items-center gap-1">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => void openOwnReelGallery()}
                    aria-label="Buka galeri reels Anda"
                    className="block rounded-full"
                  >
                    <span className={`block rounded-full p-[2px] ${ownStoryProfile?.hasUnseen ? "bg-brand" : "bg-line"}`}>
                      <span className="block rounded-full bg-surface p-[2px]">
                        <Avatar name={profile.displayName || profile.nickname || "Kamu"} src={profile.avatarUrl || undefined} size={56} />
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={openOwnStoryComposer}
                    aria-label="Buat cerita baru"
                    className="absolute -bottom-0.5 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-surface bg-brand text-brand-ink shadow-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
                <span className="w-full truncate text-center text-[12px] font-medium leading-tight">Cerita Anda</span>
              </div>
              {loading ? (
                <div className="px-3 py-6 text-sm text-muted">Memuat...</div>
              ) : (
                otherStoryProfiles.map((profileStory) => {
                  const s = profileStory.story;
                  const name = s.characterName || s.userDisplayName || s.userNickname || "Kamu";
                  const avatar = s.characterAvatar || s.userAvatar || undefined;
                  return (
                    <button key={profileStory.key} onClick={() => openStoryProfile(profileStory.key)} className="flex w-1/4 shrink-0 snap-start flex-col items-center gap-1">
                      <span className={`rounded-full p-[2px] ${profileStory.hasUnseen ? "bg-brand" : "bg-line"}`}>
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
                      <div className={`w-full cursor-pointer bg-gradient-to-br from-[#0d1a35] via-[#1c3e75] to-[#2c5ba0] dark:from-[#1b150b] dark:via-[#4b3717] dark:to-[#705426] px-6 py-10 ${it.kind === "reel" ? "aspect-[9/16] flex items-center justify-center" : ""}`}>
                        <p className="whitespace-pre-wrap text-center text-[18px] font-semibold leading-relaxed text-white drop-shadow">{it.content || it.caption || "—"}</p>
                      </div>
                    )}

                    {/* Banner transparan IG: avatar + nama di atas konten, burger kanan */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent px-3 pb-8 pt-2.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); void openTalentProfile(it); }} aria-label={`Buka profil ${displayName}`} className="pointer-events-auto flex min-w-0 items-center gap-2.5 text-left">
                        <span className="rounded-full bg-white p-[2px] shadow-sm">
                          <Avatar name={displayName} src={avatar} size={32} />
                        </span>
                        <div className="min-w-0 leading-none">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-white drop-shadow">{displayName}</span>
                            <span className="shrink-0 text-[11px] font-normal text-white/80">• {timeAgo(it.createdAt)}</span>
                          </div>
                          <div className="truncate text-[11px] text-white/80 drop-shadow">{it.followerCount} pengikut · {it.kind === "reel" ? "Reels" : "Status"} {it.expiresAt ? `• ${remainingHours(it.expiresAt)}` : ""}</div>
                        </div>
                      </button>
                      {canManageStatus(it) ? (
                        <button
                          onClick={() => setMenuFor(menuFor === it.id ? null : it.id)}
                          className="pointer-events-auto -mr-1 rounded-full p-2 text-white active:scale-90"
                          aria-label="Opsi postingan"
                        >
                          <IgMoreIcon className="h-5 w-5 text-white drop-shadow" />
                        </button>
                      ) : null}
                    </div>

                    {/* Popover opsi burger */}
                    {menuFor === it.id && canManageStatus(it) && (
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
                    {menuFor === it.id && canManageStatus(it) && (
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
                        <ChatSquareIcon className="h-[24px] w-[24px] text-ink" />
                      </button>
                      <button onClick={() => handleShare(it)} aria-label="Bagikan" className="p-1 active:scale-90">
                        <IgShareIcon className="h-[24px] w-[24px] text-ink" />
                      </button>
                    </div>
                    <button
                      onClick={() => toggleBookmark(it.id)}
                      aria-label={it.bookmarkedByMe ? "Hapus dari tersimpan" : "Simpan"}
                      aria-pressed={it.bookmarkedByMe}
                      disabled={!!bookmarkBusyIds[it.id]}
                      className="p-1 active:scale-90 disabled:opacity-60"
                    >
                      <IgBookmarkIcon filled={it.bookmarkedByMe} className="h-[24px] w-[24px] text-ink" />
                    </button>
                  </div>

                  {it.likeCount > 0 && (
                    <div className="px-3 pb-1 text-[14px] font-semibold leading-none">
                      {it.likeCount.toLocaleString("id-ID")} suka
                    </div>
                  )}

                  {(it.caption || it.content) && it.mediaType !== "text" ? (
                    <ExpandableCaption
                      author={displayName}
                      text={it.caption || it.content}
                      className="px-3 pb-1 text-sm leading-[18px] text-copy"
                    />
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
                          groupCommentThreads(comments[it.id] || []).map(({ comment: c, replies }) => (
                            <div key={c.id} className="space-y-1.5">
                              <div className="flex gap-2">
                                <Avatar name={c.displayName || c.nickname || "User"} src={c.avatarUrl || undefined} size={24} />
                                <div className="min-w-0 rounded-2xl bg-surface-2 px-3 py-1.5 shadow-sm">
                                  <div className="text-xs font-semibold text-ink">{c.displayName || c.nickname || "User"}</div>
                                  {c.content ? <div className="text-sm leading-snug text-ink">{c.content}</div> : null}
                                  {c.imageUrl ? <img src={c.imageUrl} alt="Foto komentar" className="mt-1 max-h-48 max-w-full rounded-xl object-contain" /> : null}
                                </div>
                              </div>
                              {replies.map((reply) => (
                                <div key={reply.id} className="ml-7 flex gap-2">
                                  <Avatar name={reply.displayName || reply.nickname || "User"} src={reply.avatarUrl || undefined} size={22} />
                                  <div className="min-w-0 rounded-2xl bg-surface-2 px-3 py-1.5 shadow-sm">
                                    <div className="text-xs font-semibold text-ink-soft">{reply.displayName || reply.nickname || "User"}</div>
                                    {reply.content ? <div className="text-sm leading-snug text-ink-soft">{reply.content}</div> : null}
                                    {reply.imageUrl ? <img src={reply.imageUrl} alt="Foto balasan" className="mt-1 max-h-48 max-w-full rounded-xl object-contain" /> : null}
                                  </div>
                                </div>
                              ))}
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
                            className="flex-1 rounded-full border border-line bg-surface-2 px-4 py-2 text-sm text-ink outline-none"
                          />
                        <button onClick={() => sendComment(it.id)} className="rounded-full bg-brand p-2.5 text-brand-ink">
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

      {profileItem && (() => {
        const name = profileItem.characterName || profileItem.userDisplayName || profileItem.userNickname || "Member";
        const avatar = profileItem.characterAvatar || profileItem.userAvatar;
        const storiesInProfile = profilePosts.filter((post) => post.kind === "status");
        const reelsInProfile = profilePosts.filter((post) => post.kind === "reel");
        const openPost = (post: StatusItem) => {
          const combined = [...items, ...profilePosts.filter((p) => !items.some((i) => i.id === p.id))];
          setItems(combined);
          closeTalentProfile();
          setFullScreenId(null);
          if (post.kind === "status") {
            const profileStories = combined.filter((p) => p.kind === "status" && statusProfileKey(p) === statusProfileKey(post));
            setViewerProfileKey(statusProfileKey(post));
            setViewerIdx(profileStories.findIndex((p) => p.id === post.id));
            setStoryProgress(0);
            markStoryViewed(post);
          } else {
            setViewerIdx(null);
            setFullScreenId(post.id);
          }
        };
        return <div className="fixed inset-0 z-[90] overflow-y-auto bg-app text-ink" role="dialog" aria-modal="true" aria-label={`Profil ${name}`}>
          <div className="mx-auto min-h-full max-w-[560px] pb-8">
            <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-line bg-surface px-4 pb-3 pt-[max(0.75rem,var(--safe-top))]">
              <button type="button" onClick={closeTalentProfile} className="rounded-full px-2 py-1 text-2xl" aria-label="Kembali">‹</button>
              <h2 className="truncate text-lg font-bold text-accent-text">{name}</h2>
            </header>
            <div className="px-4 py-5">
              <div className="flex items-center gap-5">
                <span className="rounded-full bg-gradient-to-tr from-[#4687fe] via-white to-[#4687fe] dark:from-[#d5b767] dark:via-white dark:to-[#d5b767] p-[3px]"><span className="block rounded-full bg-surface p-[3px]"><Avatar name={name} src={avatar} size={78} /></span></span>
                <div><div className="font-bold text-accent-text">{name}</div><div className="mt-2 text-sm"><strong>{profileItem.followerCount}</strong> pengikut</div></div>
              </div>
              {(profileItem.characterId ? profileItem.characterBio : profileItem.userBio) && <p className="mt-4 whitespace-pre-wrap text-sm">{profileItem.characterId ? profileItem.characterBio : profileItem.userBio}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {profileItem.canFollow && <button type="button" disabled={!!followBusyKeys[statusProfileKey(profileItem)]} onClick={async () => { const request = profileRequestRef.current; await toggleFollow(profileItem); if (profileRequestRef.current === request) await openTalentProfile(profileItem); }} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50">{profileItem.followingByMe ? "Mengikuti" : !profileItem.characterId && profileItem.accountFollowsMe ? "Ikuti balik" : "Ikuti"}</button>}
                {profileItem.canFollow && profileItem.characterId && <button type="button" disabled={!!followBusyKeys[`account:${profileItem.userId}`]} onClick={async () => { const request = profileRequestRef.current; await toggleFollow(profileItem, true); if (profileRequestRef.current === request) await openTalentProfile(profileItem); }} className="rounded-xl border border-brand bg-surface px-4 py-2 text-sm font-semibold disabled:opacity-50">{profileItem.followingAccountByMe ? "Mengikuti akun" : profileItem.accountFollowsMe ? "Ikuti balik akun" : "Ikuti akun"} · {profileItem.accountFollowerCount} pengikut</button>}
                {profileItem.characterId && chatCharacterIds.includes(profileItem.characterId) && onOpenCharacterChat && <button type="button" onClick={() => onOpenCharacterChat(profileItem.characterId!)} className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-semibold">Buka Chat</button>}
                {profileItem.canFollow && profileItem.characterId && !chatCharacterIds.includes(profileItem.characterId) && <button type="button" disabled={inviteBusy} onClick={() => void inviteFromProfile(profileItem)} className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-semibold disabled:opacity-50">{inviteBusy ? "Mengirim…" : "Undang ke kontak"}</button>}
              </div>
              {inviteMessage && <p role="status" className="mt-2 text-sm text-ink-soft">{inviteMessage}</p>}
              {followError && <p role="alert" className="mt-2 text-sm text-red-600">{followError}</p>}
            </div>
            {profileLoading ? <p className="p-4 text-sm text-muted">Memuat profil…</p> : profileError ? <p role="alert" className="p-4 text-sm text-red-600">{profileError}</p> : <>
              <div className="border-t border-line px-4 py-3 text-sm font-semibold">Story aktif · {storiesInProfile.length}</div>
              <div className="flex gap-2 overflow-x-auto px-4 pb-4">{storiesInProfile.length ? storiesInProfile.map((post) => <button key={post.id} onClick={() => openPost(post)} className="shrink-0 rounded-full border-2 border-brand p-1" aria-label={`Lihat story ${name}`}><Avatar name={name} src={avatar} size={48} /></button>) : <span className="text-sm text-muted">Belum ada Story aktif.</span>}</div>
              <div className="border-t border-line px-4 py-3 text-sm font-semibold">Reels · {reelsInProfile.length}{profilePosts.length === 120 ? "+" : ""}</div>
              {reelsInProfile.length ? <div className="grid grid-cols-3 gap-0.5">{reelsInProfile.map((post) => <button key={post.id} onClick={() => openPost(post)} aria-label={`Buka Reel ${name}`} className="relative aspect-[3/4] overflow-hidden bg-surface-2 text-sm">{post.imageUrl ? <img src={post.imageUrl} alt="" className="h-full w-full object-cover" /> : post.videoUrl ? <video src={post.videoUrl} muted preload="metadata" className="h-full w-full object-cover" /> : <span className="line-clamp-4 p-2">{post.content || post.caption || "Reel"}</span>}</button>)}</div> : <p className="px-4 text-sm text-muted">Belum ada Reel.</p>}
              {profilePosts.length === 120 && <p className="p-4 text-xs text-muted">Menampilkan hingga 120 postingan terbaru.</p>}
            </>}
          </div>
        </div>;
      })()}

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
              <h2 id="status-edit-title" className="text-base font-bold text-accent-text">Edit postingan</h2>
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
                  className="w-full resize-y rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-copy outline-none focus:border-ink/30"
                />
              )}
              <textarea
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value.slice(0, 500))}
                placeholder={editingItem.mediaType === "text" ? "Caption (opsional)" : "Edit caption..."}
                rows={3}
                className="w-full resize-y rounded-2xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-copy outline-none focus:border-ink/30"
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
                  className="flex-1 rounded-full bg-brand px-3 py-2.5 text-sm font-semibold text-brand-ink disabled:opacity-50"
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
          if (returnToChat) onReturnToChat?.();
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
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0d1a35] via-[#1c3e75] to-[#2c5ba0] dark:from-[#1b150b] dark:via-[#4b3717] dark:to-[#705426] px-8 py-28 text-center">
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
                <button type="button" onClick={() => void openTalentProfile(currentStory)} aria-label={`Buka profil ${displayName}`} className="flex min-w-0 items-center gap-2 text-left">
                  <Avatar name={displayName} src={avatar} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{displayName}</div>
                    <div className="text-xs text-white/75">{timeAgo(currentStory.createdAt)} · {currentStory.followerCount} pengikut</div>
                  </div>
                </button>
                <button onClick={closeViewer} className="rounded-full bg-black/30 p-2 backdrop-blur-md" aria-label="Tutup status">
                  <XIcon className="h-5 w-5" />
                </button>
              </div>
              {currentStory.canFollow && <div className="mt-2 flex flex-wrap gap-2 px-1 text-xs">
                <button type="button" disabled={!!followBusyKeys[statusProfileKey(currentStory)]} onClick={() => void toggleFollow(currentStory)} className="rounded-full bg-black/50 px-3 py-1.5 disabled:opacity-50">{currentStory.followingByMe ? "Mengikuti" : currentStory.characterId ? "Ikuti karakter" : currentStory.accountFollowsMe ? "Ikuti balik" : "Ikuti"}</button>
                {currentStory.characterId && <button type="button" disabled={!!followBusyKeys[`account:${currentStory.userId}`]} onClick={() => void toggleFollow(currentStory, true)} className="rounded-full bg-black/50 px-3 py-1.5 disabled:opacity-50">{currentStory.followingAccountByMe ? "Mengikuti akun" : currentStory.accountFollowsMe ? "Ikuti balik akun" : "Ikuti akun"} · {currentStory.accountFollowerCount} pengikut</button>}
                {followError && <span role="alert">{followError}</span>}
              </div>}
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

            {currentStory.caption && currentStory.caption !== currentStory.content ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 truncate px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-20 text-center text-sm text-white/90 drop-shadow">
                {currentStory.caption}
              </div>
            ) : null}
          </div>
        );
      })()}

      {/* Fullscreen IG — scroll vertikal pindah status kayak IG, tanpa nama tengah */}
      {fullScreenId && (() => {
        if (!fsItems.length) return null;
        const activeIt = fsItems.find((x) => x.id === (activeFsId || fullScreenId)) || fsItems.find((x) => x.id === fullScreenId) || fsItems[0];
        const activeAuthor = activeIt.characterName || activeIt.userDisplayName || activeIt.userNickname || "Anonim";
        const activeAvatar = activeIt.characterAvatar || activeIt.userAvatar || undefined;
        const activeCaption = (activeIt.caption || activeIt.content || "").trim();
        return (
          <div className="fixed inset-0 z-[60] bg-black overflow-hidden">
            {/* header global — cuma back + opsi */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[max(0.7rem,var(--safe-top))] pb-3 text-white z-30 pointer-events-none">
              <button onClick={() => { setFullScreenId(null); if (returnToChat) onReturnToChat?.(); }} className="pointer-events-auto rounded-full bg-black/25 p-2 backdrop-blur-md border border-white/15 active:scale-90" aria-label="Kembali">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5"><path d="M15 18L9 12l6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              {canManageStatus(activeIt) ? (
                <button onClick={() => { const id = activeFsId || fullScreenId; setMenuFor((prev) => prev === id ? null : id); }} className="pointer-events-auto rounded-full bg-black/25 p-2 backdrop-blur-md border border-white/10 active:scale-90" aria-label="Opsi postingan">
                  <IgMoreIcon className="h-5 w-5 text-white" />
                </button>
              ) : null}
            </div>
            {menuFor === activeIt.id && canManageStatus(activeIt) && (
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
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0d1a35] via-[#1c3e75] to-[#2c5ba0] dark:from-[#1b150b] dark:via-[#4b3717] dark:to-[#705426] p-8 text-center">
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
                      <button onClick={() => openFullscreenComments(item.id)} className="flex flex-col items-center gap-1 active:scale-90 drop-shadow">
                        <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                          <ChatSquareIcon className="h-6 w-6 text-white" />
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
                      <button
                        onClick={() => toggleBookmark(item.id)}
                        aria-label={item.bookmarkedByMe ? "Hapus dari tersimpan" : "Simpan"}
                        aria-pressed={item.bookmarkedByMe}
                        disabled={!!bookmarkBusyIds[item.id]}
                        title={item.bookmarkedByMe ? "Hapus dari tersimpan" : "Simpan"}
                        className="flex flex-col items-center gap-1 active:scale-90 opacity-90 drop-shadow disabled:opacity-60"
                      >
                        <span className="rounded-full bg-white/10 p-2.5 backdrop-blur border border-white/10">
                          <IgBookmarkIcon filled={item.bookmarkedByMe} className="h-[22px] w-[22px] text-white drop-shadow" />
                        </span>
                      </button>
                    </div>
                    {/* bottom profile per item */}
                    <div className="absolute inset-x-0 bottom-[96px] px-3 pb-2 pt-2 text-white pr-14">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-white p-[2px] shadow">
                          <Avatar name={dName} src={av} size={28} />
                        </span>
                        <button type="button" onClick={() => void openTalentProfile(item)} className="text-left text-[13px] font-semibold drop-shadow" aria-label={`Buka profil ${dName}`}>{dName} · {item.followerCount} pengikut</button>
                        <span className="text-[11px] text-white/70 drop-shadow">• {item.kind === "reel" ? "Reels" : "Status"} • {timeAgo(item.createdAt)}</span>
                        {item.canFollow ? (
                          <button
                            type="button"
                            onClick={() => toggleFollow(item)}
                            aria-label={item.followingByMe ? `Berhenti mengikuti ${dName}` : `Ikuti ${dName}`}
                            aria-pressed={item.followingByMe}
                            disabled={!!followBusyKeys[statusProfileKey(item)]}
                            className={`ml-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                              item.followingByMe
                                ? "border-white/50 bg-white/85 text-black"
                                : "border-white/30 bg-white/15 text-white"
                            }`}
                          >
                            {item.followingByMe ? "Mengikuti" : !item.characterId && item.accountFollowsMe ? "Ikuti balik" : item.characterId ? "Ikuti karakter" : "Ikuti"}
                          </button>
                        ) : null}
                      </div>
                      {item.characterId && item.canFollow && <button type="button" disabled={!!followBusyKeys[`account:${item.userId}`]} onClick={() => void toggleFollow(item, true)} className="mt-1 rounded-full bg-black/40 px-2 py-1 text-xs disabled:opacity-50">{item.followingAccountByMe ? "Mengikuti akun" : item.accountFollowsMe ? "Ikuti balik akun" : "Ikuti akun"} · {item.accountFollowerCount} pengikut</button>}
                      {followError && <div role="alert" className="text-xs">{followError}</div>}
                      {(cap?.trim() || (item.content || "").trim()) ? (
                        <button
                          type="button"
                          onClick={() => openFullscreenComments(item.id)}
                          aria-label={`Buka komentar untuk postingan ${dName}`}
                          className="mt-1.5 block w-full truncate pr-2 text-left text-sm leading-snug drop-shadow"
                        >
                          <span className="font-medium">{dName} </span>
                          <span className="font-normal text-white/90">{(cap || item.content || "").trim()}</span>
                        </button>
                      ) : (
                        <div className="mt-1 text-sm text-white/60 drop-shadow">—</div>
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
              <button onClick={() => openFullscreenComments(activeIt.id)} className="flex flex-1 items-center rounded-full bg-ink/10 border border-line px-4 py-2.5 text-left text-sm text-ink-soft/70">
                Tambahkan komentar...
              </button>
            </div>

            {/* sheet komen untuk item aktif */}
            {showFullscreenComments && activeIt && (
              <>
                <button aria-label="Tutup komentar" onClick={() => { setReplyingTo(null); setShowFullscreenComments(false); }} className="absolute inset-0 bg-black/45 backdrop-blur-[1px] z-30" />
                <div className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-[20px] bg-surface shadow-2xl z-40 transition-transform duration-200" style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}>
                  <div className="flex shrink-0 justify-center pt-2.5 pb-1">
                    <span className="h-1 w-10 rounded-full bg-ink-soft/30" />
                  </div>
                  <div className="flex-1 overflow-y-auto px-3">
                    {activeCaption ? (
                      <div className="mb-2 flex gap-2.5 border-b border-line pb-3 pt-2">
                        <Avatar name={activeAuthor} src={activeAvatar} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-sm font-medium text-ink">{activeAuthor}</span>
                            <span className="text-[11px] text-ink-soft/60">• {timeAgo(activeIt.createdAt)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm font-normal leading-relaxed text-ink-soft">
                            {activeCaption}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <div className="max-h-[42dvh] space-y-3.5 overflow-y-auto py-2">
                      {(comments[activeIt.id] || []).length === 0 ? (
                        <div className="py-8 text-center text-sm text-ink-soft/60">Belum ada komentar — jadi yang pertama ✨</div>
                      ) : (
                        groupCommentThreads(comments[activeIt.id] || []).map(({ comment: c, replies }) => (
                          <div key={c.id} className="space-y-2.5">
                            <div className="flex gap-2.5">
                              <Avatar name={c.displayName || c.nickname || "User"} src={c.avatarUrl || undefined} size={32} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[13px] font-semibold text-ink">{c.displayName || c.nickname || "Anonim"}</span>
                                  <span className="text-[11px] text-ink-soft/60">{timeAgo(c.createdAt)}</span>
                                </div>
                                {c.content ? <div className="text-[13px] leading-snug text-ink-soft">{c.content}</div> : null}
                                {c.imageUrl ? <img src={c.imageUrl} alt="Foto komentar" className="mt-1 max-h-[220px] max-w-full rounded-xl object-contain" /> : null}
                                <button
                                  onClick={() => beginCommentReply(activeIt.id, c)}
                                  className="mt-1 text-xs font-semibold text-ink-soft/70 active:text-ink"
                                >
                                  Balas
                                </button>
                              </div>
                              <button
                                onClick={() => toggleCommentLike(activeIt.id, c.id)}
                                aria-label={c.likedByMe ? "Batal suka komentar" : "Sukai komentar"}
                                aria-pressed={c.likedByMe}
                                disabled={!!commentLikeBusyIds[c.id]}
                                className={`shrink-0 self-start inline-flex items-center gap-1 p-1.5 active:scale-90 disabled:opacity-50 ${c.likedByMe ? "text-rose-500" : "text-ink-soft/60"}`}
                              >
                                <IgHeartIcon filled={c.likedByMe} className="h-4 w-4" />
                                {c.likeCount > 0 ? <span className="text-[10px] leading-none">{c.likeCount}</span> : null}
                              </button>
                            </div>
                            {replies.map((reply) => (
                              <div key={reply.id} className="ml-8 flex gap-2">
                                <Avatar name={reply.displayName || reply.nickname || "User"} src={reply.avatarUrl || undefined} size={26} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-[12px] font-semibold text-ink">{reply.displayName || reply.nickname || "Anonim"}</span>
                                    <span className="text-[10px] text-ink-soft/60">{timeAgo(reply.createdAt)}</span>
                                  </div>
                                  {reply.content ? <div className="text-[13px] leading-snug text-ink-soft">{reply.content}</div> : null}
                                  {reply.imageUrl ? <img src={reply.imageUrl} alt="Foto balasan" className="mt-1 max-h-[220px] max-w-full rounded-xl object-contain" /> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto py-3 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                      {["❤️","🙌","🔥","👏","😢","😍","😲","😂"].map((e) => (
                        <button key={e} onClick={() => setCommentDraft((p) => p + e)} className="shrink-0 rounded-full bg-ink/10 px-3 py-2 text-[18px] active:scale-90 border border-line text-ink">
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col border-t border-line bg-surface px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <input
                      ref={commentPhotoRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) handlePickCommentImage(file, activeIt.id);
                        event.currentTarget.value = "";
                      }}
                    />
                    {commentImage?.statusId === activeIt.id ? (
                      <div className="mb-2 flex items-center gap-2 rounded-xl bg-ink/10 px-2 py-1.5">
                        <img src={commentImage.url} alt="Pratinjau foto komentar" className="h-12 w-12 rounded-lg object-cover" />
                        <span className="min-w-0 flex-1 truncate text-xs text-ink-soft/60">Foto siap dikirim</span>
                        <button
                          type="button"
                          onClick={() => { setCommentImage(null); setCommentErr(null); }}
                          aria-label="Hapus foto komentar"
                          className="shrink-0 rounded-full p-1 text-ink-soft/60 hover:bg-ink/10"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    {commentUploadBusy ? <div className="mb-2 px-1 text-xs text-ink-soft/60">Mengunggah foto...</div> : null}
                    {commentErr ? <div role="alert" className="mb-2 px-1 text-xs text-rose-300">{commentErr}</div> : null}
                    {replyingTo?.statusId === activeIt.id ? (
                      <div className="flex items-center justify-between gap-2 px-1 pb-2 text-xs text-ink-soft/60">
                        <span className="min-w-0 truncate">Membalas kepada <span className="font-semibold text-ink">{replyingTo.displayName}</span></span>
                        <button onClick={() => setReplyingTo(null)} aria-label="Batal membalas" className="shrink-0 rounded-full p-1 text-ink-soft/60 hover:bg-ink/10">
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <Avatar name={profile.displayName || profile.nickname || "Kamu"} src={profile.avatarUrl || undefined} size={30} />
                      <div className="flex flex-1 items-center gap-1 rounded-full bg-ink/10 border border-line pl-3 pr-1 py-1">
                        <input
                          ref={fsCommentInputRef}
                          autoFocus
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") sendComment(activeIt.id); }}
                          placeholder={replyingTo?.statusId === activeIt.id ? `Balas ke ${replyingTo.displayName}...` : "Apa pendapat Anda tenta..."}
                          className="flex-1 bg-surface-2 py-1.5 text-sm text-ink placeholder:text-ink-soft/60 outline-none"
                        />
                        {commentImage?.statusId === activeIt.id ? null : (
                          <button
                            type="button"
                            onClick={() => commentPhotoRef.current?.click()}
                            disabled={commentUploadBusy}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft/70 active:bg-ink/10 disabled:opacity-40"
                            aria-label="Lampirkan foto"
                          >
                            <CameraIcon className="h-5 w-5" />
                          </button>
                        )}
                        {commentDraft.trim() || commentImage?.statusId === activeIt.id ? (
                          <button
                            type="button"
                            onClick={() => sendComment(activeIt.id)}
                            disabled={commentUploadBusy}
                            className="shrink-0 rounded-full bg-brand p-1.5 text-brand-ink active:scale-90 disabled:opacity-50"
                            aria-label="Kirim komentar"
                          >
                            <SendIcon className="h-5 w-5" />
                          </button>
                        ) : null}
                      </div>
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



