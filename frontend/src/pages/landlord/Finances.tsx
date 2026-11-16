import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, DoorOpen, HandCoins, Hammer, Info, Receipt, Scale } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { AccessibleDataTable } from "@/components/AccessibleDataTable";
import { DashboardMetricCard } from "@/components/cards";
import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { RentStatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { get, qs } from "@/lib/api";
import { firstOfMonthISO, formatMoney, formatMonth, todayISO } from "@/lib/format";
import { useProperties } from "@/lib/queries";
import type { FinanceSummary, RentRow } from "@/lib/types";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

function periodFor(choice: string): [string, string] {
  const today = todayISO();
  const [y, m] = today.split("-").map(Number);
  if (choice === "last_month") {
    const d = new Date(Date.UTC(y, m - 2, 1));
    const end = new Date(Date.UTC(y, m - 1, 0));
    return [d.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  }
  if (choice === "year") return [`${y}-01-01`, today];
  if (choice === "12_months") return [new Date(Date.UTC(y - 1, m, 1)).toISOString().slice(0, 10), today];
  return [firstOfMonthISO(), today];
}

/** A plain two-bar-per-month chart: money in vs money out. Values are also listed as text. */
function MonthlyBars({ months }: { months: FinanceSummary["months"] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...months.flatMap((m) => [m.rent_received, m.expenses]));
  return (
    <figure>
      <div className="flex items-end gap-3 overflow-x-auto pb-2" aria-hidden="true">
        {months.map((m) => (
          <div key={m.month} className="flex min-w-16 flex-col items-center gap-1">
            <div className="flex h-40 items-end gap-1">
              <div className="w-6 rounded-t bg-teal-600" style={{ height: `${(m.rent_received / max) * 100}%` }} />
              <div className="w-6 rounded-t bg-warning-600" style={{ height: `${(m.expenses / max) * 100}%` }} />
            </div>
            <span className="text-xs text-muted">{formatMonth(m.month)}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-teal-600" />{t("finances:summary.rentReceived")}</span>
        <span className="inline-flex items-center gap-2"><span className="size-3 rounded bg-warning-600" />{t("finances:summary.totalExpenses")}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{t("finances:summary.byMonth")}</caption>
        <thead><tr><th>{t("finances:summary.month")}</th><th>{t("finances:summary.rentReceived")}</th><th>{t("finances:summary.totalExpenses")}</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.month}><td>{formatMonth(m.month)}</td><td>{formatMoney(m.rent_received)}</td><td>{formatMoney(m.expenses)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export default function FinancesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const properties = useProperties();
  const [choice, setChoice] = useState("this_month");
  const [custom, setCustom] = useState<[string, string]>(periodFor("this_month"));
  const [from, to] = choice === "custom" ? custom : periodFor(choice);
  const property = params.get("property") ?? "";
  const [payOpen, setPayOpen] = useState(params.get("pay") === "1");
  const summary = useQuery({ queryKey: ["finance", from, to, property], queryFn: () => get<FinanceSummary>(`/api/finance/summary/${qs({ date_from: from, date_to: to, property })}`) });
  const rent = useQuery({ queryKey: ["rent", property], queryFn: () => get<RentRow[]>(`/api/rent/tenancies/${qs({ property })}`) });

  return (
    <>
      <PageHeader title={t("finances:title")} subtitle={t("finances:subtitle")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.finances") }]}
        actions={<Button size="lg" onClick={() => setPayOpen(true)} disabled={!rent.data?.length}><HandCoins aria-hidden="true" />{t("finances:rent.recordPayment")}</Button>} />

      <div className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("finances:period.label")}>
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            {["this_month", "last_month", "year", "12_months", "custom"].map((c) => <option key={c} value={c}>{t(`finances:period.${c}`)}</option>)}
          </Select>
        </Field>
        {choice === "custom" && (
          <>
            <Field label={t("maintenance:list.from")}><Input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} /></Field>
            <Field label={t("maintenance:list.to")}><Input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} /></Field>
          </>
        )}
        <Field label={t("common:nav.properties")}>
          <Select value={property} onChange={(e) => { const n = new URLSearchParams(params); if (e.target.value) n.set("property", e.target.value); else n.delete("property"); setParams(n, { replace: true }); }}>
            <option value="">{t("maintenance:list.allProperties")}</option>
            {properties.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      </div>

      <QueryState query={summary}>
        {(s) => (
          <div className="space-y-8">
            <section aria-labelledby="money-in">
              <h2 id="money-in" className="mb-3 text-xl font-bold">{t("finances:summary.moneyIn")}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <DashboardMetricCard icon={HandCoins} label={t("finances:summary.rentReceived")} value={formatMoney(s.rent_received)} hint={t("finances:summary.rentReceivedHint")} />
                <DashboardMetricCard icon={Scale} label={t("finances:summary.rentDue")} value={formatMoney(s.rent_due)} hint={t("finances:summary.rentDueHint")} />
                <DashboardMetricCard icon={AlertTriangle} label={t("finances:summary.outstanding")} value={formatMoney(s.outstanding)} hint={t("finances:summary.outstandingHint")} tone={s.outstanding ? "warning" : "default"} />
              </div>
            </section>
            <section aria-labelledby="money-out">
              <h2 id="money-out" className="mb-3 text-xl font-bold">{t("finances:summary.moneyOut")}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <DashboardMetricCard icon={Hammer} label={t("finances:summary.maintenanceSpending")} value={formatMoney(s.maintenance_expenses)} to="/landlord/expenses?category=repair" />
                <DashboardMetricCard icon={Receipt} label={t("finances:summary.otherExpenses")} value={formatMoney(s.other_expenses)} to="/landlord/expenses" />
                <DashboardMetricCard icon={DoorOpen} label={t("finances:summary.occupancy")} value={`${s.occupancy.occupied} / ${s.occupancy.units}`} hint={t("finances:summary.vacantCount", { count: s.occupancy.vacant })} />
              </div>
            </section>
            <Card className="border-2 border-navy-800">
              <p className="text-sm font-semibold text-muted">{t("finances:summary.netCashFlow")}</p>
              <p className={`text-3xl font-bold ${s.net_cash_flow < 0 ? "text-danger-700" : "text-navy-800 dark:text-white"}`}>{formatMoney(s.net_cash_flow)}</p>
              <p className="mt-1">{t("finances:summary.netFormula")}</p>
              <details className="mt-3">
                <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-teal-600"><Info className="size-5" aria-hidden="true" />{t("finances:summary.howCalculated")}</summary>
                <ul className="mt-2 list-disc space-y-1 pl-6 text-muted">
                  {["received", "due", "outstanding", "expenses", "net", "excluded"].map((k) => <li key={k}>{t(`finances:definitions.${k}`)}</li>)}
                </ul>
              </details>
            </Card>
            {s.months.length > 1 && (
              <Card>
                <CardTitle>{t("finances:summary.byMonth")}</CardTitle>
                <div className="mt-4"><MonthlyBars months={s.months} /></div>
              </Card>
            )}
            {s.per_property.length > 1 && (
              <section aria-labelledby="per-property">
                <h2 id="per-property" className="mb-3 text-xl font-bold">{t("finances:summary.perProperty")}</h2>
                <AccessibleDataTable caption={t("finances:summary.perProperty")} rows={s.per_property} rowKey={(r) => r.property_id} columns={[
                  { key: "name", header: t("common:search.property"), cell: (r) => <Link className="font-semibold text-teal-600 underline" to={`/landlord/properties/${r.property_id}`}>{r.property_name}</Link> },
                  { key: "due", header: t("finances:summary.rentDue"), align: "right", cell: (r) => formatMoney(r.rent_due) },
                  { key: "in", header: t("finances:summary.rentReceived"), align: "right", cell: (r) => formatMoney(r.rent_received) },
                  { key: "out", header: t("finances:summary.totalExpenses"), align: "right", cell: (r) => formatMoney(r.expenses) },
                  { key: "net", header: t("finances:summary.netCashFlow"), align: "right", cell: (r) => <span className="font-bold">{formatMoney(r.net_cash_flow)}</span> },
                ]} />
              </section>
            )}
          </div>
        )}
      </QueryState>

      <section aria-labelledby="rent-title" className="mt-10">
        <h2 id="rent-title" className="mb-3 text-xl font-bold">{t("finances:rent.title")}</h2>
        <QueryState query={rent}>
          {(rows) => rows.length === 0 ? <EmptyState icon={HandCoins} title={t("finances:rent.emptyTitle")} text={t("finances:rent.emptyText")} /> : (
            <AccessibleDataTable caption={t("finances:rent.title")} rows={rows} rowKey={(r) => r.tenancy_id} columns={[
              { key: "tenant", header: t("finances:rent.tenant"), cell: (r) => <Link className="font-semibold text-teal-600 underline" to={`/landlord/rent/${r.tenancy_id}`}>{r.tenant_name}</Link> },
              { key: "home", header: t("properties:tenants.unit"), cell: (r) => `${r.property_name} — ${r.unit_name}` },
              { key: "rent", header: t("finances:rent.monthlyRent"), align: "right", cell: (r) => formatMoney(r.monthly_rent) },
              { key: "next", header: t("finances:rent.status"), cell: (r) => r.overdue_count ? <RentStatusBadge status="overdue" /> : r.next_due ? <RentStatusBadge status={r.next_due.status} /> : <RentStatusBadge status="paid" /> },
              { key: "owed", header: t("finances:summary.outstanding"), align: "right", cell: (r) => <span className={r.outstanding ? "font-bold text-danger-700" : ""}>{formatMoney(r.outstanding)}</span> },
            ]} />
          )}
        </QueryState>
      </section>
      {rent.data && <RecordPaymentDialog open={payOpen} onOpenChange={(o) => { setPayOpen(o); if (!o && params.get("pay")) { params.delete("pay"); setParams(params, { replace: true }); } }} rows={rent.data} />}
    </>
  );
}
