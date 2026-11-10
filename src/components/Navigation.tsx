"use client";

import type { UserProfile } from "@/lib/userProfile";
import { Avatar } from "./Avatar";
import { ChatSquareIcon, ChatsIcon, MeetupIcon, PhoneCallIcon, StatusIcon, UserIcon } from "./icons";

export type AppView = "chats" | "calls" | "profile" | "settings" | "brainstorm" | "status";

type Item = {
  id: AppView;
  label: string;
  Icon: typeof ChatsIcon;
};

const ITEMS: Item[] = [
  { id: "status", label: "Story", Icon: StatusIcon },
  { id: "calls", label: "Panggilan", Icon: PhoneCallIcon },
  { id: "brainstorm", label: "MeetUp", Icon: MeetupIcon },
  { id: "chats", label: "Chat", Icon: ChatSquareIcon },
  { id: "profile", label: "Profil", Icon: UserIcon },
];

/**
 * Rail navigasi vertikal di sisi kiri desktop.
 */
export function NavRail({
  view,
  onChange,
  profile,
  profileBadgeCount = 0,
}: {
  view: AppView;
  onChange: (next: AppView) => void;
  profile: UserProfile;
  profileBadgeCount?: number;
}) {
  const userName = profile.displayName || profile.nickname || "Kamu";

  return (
    <nav
      aria-label="Navigasi utama"
      className="hidden h-full w-[74px] shrink-0 flex-col items-center justify-start border-r border-line bg-header py-3 md:flex"
    >
      <div className="flex flex-col items-center gap-1">
        {ITEMS.map(({ id, label, Icon }) => {
          const active = view === id;
          const isProfile = id === "profile";
          const showBadge = isProfile && profileBadgeCount > 0;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={active ? "page" : undefined}
              className={`group relative flex w-14 flex-col items-center gap-1 rounded-2xl py-2 text-[12px] font-medium transition active:scale-95 ${
                active
                  ? "bg-[#4687fe]/10 font-semibold text-[#205ac4] dark:text-[#79aaff]"
                  : "text-ink-soft hover:bg-[#4687fe]/10 hover:text-[#205ac4] dark:hover:text-[#79aaff]"
              }`}
            >
              <span className="relative">
                {isProfile ? (
                  <span className={`block rounded-full ${active ? "ring-2 ring-[#4687fe] ring-offset-2 ring-offset-surface" : ""}`}><Avatar name={userName} src={profile.avatarUrl} size={28} /></span>
                ) : (
                  <Icon className="h-6 w-6" />
                )}
                {showBadge && (
                  <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9.5px] font-extrabold text-white">
                    {profileBadgeCount > 9 ? "9+" : profileBadgeCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
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
  profile,
  profileBadgeCount = 0,
}: {
  view: AppView;
  onChange: (next: AppView) => void;
  profile: UserProfile;
  profileBadgeCount?: number;
}) {
  const userName = profile.displayName || profile.nickname || "Kamu";

  return (
    <div className="mobile-tabbar pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.7rem))] md:hidden">
      <nav
        aria-label="Navigasi utama"
        className="glass-capsule pointer-events-auto flex w-full max-w-[420px] items-center gap-0.5 rounded-full p-1.5"
      >
        {ITEMS.map(({ id, label, Icon }) => {
          const active = view === id;
          const isProfile = id === "profile";
          const showBadge = isProfile && profileBadgeCount > 0;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition duration-200 active:scale-95 ${
                active
                  ? "bg-[#4687fe]/10 font-semibold text-[#205ac4] shadow-xs dark:bg-[#4687fe]/20 dark:text-[#79aaff]"
                  : "text-ink-soft hover:bg-[#4687fe]/10 hover:text-[#205ac4] dark:hover:text-[#79aaff]"
              }`}
            >
              <span className="relative">
                {isProfile ? (
                  <span className={`block rounded-full ${active ? "ring-2 ring-[#4687fe]" : ""}`}><Avatar name={userName} src={profile.avatarUrl} size={26} /></span>
                ) : (
                  <Icon className="h-[26px] w-[26px] shrink-0" />
                )}
                {showBadge && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9.5px] font-extrabold text-white">
                    {profileBadgeCount > 9 ? "9+" : profileBadgeCount}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1">{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
