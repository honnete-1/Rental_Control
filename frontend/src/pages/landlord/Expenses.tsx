import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { AccessibleDataTable } from "@/components/AccessibleDataTable";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Banner, EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, del, get, qs, toFormData, type Paginated } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { useProperties, useUnits } from "@/lib/queries";
import type { Expense } from "@/lib/types";

export const EXPENSE_CATEGORIES = ["repair", "utilities", "cleaning", "security", "insurance", "taxes_fees", "management", "other"];

function ExpenseDialog({ open, onOpenChange, propertyId }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const properties = useProperties();
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const schema = z.object({
    property: z.string().min(1, t("common:validation.required")),
    unit: z.string().optional(),
    category: z.string().min(1, t("common:validation.required")),
    amount: z.string().trim().regex(/^[\d\s,]+$/, t("common:validation.wholeNumber")).refine((v) => Number(v.replace(/[\s,]/g, "")) > 0, t("finances:expenses.amountPositive")),
    spent_on: z.string().min(1, t("common:validation.required")),
    description: z.string().trim().min(2, t("common:validation.required")),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { property: propertyId ? String(propertyId) : "", unit: "", category: "", amount: "", spent_on: todayISO(), description: "" } });
  const selectedProperty = form.watch("property");
  const units = useUnits(selectedProperty || undefined);
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("finances:expenses.add")} description={t("finances:expenses.addHelp")}>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit(async (v) => {
        setError(null);
        try {
          await api("/api/expenses/", { method: "POST", body: toFormData({ ...v, unit: v.unit || undefined, amount: v.amount.replace(/[\s,]/g, ""), receipt: receipt ?? undefined }) });
          qc.invalidateQueries({ queryKey: ["expenses"] });
          qc.invalidateQueries({ queryKey: ["finance"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          toast.show(t("finances:expenses.saved"));
          form.reset();
          setReceipt(null);
          onOpenChange(false);
        } catch (err) {
          if (!applyFieldErrors(t, err, form.setError, ["property", "unit", "category", "amount", "spent_on", "description"])) setError(errorMessage(t, err));
        }
      })}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("common:search.property")} error={e.property?.message}>
          <Select {...form.register("property")} disabled={!!propertyId}>
            <option value="">{t("common:form.choose")}</option>
            {properties.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label={t("properties:tenants.unit")} optional hint={t("finances:expenses.unitHint")}>
          <Select {...form.register("unit")}>
            <option value="">{t("finances:expenses.wholeProperty")}</option>
            {units.data?.results.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label={t("finances:expenses.category")} error={e.category?.message}>
          <Select {...form.register("category")}>
            <option value="">{t("common:form.choose")}</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`finances:categories.${c}`)}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("finances:expenses.amount")} hint={t("finances:amountHint")} error={e.amount?.message}><Input inputMode="numeric" {...form.register("amount")} /></Field>
          <Field label={t("finances:expenses.date")} error={e.spent_on?.message}><Input type="date" {...form.register("spent_on")} /></Field>
        </div>
        <Field label={t("finances:expenses.description")} hint={t("finances:expenses.descriptionHint")} error={e.description?.message}><Input {...form.register("description")} /></Field>
        <Field label={t("finances:expenses.receipt")} optional hint={t("finances:expenses.receiptHint")}>
          <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(ev) => setReceipt(ev.target.files?.[0] ?? null)} className="py-2.5" />
        </Field>
        <Banner tone="info">{t("finances:expenses.repairTip")}</Banner>
        <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button><Button type="submit" loading={form.formState.isSubmitting}>{t("finances:expenses.save")}</Button></div>
      </form>
    </Dialog>
  );
}

