import { ChevronRight, Home } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export interface Crumb {
  label: string;
  to?: string;
}

/** Page title + breadcrumbs ("where am I?") + main actions. Also sets the browser tab title. */
export function PageHeader({ title, subtitle, crumbs, actions }: { title: string; subtitle?: ReactNode; crumbs?: Crumb[]; actions?: ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${title} · Rental_Control`;
  }, [title]);
  return (
    <header className="mb-6 space-y-3">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label={t("common:nav.breadcrumb")}>
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-4" aria-hidden="true" />}
                {c.to ? (
                  <Link to={c.to} className="inline-flex min-h-11 items-center gap-1 font-medium text-teal-600 underline">
                    {i === 0 && <Home className="size-4" aria-hidden="true" />}
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
