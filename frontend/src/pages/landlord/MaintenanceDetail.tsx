import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Hammer, MessageSquare, Phone, UserCog } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Banner, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PriorityBadge, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, get, patch, post, toFormData } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatDateTime, formatMoney, todayISO } from "@/lib/format";
import type { MaintenanceDetail, RequestStatus } from "@/lib/types";

const ACTION_ORDER: RequestStatus[] = ["under_review", "approved", "in_progress", "resolved", "closed"];

function RepairDialog({ req, open, onOpenChange }: { req: MaintenanceDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState({ description: "", provider_name: req.provider_name, provider_phone: req.provider_phone, completed_on: todayISO(), cost: "", notes: "", mark_resolved: true });
  const [error, setError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => post(`/api/maintenance/${req.id}/repair/`, { ...values, cost: values.cost ? Number(values.cost.replace(/[\s,]/g, "")) : 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.show(t("maintenance:repair.saved"));
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(t, e)),
  });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("maintenance:repair.title")} description={t("maintenance:repair.help")}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (values.cost && !/^[\d\s,]+$/.test(values.cost)) return setCostError(t("common:validation.wholeNumber"));
        if (values.description.trim().length < 3) return setError(t("maintenance:repair.describeRequired"));
        setCostError(null);
        save.mutate();
      }}>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("maintenance:repair.whatWasDone")} hint={t("maintenance:repair.whatHint")}><Textarea value={values.description} onChange={set("description")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("maintenance:repair.provider")} optional><Input value={values.provider_name} onChange={set("provider_name")} /></Field>
          <Field label={t("maintenance:repair.providerPhone")} optional><Input type="tel" value={values.provider_phone} onChange={set("provider_phone")} /></Field>
          <Field label={t("maintenance:repair.date")}><Input type="date" required value={values.completed_on} onChange={set("completed_on")} /></Field>
          <Field label={t("maintenance:repair.cost")} optional hint={t("maintenance:repair.costHint")} error={costError ?? undefined}><Input inputMode="numeric" value={values.cost} onChange={set("cost")} /></Field>
        </div>
        <Field label={t("maintenance:repair.notes")} optional><Textarea value={values.notes} onChange={set("notes")} /></Field>
        <Checkbox label={t("maintenance:repair.markResolved")} checked={values.mark_resolved} onChange={(e) => setValues((v) => ({ ...v, mark_resolved: e.target.checked }))} />
        <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button><Button type="submit" loading={save.isPending}>{t("maintenance:repair.save")}</Button></div>
      </form>
    </Dialog>
  );
}

