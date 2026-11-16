import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { ActivityTimeline } from "@/components/ActivityTimeline";
import { QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { PhotoUploader } from "@/components/PhotoUploader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, get, post, toFormData } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import type { MaintenanceDetail, RequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROGRESS: RequestStatus[] = ["new", "under_review", "approved", "in_progress", "resolved"];

/** A simple progress line: Reported → Reviewed → Approved → Repair started → Fixed. */
function ProgressSteps({ status }: { status: RequestStatus }) {
  const { t } = useTranslation();
  const current = status === "closed" ? PROGRESS.length - 1 : PROGRESS.indexOf(status);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t("maintenance:tenantProgress.label")}>
      {PROGRESS.map((s, i) => (
        <li key={s} className="text-center" aria-current={i === current ? "step" : undefined}>
          <span className={cn("mx-auto mb-1 block h-2 rounded-full", i <= current ? "bg-teal-600" : "bg-slate-300")} aria-hidden="true" />
          <span className={cn("text-xs sm:text-sm", i <= current ? "font-semibold" : "text-muted")}>
            {t(`maintenance:tenantProgress.${s}`)}
            {i <= current && <span className="sr-only"> ✓</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function TenantRequestDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const query = useQuery({ queryKey: ["tenant-request", id], queryFn: () => get<MaintenanceDetail>(`/api/maintenance/${id}/`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["tenant-request", id] });
  const addNote = useMutation({ mutationFn: () => post(`/api/maintenance/${id}/notes/`, { message: note }), onSuccess: () => { setNote(""); refresh(); toast.show(t("maintenance:detail.noteSent")); }, onError: (e) => toast.show(errorMessage(t, e), "error") });
  const upload = useMutation({
    mutationFn: async () => { for (const f of photos) await api(`/api/maintenance/${id}/photos/`, { method: "POST", body: toFormData({ image: f }) }); },
    onSuccess: () => { setPhotos([]); refresh(); toast.show(t("maintenance:detail.photosSaved")); },
    onError: (e) => toast.show(errorMessage(t, e), "error"),
  });
  return (
    <QueryState query={query}>
      {(r) => (
        <>
          <PageHeader title={t(`maintenance:categories.${r.category}`)} subtitle={`${r.reference} · ${formatDate(r.created_at)}`} crumbs={[{ label: t("common:nav.myHome"), to: "/tenant" }, { label: t("common:nav.myRequests"), to: "/tenant/requests" }, { label: r.reference }]} />
          <div className="space-y-6">
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center gap-3"><StatusBadge status={r.status} /></div>
              <p className="text-lg font-semibold">{t(`maintenance:tenantStatus.${r.status}`)}</p>
              <ProgressSteps status={r.status} />
              {r.provider_name && <p>{t("maintenance:detail.tenantProvider", { name: r.provider_name })}</p>}
              {r.repair && <p className="rounded-xl bg-success-50 p-3 text-success-700">{t("maintenance:detail.tenantRepairDone", { date: formatDate(r.repair.completed_on), what: r.repair.description })}</p>}
            </Card>
            <Card>
              <CardTitle>{t("maintenance:detail.yourReport")}</CardTitle>
              <p className="mt-2 whitespace-pre-line">{r.description}</p>
              {r.location_in_home && <p className="mt-2 text-muted">{t("maintenance:report.whereLabel")}: {r.location_in_home}</p>}
              <p className="mt-2 text-sm text-muted">{formatDateTime(r.created_at)}</p>
              {r.photos.length > 0 && (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {r.photos.map((p) => <li key={p.id}><img src={p.image} alt={t("maintenance:detail.photoAlt", { phase: t(`maintenance:phases.${p.phase}`), date: formatDate(p.created_at) })} className="aspect-[4/3] w-full rounded-xl object-cover" /></li>)}
                </ul>
              )}
            </Card>
            <Card>
              <CardTitle>{t("maintenance:detail.history")}</CardTitle>
              <div className="mt-4"><ActivityTimeline updates={r.updates} viewer="tenant" /></div>
            </Card>
            {r.status !== "closed" && (
              <Card className="space-y-4">
                <CardTitle>{t("maintenance:detail.tenantAddInfo")}</CardTitle>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
                  <Field label={t("maintenance:detail.messageToLandlord")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <Button type="submit" variant="secondary" disabled={!note.trim()} loading={addNote.isPending}><MessageSquare aria-hidden="true" />{t("maintenance:detail.send")}</Button>
                </form>
                <div className="border-t border-line pt-4">
                  <PhotoUploader files={photos} onChange={setPhotos} max={6} label={t("maintenance:detail.addMorePhotos")} onError={(m) => toast.show(m, "error")} />
                  {photos.length > 0 && <Button className="mt-3" onClick={() => upload.mutate()} loading={upload.isPending}><Camera aria-hidden="true" />{t("maintenance:detail.savePhotos")}</Button>}
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </QueryState>
  );
}
