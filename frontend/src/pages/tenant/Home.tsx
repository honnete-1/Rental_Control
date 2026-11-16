import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronRight, ClipboardCheck, HandCoins, Home as HomeIcon, Mail, MapPin, Phone, PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Banner, EmptyState, QueryState } from "@/components/feedback";
import { useNotificationText } from "@/components/NotificationPanel";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { get, type Paginated } from "@/lib/api";
import { formatDate, formatMoney, relativeTime } from "@/lib/format";
import type { Inspection, Notification, RequestStatus } from "@/lib/types";

interface TenantDashboard {
  home: { unit_id: number; unit_name: string; property_name: string; district: string; city: string; photo: string | null } | null;
  active_requests: { id: number; reference: string; category: string; status: RequestStatus; description: string; created_at: string; updated_at: string }[];
  open_count: number;
  resolved_count: number;
  notifications: Notification[];
}

interface MyHome {
  tenancy: { start_date: string; monthly_rent: number; rent_due_day: number; share_payments_with_tenant: boolean } | null;
  landlord?: { full_name: string; phone: string; email: string };
}

export default function TenantHomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const text = useNotificationText();
  const dash = useQuery({ queryKey: ["tenant-dashboard"], queryFn: () => get<TenantDashboard>("/api/dashboard/tenant/") });
  const home = useQuery({ queryKey: ["my-home"], queryFn: () => get<MyHome>("/api/my-home/") });
  const inspections = useQuery({ queryKey: ["tenant-inspections"], queryFn: () => get<Paginated<Inspection>>("/api/inspections/") });

  return (
    <>
      <PageHeader title={t("common:tenant.welcome", { name: user?.full_name?.split(" ")[0] })} />
      {params.get("welcome") === "1" && <Banner tone="success" className="mb-6" title={t("common:tenant.joinedTitle")}>{t("common:tenant.joinedText")}</Banner>}
      <QueryState query={dash}>
        {(d) => !d.home ? (
          <EmptyState icon={HomeIcon} title={t("common:tenant.noHomeTitle")} text={t("common:tenant.noHomeText")} />
        ) : (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
              {d.home.photo && <img src={d.home.photo} alt="" className="h-40 w-full object-cover" />}
              <div className="p-5">
                <p className="text-sm font-semibold text-teal-600">{t("common:tenant.yourHome")}</p>
                <h2 className="text-2xl font-bold">{d.home.property_name} — {d.home.unit_name}</h2>
                {(d.home.district || d.home.city) && <p className="mt-1 flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden="true" />{[d.home.district, d.home.city].filter(Boolean).join(", ")}</p>}
              </div>
            </div>

            <ButtonLink to="/tenant/report" size="lg" full className="min-h-20 text-xl">
              <PlusCircle className="!size-7" aria-hidden="true" />
              {t("common:nav.reportProblem")}
            </ButtonLink>
            <p className="-mt-3 text-center text-muted">{t("common:tenant.reportHint")}</p>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{t("common:tenant.activeRequests")}</CardTitle>
                <Link to="/tenant/requests" className="inline-flex min-h-11 items-center font-semibold text-teal-600 underline">{t("common:tenant.seeAll")}</Link>
              </div>
              {d.active_requests.length === 0 ? <p className="mt-3 text-muted">{t("common:tenant.noActive")}</p> : (
                <ul className="mt-3 space-y-2">
                  {d.active_requests.map((r) => (
                    <li key={r.id}>
                      <Link to={`/tenant/requests/${r.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-teal-600">
                        <div className="flex-1">
                          <p className="font-semibold">{t(`maintenance:categories.${r.category}`)}</p>
                          <p className="text-sm text-muted">{r.reference} · {formatDate(r.created_at)}</p>
                          <p className="mt-1 text-sm">{t(`maintenance:tenantStatus.${r.status}`)}</p>
                        </div>
                        <StatusBadge status={r.status} />
                        <ChevronRight className="size-5 text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{t("common:tenant.recentUpdates")}</CardTitle>
                <Link to="/tenant/notifications" className="inline-flex min-h-11 items-center font-semibold text-teal-600 underline">{t("common:tenant.seeAll")}</Link>
              </div>
              {d.notifications.length === 0 ? <p className="mt-3 text-muted">{t("common:notifications.emptyTitle")}</p> : (
                <ul className="mt-3 space-y-2">
                  {d.notifications.map((n) => (
                    <li key={n.id}><Link to={n.link || "/tenant/notifications"} className="flex gap-3 rounded-xl p-2 hover:bg-canvas"><Bell className="mt-1 size-5 shrink-0 text-teal-600" aria-hidden="true" /><span className={n.is_read ? "" : "font-semibold"}>{text(n)}<span className="block text-sm font-normal text-muted">{relativeTime(n.created_at)}</span></span></Link></li>
                  ))}
                </ul>
              )}
            </Card>

            <QueryState query={home} skeletonLines={1}>
              {(h) => h.tenancy && (
                <Card>
                  <CardTitle>{t("common:tenant.homeDetails")}</CardTitle>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div><dt className="text-sm text-muted">{t("properties:tenants.since")}</dt><dd className="font-semibold">{formatDate(h.tenancy.start_date)}</dd></div>
                    {h.tenancy.monthly_rent > 0 && <div><dt className="text-sm text-muted">{t("finances:rent.monthlyRent")}</dt><dd className="font-semibold">{formatMoney(h.tenancy.monthly_rent)} · {t("finances:rent.dueDayValue", { day: h.tenancy.rent_due_day })}</dd></div>}
                  </dl>
                  {h.landlord && (
                    <div className="mt-4 rounded-xl bg-canvas p-4">
                      <p className="font-semibold">{t("common:tenant.landlordContact")}: {h.landlord.full_name}</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        {h.landlord.phone && <a href={`tel:${h.landlord.phone}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-teal-600 underline"><Phone className="size-5" aria-hidden="true" />{h.landlord.phone}</a>}
                        <a href={`mailto:${h.landlord.email}`} className="inline-flex min-h-11 items-center gap-2 font-semibold text-teal-600 underline"><Mail className="size-5" aria-hidden="true" />{h.landlord.email}</a>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    {h.tenancy.share_payments_with_tenant && <ButtonLink to="/tenant/payments" variant="secondary"><HandCoins aria-hidden="true" />{t("common:tenant.myPayments")}</ButtonLink>}
                  </div>
                </Card>
              )}
            </QueryState>

            <QueryState query={inspections} skeletonLines={1}>
              {(list) => list.results.length > 0 && (
                <Card>
                  <CardTitle>{t("common:tenant.conditionRecords")}</CardTitle>
                  <p className="mt-1 text-sm text-muted">{t("common:tenant.conditionRecordsHint")}</p>
                  <ul className="mt-3 space-y-2">
                    {list.results.map((i) => (
                      <li key={i.id}><Link to={`/tenant/inspections/${i.id}`} className="flex min-h-12 items-center gap-3 rounded-xl border border-line p-3 hover:border-teal-600"><ClipboardCheck className="size-5 text-teal-600" aria-hidden="true" /><span className="flex-1 font-semibold">{t(`inspections:types.${i.inspection_type}`)} · {formatDate(i.inspection_date)}</span><ChevronRight className="size-5 text-muted" aria-hidden="true" /></Link></li>
                    ))}
                  </ul>
                </Card>
              )}
            </QueryState>
          </div>
        )}
      </QueryState>
    </>
  );
}
