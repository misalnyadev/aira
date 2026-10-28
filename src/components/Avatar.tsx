const PALETTE = [
  "from-rose-400 to-orange-300",
  "from-violet-400 to-indigo-300",
  "from-emerald-400 to-teal-300",
  "from-amber-400 to-pink-300",
  "from-sky-400 to-cyan-300",
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
        className={`shrink-0 rounded-full object-cover ${ring ? "ring-2 ring-emerald-400 ring-offset-2" : ""}`}
      />
    );
  }

  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${colorFor(
        name || "?"
      )} font-semibold text-white ${ring ? "ring-2 ring-emerald-400 ring-offset-2" : ""}`}
    >
      <span style={{ fontSize: size * 0.38 }}>{initials || "?"}</span>
    </div>
  );
}
