import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ClipboardCheck, DoorOpen, MapPin, Pencil, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { UnitCard } from "@/components/cards";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Banner, EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { ConditionBadge } from "@/components/StatusBadge";
import { Tabs } from "@/components/Tabs";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { del, get, post } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { useUnits } from "@/lib/queries";
import type { Person, Property } from "@/lib/types";
import { ExpenseList } from "./Expenses";
import { RequestList } from "./Maintenance";
import { UnitFormDialog } from "./UnitFormDialog";

interface Assignment {
  id: number;
  manager: Person;
  can_view_finances: boolean;
}

function ManagersCard({ property }: { property: Property }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [finance, setFinance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["managers", property.id], queryFn: () => get<Assignment[]>(`/api/properties/${property.id}/managers/`) });
  const add = useMutation({
    mutationFn: () => post(`/api/properties/${property.id}/managers/`, { email, can_view_finances: finance }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers", property.id] });
      toast.show(t("properties:managers.added"));
      setOpen(false);
      setEmail("");
    },
    onError: (e) => setError(errorMessage(t, e) === t("common:errors.validation_error") ? t("properties:managers.notFound") : errorMessage(t, e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/api/properties/${property.id}/managers/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["managers", property.id] }),
  });
  return (
    <Card>
      <CardTitle>{t("properties:managers.title")}</CardTitle>
      <p className="mt-1 text-sm text-muted">{t("properties:managers.text")}</p>
      <QueryState query={query} skeletonLines={1}>
        {(list) => (
          <ul className="mt-3 space-y-2">
            {list.length === 0 && <li className="text-muted">{t("properties:managers.none")}</li>}
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas p-3">
                <span>
                  <span className="font-semibold">{a.manager.full_name}</span>
                  <span className="block text-sm text-muted">{a.manager.email} · {a.can_view_finances ? t("properties:managers.withMoney") : t("properties:managers.noMoney")}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(a.id)}><UserMinus aria-hidden="true" />{t("common:actions.remove")}</Button>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <Button variant="secondary" className="mt-4" onClick={() => { setError(null); setOpen(true); }}><UserPlus aria-hidden="true" />{t("properties:managers.add")}</Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("properties:managers.add")} description={t("properties:managers.addHelp")}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}>
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label={t("common:auth.email")}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Checkbox label={t("properties:managers.allowMoney")} hint={t("properties:managers.allowMoneyHint")} checked={finance} onChange={(e) => setFinance(e.target.checked)} />
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setOpen(false)}>{t("common:actions.cancel")}</Button><Button type="submit" loading={add.isPending}>{t("properties:managers.add")}</Button></div>
        </form>
      </Dialog>
    </Card>
  );
}

