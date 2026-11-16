import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Banner } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { post } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import { formatMoney, todayISO } from "@/lib/format";
import type { RentRow } from "@/lib/types";

export const METHODS = ["cash", "mobile_money", "bank", "other"];

/** Records rent money already received. Rental_Control does not move any money itself. */
export function RecordPaymentDialog({ open, onOpenChange, rows, tenancyId }: { open: boolean; onOpenChange: (o: boolean) => void; rows: RentRow[]; tenancyId?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    tenancy: z.string().min(1, t("common:validation.required")),
    amount: z.string().trim().regex(/^[\d\s,]+$/, t("common:validation.wholeNumber")).refine((v) => Number(v.replace(/[\s,]/g, "")) > 0, t("finances:expenses.amountPositive")),
    paid_on: z.string().min(1, t("common:validation.required")),
    method: z.string(),
    reference: z.string().optional(),
  });
  type Values = z.infer<typeof schema>;
  const initial = rows.find((r) => r.tenancy_id === tenancyId);
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { tenancy: tenancyId ? String(tenancyId) : "", amount: initial ? String(initial.next_due?.balance || initial.monthly_rent || "") : "", paid_on: todayISO(), method: "mobile_money", reference: "" } });
  const e = form.formState.errors;
  const selected = rows.find((r) => String(r.tenancy_id) === form.watch("tenancy"));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("finances:rent.recordPayment")} description={t("finances:rent.recordHelp")}>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit(async (v) => {
        setError(null);
        try {
          await post("/api/rent/payments/", { ...v, tenancy: Number(v.tenancy), amount: Number(v.amount.replace(/[\s,]/g, "")) });
          ["rent", "finance", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
          toast.show(t("finances:rent.paymentSaved"));
          form.reset();
          onOpenChange(false);
        } catch (err) {
          if (!applyFieldErrors(t, err, form.setError, ["tenancy", "amount", "paid_on", "method", "reference"])) setError(errorMessage(t, err));
        }
      })}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("finances:rent.tenant")} error={e.tenancy?.message}>
          <Select {...form.register("tenancy")} disabled={!!tenancyId}>
            <option value="">{t("common:form.choose")}</option>
            {rows.map((r) => <option key={r.tenancy_id} value={r.tenancy_id}>{r.tenant_name} — {r.property_name}, {r.unit_name}</option>)}
          </Select>
        </Field>
        {selected && <p className="text-sm text-muted">{t("finances:rent.owesNow", { amount: formatMoney(selected.outstanding), rent: formatMoney(selected.monthly_rent) })}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("finances:rent.amountReceived")} hint={t("finances:amountHint")} error={e.amount?.message}><Input inputMode="numeric" {...form.register("amount")} /></Field>
          <Field label={t("finances:rent.paidOn")} error={e.paid_on?.message}><Input type="date" {...form.register("paid_on")} /></Field>
        </div>
        <Field label={t("finances:rent.method")}>
          <Select {...form.register("method")}>{METHODS.map((m) => <option key={m} value={m}>{t(`finances:methods.${m}`)}</option>)}</Select>
        </Field>
        <Field label={t("finances:rent.reference")} optional hint={t("finances:rent.referenceHint")}><Input {...form.register("reference")} /></Field>
        <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button><Button type="submit" loading={form.formState.isSubmitting}>{t("finances:rent.savePayment")}</Button></div>
      </form>
    </Dialog>
  );
}
