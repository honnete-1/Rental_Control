import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { get, qs, type Paginated } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useProperties } from "@/lib/queries";
import type { Inspection } from "@/lib/types";

export default function InspectionsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const properties = useProperties();
  const property = params.get("property") ?? "";
  const status = params.get("status") ?? "";
  const query = useQuery({ queryKey: ["inspections", property, status], queryFn: () => get<Paginated<Inspection>>(`/api/inspections/${qs({ property, status, page_size: 100 })}`) });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  return (
    <>
      <PageHeader title={t("inspections:list.title")} subtitle={t("inspections:list.subtitle")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.inspections") }]}
        actions={<ButtonLink to="/landlord/inspections/new" size="lg"><Plus aria-hidden="true" />{t("inspections:newInspection")}</ButtonLink>} />
      <div className="mb-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <Field label={t("common:nav.properties")}>
          <Select value={property} onChange={(e) => set("property", e.target.value)}>
            <option value="">{t("maintenance:list.allProperties")}</option>
            {properties.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label={t("maintenance:detail.status")}>
          <Select value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="">{t("maintenance:list.allStatuses")}</option>
            <option value="draft">{t("inspections:status.draft")}</option>
            <option value="completed">{t("inspections:status.completed")}</option>
          </Select>
        </Field>
      </div>
      <QueryState query={query}>
        {(data) => data.results.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t("inspections:list.emptyTitle")} text={t("inspections:list.emptyText")} action={<ButtonLink to="/landlord/inspections/new">{t("inspections:newInspection")}</ButtonLink>} />
        ) : (
          <ul className="space-y-3">
            {data.results.map((i) => (
              <li key={i.id}>
                <Link to={`/landlord/inspections/${i.id}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 hover:border-teal-600 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="font-bold">{t(`inspections:types.${i.inspection_type}`)} — {i.property_name}, {i.unit_name}</p>
                    <p className="text-sm text-muted">{formatDate(i.inspection_date)} · {i.inspector_name} · {t("inspections:list.photos", { count: i.photo_count })}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    {i.status === "draft" ? <span className="rounded-full border border-warning-700 bg-warning-50 px-2.5 py-1 font-semibold text-warning-700">{t("inspections:status.draft")}</span> : (
                      <>
                        <span className="rounded-full border border-success-700 bg-success-50 px-2.5 py-1 font-semibold text-success-700">{t("inspections:conditions.good")}: {i.counts.good}</span>
                        {i.counts.needs_attention > 0 && <span className="rounded-full border border-warning-700 bg-warning-50 px-2.5 py-1 font-semibold text-warning-700">{t("inspections:conditions.needs_attention")}: {i.counts.needs_attention}</span>}
                        {i.counts.damaged > 0 && <span className="rounded-full border border-danger-700 bg-danger-50 px-2.5 py-1 font-semibold text-danger-700">{t("inspections:conditions.damaged")}: {i.counts.damaged}</span>}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
