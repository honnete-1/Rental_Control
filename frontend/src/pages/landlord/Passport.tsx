import { useQuery } from "@tanstack/react-query";
import { BookOpen, Camera, ClipboardCheck, Hammer, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { DashboardMetricCard } from "@/components/cards";
import { EmptyState, QueryState } from "@/components/feedback";
import { PhotoComparison } from "@/components/PhotoComparison";
import { ConditionBadge, StatusBadge } from "@/components/StatusBadge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { get } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { Passport } from "@/lib/types";

/** The Digital Property Passport: one dated, objective record of the unit's condition and repairs. */
export function DigitalPassport({ unitId }: { unitId: number }) {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["passport", unitId], queryFn: () => get<Passport>(`/api/units/${unitId}/passport/`) });
  return (
    <QueryState query={query}>
      {(p) => (
        <div className="space-y-8">
          <div className="flex flex-col gap-4 rounded-2xl bg-navy-800 p-5 text-white sm:flex-row sm:items-center">
            <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-teal-600"><BookOpen className="size-7" aria-hidden="true" /></span>
            <div className="flex-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-100">{t("properties:passport.title")}</p>
              <h2 className="text-2xl font-bold text-white">{p.unit.property_name} — {p.unit.name}</h2>
              <p className="text-slate-200">
                {t(`properties:unitTypes.${p.unit.unit_type}`)}
                {p.unit.bedrooms ? ` · ${t("properties:unit.bedroomsCount", { count: p.unit.bedrooms })}` : ""}
                {p.current_tenant ? ` · ${t("properties:passport.tenantSince", { name: p.current_tenant.full_name, date: formatDate(p.current_tenant.since) })}` : ` · ${t("properties:unit.noTenant")}`}
              </p>
            </div>
            <ButtonLink to={`/landlord/inspections/new?unit=${p.unit.id}`} className="bg-white text-navy-800 hover:bg-teal-50"><ClipboardCheck aria-hidden="true" />{t("inspections:newInspection")}</ButtonLink>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard icon={Wrench} label={t("properties:passport.openRequests")} value={p.totals.open_requests} tone={p.totals.open_requests ? "warning" : "default"} />
            <DashboardMetricCard icon={Hammer} label={t("properties:passport.completedRepairs")} value={p.totals.completed_repairs} />
            <DashboardMetricCard icon={ClipboardCheck} label={t("properties:passport.inspections")} value={p.totals.inspections} />
            {p.totals.repair_cost !== null && <DashboardMetricCard icon={Hammer} label={t("properties:passport.repairCost")} value={formatMoney(p.totals.repair_cost)} />}
          </div>

          <section aria-labelledby="latest-condition">
            <h3 id="latest-condition" className="mb-3 text-xl font-bold">{t("properties:passport.latestCondition")}</h3>
            {p.latest_condition ? (
              <Card>
                <p className="text-muted">{t("properties:passport.fromInspection", { type: t(`inspections:types.${p.latest_condition.inspection_type}`), date: formatDate(p.latest_condition.inspection_date) })} · <Link className="font-semibold text-teal-600 underline" to={`/landlord/inspections/${p.latest_condition.inspection_id}`}>{t("properties:passport.seeInspection")}</Link></p>
                {p.latest_condition.summary && <p className="mt-2">{p.latest_condition.summary}</p>}
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {p.latest_condition.rooms.map((room) => (
                    <li key={room.area} className="rounded-xl border border-line p-3">
                      <div className="flex items-center justify-between gap-2"><span className="font-bold">{room.area}</span><ConditionBadge condition={room.condition} /></div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {room.items.filter((i) => i.condition === "damaged" || i.condition === "needs_attention").map((i) => (
                          <li key={i.element}>{t(`inspections:elements.${i.element}`)}: {t(`inspections:conditions.${i.condition}`)}{i.notes ? ` — ${i.notes}` : ""}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <EmptyState icon={ClipboardCheck} title={t("properties:passport.noInspectionTitle")} text={t("properties:passport.noInspectionText")} action={<ButtonLink to={`/landlord/inspections/new?unit=${p.unit.id}`}>{t("inspections:newInspection")}</ButtonLink>} />
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle>{t("properties:passport.conditionHistory")}</CardTitle>
              {p.inspections.length === 0 ? <p className="mt-3 text-muted">{t("properties:passport.none")}</p> : (
                <ol className="mt-3 divide-y divide-line">
                  {p.inspections.map((i) => (
                    <li key={i.id}>
                      <Link to={`/landlord/inspections/${i.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:underline">
                        <span>
                          <span className="font-semibold">{t(`inspections:types.${i.inspection_type}`)} · {formatDate(i.inspection_date)}</span>
                          <span className="block text-sm text-muted">{i.inspector_name} · {t("inspections:list.photos", { count: i.photo_count })} · {t("inspections:list.problems", { count: i.problem_count })}</span>
                        </span>
                        {i.status === "draft" && <span className="rounded bg-warning-50 px-2 py-0.5 text-sm font-semibold text-warning-700">{t("inspections:status.draft")}</span>}
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card>
              <CardTitle>{t("properties:passport.maintenanceHistory")}</CardTitle>
              {p.maintenance.length === 0 ? <p className="mt-3 text-muted">{t("properties:passport.none")}</p> : (
                <ol className="mt-3 divide-y divide-line">
                  {p.maintenance.map((m) => (
                    <li key={m.id}>
                      <Link to={`/landlord/maintenance/${m.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2 hover:underline">
                        <span>
                          <span className="font-semibold">{t(`maintenance:categories.${m.category}`)}</span>
                          <span className="block text-sm text-muted">{m.reference} · {formatDate(m.created_at)}</span>
                        </span>
                        <StatusBadge status={m.status} />
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>

          <Card>
            <CardTitle>{t("properties:passport.repairs")}</CardTitle>
            {p.repairs.length === 0 ? <p className="mt-3 text-muted">{t("properties:passport.none")}</p> : (
              <ul className="mt-3 divide-y divide-line">
                {p.repairs.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 py-3">
                    <span>
                      <span className="font-semibold">{r.description}</span>
                      <span className="block text-sm text-muted">{formatDate(r.completed_on)}{r.provider_name && ` · ${r.provider_name}`}{r.request_reference && ` · ${r.request_reference}`}</span>
                    </span>
                    {r.cost !== null && <span className="font-bold tabular-nums">{formatMoney(r.cost)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section aria-labelledby="photos-title" className="space-y-4">
            <h3 id="photos-title" className="flex items-center gap-2 text-xl font-bold"><Camera className="size-6 text-teal-600" aria-hidden="true" />{t("properties:passport.photos")}</h3>
            {p.photos.length === 0 ? <p className="text-muted">{t("properties:passport.noPhotos")}</p> : (
              <>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {p.photos.map((ph) => (
                    <li key={ph.id}>
                      <figure className="overflow-hidden rounded-xl border border-line bg-surface">
                        <a href={ph.url} target="_blank" rel="noreferrer"><img src={ph.url} alt={ph.caption || ph.area || t("properties:passport.photo")} className="aspect-[4/3] w-full object-cover" loading="lazy" /></a>
                        <figcaption className="p-2 text-sm">
                          <span className="font-semibold">{formatDate(ph.date)}</span>
                          <span className="block text-muted">{ph.source === "inspection" ? t(`inspections:types.${ph.inspection_type}`) : ph.reference}{ph.area ? ` · ${ph.area}` : ""}</span>
                        </figcaption>
                      </figure>
                    </li>
                  ))}
                </ul>
                <Card>
                  <CardTitle>{t("inspections:compare.title")}</CardTitle>
                  <div className="mt-3"><PhotoComparison photos={p.photos} /></div>
                </Card>
              </>
            )}
          </section>
        </div>
      )}
    </QueryState>
  );
}
