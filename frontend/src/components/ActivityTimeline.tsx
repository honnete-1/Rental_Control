import { Camera, CheckCircle2, Flag, Hammer, MessageSquare, RefreshCw, UserCog, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDateTime } from "@/lib/format";
import type { MaintenanceUpdate } from "@/lib/types";

const ICONS: Record<string, LucideIcon> = {
  reported: Flag,
  status_changed: RefreshCw,
  note: MessageSquare,
  photo_added: Camera,
  repair_recorded: Hammer,
  provider_assigned: UserCog,
  priority_changed: Flag,
};

/** The history of a request, oldest first, in plain words. Entries can never be edited. */
export function ActivityTimeline({ updates, viewer }: { updates: MaintenanceUpdate[]; viewer: "staff" | "tenant" }) {
  const { t } = useTranslation();
  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-6">
      {updates.map((u) => {
        const Icon = u.kind === "status_changed" && u.to_status === "resolved" ? CheckCircle2 : ICONS[u.kind] ?? MessageSquare;
        let title: string;
        if (u.kind === "status_changed") {
          title = viewer === "tenant" ? t(`maintenance:tenantStatus.${u.to_status}`) : t("maintenance:timeline.statusChanged", { status: t(`maintenance:statuses.${u.to_status}`) });
        } else if (u.kind === "priority_changed") {
          title = t("maintenance:timeline.priority_changed", { priority: t(`maintenance:priorities.${u.message}`) });
        } else if (u.kind === "photo_added") {
          title = t("maintenance:timeline.photo_added");
        } else {
          title = t(`maintenance:timeline.${u.kind}`);
        }
        const showMessage = u.message && !["priority_changed", "photo_added"].includes(u.kind);
        return (
          <li key={u.id} className="relative">
            <span className="absolute -left-[2.35rem] top-0 inline-flex size-8 items-center justify-center rounded-full border-2 border-teal-600 bg-surface text-teal-600">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <p className="font-semibold">{title}</p>
            <p className="text-sm text-muted">
              {formatDateTime(u.created_at)}
              {u.author_name && ` · ${u.author_name}`}
              {viewer === "staff" && !u.visible_to_tenant && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-semibold text-slate-700">{t("maintenance:timeline.internal")}</span>}
            </p>
            {showMessage && <p className="mt-1 whitespace-pre-line rounded-xl bg-canvas p-3">{u.message}</p>}
          </li>
        );
      })}
    </ol>
  );
}