export default function MaintenanceDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const query = useQuery({ queryKey: ["maintenance", "detail", id], queryFn: () => get<MaintenanceDetail>(`/api/maintenance/${id}/`) });
  const [statusTarget, setStatusTarget] = useState<RequestStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [note, setNote] = useState("");
  const [internal, setInternal] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [provider, setProvider] = useState({ provider_name: "", provider_phone: "" });
  const [photos, setPhotos] = useState<File[]>([]);
  const [phase, setPhase] = useState("after");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["maintenance"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const onError = (e: unknown) => toast.show(errorMessage(t, e), "error");

  const changeStatus = useMutation({
    mutationFn: () => post(`/api/maintenance/${id}/status/`, { status: statusTarget, message: statusMessage }),
    onSuccess: () => { toast.show(t("maintenance:detail.statusSaved", { status: t(`maintenance:statuses.${statusTarget}`) })); setStatusTarget(null); setStatusMessage(""); refresh(); },
    onError,
  });
  const addNote = useMutation({
    mutationFn: () => post(`/api/maintenance/${id}/notes/`, { message: note, visible_to_tenant: !internal }),
    onSuccess: () => { setNote(""); setInternal(false); toast.show(t("maintenance:detail.noteSaved")); refresh(); },
    onError,
  });
  const updateRequest = useMutation({
    mutationFn: (body: Record<string, string>) => patch(`/api/maintenance/${id}/`, body),
    onSuccess: () => { setProviderOpen(false); toast.show(t("common:states.saved")); refresh(); },
    onError,
  });
  const uploadPhotos = useMutation({
    mutationFn: async () => {
      for (const file of photos) await api(`/api/maintenance/${id}/photos/`, { method: "POST", body: toFormData({ image: file, phase }) });
    },
    onSuccess: () => { setPhotos([]); toast.show(t("maintenance:detail.photosSaved")); refresh(); },
    onError,
  });

  return (
    <QueryState query={query}>
      {(r) => {
        const actions = ACTION_ORDER.filter((s) => r.allowed_transitions.includes(s));
        const reopen = r.allowed_transitions.find((s) => (r.status === "resolved" && s === "in_progress") || (r.status === "closed" && s === "under_review"));
        return (
          <>
            <PageHeader
              title={`${t(`maintenance:categories.${r.category}`)}${r.location_in_home ? ` — ${r.location_in_home}` : ""}`}
              subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><PriorityBadge priority={r.priority} /><span>{r.reference}</span></span>}
              crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.maintenance"), to: "/landlord/maintenance" }, { label: r.reference }]}
            />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <Card>
                  <CardTitle>{t("maintenance:detail.whatHappened")}</CardTitle>
                  <p className="mt-2 whitespace-pre-line text-lg">{r.description}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div><dt className="text-sm text-muted">{t("maintenance:detail.where")}</dt><dd className="font-semibold"><Link className="text-teal-600 underline" to={`/landlord/units/${r.unit}`}>{r.property_name} — {r.unit_name}</Link></dd></div>
                    <div><dt className="text-sm text-muted">{t("maintenance:detail.reportedBy")}</dt><dd className="font-semibold">{r.reported_by_name}{r.reported_by_phone && <a className="ml-2 inline-flex items-center gap-1 text-teal-600 underline" href={`tel:${r.reported_by_phone}`}><Phone className="size-4" aria-hidden="true" />{r.reported_by_phone}</a>}</dd></div>
                    <div><dt className="text-sm text-muted">{t("maintenance:detail.reportedOn")}</dt><dd className="font-semibold">{formatDateTime(r.created_at)}</dd></div>
                    <div><dt className="text-sm text-muted">{t("maintenance:detail.provider")}</dt><dd className="font-semibold">{r.provider_name ? `${r.provider_name}${r.provider_phone ? ` · ${r.provider_phone}` : ""}` : t("maintenance:detail.noProvider")}</dd></div>
                  </dl>
                </Card>

                <Card>
                  <CardTitle>{t("maintenance:detail.photos", { count: r.photos.length })}</CardTitle>
                  {r.photos.length === 0 ? <p className="mt-2 text-muted">{t("maintenance:detail.noPhotos")}</p> : (
                    <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {r.photos.map((p) => (
                        <li key={p.id}>
                          <figure className="overflow-hidden rounded-xl border border-line">
                            <a href={p.image} target="_blank" rel="noreferrer"><img src={p.image} alt={t("maintenance:detail.photoAlt", { phase: t(`maintenance:phases.${p.phase}`), date: formatDate(p.created_at) })} className="aspect-[4/3] w-full object-cover" /></a>
                            <figcaption className="p-2 text-sm"><span className="font-semibold">{t(`maintenance:phases.${p.phase}`)}</span> · {formatDate(p.created_at)}</figcaption>
                          </figure>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-5 space-y-3 border-t border-line pt-4">
                    <Field label={t("maintenance:detail.photoType")}>
                      <Select value={phase} onChange={(e) => setPhase(e.target.value)}>
                        {["before", "after", "reported"].map((p) => <option key={p} value={p}>{t(`maintenance:phases.${p}`)}</option>)}
                      </Select>
                    </Field>
                    <PhotoUploader files={photos} onChange={setPhotos} onError={(m) => toast.show(m, "error")} />
                    {photos.length > 0 && <Button onClick={() => uploadPhotos.mutate()} loading={uploadPhotos.isPending}><Camera aria-hidden="true" />{t("maintenance:detail.savePhotos")}</Button>}
                  </div>
                </Card>

                {r.repair && (
                  <Card>
                    <CardTitle>{t("maintenance:repair.recorded")}</CardTitle>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2"><dt className="text-sm text-muted">{t("maintenance:repair.whatWasDone")}</dt><dd className="font-semibold">{r.repair.description}</dd></div>
                      <div><dt className="text-sm text-muted">{t("maintenance:repair.date")}</dt><dd className="font-semibold">{formatDate(r.repair.completed_on)}</dd></div>
                      <div><dt className="text-sm text-muted">{t("maintenance:repair.provider")}</dt><dd className="font-semibold">{r.repair.provider_name || "—"}</dd></div>
                      {r.repair.cost !== undefined && <div><dt className="text-sm text-muted">{t("maintenance:repair.cost")}</dt><dd className="font-semibold">{formatMoney(r.repair.cost)}</dd></div>}
                      {r.repair.notes && <div className="sm:col-span-2"><dt className="text-sm text-muted">{t("maintenance:repair.notes")}</dt><dd>{r.repair.notes}</dd></div>}
                    </dl>
                    {r.repair.cost ? <p className="mt-3 text-sm text-muted">{t("maintenance:repair.expenseNote")}</p> : null}
                  </Card>
                )}

                <Card>
                  <CardTitle>{t("maintenance:detail.history")}</CardTitle>
                  <div className="mt-4"><ActivityTimeline updates={r.updates} viewer="staff" /></div>
                </Card>
              </div>

              <div className="space-y-6">
                <Card className="space-y-3">
                  <CardTitle>{t("maintenance:detail.whatNext")}</CardTitle>
                  <p className="text-sm text-muted">{t(`maintenance:nextHint.${r.status}`)}</p>
                  {actions.filter((s) => !(s === reopen)).map((s) => (
                    <Button key={s} full variant={s === "closed" ? "secondary" : "primary"} onClick={() => setStatusTarget(s)}>{t(`maintenance:actions.${s}`)}</Button>
                  ))}
                  {!r.repair && r.status !== "closed" && <Button full variant="navy" onClick={() => setRepairOpen(true)}><Hammer aria-hidden="true" />{t("maintenance:repair.title")}</Button>}
                  {reopen && <Button full variant="ghost" onClick={() => setStatusTarget(reopen)}>{t("maintenance:actions.reopen")}</Button>}
                  <Button full variant="ghost" onClick={() => { setProvider({ provider_name: r.provider_name, provider_phone: r.provider_phone }); setProviderOpen(true); }}><UserCog aria-hidden="true" />{t("maintenance:detail.assignProvider")}</Button>
                  <Field label={t("maintenance:detail.priority")}>
                    <Select value={r.priority} onChange={(e) => updateRequest.mutate({ priority: e.target.value })}>
                      {(["urgent", "normal", "low"] as const).map((p) => <option key={p} value={p}>{t(`maintenance:priorities.${p}`)}</option>)}
                    </Select>
                  </Field>
                </Card>

                <Card>
                  <CardTitle>{t("maintenance:detail.addNote")}</CardTitle>
                  <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (note.trim()) addNote.mutate(); }}>
                    <Field label={t("maintenance:detail.noteLabel")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                    <Checkbox label={t("maintenance:detail.internal")} hint={t("maintenance:detail.internalHint")} checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                    <Button type="submit" variant="secondary" loading={addNote.isPending} disabled={!note.trim()}><MessageSquare aria-hidden="true" />{t("maintenance:detail.addNote")}</Button>
                  </form>
                </Card>
              </div>
            </div>

            <Dialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)} title={statusTarget ? t(`maintenance:actions.${statusTarget === reopen ? "reopen" : statusTarget}`) : ""} description={statusTarget ? t(`maintenance:confirm.${statusTarget}`) : undefined}>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); changeStatus.mutate(); }}>
                <Field label={t("maintenance:detail.messageForTenant")} optional hint={t("maintenance:detail.messageHint")}><Textarea value={statusMessage} onChange={(e) => setStatusMessage(e.target.value)} /></Field>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={() => setStatusTarget(null)}>{t("common:actions.noGoBack")}</Button>
                  <Button type="submit" loading={changeStatus.isPending}>{t("common:actions.confirm")}</Button>
                </div>
              </form>
            </Dialog>
            <Dialog open={providerOpen} onOpenChange={setProviderOpen} title={t("maintenance:detail.assignProvider")} description={t("maintenance:detail.providerHelp")}>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); updateRequest.mutate(provider); }}>
                <Field label={t("maintenance:repair.provider")}><Input value={provider.provider_name} onChange={(e) => setProvider((p) => ({ ...p, provider_name: e.target.value }))} /></Field>
                <Field label={t("maintenance:repair.providerPhone")} optional><Input type="tel" value={provider.provider_phone} onChange={(e) => setProvider((p) => ({ ...p, provider_phone: e.target.value }))} /></Field>
                <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setProviderOpen(false)}>{t("common:actions.cancel")}</Button><Button type="submit" loading={updateRequest.isPending}>{t("common:actions.save")}</Button></div>
              </form>
            </Dialog>
            {repairOpen && <RepairDialog req={r} open={repairOpen} onOpenChange={setRepairOpen} />}
            {r.status === "resolved" && <Banner tone="success" className="mt-6">{t("maintenance:detail.resolvedNote")}</Banner>}
          </>
        );
      }}
    </QueryState>
  );
}
