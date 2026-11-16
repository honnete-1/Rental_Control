import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ME_KEY } from "@/auth/AuthContext";
import { get, post, type Paginated } from "@/lib/api";
import { formatMoney, relativeTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState, QueryState } from "./feedback";
import { Button } from "./ui/button";

/** Builds the sentence for a notification in the reader's language. */
export function useNotificationText() {
  const { t } = useTranslation();
  return (n: Notification) => {
    const p = { ...n.params } as Record<string, string | number>;
    if (p.status) p.status = t(`maintenance:statuses.${p.status}`);
    if (p.category) p.category = t(`maintenance:categories.${p.category}`);
    if (p.type) p.type = t(`inspections:types.${p.type}`);
    if (typeof p.amount === "number") p.amount = formatMoney(p.amount);
    const key = n.kind === "request_created" && n.params.priority === "urgent" ? "request_created_urgent" : n.kind;
    return t(`common:notifications.kinds.${key}`, p);
  };
}

export function NotificationList({ limit }: { limit?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const text = useNotificationText();
  const query = useQuery({ queryKey: ["notifications"], queryFn: () => get<Paginated<Notification>>("/api/notifications/") });
  const markRead = useMutation({
    mutationFn: (id: number) => post(`/api/notifications/${id}/read/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
  const readAll = useMutation({
    mutationFn: () => post("/api/notifications/read-all/"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });

  return (
    <QueryState query={query}>
      {(data) => {
        const items = limit ? data.results.slice(0, limit) : data.results;
        if (!items.length) return <EmptyState icon={Bell} title={t("common:notifications.emptyTitle")} text={t("common:notifications.emptyText")} />;
        const unread = data.results.some((n) => !n.is_read);
        return (
          <div className="space-y-3">
            {!limit && unread && (
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => readAll.mutate()} loading={readAll.isPending}>
                  <CheckCheck aria-hidden="true" />
                  {t("common:notifications.markAllRead")}
                </Button>
              </div>
            )}
            <ul className="space-y-2">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.is_read) markRead.mutate(n.id);
                      if (n.link) navigate(n.link);
                    }}
                    className={cn("flex w-full items-start gap-3 rounded-2xl border p-4 text-left hover:border-teal-600", n.is_read ? "border-line bg-surface" : "border-teal-600 bg-teal-50 dark:bg-navy-700")}
                  >
                    <span className={cn("mt-1.5 size-3 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-teal-600")} aria-hidden="true" />
                    <span className="flex-1">
                      {!n.is_read && <span className="mr-2 rounded bg-teal-600 px-1.5 py-0.5 text-xs font-bold uppercase text-white">{t("common:notifications.new")}</span>}
                      <span className={cn(!n.is_read && "font-semibold")}>{text(n)}</span>
                      <span className="mt-1 block text-sm text-muted">{relativeTime(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    </QueryState>
  );
}
