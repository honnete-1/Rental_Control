import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router-dom";

import { homePathFor, useAuth } from "@/auth/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ButtonLink } from "@/components/ui/button";

export default function PublicLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">{t("common:nav.skipToContent")}</a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-h-11 items-center gap-2 text-lg font-bold text-navy-800 dark:text-white">
            <img src="/favicon.svg" alt="" className="size-9" />
            Rental_Control
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <LanguageSwitcher />
            {user ? (
              <ButtonLink to={homePathFor(user)}>{t("common:landing.openApp")}</ButtonLink>
            ) : (
              <ButtonLink to="/login" variant="secondary">{t("common:auth.signIn")}</ButtonLink>
            )}
          </div>
        </div>
      </header>
      <main id="main" className="flex-1" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm">
          <span className="text-muted">© {new Date().getFullYear()} Rental_Control</span>
          <Link to="/help" className="font-semibold text-teal-600 underline">{t("common:nav.help")}</Link>
          <Link to="/privacy" className="font-semibold text-teal-600 underline">{t("common:privacy.title")}</Link>
        </div>
      </footer>
    </div>
  );
}
