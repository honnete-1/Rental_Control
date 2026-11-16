import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { AccessibleDataTable } from "@/components/AccessibleDataTable";
import { DashboardMetricCard } from "@/components/cards";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { RentStatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { del, get } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import type { RentCharge, RentPayment, RentRow } from "@/lib/types";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

interface Ledger {
  tenancy_id: number;
  tenant_name: string;
  unit_name: string;
  property_name: string;
  monthly_rent: number;
  rent_due_day: number;
  start_date: string;
  is_active: boolean;
  charges: RentCharge[];
  total_due_to_date: number;
  total_paid: number;
  outstanding: number;
  credit: number;
  overdue_count: number;
  payments: RentPayment[];
}

export function ChargesTable({ charges }: { charges: RentCharge[] }) {
  const { t } = useTranslation();
  return (
    <AccessibleDataTable caption={t("finances:rent.months")} rows={[...charges].reverse()} rowKey={(r) => r.id} columns={[
      { key: "month", header: t("finances:summary.month"), cell: (r) => <span className="font-semibold">{formatMonth(r.period_start)}</span> },
      { key: "due", header: t("finances:rent.dueDate"), cell: (r) => formatDate(r.due_date) },
      { key: "amount", header: t("finances:rent.amountDue"), align: "right", cell: (r) => formatMoney(r.amount_due) },
      { key: "paid", header: t("finances:rent.amountPaid"), align: "right", cell: (r) => formatMoney(r.amount_paid) },
      { key: "status", header: t("finances:rent.status"), cell: (r) => <RentStatusBadge status={r.status} /> },
    ]} />
  );
}

export default function RentTenancyPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [payOpen, setPayOpen] = useState(false);
  const [toDelete, setToDelete] = useState<RentPayment | null>(null);
  const query = useQuery({ queryKey: ["rent", "ledger", id], queryFn: () => get<Ledger>(`/api/rent/tenancies/${id}/`) });
  const remove = useMutation({
    mutationFn: (pid: number) => del(`/api/rent/payments/${pid}/`),
    onSuccess: () => { setToDelete(null); ["rent", "finance", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast.show(t("finances:rent.paymentDeleted")); },
    onError: (e) => toast.show(errorMessage(t, e), "error"),
  });
  return (
    <QueryState query={query}>
      {(l) => {
        const row: RentRow = { tenancy_id: l.tenancy_id, tenant_name: l.tenant_name, tenant_phone: "", unit_id: 0, unit_name: l.unit_name, property_id: 0, property_name: l.property_name, monthly_rent: l.monthly_rent, rent_due_day: l.rent_due_day, is_active: l.is_active, total_due_to_date: l.total_due_to_date, total_paid: l.total_paid, outstanding: l.outstanding, overdue_count: l.overdue_count, next_due: l.charges.find((c) => c.status !== "paid") ?? null };
        return (
          <>
            <PageHeader title={t("finances:rent.ledgerTitle", { name: l.tenant_name })} subtitle={`${l.property_name} — ${l.unit_name} · ${t("finances:rent.dueDayValue", { day: l.rent_due_day })}`}
              crumbs={[{ label: t("common:nav.finances"), to: "/landlord/finances" }, { label: l.tenant_name }]}
              actions={<Button size="lg" onClick={() => setPayOpen(true)}><HandCoins aria-hidden="true" />{t("finances:rent.recordPayment")}</Button>} />
            <div className="mb-8 grid gap-3 sm:grid-cols-3">
              <DashboardMetricCard icon={HandCoins} label={t("finances:rent.totalDue")} value={formatMoney(l.total_due_to_date)} />
              <DashboardMetricCard icon={HandCoins} label={t("finances:rent.totalPaid")} value={formatMoney(l.total_paid)} />
              <DashboardMetricCard icon={HandCoins} label={t("finances:summary.outstanding")} value={formatMoney(l.outstanding)} tone={l.outstanding ? "danger" : "default"} hint={l.credit ? t("finances:rent.credit", { amount: formatMoney(l.credit) }) : undefined} />
            </div>
            <h2 className="mb-3 text-xl font-bold">{t("finances:rent.months")}</h2>
            {l.charges.length === 0 ? <p className="text-muted">{t("finances:rent.noCharges")}</p> : <ChargesTable charges={l.charges} />}
            <h2 className="mb-3 mt-8 text-xl font-bold">{t("finances:rent.payments")}</h2>
            {l.payments.length === 0 ? <p className="text-muted">{t("finances:rent.noPayments")}</p> : (
              <AccessibleDataTable caption={t("finances:rent.payments")} rows={l.payments} rowKey={(r) => r.id} columns={[
                { key: "date", header: t("finances:rent.paidOn"), cell: (r) => formatDate(r.paid_on) },
                { key: "amount", header: t("finances:rent.amountReceived"), align: "right", cell: (r) => <span className="font-semibold">{formatMoney(r.amount)}</span> },
                { key: "method", header: t("finances:rent.method"), cell: (r) => t(`finances:methods.${r.method}`) },
                { key: "ref", header: t("finances:rent.reference"), cell: (r) => r.reference || "—" },
                { key: "act", header: t("common:actions.actions"), align: "right", cell: (r) => <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}><Trash2 aria-hidden="true" />{t("common:actions.delete")}</Button> },
              ]} />
            )}
            <p className="mt-6 text-sm text-muted">{t("finances:rent.manualNote")}</p>
            <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} rows={[row]} tenancyId={l.tenancy_id} />
            <ConfirmationDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={t("finances:rent.deletePaymentTitle")} message={toDelete ? t("finances:rent.deletePaymentText", { amount: formatMoney(toDelete.amount), date: formatDate(toDelete.paid_on) }) : ""} confirmLabel={t("common:actions.delete")} onConfirm={() => toDelete && remove.mutate(toDelete.id)} loading={remove.isPending} />
          </>
        );
      }}
    </QueryState>
  );
}