export function ExpenseList({ propertyId, filters = {} }: { propertyId?: number; filters?: Record<string, string | undefined> }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const query = useQuery({ queryKey: ["expenses", propertyId, filters], queryFn: () => get<Paginated<Expense>>(`/api/expenses/${qs({ property: propertyId, ...filters, page_size: 200 })}`) });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/api/expenses/${id}/`),
    onSuccess: () => { setToDelete(null); qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["finance"] }); toast.show(t("finances:expenses.deleted")); },
    onError: (e) => { setToDelete(null); toast.show(errorMessage(t, e), "error"); },
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setOpen(true)}><Plus aria-hidden="true" />{t("finances:expenses.add")}</Button></div>
      <QueryState query={query}>
        {(data) => data.results.length === 0 ? (
          <EmptyState icon={Receipt} title={t("finances:expenses.emptyTitle")} text={t("finances:expenses.emptyText")} />
        ) : (
          <AccessibleDataTable caption={t("finances:expenses.title")} rows={data.results} rowKey={(r) => r.id}
            footer={<span className="flex justify-between gap-4"><span>{t("finances:expenses.total", { count: data.count })}</span><span className="tabular-nums">{formatMoney(data.total_amount ?? 0)}</span></span>}
            columns={[
              { key: "date", header: t("finances:expenses.date"), cell: (r) => formatDate(r.spent_on) },
              { key: "desc", header: t("finances:expenses.description"), cell: (r) => (
                <span>
                  <span className="font-semibold">{r.description}</span>
                  {r.maintenance_reference && <Link className="ml-2 text-sm text-teal-600 underline" to={`/landlord/maintenance/${r.maintenance_request}`}>{r.maintenance_reference}</Link>}
                  {r.receipt && <a className="ml-2 inline-flex items-center gap-1 text-sm text-teal-600 underline" href={r.receipt} target="_blank" rel="noreferrer"><FileText className="size-4" aria-hidden="true" />{t("finances:expenses.receipt")}</a>}
                </span>
              ) },
              { key: "where", header: t("common:search.property"), cell: (r) => `${r.property_name}${r.unit_name ? ` — ${r.unit_name}` : ""}` },
              { key: "cat", header: t("finances:expenses.category"), cell: (r) => t(`finances:categories.${r.category}`) },
              { key: "amount", header: t("finances:expenses.amount"), align: "right", cell: (r) => <span className="font-semibold">{formatMoney(r.amount)}</span> },
              { key: "actions", header: t("common:actions.actions"), align: "right", cell: (r) => r.is_repair_cost ? <span className="text-sm text-muted">{t("finances:expenses.fromRepair")}</span> : (
                <Button variant="ghost" size="sm" onClick={() => setToDelete(r)}><Trash2 aria-hidden="true" />{t("common:actions.delete")}</Button>
              ) },
            ]} />
        )}
      </QueryState>
      <ExpenseDialog open={open} onOpenChange={setOpen} propertyId={propertyId} />
      <ConfirmationDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={t("finances:expenses.deleteTitle")} message={toDelete ? t("finances:expenses.deleteText", { description: toDelete.description, amount: formatMoney(toDelete.amount) }) : ""} confirmLabel={t("common:actions.delete")} onConfirm={() => toDelete && remove.mutate(toDelete.id)} loading={remove.isPending} />
    </div>
  );
}

export default function ExpensesPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const properties = useProperties();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const filters = { category: params.get("category") ?? undefined, date_from: params.get("date_from") ?? undefined, date_to: params.get("date_to") ?? undefined };
  const property = params.get("property");
  return (
    <>
      <PageHeader title={t("finances:expenses.title")} subtitle={t("finances:expenses.subtitle")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.expenses") }]} />
      <div className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t("common:nav.properties")}>
          <Select value={property ?? ""} onChange={(e) => set("property", e.target.value)}>
            <option value="">{t("maintenance:list.allProperties")}</option>
            {properties.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label={t("finances:expenses.category")}>
          <Select value={filters.category ?? ""} onChange={(e) => set("category", e.target.value)}>
            <option value="">{t("finances:expenses.allCategories")}</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`finances:categories.${c}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("maintenance:list.from")}><Input type="date" value={filters.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} /></Field>
        <Field label={t("maintenance:list.to")}><Input type="date" value={filters.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} /></Field>
      </div>
      <ExpenseList propertyId={property ? Number(property) : undefined} filters={filters} />
      <ExpenseAutoOpen />
    </>
  );
}

/** Opens the "Add an expense" form when arriving from a quick action (?new=1). */
function ExpenseAutoOpen() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get("new") === "1");
  return <ExpenseDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o && params.get("new")) { params.delete("new"); setParams(params, { replace: true }); } }} />;
}