export default function PropertyDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const [unitOpen, setUnitOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useQuery({ queryKey: ["property", id], queryFn: () => get<Property>(`/api/properties/${id}/`) });
  const units = useUnits(id);

  useEffect(() => {
    if (params.get("addUnit") === "1") {
      setUnitOpen(true);
      params.delete("addUnit");
      params.set("tab", "units");
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const remove = useMutation({
    mutationFn: () => del(`/api/properties/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.show(t("properties:detail.deleted"));
      navigate("/landlord/properties");
    },
    onError: (e) => {
      setConfirmDelete(false);
      toast.show(errorMessage(t, e), "error");
    },
  });

  return (
    <QueryState query={query}>
      {(p) => (
        <>
          <PageHeader
            title={p.name}
            subtitle={<span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden="true" />{[p.address, p.district, p.city].filter(Boolean).join(", ") || t(`properties:propertyTypes.${p.property_type}`)}</span>}
            crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.properties"), to: "/landlord/properties" }, { label: p.name }]}
            actions={
              <>
                <Button onClick={() => setUnitOpen(true)}><Plus aria-hidden="true" />{t("properties:units.add")}</Button>
                <ButtonLink to={`/landlord/properties/${p.id}/edit`} variant="secondary"><Pencil aria-hidden="true" />{t("properties:detail.edit")}</ButtonLink>
              </>
            }
          />
          <Tabs
            label={t("properties:detail.sections")}
            value={tab}
            onChange={(v) => setParams({ tab: v }, { replace: true })}
            tabs={[
              { id: "overview", label: t("properties:detail.tabs.overview") },
              { id: "units", label: t("properties:detail.tabs.units", { count: p.unit_count }) },
              { id: "condition", label: t("properties:detail.tabs.condition") },
              { id: "maintenance", label: t("properties:detail.tabs.maintenance") },
              { id: "expenses", label: t("properties:detail.tabs.expenses") },
            ]}
          >
            {tab === "overview" && (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <div className="overflow-hidden rounded-2xl border border-line bg-navy-50">
                    {p.photo ? <img src={p.photo} alt={t("properties:detail.photoAlt", { name: p.name })} className="max-h-96 w-full object-cover" /> : <div className="flex h-48 items-center justify-center text-navy-600"><Building2 className="size-16" aria-hidden="true" /></div>}
                  </div>
                  {p.description && <p className="whitespace-pre-line">{p.description}</p>}
                  {p.notes && <Banner title={t("properties:form.notes")}>{p.notes}</Banner>}
                </div>
                <div className="space-y-6">
                  <Card>
                    <CardTitle>{t("properties:detail.facts")}</CardTitle>
                    <dl className="mt-3 space-y-2">
                      {[
                        [t("properties:form.type"), t(`properties:propertyTypes.${p.property_type}`)],
                        [t("properties:card.units"), t("properties:card.occupiedOf", { occupied: p.occupied_count, total: p.unit_count })],
                        [t("properties:card.repairs"), t("properties:card.openRequests", { count: p.open_requests })],
                        [t("properties:detail.owner"), p.owner_name],
                        [t("properties:detail.added"), formatDate(p.created_at)],
                      ].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
                    </dl>
                  </Card>
                  {p.is_owner && <ManagersCard property={p} />}
                  {p.is_owner && (
                    <Card>
                      <CardTitle>{t("properties:detail.deleteTitle")}</CardTitle>
                      <p className="mt-1 text-sm text-muted">{t("properties:detail.deleteText")}</p>
                      <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />{t("properties:detail.delete")}</Button>
                    </Card>
                  )}
                </div>
              </div>
            )}
            {tab === "units" && (
              <QueryState query={units}>
                {(data) =>
                  data.results.length === 0 ? (
                    <EmptyState icon={DoorOpen} title={t("properties:units.emptyTitle")} text={t("properties:units.emptyText")} action={<Button size="lg" onClick={() => setUnitOpen(true)}><Plus aria-hidden="true" />{t("properties:units.add")}</Button>} />
                  ) : (
                    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data.results.map((u) => <li key={u.id}><UnitCard unit={u} /></li>)}</ul>
                  )
                }
              </QueryState>
            )}
            {tab === "condition" && (
              <QueryState query={units}>
                {(data) => (
                  <div className="space-y-4">
                    <div className="flex justify-end"><ButtonLink to={`/landlord/inspections/new?property=${p.id}`}><ClipboardCheck aria-hidden="true" />{t("inspections:newInspection")}</ButtonLink></div>
                    {data.results.length === 0 ? <EmptyState icon={ClipboardCheck} title={t("properties:units.emptyTitle")} /> : (
                      <ul className="space-y-3">
                        {data.results.map((u) => (
                          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
                            <div>
                              <p className="font-bold">{u.name}</p>
                              <p className="text-sm text-muted">{u.latest_condition ? t("properties:detail.lastChecked", { date: formatDate(u.latest_condition.inspection_date) }) : t("properties:detail.neverChecked")}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {u.latest_condition && <ConditionBadge condition={u.latest_condition.overall} />}
                              <ButtonLink to={`/landlord/units/${u.id}?tab=passport`} variant="secondary" size="sm">{t("properties:passport.open")}</ButtonLink>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </QueryState>
            )}
            {tab === "maintenance" && <RequestList filters={{ property: p.id }} />}
            {tab === "expenses" && <ExpenseList propertyId={p.id} />}
          </Tabs>
          <UnitFormDialog open={unitOpen} onOpenChange={setUnitOpen} propertyId={p.id} onSaved={(u) => navigate(`/landlord/units/${u.id}?created=1`)} />
          <ConfirmationDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("properties:detail.deleteConfirmTitle", { name: p.name })} message={t("properties:detail.deleteConfirmText")} confirmLabel={t("properties:detail.delete")} onConfirm={() => remove.mutate()} loading={remove.isPending} />
        </>
      )}
    </QueryState>
  );
}
