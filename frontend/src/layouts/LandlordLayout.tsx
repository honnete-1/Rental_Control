import * as RadixDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  ClipboardCheck,
  HandCoins,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Search,
  Settings,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Input } from "@/components/ui/form";
import { get } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  key: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/landlord", key: "overview", icon: LayoutDashboard, end: true },
  { to: "/landlord/properties", key: "properties", icon: Building2 },
  { to: "/landlord/tenants", key: "tenants", icon: Users },
  { to: "/landlord/maintenance", key: "maintenance", icon: Wrench },
  { to: "/landlord/inspections", key: "inspections", icon: ClipboardCheck },
  { to: "/landlord/expenses", key: "expenses", icon: Receipt },
  { to: "/landlord/finances", key: "finances", icon: HandCoins },
  { to: "/landlord/notifications", key: "notifications", icon: Bell },
  { to: "/landlord/help", key: "help", icon: HelpCircle },
  { to: "/landlord/settings", key: "settings", icon: Settings },
];

function Brand() {
  return (
    <Link to="/landlord" className="flex min-h-11 items-center gap-2 text-lg font-bold text-white">
      <img src="/favicon.svg" alt="" className="size-9" />
      Rental_Control
    </Link>
  );
}

/** Left navigation with text labels. Collapsible on large screens. */
export function AppSidebar({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <nav aria-label={t("common:nav.main")} className="flex-1 overflow-y-auto px-3 py-4">
      <ul className="space-y-1">
        {NAV.map(({ to, key, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              title={collapsed ? t(`common:nav.${key}`) : undefined}
              className={({ isActive }) =>
                cn(
                  "flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold text-slate-200 hover:bg-navy-700 hover:text-white",
                  isActive && "bg-teal-600 text-white hover:bg-teal-600",
                  collapsed && "justify-center px-0",
                )
              }
            >
              <Icon className="size-6 shrink-0" aria-hidden="true" />
              <span className={cn(collapsed && "sr-only")}>{t(`common:nav.${key}`)}</span>
              {key === "notifications" && !!user?.unread_notifications && (
                <span className={cn("ml-auto rounded-full bg-warning-600 px-2 text-sm font-bold text-navy-900", collapsed && "sr-only")}>
                  {user.unread_notifications}
                  <span className="sr-only"> {t("common:notifications.unread")}</span>
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

interface SearchResults {
  properties: { id: number; name: string; district: string }[];
  units: { id: number; name: string; property_name: string }[];
  tenants: { id: number; full_name: string; unit_id: number; unit_name: string }[];
  requests: { id: number; reference: string; category: string; status: string }[];
}

function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const location = useLocation();
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => setQ(""), [location.pathname]);
  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => get<SearchResults>(`/api/search/?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });
  const r = results.data;
  const links: { to: string; label: string; kind: string }[] = r
    ? [
        ...r.properties.map((p) => ({ to: `/landlord/properties/${p.id}`, label: p.name, kind: t("common:search.property") })),
        ...r.units.map((u) => ({ to: `/landlord/units/${u.id}`, label: `${u.property_name} — ${u.name}`, kind: t("common:search.unit") })),
        ...r.tenants.map((x) => ({ to: `/landlord/units/${x.unit_id}`, label: `${x.full_name} (${x.unit_name})`, kind: t("common:search.tenant") })),
        ...r.requests.map((x) => ({ to: `/landlord/maintenance/${x.id}`, label: `${x.reference} — ${t(`maintenance:categories.${x.category}`)}`, kind: t("common:search.request") })),
      ]
    : [];
  return (
    <div className="relative w-full max-w-md" role="search">
      <label htmlFor="global-search" className="sr-only">{t("common:search.label")}</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
      <Input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common:search.placeholder")} className="pl-10" autoComplete="off"
        onKeyDown={(e) => { if (e.key === "Enter" && links[0]) navigate(links[0].to); if (e.key === "Escape") setQ(""); }} />
      {debounced.length >= 2 && q && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 rounded-xl border border-line bg-surface p-2 shadow-lg" aria-live="polite">
          {results.isPending ? (
            <p className="p-3 text-muted">{t("common:states.loading")}</p>
          ) : links.length === 0 ? (
            <p className="p-3 text-muted">{t("common:search.noResults")}</p>
          ) : (
            <ul>
              {links.map((l) => (
                <li key={l.to + l.label}>
                  <Link to={l.to} className="flex min-h-11 flex-col justify-center rounded-lg px-3 py-2 hover:bg-canvas">
                    <span className="font-semibold">{l.label}</span>
                    <span className="text-sm text-muted">{l.kind}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TopNavigation({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur lg:px-6">
      <button type="button" onClick={onOpenMenu} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-line px-3 font-semibold lg:hidden">
        <Menu className="size-6" aria-hidden="true" />
        {t("common:nav.menu")}
      </button>
      <div className="hidden flex-1 md:block">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitcher compact className="sm:[&_label]:not-sr-only" />
        <Link to="/landlord/notifications" className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-canvas" aria-label={t("common:notifications.ariaCount", { count: user?.unread_notifications ?? 0 })}>
          <Bell className="size-6" aria-hidden="true" />
          {!!user?.unread_notifications && <span className="absolute right-1 top-1 min-w-5 rounded-full bg-danger-700 px-1 text-center text-xs font-bold text-white" aria-hidden="true">{user.unread_notifications}</span>}
        </Link>
        <Link to="/landlord/settings" className="hidden min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-canvas sm:inline-flex">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-navy-800 font-bold text-white" aria-hidden="true">{user?.full_name?.[0] ?? "?"}</span>
          <span className="hidden max-w-40 truncate font-semibold xl:inline">{user?.full_name}</span>
          <span className="sr-only">{t("common:nav.settings")}</span>
        </Link>
        <button type="button" onClick={async () => { await logout(); navigate("/"); }} className="hidden min-h-11 items-center gap-2 rounded-xl px-3 font-semibold hover:bg-canvas sm:inline-flex">
          <LogOut className="size-5" aria-hidden="true" />
          <span className="hidden lg:inline">{t("common:auth.signOut")}</span>
          <span className="sr-only lg:hidden">{t("common:auth.signOut")}</span>
        </button>
      </div>
    </header>
  );
}

export default function LandlordLayout() {
  const { t } = useTranslation();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("rc-sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("rc-sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="skip-link">{t("common:nav.skipToContent")}</a>
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col bg-navy-800 lg:flex", collapsed ? "w-20" : "w-72")}>
        <div className={cn("flex items-center px-4 py-4", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <Brand />}
          <button type="button" onClick={toggle} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-200 hover:bg-navy-700" aria-label={collapsed ? t("common:nav.expandMenu") : t("common:nav.collapseMenu")} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen className="size-6" aria-hidden="true" /> : <PanelLeftClose className="size-6" aria-hidden="true" />}
          </button>
        </div>
        <AppSidebar collapsed={collapsed} />
        {!collapsed && user?.is_demo && <p className="m-3 rounded-lg bg-navy-700 p-3 text-sm text-slate-200">{t("common:demoAccount")}</p>}
      </aside>

      <RadixDialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-40 bg-navy-900/60 lg:hidden" />
          <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-sm flex-col bg-navy-800 lg:hidden" aria-describedby={undefined}>
            <div className="flex items-center justify-between px-4 py-4">
              <RadixDialog.Title asChild><span><Brand /></span></RadixDialog.Title>
              <RadixDialog.Close className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-white hover:bg-navy-700">
                <X className="size-6" aria-hidden="true" />
                {t("common:actions.close")}
              </RadixDialog.Close>
            </div>
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-navy-600 p-3">
              <button type="button" onClick={async () => { await logout(); navigate("/"); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 font-semibold text-slate-200 hover:bg-navy-700">
                <LogOut className="size-6" aria-hidden="true" />
                {t("common:auth.signOut")}
              </button>
            </div>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <div className="min-w-0 flex-1">
        <TopNavigation onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
