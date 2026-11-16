import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Banner, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { ConditionBadge } from "@/components/StatusBadge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { del, get } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Inspection } from "@/lib/types";

/** Read-only view of one inspection, grouped by room. Used for both landlords and tenants. */
export function InspectionView({ inspection }: { inspection: Inspection }) {
  const { t } = useTranslation();
  const rooms = Array.from(new Set((inspection.items ?? []).map((i) => i.area)));
  return (
    <div className="space-y-6">
      <Card>
        <dl className="grid gap-3 sm:grid-cols-4">
          <div><dt className="text-sm text-muted">{t("inspections:wizard.typeLabel")}</dt><dd className="font-semibold">{t(`inspections:types.${inspection.inspection_type}`)}</dd></div>
          <div><dt className="text-sm text-muted">{t("inspections:wizard.date")}</dt><dd className="font-semibold">{formatDate(inspection.inspection_date)}</dd></div>
          <div><dt className="text-sm text-muted">{t("inspections:wizard.inspector")}</dt><dd className="font-semibold">{inspection.inspector_name}</dd></div>
          <div><dt className="text-sm text-muted">{t("maintenance:detail.status")}</dt><dd className="font-semibold">{t(`inspections:status.${inspection.status}`)}{inspection.completed_at && ` · ${formatDateTime(inspection.completed_at)}`}</dd></div>
        </dl>
        {inspection.summary && <p className="mt-4 whitespace-pre-line">{inspection.summary}</p>}
      </Card>
      {rooms.map((room) => {
        const items = (inspection.items ?? []).filter((i) => i.area === room);
        const photos = (inspection.photos ?? []).filter((p) => p.area === room);
        return (
          <section key={room} aria-labelledby={`room-${room}`} className="rounded-2xl border border-line bg-surface p-5">
            <h2 id={`room-${room}`} className="text-xl font-bold">{room}</h2>
            <ul className="mt-3 divide-y divide-line">
              {items.map((i) => (
                <li key={i.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-semibold">{t(`inspections:elements.${i.element}`)}</span>
                    {i.notes && <span className="block text-muted">{i.notes}</span>}
                  </span>
                  <ConditionBadge condition={i.condition} />
                </li>
              ))}
            </ul>
            {photos.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {photos.map((p) => <li key={p.id}><a href={p.image} target="_blank" rel="noreferrer"><img src={p.image} alt={p.caption || room} className="aspect-[4/3] w-full rounded-xl object-cover" /></a></li>)}
              </ul>
            )}
          </section>
        );
      })}
      {(inspection.photos ?? []).some((p) => !p.area) && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-xl font-bold">{t("inspections:wizard.generalPhoto")}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(inspection.photos ?? []).filter((p) => !p.area).map((p) => <li key={p.id}><img src={p.image} alt={p.caption || t("properties:passport.photo")} className="aspect-[4/3] w-full rounded-xl object-cover" /></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function InspectionDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({ queryKey: ["inspection", id], queryFn: () => get<Inspection>(`/api/inspections/${id}/`) });
  const remove = useMutation({
    mutationFn: () => del(`/api/inspections/${id}/`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["inspections"] }); toast.show(t("inspections:detail.deleted")); navigate("/landlord/inspections"); },
    onError: (e) => toast.show(errorMessage(t, e), "error"),
  });
  return (
    <QueryState query={query}>
      {(i) => (
        <>
          <PageHeader
            title={`${t(`inspections:types.${i.inspection_type}`)} — ${i.unit_name}`}
            subtitle={i.property_name}
            crumbs={[{ label: t("common:nav.inspections"), to: "/landlord/inspections" }, { label: i.property_name, to: `/landlord/properties/${i.property_id}` }, { label: i.unit_name, to: `/landlord/units/${i.unit}` }, { label: formatDate(i.inspection_date) }]}
            actions={i.status === "draft" ? (
              <>
                <ButtonLink to={`/landlord/inspections/new?draft=${i.id}`}><Pencil aria-hidden="true" />{t("inspections:detail.continue")}</ButtonLink>
                <Button variant="ghost" onClick={() => setConfirm(true)}><Trash2 aria-hidden="true" />{t("inspections:detail.deleteDraft")}</Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => window.print()}><Printer aria-hidden="true" />{t("inspections:detail.print")}</Button>
            )}
          />
          {i.status === "completed" ? (
            <Banner tone="info" className="mb-6" title={t("inspections:detail.lockedTitle")}><span className="inline-flex items-center gap-1"><Lock className="size-4" aria-hidden="true" />{t("inspections:detail.lockedText")}</span></Banner>
          ) : (
            <Banner tone="warning" className="mb-6">{t("inspections:detail.draftText")}</Banner>
          )}
          <InspectionView inspection={i} />
          <ConfirmationDialog open={confirm} onOpenChange={setConfirm} title={t("inspections:detail.deleteDraft")} message={t("inspections:detail.deleteConfirm")} confirmLabel={t("inspections:detail.deleteDraft")} onConfirm={() => remove.mutate()} loading={remove.isPending} />
        </>
      )}
    </QueryState>
  );
}
