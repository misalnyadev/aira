"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { XIcon } from "./icons";

const STAGE_SIZE = 264;
const CIRCLE_SIZE = 232;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function AvatarCropModal({
  source,
  title = "Atur Foto Profil",
  busy = false,
  error = null,
  onCancel,
  onConfirm,
  onPickAnother,
}: {
  /** File baru dari galeri atau URL gambar profil yang sudah ada (same-origin / data URL). */
  source: File | string;
  title?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => Promise<void> | void;
  onPickAnother?: () => void;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() =>
    typeof source === "string" ? source : null
  );

  useEffect(() => {
    let active = true;
    let createdBlobUrl: string | null = null;

    if (typeof source !== "string") {
      createdBlobUrl = URL.createObjectURL(source);
      const urlToSet = createdBlobUrl;
      queueMicrotask(() => {
        if (active) setResolvedUrl(urlToSet);
      });
    } else if (
      source.startsWith("data:") ||
      source.startsWith("blob:") ||
      source.startsWith("/")
    ) {
      queueMicrotask(() => {
        if (active) setResolvedUrl(source);
      });
    } else {
      fetch(source)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("fetch"))))
        .then((blob) => {
          if (!active) return;
          createdBlobUrl = URL.createObjectURL(blob);
          setResolvedUrl(createdBlobUrl);
        })
        .catch(() => {
          if (active) setResolvedUrl(source);
        });
    }

    return () => {
      active = false;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [source]);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !exporting) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy, exporting]);

  const metrics = useMemo(() => {
    if (!naturalSize || naturalSize.w <= 0 || naturalSize.h <= 0) return null;
    const baseScale = Math.max(
      CIRCLE_SIZE / naturalSize.w,
      CIRCLE_SIZE / naturalSize.h
    );
    const dispW = naturalSize.w * baseScale * zoom;
    const dispH = naturalSize.h * baseScale * zoom;
    const maxPanX = Math.max(0, (dispW - CIRCLE_SIZE) / 2);
    const maxPanY = Math.max(0, (dispH - CIRCLE_SIZE) / 2);
    return {
      dispW,
      dispH,
      maxPanX,
      maxPanY,
      clampedX: clamp(pan.x, -maxPanX, maxPanX),
      clampedY: clamp(pan.y, -maxPanY, maxPanY),
    };
  }, [naturalSize, zoom, pan.x, pan.y]);

  const applyZoom = useCallback(
    (nextZoomRaw: number) => {
      const nextZoom = clamp(nextZoomRaw, MIN_ZOOM, MAX_ZOOM);
      setZoom(nextZoom);
      if (!naturalSize) return;
      const baseScale = Math.max(
        CIRCLE_SIZE / naturalSize.w,
        CIRCLE_SIZE / naturalSize.h
      );
      const dispW = naturalSize.w * baseScale * nextZoom;
      const dispH = naturalSize.h * baseScale * nextZoom;
      const maxX = Math.max(0, (dispW - CIRCLE_SIZE) / 2);
      const maxY = Math.max(0, (dispH - CIRCLE_SIZE) / 2);
      setPan((prev) => ({
        x: clamp(prev.x, -maxX, maxX),
        y: clamp(prev.y, -maxY, maxY),
      }));
    },
    [naturalSize]
  );

  function handleReset() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!metrics || busy || exporting) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(
        pts[1].x - pts[0].x,
        pts[1].y - pts[0].y
      );
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!metrics || !pointersRef.current.has(e.pointerId)) return;
    const prevPt = pointersRef.current.get(e.pointerId)!;
    const nextPt = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, nextPt);

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (pinchDistanceRef.current && pinchDistanceRef.current > 8) {
        const factor = dist / pinchDistanceRef.current;
        applyZoom(zoom * factor);
      }
      pinchDistanceRef.current = dist;
      return;
    }

    const dx = nextPt.x - prevPt.x;
    const dy = nextPt.y - prevPt.y;
    setPan((prev) => ({
      x: clamp(prev.x + dx, -metrics.maxPanX, metrics.maxPanX),
      y: clamp(prev.y + dy, -metrics.maxPanY, metrics.maxPanY),
    }));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchDistanceRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      setDragging(false);
    }
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.08 : -0.08;
    applyZoom(zoom + step);
  }

  async function handleConfirmCrop() {
    if (!imgRef.current || !metrics || busy || exporting) return;
    setExporting(true);
    setLoadError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Browser tidak mendukung pemotongan gambar.");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const ratio = OUTPUT_SIZE / CIRCLE_SIZE;
      const outW = metrics.dispW * ratio;
      const outH = metrics.dispH * ratio;
      const drawX = OUTPUT_SIZE / 2 - outW / 2 + metrics.clampedX * ratio;
      const drawY = OUTPUT_SIZE / 2 - outH / 2 + metrics.clampedY * ratio;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(imgRef.current, drawX, drawY, outW, outH);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88)
      );
      if (!blob) throw new Error("Gagal memproses hasil potongan foto.");

      const baseName =
        typeof source === "string"
          ? "avatar"
          : source.name.replace(/\.[^.]+$/, "") || "avatar";
      const file = new File([blob], `${baseName}-crop.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });

      await onConfirm(file);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Gagal menyimpan potongan foto."
      );
    } finally {
      setExporting(false);
    }
  }

  const isWorking = busy || exporting;

  return (
    <div
      className="fade-in fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,var(--safe-top))] backdrop-blur-sm sm:p-4"
      onClick={() => {
        if (!isWorking) onCancel();
      }}
    >
      <div
        className="pop-in flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3.5">
          <div>
            <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
            <p className="text-[11px] text-ink-soft">
              Geser &amp; perbesar agar pas di tengah lingkaran
            </p>
          </div>
          <button
            type="button"
            disabled={isWorking}
            onClick={onCancel}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Panggung Geser & Pratinjau Lingkaran */}
          <div className="flex flex-col items-center">
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
              className={`relative select-none overflow-hidden rounded-2xl bg-neutral-900 touch-none ${
                dragging ? "cursor-grabbing" : "cursor-grab"
              }`}
            >
              {resolvedUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  ref={imgRef}
                  src={resolvedUrl}
                  alt="Pratinjau foto profil"
                  crossOrigin={
                    resolvedUrl.startsWith("blob:") ||
                    resolvedUrl.startsWith("data:")
                      ? undefined
                      : "anonymous"
                  }
                  draggable={false}
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    setNaturalSize({
                      w: el.naturalWidth || 1,
                      h: el.naturalHeight || 1,
                    });
                    setLoadError(null);
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  onError={() =>
                    setLoadError(
                      "Gambar tidak dapat dimuat. Silakan pilih foto lain dari perangkatmu."
                    )
                  }
                  style={
                    metrics
                      ? {
                          position: "absolute",
                          maxWidth: "none",
                          width: `${metrics.dispW}px`,
                          height: `${metrics.dispH}px`,
                          left: `${STAGE_SIZE / 2 - metrics.dispW / 2 + metrics.clampedX}px`,
                          top: `${STAGE_SIZE / 2 - metrics.dispH / 2 + metrics.clampedY}px`,
                        }
                      : { opacity: 0 }
                  }
                  className="pointer-events-none select-none"
                />
              )}

              {/* Masker gelap di luar lingkaran + cincin bingkai bulat */}
              <div
                style={{
                  width: CIRCLE_SIZE,
                  height: CIRCLE_SIZE,
                  left: (STAGE_SIZE - CIRCLE_SIZE) / 2,
                  top: (STAGE_SIZE - CIRCLE_SIZE) / 2,
                  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.58)",
                }}
                className="pointer-events-none absolute rounded-full ring-2 ring-white/90"
              >
                {/* Garis bantu tengah halus saat sedang digeser */}
                {dragging && (
                  <>
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/35" />
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/35" />
                  </>
                )}
              </div>

              {!metrics && !loadError && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/75">
                  Memuat gambar...
                </div>
              )}
            </div>
          </div>

          {/* Kontrol Perbesar (Zoom) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-ink-soft">
                Perbesar ({Math.round(zoom * 100)}%)
              </span>
              <div className="flex items-center gap-3">
                {onPickAnother && (
                  <button
                    type="button"
                    disabled={isWorking}
                    onClick={onPickAnother}
                    className="font-medium text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-40"
                  >
                    Pilih foto lain
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    isWorking ||
                    (zoom === 1 && pan.x === 0 && pan.y === 0)
                  }
                  onClick={handleReset}
                  className="font-medium text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-40"
                >
                  Tengahkan
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={isWorking || zoom <= MIN_ZOOM}
                onClick={() => applyZoom(zoom - 0.15)}
                aria-label="Perkecil"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-bold text-ink transition hover:bg-line disabled:opacity-40"
              >
                -
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.02}
                value={zoom}
                disabled={isWorking || !metrics}
                onChange={(e) => applyZoom(Number(e.target.value))}
                aria-label="Tingkat perbesaran foto"
                className="h-1.5 flex-1 cursor-pointer accent-ink"
              />
              <button
                type="button"
                disabled={isWorking || zoom >= MAX_ZOOM}
                onClick={() => applyZoom(zoom + 0.15)}
                aria-label="Perbesar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-bold text-ink transition hover:bg-line disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>

          {(loadError || error) && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              {loadError || error}
            </p>
          )}
        </div>

        {/* Footer Aksi */}
        <div className="flex shrink-0 gap-2 border-t border-line bg-surface-2/40 px-4 py-3">
          <button
            type="button"
            disabled={isWorking}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line bg-surface py-2.5 text-xs font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isWorking || !metrics}
            onClick={() => void handleConfirmCrop()}
            className="flex-1 rounded-xl bg-brand py-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
          >
            {isWorking ? "Menyimpan..." : "Pakai Foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
