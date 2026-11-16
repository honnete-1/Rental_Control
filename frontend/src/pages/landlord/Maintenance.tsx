import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Columns3, List, Plus, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { MaintenanceRequestCard } from "@/components/cards";
import { Banner, EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { PriorityBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { get, post, qs, type Paginated } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useProperties, useUnits } from "@/lib/queries";
import type { MaintenanceRequest, RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CATEGORIES = ["plumbing", "electricity", "doors_windows", "walls_ceiling", "appliances", "other"];
export const STATUSES: RequestStatus[] = ["new", "under_review", "approved", "in_progress", "resolved", "closed"];

type Filters = Record<string, string | number | undefined>;

export function RequestList({ filters }: { filters: Filters }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["maintenance", filters],
    queryFn: () => get<Paginated<MaintenanceRequest>>(`/api/maintenance/${qs({ ...filters, page_size: 100 })}`),
  });
  return (
    <QueryState query={query}>
      {(data) =>
        data.results.length === 0 ? (
          <EmptyState icon={Wrench} title={t("maintenance:list.emptyTitle")} text={t("maintenance:list.emptyText")} />
        ) : (
          <>
            <p className="mb-3 text-muted" aria-live="polite">{t("maintenance:list.count", { count: data.count })}</p>
            <ul className="space-y-3">{data.results.map((r) => <li key={r.id}><MaintenanceRequestCard request={r} to={`/landlord/maintenance/${r.id}`} /></li>)}</ul>
          </>
        )
      }
    </QueryState>
  );
}

function Board({ filters }: { filters: Filters }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["maintenance", "board", filters],
    queryFn: () => get<Paginated<MaintenanceRequest>>(`/api/maintenance/${qs({ ...filters, status: undefined, page_size: 200 })}`),
  });
  return (
    <QueryState query={query}>
      {(data) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {STATUSES.map((s) => {
            const items = data.results.filter((r) => r.status === s);
            return (
              <section key={s} aria-labelledby={`col-${s}`} className="rounded-2xl bg-slate-100 p-3 dark:bg-navy-900">
                <h2 id={`col-${s}`} className="mb-3 flex items-center justify-between font-bold">{t(`maintenance:statuses.${s}`)}<span className="rounded-full bg-white px-2 text-sm dark:bg-navy-700">{items.length}</span></h2>
                <ul className="space-y-2">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link to={`/landlord/maintenance/${r.id}`} className="block rounded-xl border border-line bg-surface p-3 hover:border-teal-600">
                        <span className="block font-semibold">{t(`maintenance:categories.${r.category}`)}</span>
                        <span className="block text-sm text-muted">{r.property_name} · {r.unit_name}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">{r.reference} · {formatDate(r.created_at)}{r.priority === "urgent" && <PriorityBadge priority="urgent" />}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}

/** Landlords and managers can also record a problem they noticed themselves. */
function StaffReportDialog({ open, onOpenChange, defaultUnit }: { open: boolean; onOpenChange: (o: boolean) => void; defaultUnit?: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const units = useUnits();
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    unit: z.string().min(1, t("common:validation.required")),
    category: z.string().min(1, t("common:validation.required")),
    location_in_home: z.string().optional(),
    description: z.string().trim().min(5, t("maintenance:report.describeRequired")),
    priority: z.enum(["low", "normal", "urgent"]),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), values: { unit: defaultUnit ?? "", category: "", location_in_home: "", description: "", priority: "normal" } });
  const e = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("maintenance:staffReport")}>
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          const created = await post<MaintenanceRequest>("/api/maintenance/", { ...values, unit: Number(values.unit) });
          qc.invalidateQueries({ queryKey: ["maintenance"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          toast.show(t("maintenance:report.successTitle", { reference: created.reference }));
          onOpenChange(false);
          navigate(`/landlord/maintenance/${created.id}`);
        } catch (err) {
          setError(errorMessage(t, err));
        }
      })}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("properties:tenants.unit")} error={e.unit?.message}>
          <Select {...form.register("unit")}>
            <option value="">{t("common:form.choose")}</option>
            {units.data?.results.map((u) => <option key={u.id} value={u.id}>{u.property_name} — {u.name}</option>)}
          </Select>
        </Field>
        <Field label={t("maintenance:report.categoryLabel")} error={e.category?.message}>
          <Select {...form.register("category")}>
            <option value="">{t("common:form.choose")}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`maintenance:categories.${c}`)}</option>)}
          </Select>
        </Field>
        <Field label={t("maintenance:report.whereLabel")} optional><Input {...form.register("location_in_home")} /></Field>
        <Field label={t("maintenance:report.describeLabel")} error={e.description?.message}><Textarea {...form.register("description")} /></Field>
        <Field label={t("maintenance:detail.priority")}>
          <Select {...form.register("priority")}>
            {(["urgent", "normal", "low"] as const).map((p) => <option key={p} value={p}>{t(`maintenance:priorities.${p}`)}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button><Button type="submit" loading={form.formState.isSubmitting}>{t("maintenance:report.submit")}</Button></div>
      </form>
    </Dialog>
  );
}

