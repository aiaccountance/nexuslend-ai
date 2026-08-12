import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Shirt,
  Swords,
  Trophy,
  Plus,
  Home,
  LogOut,
  Layers,
  Search,
  Bell,
  Flame,
  User,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAccount } from "./useAccount";

/** The full set, for the top of a wide screen. */
const NAV_ITEMS = [
  { href: "/outfits", label: "Feed", icon: Home },
  { href: "/outfits/search", label: "Search", icon: Search },
  { href: "/outfits/upload", label: "Post", icon: Plus },
  { href: "/outfits/wardrobe", label: "Wardrobe", icon: Layers },
  { href: "/outfits/challenge", label: "Challenge", icon: Flame },
  { href: "/outfits/battle", label: "Battle", icon: Swords },
  { href: "/outfits/leaderboard", label: "Ranking", icon: Trophy },
];

/**
 * What a thumb can reach, for the bottom of a phone. Five is the most that
 * stays tappable, and Post sits in the middle because that's where every app
 * people already use puts it.
 */
const PHONE_TABS = [
  { href: "/outfits", label: "Feed", icon: Home },
  { href: "/outfits/search", label: "Search", icon: Search },
  { href: "/outfits/upload", label: "Post", icon: Plus, primary: true },
  { href: "/outfits/challenge", label: "Challenge", icon: Flame },
  { href: "/outfits/wardrobe", label: "Closet", icon: Layers },
] as const;

export default function OutfitLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { account, state, signOut } = useAccount();

  return (
    <div className="min-h-screen bg-[#0b0a12] text-white">
      <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0a12]/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/outfits"
              className="flex items-center gap-2 group shrink-0"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center">
                <Shirt className="w-4 h-4 text-white" />
              </div>
              <span className="font-black tracking-tight text-white group-hover:text-fuchsia-300 transition-colors hidden sm:inline">
                Outfit Arena
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map(item => {
                const active = location === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {state === "ready" && account ? (
              <>
                <NotificationBell active={location === "/outfits/alerts"} />
                <Link
                  href={`/outfits/@${account.username}`}
                  className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
                >
                  {account.avatarUrl ? (
                    <img
                      src={account.avatarUrl}
                      alt=""
                      className="w-7 h-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-xs font-bold">
                      {account.displayUsername.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline">
                    @{account.displayUsername}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => signOut()}
                  className="text-white/60 hover:text-white hover:bg-white/10 hidden sm:inline-flex"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : state === "needsHandle" ? (
              <Link href="/outfits/pick-username">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:opacity-90 text-white border-0"
                >
                  Pick a username
                </Button>
              </Link>
            ) : (
              <Link href="/outfits/signin">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:opacity-90 text-white border-0"
                >
                  Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* The bottom bar covers the last stretch of the page on a phone, so the
          page gets that much padding back. */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-6">
        {children}
      </main>

      <PhoneTabs location={location} signedIn={state === "ready"} />
    </div>
  );
}

/** The bell, with a count of what's happened since you last looked. */
function NotificationBell({ active }: { active: boolean }) {
  const unread = trpc.arena.notifications.unreadCount.useQuery(undefined, {
    // Often enough to feel live, rarely enough to be free.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const count = unread.data ?? 0;

  return (
    <Link
      href="/outfits/alerts"
      className={`relative p-2 rounded-lg transition-colors ${
        active ? "bg-white/10 text-white" : "text-white/60 hover:text-white"
      }`}
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
    >
      <Bell className="w-5 h-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-fuchsia-500 text-[10px] font-bold flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

/**
 * The phone tab bar. Fixed to the bottom, out of the way of the notch and the
 * home indicator, with the post button raised the way a camera button is.
 */
function PhoneTabs({
  location,
  signedIn,
}: {
  location: string;
  signedIn: boolean;
}) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-[#0b0a12]/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {PHONE_TABS.map(tab => {
          const active = location === tab.href;
          const Icon = tab.icon;

          if ("primary" in tab && tab.primary) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center justify-center px-2"
                aria-label={tab.label}
              >
                <span className="w-11 h-8 -mt-1 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-900/40">
                  <Icon className="w-5 h-5 text-white" />
                </span>
                <span className="text-[10px] mt-0.5 text-white/70">
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                active ? "text-fuchsia-300" : "text-white/55"
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
            </Link>
          );
        })}

        {!signedIn && (
          <Link
            href="/outfits/signin"
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] font-medium text-white/55"
          >
            <User className="w-5 h-5" />
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
