import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AccessibleDataTable } from "@/components/AccessibleDataTable";
import { DashboardMetricCard } from "@/components/cards";
import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { get } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import type { RentCharge } from "@/lib/types";
import { ChargesTable } from "../landlord/RentTenancy";

interface MyPayments {
  enabled: boolean;
  reason?: string;
  monthly_rent?: number;
  charges?: RentCharge[];
  total_due_to_date?: number;
  total_paid?: number;
  outstanding?: number;
  payments?: { id: number; amount: number; paid_on: string; method: string; reference: string }[];
}

export default function TenantPaymentsPage() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["my-payments"], queryFn: () => get<MyPayments>("/api/my-payments/") });
  return (
    <>
      <PageHeader title={t("common:tenant.myPayments")} crumbs={[{ label: t("common:nav.myHome"), to: "/tenant" }, { label: t("common:tenant.myPayments") }]} />
      <QueryState query={query}>
        {(d) => !d.enabled ? <EmptyState icon={HandCoins} title={t("common:tenant.paymentsOff")} /> : (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-3">
              <DashboardMetricCard icon={HandCoins} label={t("finances:rent.monthlyRent")} value={formatMoney(d.monthly_rent)} />
              <DashboardMetricCard icon={HandCoins} label={t("finances:rent.totalPaid")} value={formatMoney(d.total_paid)} />
              <DashboardMetricCard icon={HandCoins} label={t("finances:summary.outstanding")} value={formatMoney(d.outstanding)} tone={d.outstanding ? "warning" : "default"} />
            </div>
            {d.charges && d.charges.length > 0 && <ChargesTable charges={d.charges} />}
            {d.payments && d.payments.length > 0 && (
              <AccessibleDataTable caption={t("finances:rent.payments")} rows={d.payments} rowKey={(r) => r.id} columns={[
                { key: "date", header: t("finances:rent.paidOn"), cell: (r) => formatDate(r.paid_on) },
                { key: "amount", header: t("finances:rent.amountReceived"), align: "right", cell: (r) => formatMoney(r.amount) },
                { key: "method", header: t("finances:rent.method"), cell: (r) => t(`finances:methods.${r.method}`) },
              ]} />
            )}
            <p className="text-sm text-muted">{t("common:tenant.paymentsNote")}</p>
          </div>
        )}
      </QueryState>
    </>
  );
}