export default function MaintenancePage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const properties = useProperties();
  const [view, setView] = useState<"list" | "board">(() => {
    try {
      return localStorage.getItem("rc-maint-view") === "board" ? "board" : "list";
    } catch {
      return "list";
    }
  });
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [reportOpen, setReportOpen] = useState(params.get("report") === "1");
  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (search) next.set("search", search);
      else next.delete("search");
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(id);
  }, [search, params, setParams]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "status") next.delete("open");
    setParams(next, { replace: true });
  };
  const filters: Filters = {
    status: params.get("status") ?? undefined,
    open: params.get("open") ?? undefined,
    priority: params.get("priority") ?? undefined,
    property: params.get("property") ?? undefined,
    category: params.get("category") ?? undefined,
    date_from: params.get("date_from") ?? undefined,
    date_to: params.get("date_to") ?? undefined,
    search: params.get("search") ?? undefined,
    ordering: params.get("ordering") ?? undefined,
  };
  const changeView = (v: "list" | "board") => {
    setView(v);
    try {
      localStorage.setItem("rc-maint-view", v);
    } catch {
      /* ignore */
    }
  };
  const statusValue = params.get("open") === "true" ? "open" : params.get("status") ?? "";

  return (
    <>
      <PageHeader title={t("common:nav.maintenance")} subtitle={t("maintenance:list.subtitle")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.maintenance") }]}
        actions={<Button onClick={() => setReportOpen(true)}><Plus aria-hidden="true" />{t("maintenance:staffReport")}</Button>} />

      <section aria-label={t("maintenance:list.filters")} className="mb-6 rounded-2xl border border-line bg-surface p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("common:search.label")}><Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("maintenance:list.searchPlaceholder")} /></Field>
          <Field label={t("maintenance:detail.status")}>
            <Select value={statusValue} onChange={(e) => { if (e.target.value === "open") { const n = new URLSearchParams(params); n.delete("status"); n.set("open", "true"); setParams(n, { replace: true }); } else setParam("status", e.target.value); }}>
              <option value="">{t("maintenance:list.allStatuses")}</option>
              <option value="open">{t("maintenance:list.openOnly")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`maintenance:statuses.${s}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("maintenance:detail.priority")}>
            <Select value={params.get("priority") ?? ""} onChange={(e) => setParam("priority", e.target.value)}>
              <option value="">{t("maintenance:list.allPriorities")}</option>
              {(["urgent", "normal", "low"] as const).map((p) => <option key={p} value={p}>{t(`maintenance:priorities.${p}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("common:nav.properties")}>
            <Select value={params.get("property") ?? ""} onChange={(e) => setParam("property", e.target.value)}>
              <option value="">{t("maintenance:list.allProperties")}</option>
              {properties.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label={t("maintenance:report.categoryLabel")}>
            <Select value={params.get("category") ?? ""} onChange={(e) => setParam("category", e.target.value)}>
              <option value="">{t("maintenance:list.allCategories")}</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{t(`maintenance:categories.${c}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("maintenance:list.from")}><Input type="date" value={params.get("date_from") ?? ""} onChange={(e) => setParam("date_from", e.target.value)} /></Field>
          <Field label={t("maintenance:list.to")}><Input type="date" value={params.get("date_to") ?? ""} onChange={(e) => setParam("date_to", e.target.value)} /></Field>
          <Field label={t("maintenance:list.sort")}>
            <Select value={params.get("ordering") ?? ""} onChange={(e) => setParam("ordering", e.target.value)}>
              <option value="">{t("maintenance:list.newest")}</option>
              <option value="priority">{t("maintenance:list.mostUrgent")}</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => { setSearch(""); setParams({}, { replace: true }); }}>{t("maintenance:list.clearFilters")}</Button>
          <div role="group" aria-label={t("maintenance:list.view")} className="inline-flex rounded-xl border-2 border-line p-1">
            {([{ v: "list", icon: List }, { v: "board", icon: Columns3 }] as const).map(({ v, icon: Icon }) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => changeView(v)} className={cn("inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold", view === v && "bg-navy-800 text-white")}>
                <Icon className="size-5" aria-hidden="true" />{t(`maintenance:list.${v}View`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {view === "list" ? <RequestList filters={filters} /> : <Board filters={filters} />}
      <StaffReportDialog open={reportOpen} onOpenChange={(o) => { setReportOpen(o); if (!o && params.get("report")) setParam("report", ""); }} defaultUnit={params.get("unit") ?? undefined} />
    </>
  );
}
