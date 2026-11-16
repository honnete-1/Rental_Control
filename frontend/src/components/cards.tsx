import { AlertTriangle, Building2, ChevronRight, DoorOpen, Image as ImageIcon, MapPin, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { formatDate, formatMoney } from "@/lib/format";
import type { MaintenanceRequest, Property, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConditionBadge, OccupancyBadge, PriorityBadge, StatusBadge } from "./StatusBadge";

export function DashboardMetricCard({ icon: Icon, label, value, to, hint, tone = "default" }: { icon: LucideIcon; label: string; value: ReactNode; to?: string; hint?: string; tone?: "default" | "danger" | "warning" }) {
  const body = (
    <>
      <span className={cn("inline-flex size-12 shrink-0 items-center justify-center rounded-xl", tone === "danger" ? "bg-danger-50 text-danger-700" : tone === "warning" ? "bg-warning-50 text-warning-700" : "bg-teal-50 text-teal-600")}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-muted">{label}</span>
        <span className="block text-2xl font-bold text-navy-800 dark:text-white">{value}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      {to && <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />}
    </>
  );
  const cls = "flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm";
  return to ? <Link to={to} className={cn(cls, "hover:border-teal-600")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function PropertyCard({ property }: { property: Property }) {
  const { t } = useTranslation();
  const needsAttention = property.urgent_requests > 0 || property.open_requests > 0;
  return (
    <Link to={`/landlord/properties/${property.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm hover:border-teal-600">
      <div className="relative aspect-[16/9] bg-navy-50">
        {property.photo ? (
          <img src={property.photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-navy-600"><Building2 className="size-14" aria-hidden="true" /></div>
        )}
        {property.urgent_requests > 0 && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-danger-700 px-3 py-1 text-sm font-bold text-white">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t("properties:card.urgent", { count: property.urgent_requests })}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="text-lg font-bold group-hover:underline">{property.name}</h2>
        {(property.district || property.city) && (
          <p className="flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden="true" />{[property.district, property.city].filter(Boolean).join(", ")}</p>
        )}
        <dl className="mt-auto grid grid-cols-2 gap-2 pt-2 text-sm">
          <div>
            <dt className="text-muted">{t("properties:card.units")}</dt>
            <dd className="font-semibold">{t("properties:card.occupiedOf", { occupied: property.occupied_count, total: property.unit_count })}</dd>
          </div>
          <div>
            <dt className="text-muted">{t("properties:card.repairs")}</dt>
            <dd className={cn("flex items-center gap-1 font-semibold", needsAttention ? "text-warning-700" : "text-success-700")}>
              <Wrench className="size-4" aria-hidden="true" />
              {needsAttention ? t("properties:card.openRequests", { count: property.open_requests }) : t("properties:card.allGood")}
            </dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}

export function UnitCard({ unit }: { unit: Unit }) {
  const { t } = useTranslation();
  return (
    <Link to={`/landlord/units/${unit.id}`} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:border-teal-600">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-navy-50 text-navy-800"><DoorOpen className="size-6" aria-hidden="true" /></span>
          <div>
            <h3 className="text-lg font-bold">{unit.name}</h3>
            <p className="text-sm text-muted">{t(`properties:unitTypes.${unit.unit_type}`)}{unit.bedrooms ? ` · ${t("properties:unit.bedroomsCount", { count: unit.bedrooms })}` : ""}</p>
          </div>
        </div>
        <ChevronRight className="size-5 text-muted" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap gap-2">
        <OccupancyBadge occupancy={unit.occupancy} />
        {unit.latest_condition && <ConditionBadge condition={unit.latest_condition.overall} />}
        {unit.open_requests > 0 && <span className="inline-flex items-center gap-1 rounded-full border border-warning-700 bg-warning-50 px-2.5 py-1 text-sm font-semibold text-warning-700"><Wrench className="size-4" aria-hidden="true" />{t("properties:card.openRequests", { count: unit.open_requests })}</span>}
      </div>
      <p className="text-sm">
        {unit.current_tenancy ? t("properties:unit.tenantIs", { name: unit.current_tenancy.tenant.full_name }) : unit.pending_invitation ? t("properties:unit.invitedPerson", { name: unit.pending_invitation.full_name }) : t("properties:unit.noTenant")}
        {unit.monthly_rent ? ` · ${formatMoney(unit.monthly_rent)}/${t("finances:perMonth")}` : ""}
      </p>
    </Link>
  );
}

export function MaintenanceRequestCard({ request, to }: { request: MaintenanceRequest; to: string }) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="flex gap-4 rounded-2xl border border-line bg-surface p-4 shadow-sm hover:border-teal-600">
      <div className="hidden size-20 shrink-0 overflow-hidden rounded-xl bg-navy-50 sm:block">
        {request.first_photo ? <img src={request.first_photo} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-navy-600"><ImageIcon className="size-7" aria-hidden="true" /></div>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={request.status} />
          {request.priority !== "normal" && <PriorityBadge priority={request.priority} />}
        </div>
        <h3 className="font-bold">{t(`maintenance:categories.${request.category}`)}{request.location_in_home ? ` — ${request.location_in_home}` : ""}</h3>
        <p className="line-clamp-2 text-muted">{request.description}</p>
        <p className="text-sm text-muted">
          {request.reference} · {request.property_name}, {request.unit_name} · {formatDate(request.created_at)}
        </p>
      </div>
      <ChevronRight className="size-5 shrink-0 self-center text-muted" aria-hidden="true" />
    </Link>
  );
}
