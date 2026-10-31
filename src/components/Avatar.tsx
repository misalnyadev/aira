const PALETTE = [
  "from-neutral-500 to-neutral-400",
  "from-stone-500 to-stone-400",
  "from-zinc-500 to-zinc-400",
  "from-slate-500 to-slate-400",
  "from-gray-500 to-gray-400",
];

function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({
  name,
  src,
  size = 44,
  ring = false,
}: {
  name: string;
  src?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const style = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={style}
        className={`shrink-0 rounded-full object-cover ${
          ring ? "ring-2 ring-ink/15 ring-offset-2 ring-offset-surface" : ""
        }`}
      />
    );
  }

  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${colorFor(
        name || "?"
      )} font-semibold text-white ${
        ring ? "ring-2 ring-ink/15 ring-offset-2 ring-offset-surface" : ""
      }`}
    >
      <span style={{ fontSize: size * 0.38 }}>{initials || "?"}</span>
    </div>
  );
}
