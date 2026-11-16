import { AlertTriangle, CheckCircle2, Circle, CircleDot, Clock, HelpCircle, Hammer, Lock, Search, ThumbsUp, Zap, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Condition, Priority, RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Every badge shows an icon AND a word, so meaning never depends on colour alone. */
function Badge({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-sm font-semibold", className)}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

const STATUS: Record<RequestStatus, { icon: LucideIcon; cls: string }> = {
  new: { icon: CircleDot, cls: "border-navy-600 bg-navy-50 text-navy-800" },
  under_review: { icon: Search, cls: "border-warning-700 bg-warning-50 text-warning-700" },
  approved: { icon: ThumbsUp, cls: "border-teal-600 bg-teal-50 text-teal-700" },
  in_progress: { icon: Hammer, cls: "border-teal-600 bg-teal-50 text-teal-700" },
  resolved: { icon: CheckCircle2, cls: "border-success-700 bg-success-50 text-success-700" },
  closed: { icon: Lock, cls: "border-slate-400 bg-slate-100 text-slate-700" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useTranslation();
  const s = STATUS[status] ?? STATUS.new;
  return <Badge icon={s.icon} label={t(`maintenance:statuses.${status}`)} className={s.cls} />;
}

const CONDITION: Record<Condition, { icon: LucideIcon; cls: string }> = {
  good: { icon: CheckCircle2, cls: "border-success-700 bg-success-50 text-success-700" },
  needs_attention: { icon: AlertTriangle, cls: "border-warning-700 bg-warning-50 text-warning-700" },
  damaged: { icon: Zap, cls: "border-danger-700 bg-danger-50 text-danger-700" },
  not_checked: { icon: HelpCircle, cls: "border-slate-400 bg-slate-100 text-slate-700" },
};

export function ConditionBadge({ condition }: { condition: Condition }) {
  const { t } = useTranslation();
  const c = CONDITION[condition] ?? CONDITION.not_checked;
  return <Badge icon={c.icon} label={t(`inspections:conditions.${condition}`)} className={c.cls} />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  if (priority === "urgent") return <Badge icon={AlertTriangle} label={t("maintenance:priorities.urgent")} className="border-danger-700 bg-danger-50 text-danger-700" />;
  if (priority === "low") return <Badge icon={Clock} label={t("maintenance:priorities.low")} className="border-slate-400 bg-slate-100 text-slate-700" />;
  return <Badge icon={Circle} label={t("maintenance:priorities.normal")} className="border-slate-400 bg-white text-slate-700" />;
}

export function OccupancyBadge({ occupancy }: { occupancy: "occupied" | "vacant" | "invited" }) {
  const { t } = useTranslation();
  const map = {
    occupied: { icon: CheckCircle2, cls: "border-success-700 bg-success-50 text-success-700" },
    vacant: { icon: Circle, cls: "border-warning-700 bg-warning-50 text-warning-700" },
    invited: { icon: Clock, cls: "border-navy-600 bg-navy-50 text-navy-800" },
  }[occupancy];
  return <Badge icon={map.icon} label={t(`properties:occupancy.${occupancy}`)} className={map.cls} />;
}

export function RentStatusBadge({ status }: { status: "paid" | "overdue" | "partly_paid" | "due" | "upcoming" }) {
  const { t } = useTranslation();
  const map = {
    paid: { icon: CheckCircle2, cls: "border-success-700 bg-success-50 text-success-700" },
    overdue: { icon: AlertTriangle, cls: "border-danger-700 bg-danger-50 text-danger-700" },
    partly_paid: { icon: CircleDot, cls: "border-warning-700 bg-warning-50 text-warning-700" },
    due: { icon: Clock, cls: "border-warning-700 bg-warning-50 text-warning-700" },
    upcoming: { icon: Circle, cls: "border-slate-400 bg-slate-100 text-slate-700" },
  }[status];
  return <Badge icon={map.icon} label={t(`finances:chargeStatus.${status}`)} className={map.cls} />;
}
