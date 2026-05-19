import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  FileSearch,
  Briefcase,
  ShieldAlert,
  Settings2,
  Building2,
  Landmark,
  TrendingUp,
  Activity,
  LogOut,
  ChevronRight,
  Zap,
  Menu,
  X,
  Bell,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  FileStack,
  MapPin,
  DollarSign,
  Receipt,
  ShieldCheck,
  Globe2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const navItems = [
  {
    group: "WORKSPACE",
    items: [
      { icon: LayoutDashboard, label: "Overview", path: "/dashboard", badge: null, description: "Platform summary" },
      { icon: FileSearch, label: "AI Analyser", path: "/dashboard/analyser", badge: "AI", description: "8-domain underwriting" },
      { icon: Briefcase, label: "Deal Pipeline", path: "/dashboard/deals", badge: null, description: "Manage applications" },
    ],
  },
  {
    group: "DATA INTELLIGENCE",
    items: [
      { icon: Landmark, label: "Open Banking", path: "/dashboard/open-banking", badge: null, description: "Transaction analysis" },
      { icon: Building2, label: "Companies House", path: "/dashboard/companies-house", badge: "LIVE", description: "Company search" },
      { icon: FileStack, label: "CH Deep Dive", path: "/dashboard/ch-extended", badge: "LIVE", description: "Charges, PSC, filings" },
      { icon: ShieldAlert, label: "Fraud Detection", path: "/dashboard/fraud", badge: null, description: "20-layer checks" },
    ],
  },
  {
    group: "UK GOVERNMENT APIs",
    items: [
      { icon: Receipt, label: "HMRC VAT Check", path: "/dashboard/hmrc-vat", badge: "FREE", description: "Official VAT verification" },
      { icon: MapPin, label: "Postcode Enrichment", path: "/dashboard/postcodes", badge: "FREE", description: "UK address & geo data" },
      { icon: DollarSign, label: "Live FX Rates", path: "/dashboard/fx-rates", badge: "FREE", description: "Real-time exchange rates" },
      { icon: ShieldCheck, label: "AML Screening", path: "/dashboard/creditsafe", badge: "LIVE", description: "Disqualified directors & PSC" },
      { icon: Globe2, label: "Geographic Risk", path: "/dashboard/geo-risk", badge: null, description: "Postcode concentration" },
    ],
  },
  {
    group: "PORTFOLIO",
    items: [
      { icon: TrendingUp, label: "Portfolio Monitor", path: "/dashboard/portfolio", badge: null, description: "Early warning signals" },
      { icon: Activity, label: "Model Performance", path: "/dashboard/model-performance", badge: null, description: "Drift & accuracy" },
      { icon: Settings2, label: "Policy Engine", path: "/dashboard/policy", badge: null, description: "Underwriting rules" },
    ],
  },
  {
    group: "ADMIN",
    items: [
      { icon: Users, label: "Waitlist", path: "/dashboard/waitlist", badge: null, description: "Early access sign-ups" },
    ],
  },
];

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="min-h-screen bg-[#080b12] flex items-center justify-center relative overflow-hidden">
        {/* Background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08)_0%,transparent_70%)]" />

        <div className="relative flex flex-col items-center gap-8 p-10 max-w-sm w-full text-center">
          {/* Logo */}
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
              <Zap className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#080b12] animate-pulse" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">NexusLend AI</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              The UK's most advanced AI underwriting platform. Sign in to access your dashboard.
            </p>
          </div>

          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full h-12 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-0 shadow-lg shadow-indigo-500/25 font-semibold text-sm"
          >
            Sign in to continue
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>

          <div className="flex items-center gap-6 text-xs text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />FCA-Aware AI</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />SOC 2 Type II</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" />GDPR Ready</span>
          </div>

          <a href="/" className="text-slate-600 text-xs hover:text-slate-400 transition-colors flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            Back to website
          </a>
        </div>
      </div>
    );
  }

  return <NexusLayoutContent>{children}</NexusLayoutContent>;
}

function NexusLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (user?.name || "U").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="flex h-screen bg-[#080b12] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto flex flex-col h-full
          bg-[#0c0f1a] border-r border-white/[0.06]
          transition-all duration-300 ease-in-out
          ${collapsed ? "w-[68px]" : "w-[240px]"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center h-16 px-4 border-b border-white/[0.06] shrink-0">
          {!collapsed && (
            <a href="/" className="flex items-center gap-2.5 flex-1 min-w-0 group cursor-pointer" title="Back to homepage">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white tracking-tight truncate group-hover:text-indigo-300 transition-colors">NexusLend AI</div>
                <div className="text-[10px] text-indigo-400 font-medium tracking-widest uppercase">Platform</div>
              </div>
            </a>
          )}
          {collapsed && (
            <a href="/" title="Back to homepage" className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-shadow">
              <Zap className="w-4 h-4 text-white" />
            </a>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden md:flex items-center justify-center w-7 h-7 rounded-md hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-all shrink-0 ${collapsed ? "mx-auto" : "ml-auto"}`}
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5 scrollbar-thin">
          {navItems.map((group) => (
            <div key={group.group}>
              {!collapsed && (
                <div className="px-2 mb-1.5 text-[10px] font-semibold text-slate-600 tracking-[0.12em] uppercase">
                  {group.group}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location === item.path || (item.path !== "/dashboard" && location.startsWith(item.path));
                  const btn = (
                    <button
                      key={item.path}
                      onClick={() => { setLocation(item.path); setMobileOpen(false); }}
                      className={`
                        w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 group relative
                        ${isActive
                          ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                          : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent"
                        }
                        ${collapsed ? "justify-center" : ""}
                      `}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-400 rounded-r-full" />
                      )}
                      <item.icon className={`w-4 h-4 shrink-0 ${isActive ? "text-indigo-400" : "text-slate-600 group-hover:text-slate-400"}`} />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left font-medium text-[13px]">{item.label}</span>
                          {item.badge && (
                            <Badge className={`text-[9px] px-1.5 py-0 h-4 border-0 font-bold tracking-wide ${
                              item.badge === "AI" ? "bg-violet-500/20 text-violet-300" :
                              item.badge === "LIVE" ? "bg-emerald-500/20 text-emerald-300" :
                              "bg-slate-500/20 text-slate-400"
                            }`}>
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}
                    </button>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.path} delayDuration={0}>
                        <TooltipTrigger asChild>{btn}</TooltipTrigger>
                        <TooltipContent side="right" className="bg-[#1a1f2e] border-white/10 text-white text-xs">
                          <div className="font-semibold">{item.label}</div>
                          <div className="text-slate-400">{item.description}</div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return btn;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="shrink-0 p-3 border-t border-white/[0.06]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={`flex items-center gap-2.5 w-full rounded-lg px-2 py-2 hover:bg-white/[0.04] transition-colors text-left focus:outline-none group ${collapsed ? "justify-center" : ""}`}>
                <Avatar className="h-7 w-7 border border-indigo-500/30 shrink-0">
                  <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-300">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{user?.name || "User"}</p>
                      <p className="text-[10px] text-slate-500 truncate">{user?.email || "Underwriter"}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 bg-[#141824] border-white/10 shadow-2xl">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="text-xs font-semibold text-white">{user?.name}</p>
                <p className="text-[11px] text-slate-500">{user?.email}</p>
              </div>
              <DropdownMenuItem onClick={() => setLocation("/")} className="cursor-pointer text-slate-300 focus:text-white focus:bg-white/5 text-xs mt-1">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Back to website
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-white/5" />
              <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-400 focus:text-red-300 focus:bg-red-500/10 text-xs">
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#080b12]/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-white/5 text-slate-400"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-4 h-4" />
            </button>
            {/* Breadcrumb */}
            <div className="hidden md:flex items-center gap-2 text-sm">
              <span className="text-slate-600">NexusLend AI</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-700" />
              <span className="text-slate-300 font-medium">
                {navItems.flatMap(g => g.items).find(i => i.path === location || (i.path !== "/dashboard" && location.startsWith(i.path)))?.label || "Dashboard"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-medium text-emerald-400">All systems live</span>
            </div>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors">
                  <Bell className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a1f2e] border-white/10 text-white text-xs">Notifications</TooltipContent>
            </Tooltip>

            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <a href="/" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors">
                  <HelpCircle className="w-4 h-4" />
                </a>
              </TooltipTrigger>
              <TooltipContent className="bg-[#1a1f2e] border-white/10 text-white text-xs">Help & Docs</TooltipContent>
            </Tooltip>

            <div className="w-px h-5 bg-white/[0.06] mx-1" />

            <Avatar className="h-7 w-7 border border-indigo-500/30 cursor-pointer">
              <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-indigo-300">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8 max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
