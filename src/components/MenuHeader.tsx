import type {
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
} from "react";

export function MenuHeader({
  title,
  description,
  actions,
  className = "",
  style,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <header
      className={`top-bar flex min-h-[72px] shrink-0 items-center gap-3 border-b-0 px-4 pb-3 pt-[max(1rem,var(--safe-top))] sm:px-5 ${className}`}
      style={{ borderBottom: "none", ...style }}
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-bold leading-6 tracking-tight text-ink">
          {title}
        </h1>
        <p className="truncate whitespace-nowrap text-xs leading-4 text-ink-soft">
          {description}
        </p>
      </div>
      <div className="flex h-10 w-[88px] shrink-0 items-center justify-end gap-2">
        {actions}
      </div>
    </header>
  );
}

export function MenuHeaderIconButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-soft ring-1 ring-line transition hover:bg-surface hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
