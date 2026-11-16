import { AlertTriangle, Info, CheckCircle2, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errors";
import { Button } from "./ui/button";

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-600">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h2 className="text-xl font-bold">{title}</h2>
      {text && <p className="mt-2 max-w-md text-muted">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("space-y-3", className)} role="status" aria-live="polite">
      <span className="sr-only">{t("common:states.loading")}</span>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200 dark:bg-navy-700" aria-hidden="true" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border-2 border-danger-700 bg-danger-50 p-6 text-danger-700" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-6 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-bold">{t("common:states.errorTitle")}</p>
          <p className="mt-1">{errorMessage(t, error)}</p>
          {onRetry && (
            <Button variant="secondary" className="mt-4" onClick={onRetry}>
              {t("common:actions.tryAgain")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const bannerTones = {
  info: { cls: "border-navy-600 bg-navy-50 text-navy-800", icon: Info },
  success: { cls: "border-success-700 bg-success-50 text-success-700", icon: CheckCircle2 },
  warning: { cls: "border-warning-700 bg-warning-50 text-warning-700", icon: AlertTriangle },
  danger: { cls: "border-danger-700 bg-danger-50 text-danger-700", icon: AlertTriangle },
};

export function Banner({ tone = "info", title, children, className }: { tone?: keyof typeof bannerTones; title?: string; children?: ReactNode; className?: string }) {
  const { cls, icon: Icon } = bannerTones[tone];
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border-l-4 p-4", cls, className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

/** Wraps a query result: loading, error and content states in one place. */
export function QueryState<T>({ query, children, skeletonLines }: { query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; children: (data: T) => ReactNode; skeletonLines?: number }) {
  if (query.isPending) return <LoadingSkeleton lines={skeletonLines} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data as T)}</>;
}
