import { Bell, Home, ListChecks, LogOut, PlusCircle, UserRound, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";

const TABS: { to: string; key: string; icon: LucideIcon; end?: boolean; primary?: boolean }[] = [
  { to: "/tenant", key: "myHome", icon: Home, end: true },
  { to: "/tenant/requests", key: "myRequests", icon: ListChecks },
  { to: "/tenant/report", key: "reportProblem", icon: PlusCircle, primary: true },
  { to: "/tenant/notifications", key: "notifications", icon: Bell },
  { to: "/tenant/profile", key: "profile", icon: UserRound },
];

/** Mobile-first tenant portal: simple header and a labelled bottom tab bar. */
export default function TenantLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen pb-24 md:pb-8">
      <a href="#main" className="skip-link">{t("common:nav.skipToContent")}</a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
          <Link to="/tenant" className="flex min-h-11 items-center gap-2 font-bold text-navy-800 dark:text-white">
            <img src="/favicon.svg" alt="" className="size-8" />
            <span className="hidden sm:inline">Rental_Control</span>
          </Link>
          <nav aria-label={t("common:nav.main")} className="ml-4 hidden md:block">
            <ul className="flex gap-1">
              {TABS.map(({ to, key, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className={({ isActive }) => cn("inline-flex min-h-11 items-center rounded-xl px-3 font-semibold hover:bg-canvas", isActive && "bg-teal-50 text-teal-700")}>
                    {t(`common:nav.${key}`)}
                    {key === "notifications" && !!user?.unread_notifications && <span className="ml-1.5 rounded-full bg-danger-700 px-1.5 text-xs text-white">{user.unread_notifications}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher compact />
            <button type="button" onClick={async () => { await logout(); navigate("/"); }} className="hidden min-h-11 items-center gap-2 rounded-xl px-3 font-semibold hover:bg-canvas md:inline-flex">
              <LogOut className="size-5" aria-hidden="true" />
              {t("common:auth.signOut")}
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-6" tabIndex={-1}>
        <Outlet />
      </main>
      <nav aria-label={t("common:nav.tenantTabs")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map(({ to, key, icon: Icon, end, primary }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 text-center text-[0.7rem] font-semibold leading-tight",
                    isActive ? "text-teal-700" : "text-muted",
                    primary && "text-teal-700",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={cn("relative inline-flex items-center justify-center rounded-full", primary ? "size-11 bg-teal-600 text-white" : "size-7", isActive && !primary && "bg-teal-50")}>
                      <Icon className={primary ? "size-6" : "size-5"} aria-hidden="true" />
                      {key === "notifications" && !!user?.unread_notifications && <span className="absolute -right-1 -top-1 size-3 rounded-full bg-danger-700" aria-hidden="true" />}
                    </span>
                    <span>{t(`common:nav.${key}`)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
