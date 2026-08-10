import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import {
  Shirt,
  Swords,
  Trophy,
  Upload,
  Home,
  LogOut,
  Layers,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/outfits", label: "Feed", icon: Home },
  { href: "/outfits/upload", label: "Post Outfit", icon: Upload },
  { href: "/outfits/wardrobe", label: "Wardrobe", icon: Layers },
  { href: "/outfits/battle", label: "Battle", icon: Swords },
  { href: "/outfits/leaderboard", label: "Leaderboard", icon: Trophy },
];

export default function OutfitLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

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

          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <>
                <Link
                  href={`/outfits/u/${user.id}`}
                  className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center text-xs font-bold">
                    {(user.name || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline">{user.name || "You"}</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => logout()}
                  className="text-white/60 hover:text-white hover:bg-white/10"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-fuchsia-500 to-violet-600 hover:opacity-90 text-white border-0"
                >
                  Sign in
                </Button>
              </a>
            )}
          </div>
        </div>
        {/* Mobile nav */}
        <div className="md:hidden flex items-center justify-around border-t border-white/10 px-2 py-1">
          {NAV_ITEMS.map(item => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  active ? "text-fuchsia-300" : "text-white/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
    </div>
  );
}
