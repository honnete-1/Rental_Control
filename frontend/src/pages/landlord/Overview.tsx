import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, DoorOpen, HandCoins, Hammer, Plus, Receipt, Users, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { DashboardMetricCard } from "@/components/cards";
import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { get } from "@/lib/api";
import { formatDate, formatMoney, relativeTime } from "@/lib/format";
import type { Priority, RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttentionItem {
  type: "maintenance" | "rent_overdue" | "vacant_unit";
  id: number;
  link: string;
  reference?: string;
  category?: string;
  priority?: Priority;
  status?: RequestStatus;
  unit_name: string;
  property_name: string;
  created_at?: string;
  tenant_name?: string;
  outstanding?: number;
}

interface Dashboard {
  properties: number;
  units: number;
  occupied_units: number;
  vacant_units: number;
  open_requests: number;
  urgent_requests: number;
  new_requests: number;
  needs_attention: AttentionItem[];
  recent_repairs: { id: number; description: string; unit_name: string; property_name: string; completed_on: string; cost: number | null; request_id: number | null }[];
  maintenance_spending_this_month: number | null;
  finance: null | { rent_received: number; rent_due: number; outstanding: number; total_expenses: number; net_cash_flow: number; overdue_tenants: number; period_from: string; period_to: string };
  recent_activity: { id: number; action: string; actor: string | null; created_at: string; details: Record<string, unknown> }[];
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const { t } = useTranslation();
  const tone = item.type === "maintenance" && item.priority === "urgent" ? "danger" : item.type === "vacant_unit" ? "info" : "warning";
  const border = { danger: "border-danger-700", warning: "border-warning-700", info: "border-navy-600" }[tone];
  let title = "";
  let detail = `${item.property_name} · ${item.unit_name}`;
  if (item.type === "maintenance") {
    title = t(`maintenance:categories.${item.category}`);
    detail += ` · ${item.reference} · ${relativeTime(item.created_at!)}`;
  } else if (item.type === "rent_overdue") {
    title = t("common:dashboard.rentOverdue", { name: item.tenant_name, amount: formatMoney(item.outstanding) });
  } else {
    title = t("common:dashboard.vacantUnit");
  }
  return (
    <li>
      <Link to={item.link} className={cn("flex flex-col gap-2 rounded-xl border-l-4 bg-surface p-4 shadow-sm hover:bg-canvas sm:flex-row sm:items-center", border)}>
        <div className="flex-1">
          <p className="font-bold">{title}</p>
          <p className="text-sm text-muted">{detail}</p>
        </div>
        {item.type === "maintenance" && (
          <div className="flex flex-wrap gap-2">
            {item.priority && item.priority !== "normal" && <PriorityBadge priority={item.priority} />}
            {item.status && <StatusBadge status={item.status} />}
          </div>
        )}
      </Link>
    </li>
  );
}

export default function OverviewPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => get<Dashboard>("/api/dashboard/landlord/") });

  return (
    <>
      <PageHeader title={t("common:dashboard.greeting", { name: user?.full_name?.split(" ")[0] })} subtitle={t("common:dashboard.subtitle")} />
      <QueryState query={query} skeletonLines={4}>
        {(d) =>
          d.properties === 0 ? (
            <EmptyState icon={Building2} title={t("common:dashboard.emptyTitle")} text={user?.role === "manager" ? t("common:dashboard.emptyManager") : t("common:dashboard.emptyText")}
              action={user?.role === "landlord" && <ButtonLink to="/landlord/properties/new" size="lg"><Plus aria-hidden="true" />{t("properties:addProperty")}</ButtonLink>} />
          ) : (
            <div className="space-y-8">
              <section aria-labelledby="attention-title">
                <h2 id="attention-title" className="mb-3 flex items-center gap-2 text-xl font-bold">
                  <AlertTriangle className="size-6 text-warning-700" aria-hidden="true" />
                  {t("common:dashboard.needsAttention")}
                </h2>
                {d.needs_attention.length === 0 ? (
                  <div className="flex items-center gap-3 rounded-xl border-l-4 border-success-700 bg-success-50 p-4 font-semibold text-success-700">
                    <CheckCircle2 className="size-6" aria-hidden="true" />
                    {t("common:dashboard.allGood")}
                  </div>
                ) : (
                  <ul className="space-y-2">{d.needs_attention.map((item) => <AttentionRow key={`${item.type}-${item.id}`} item={item} />)}</ul>
                )}
              </section>

              <section aria-labelledby="summary-title">
                <h2 id="summary-title" className="mb-3 text-xl font-bold">{t("common:dashboard.summary")}</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <DashboardMetricCard icon={Building2} label={t("common:dashboard.properties")} value={d.properties} to="/landlord/properties" />
                  <DashboardMetricCard icon={DoorOpen} label={t("common:dashboard.units")} value={d.units} hint={t("common:dashboard.occupiedVacant", { occupied: d.occupied_units, vacant: d.vacant_units })} to="/landlord/tenants" />
                  <DashboardMetricCard icon={Wrench} label={t("common:dashboard.openRequests")} value={d.open_requests} hint={d.new_requests ? t("common:dashboard.newCount", { count: d.new_requests }) : undefined} to="/landlord/maintenance?open=true" tone={d.open_requests ? "warning" : "default"} />
                  <DashboardMetricCard icon={AlertTriangle} label={t("common:dashboard.urgentRequests")} value={d.urgent_requests} to="/landlord/maintenance?open=true&priority=urgent" tone={d.urgent_requests ? "danger" : "default"} />
                </div>
              </section>

              {d.finance && (
                <section aria-labelledby="money-title">
                  <h2 id="money-title" className="mb-1 text-xl font-bold">{t("common:dashboard.moneyThisMonth")}</h2>
                  <p className="mb-3 text-sm text-muted">{formatDate(d.finance.period_from)} – {formatDate(d.finance.period_to)}</p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <DashboardMetricCard icon={HandCoins} label={t("finances:summary.rentReceived")} value={formatMoney(d.finance.rent_received)} to="/landlord/finances" />
                    <DashboardMetricCard icon={AlertTriangle} label={t("finances:summary.outstanding")} value={formatMoney(d.finance.outstanding)} hint={d.finance.overdue_tenants ? t("common:dashboard.overdueTenants", { count: d.finance.overdue_tenants }) : undefined} to="/landlord/finances" tone={d.finance.outstanding ? "warning" : "default"} />
                    <DashboardMetricCard icon={Hammer} label={t("finances:summary.maintenanceSpending")} value={formatMoney(d.maintenance_spending_this_month)} to="/landlord/expenses?category=repair" />
                    <DashboardMetricCard icon={Receipt} label={t("finances:summary.netCashFlow")} value={formatMoney(d.finance.net_cash_flow)} hint={t("finances:summary.notProfitNote")} to="/landlord/finances" />
                  </div>
                </section>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardTitle>{t("common:dashboard.quickActions")}</CardTitle>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {user?.role === "landlord" && <ButtonLink to="/landlord/properties/new" variant="secondary"><Plus aria-hidden="true" />{t("properties:addProperty")}</ButtonLink>}
                    <ButtonLink to="/landlord/inspections/new" variant="secondary"><ClipboardCheck aria-hidden="true" />{t("inspections:newInspection")}</ButtonLink>
                    <ButtonLink to="/landlord/expenses?new=1" variant="secondary"><Receipt aria-hidden="true" />{t("finances:expenses.add")}</ButtonLink>
                    <ButtonLink to="/landlord/finances?pay=1" variant="secondary"><HandCoins aria-hidden="true" />{t("finances:rent.recordPayment")}</ButtonLink>
                    <ButtonLink to="/landlord/tenants" variant="secondary"><Users aria-hidden="true" />{t("properties:tenants.invite")}</ButtonLink>
                  </div>
                </Card>
                <Card>
                  <CardTitle>{t("common:dashboard.recentRepairs")}</CardTitle>
                  {d.recent_repairs.length === 0 ? (
                    <p className="mt-3 text-muted">{t("common:dashboard.noRepairs")}</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-line">
                      {d.recent_repairs.map((r) => (
                        <li key={r.id} className="py-3">
                          <Link to={r.request_id ? `/landlord/maintenance/${r.request_id}` : `/landlord/units/${r.id}`} className="block hover:underline">
                            <span className="font-semibold">{r.description}</span>
                            <span className="block text-sm text-muted">{r.property_name} · {r.unit_name} · {formatDate(r.completed_on)}{r.cost !== null && ` · ${formatMoney(r.cost)}`}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              {d.recent_activity.length > 0 && (
                <Card>
                  <CardTitle>{t("common:dashboard.recentActivity")}</CardTitle>
                  <ul className="mt-3 divide-y divide-line">
                    {d.recent_activity.map((a) => (
                      <li key={a.id} className="py-2.5">
                        <span className="font-medium">{t(`common:activity.${a.action}`, { defaultValue: a.action })}</span>
                        <span className="block text-sm text-muted">{a.actor ?? t("common:activity.system")} · {relativeTime(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )
        }
      </QueryState>
    </>
  );
}
