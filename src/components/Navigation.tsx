"use client";

import type { UserProfile } from "@/lib/userProfile";
import { Avatar } from "./Avatar";
import { ThemeQuickToggle } from "./ThemeToggle";
import { ChatsIcon, GridIcon, SettingsIcon, SpeakerIcon, UserIcon } from "./icons";

export type AppView = "chats" | "characters" | "voice" | "profile" | "settings";

type Item = {
  id: AppView;
  label: string;
  Icon: typeof ChatsIcon;
};

const ITEMS: Item[] = [
  { id: "chats", label: "Chat", Icon: ChatsIcon },
  { id: "voice", label: "Suara", Icon: SpeakerIcon },
  { id: "characters", label: "Karakter", Icon: GridIcon },
  { id: "profile", label: "Profil", Icon: UserIcon },
  { id: "settings", label: "Setelan", Icon: SettingsIcon },
];

/**
 * Rail navigasi vertikal di sisi kiri desktop.
 */
export function NavRail({
  view,
  onChange,
  profile,
}: {
  view: AppView;
  onChange: (next: AppView) => void;
  profile: UserProfile;
}) {
  const userName = profile.displayName || profile.nickname || "Kamu";

  return (
    <nav
      aria-label="Navigasi utama"
      className="hidden h-full w-[74px] shrink-0 flex-col items-center justify-between border-r border-line bg-header py-3 md:flex"
    >
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onChange("profile")}
          title={`Profil: ${userName}`}
          aria-label="Buka profil saya"
          className={`mb-2 rounded-full p-0.5 transition active:scale-95 ${
            view === "profile" ? "ring-2 ring-ink" : "hover:opacity-90"
          }`}
        >
          <Avatar name={userName} src={profile.avatarUrl} size={38} />
        </button>

        {ITEMS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={active ? "page" : undefined}
              className={`group flex w-14 flex-col items-center gap-1 rounded-2xl py-2 text-[12px] font-medium transition active:scale-95 ${
                active
                  ? "bg-ink/10 font-semibold text-ink"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <ThemeQuickToggle />
      </div>
    </nav>
  );
}

/**
 * Tab bar bawah untuk layar HP — kapsul mengambang kaca buram ala iOS.
 */
export function MobileTabBar({
  view,
  onChange,
}: {
  view: AppView;
  onChange: (next: AppView) => void;
}) {
  return (
    <div className="mobile-tabbar pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
      <nav
        aria-label="Navigasi utama"
        className="glass-capsule pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-full p-1.5"
      >
        {ITEMS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition duration-200 active:scale-95 ${
                active
                  ? "bg-ink/[0.09] font-semibold text-ink shadow-xs dark:bg-white/[0.13]"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="max-w-full truncate px-1">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
