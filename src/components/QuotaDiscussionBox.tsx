"use client";

import { useEffect, useRef, useState } from "react";
import type { QuotaDiscussionMessage } from "@/types/chat";
import { ChevronDownIcon, SendIcon } from "./icons";

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function QuotaDiscussionBox({
  viewerRole,
  requestId,
  messages,
  readOnly = false,
  memberLabel,
  onMessagesChange,
  onPollRefresh,
}: {
  viewerRole: "admin" | "member";
  requestId?: string;
  messages: QuotaDiscussionMessage[];
  readOnly?: boolean;
  memberLabel?: string;
  onMessagesChange?: (next: QuotaDiscussionMessage[]) => void;
  onPollRefresh?: () => void | Promise<void>;
}) {
  const [sentSnapshot, setSentSnapshot] = useState<{
    items: QuotaDiscussionMessage[];
  } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const localMessages =
    sentSnapshot && sentSnapshot.items.length > messages.length
      ? sentSnapshot.items
      : messages;

  const hasMessages = localMessages.length > 0;
  const open = hasMessages || manualOpen;
  const lastMsg = hasMessages
    ? localMessages[localMessages.length - 1]
    : undefined;
  const awaitingViewerReply =
    !readOnly &&
    Boolean(lastMsg) &&
    ((viewerRole === "admin" && lastMsg?.senderRole === "member") ||
      (viewerRole === "member" && lastMsg?.senderRole === "admin"));

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [open, localMessages.length]);

  // Sinkronisasi ringan saat ruang diskusi pengajuan pending terbuka.
  useEffect(() => {
    if (readOnly || !open || !onPollRefresh) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void onPollRefresh();
      }
    }, 8000);
    return () => window.clearInterval(timer);
  }, [readOnly, open, onPollRefresh]);

  if (readOnly && !hasMessages) {
    return null;
  }

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || sending || readOnly) return;
    setSending(true);
    setErrMsg(null);
    try {
      const endpoint =
        viewerRole === "admin"
          ? `/api/admin/quota-requests/${requestId}`
          : "/api/quota-requests";
      const payload =
        viewerRole === "admin"
          ? { action: "message", message: trimmed }
          : { message: trimmed };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrMsg(data.error || "Gagal mengirim pesan.");
        return;
      }
      const next = Array.isArray(data.discussion)
        ? (data.discussion as QuotaDiscussionMessage[])
        : localMessages;
      setSentSnapshot({ items: next });
      setDraft("");
      onMessagesChange?.(next);
    } catch {
      setErrMsg("Koneksi gagal saat mengirim pesan.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setManualOpen((v) => (hasMessages ? v : !v))}
        className="flex w-full min-w-0 items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-2/60"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-ink">
            {viewerRole === "admin"
              ? `Diskusi dengan ${memberLabel || "Member"}`
              : "Diskusi dengan Admin"}
          </span>
          {hasMessages && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-soft">
              {localMessages.length} pesan
            </span>
          )}
          {awaitingViewerReply && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:text-sky-300">
              {viewerRole === "admin"
                ? "Balasan member"
                : "Pesan baru dari Admin"}
            </span>
          )}
        </div>
        {!hasMessages && !readOnly && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink-soft">
            {open ? "Tutup" : viewerRole === "admin" ? "Tanya dulu" : "Kirim pesan"}
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </span>
        )}
      </button>

      {open && (
        <div className="min-w-0 space-y-2 border-t border-line px-3 py-2.5">
          {hasMessages ? (
            <div
              ref={listRef}
              className="max-h-44 min-w-0 space-y-1.5 overflow-y-auto pr-0.5"
            >
              {localMessages.map((m) => {
                const mine = m.senderRole === viewerRole;
                return (
                  <div
                    key={m.id}
                    className={`flex min-w-0 flex-col ${
                      mine ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed break-words ${
                        mine
                          ? "bg-brand text-brand-ink"
                          : "border border-line bg-surface-2 text-ink"
                      }`}
                    >
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[10px] opacity-75">
                        <span className="font-semibold">
                          {mine
                            ? "Kamu"
                            : m.senderRole === "admin"
                              ? "Admin"
                              : m.senderName}
                        </span>
                        {m.createdAt && (
                          <span>· {formatShortTime(m.createdAt)}</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted">
              {viewerRole === "admin"
                ? "Tanyakan detail tambahan ke member sebelum menyetujui atau menolak penambahan slot karakter."
                : "Kirim pesan atau keterangan tambahan ke Admin terkait pengajuan slot ini."}
            </p>
          )}

          {!readOnly && (
            <div className="flex min-w-0 items-center gap-1.5 pt-0.5">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                maxLength={500}
                placeholder={
                  viewerRole === "admin"
                    ? "Tulis pertanyaan/pesan ke member..."
                    : "Balas atau tulis pesan ke Admin..."
                }
                className="w-full min-w-0 flex-1 rounded-xl border border-line bg-surface-2/60 px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-ink focus:bg-surface focus:outline-none"
              />
              <button
                type="button"
                disabled={sending || !draft.trim()}
                onClick={() => void handleSend()}
                aria-label="Kirim pesan diskusi"
                className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-xl bg-brand px-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-45"
              >
                <SendIcon className="h-3.5 w-3.5" />
                <span>{sending ? "..." : "Kirim"}</span>
              </button>
            </div>
          )}

          {errMsg && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              {errMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
