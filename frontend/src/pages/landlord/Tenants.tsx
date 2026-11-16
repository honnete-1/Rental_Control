import { useQuery } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { AccessibleDataTable } from "@/components/AccessibleDataTable";
import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/Tabs";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { get, qs, type Paginated } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useUnits } from "@/lib/queries";
import type { Invitation, Tenancy, Unit } from "@/lib/types";
import { InviteTenantDialog } from "./InviteTenantDialog";

function PickUnitDialog({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (u: Unit) => void }) {
  const { t } = useTranslation();
  const units = useUnits();
  const [choice, setChoice] = useState("");
  const vacant = units.data?.results.filter((u) => u.occupancy !== "occupied") ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("properties:tenants.invite")} description={t("properties:tenants.pickUnit")}>
      {units.isPending ? <p>{t("common:states.loading")}</p> : vacant.length === 0 ? (
        <p>{t("properties:tenants.noVacant")}</p>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const u = vacant.find((x) => String(x.id) === choice); if (u) onPick(u); }}>
          <Field label={t("properties:tenants.unit")}>
            <Select required value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t("common:form.choose")}</option>
              {vacant.map((u) => <option key={u.id} value={u.id}>{u.property_name} — {u.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button><Button type="submit" disabled={!choice}>{t("common:actions.next")}</Button></div>
        </form>
      )}
    </Dialog>
  );
}

export default function TenantsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("current");
  const [search, setSearch] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [inviteUnit, setInviteUnit] = useState<Unit | null>(null);
  const tenancies = useQuery({
    queryKey: ["tenancies", tab, search],
    queryFn: () => get<Paginated<Tenancy>>(`/api/tenancies/${qs({ active: tab === "current" ? "true" : "false", search, page_size: 200 })}`),
    enabled: tab !== "invited",
  });
  const invitations = useQuery({ queryKey: ["invitations"], queryFn: () => get<Paginated<Invitation>>("/api/invitations/?pending=true"), enabled: tab === "invited" });

  return (
    <>
      <PageHeader title={t("common:nav.tenants")} subtitle={t("properties:tenants.subtitle")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.tenants") }]}
        actions={<Button size="lg" onClick={() => setPickOpen(true)}><UserPlus aria-hidden="true" />{t("properties:tenants.invite")}</Button>} />
      <Tabs label={t("common:nav.tenants")} value={tab} onChange={setTab} tabs={[{ id: "current", label: t("properties:tenants.currentTab") }, { id: "invited", label: t("properties:tenants.invitedTab") }, { id: "past", label: t("properties:tenants.pastTab") }]}>
        {tab !== "invited" ? (
          <>
            <div className="mb-4 max-w-md">
              <Field label={t("properties:tenants.search")}><Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
            </div>
            <QueryState query={tenancies}>
              {(data) => data.results.length === 0 ? (
                <EmptyState icon={Users} title={tab === "current" ? t("properties:tenants.emptyTitle") : t("properties:tenants.emptyPast")} text={tab === "current" ? t("properties:tenants.emptyText") : undefined} />
              ) : (
                <AccessibleDataTable caption={t("common:nav.tenants")} rows={data.results} rowKey={(r) => r.id} columns={[
                  { key: "name", header: t("common:auth.fullName"), cell: (r) => <span className="font-semibold">{r.tenant.full_name}</span> },
                  { key: "home", header: t("properties:tenants.unit"), cell: (r) => <Link className="font-semibold text-teal-600 underline" to={`/landlord/units/${r.unit}?tab=tenant`}>{r.property_name} — {r.unit_name}</Link> },
                  { key: "phone", header: t("common:auth.phone"), cell: (r) => r.tenant.phone ? <a href={`tel:${r.tenant.phone}`} className="underline">{r.tenant.phone}</a> : "—" },
                  { key: "since", header: tab === "current" ? t("properties:tenants.since") : t("properties:tenants.stayed"), cell: (r) => tab === "current" ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.moved_out_on)}` },
                  { key: "rent", header: t("finances:rent.monthlyRent"), align: "right", cell: (r) => r.monthly_rent ? formatMoney(r.monthly_rent) : "—" },
                ]} />
              )}
            </QueryState>
          </>
        ) : (
          <QueryState query={invitations}>
            {(data) => data.results.length === 0 ? <EmptyState icon={UserPlus} title={t("properties:tenants.noInvites")} /> : (
              <AccessibleDataTable caption={t("properties:tenants.invitedTab")} rows={data.results} rowKey={(r) => r.id} columns={[
                { key: "name", header: t("common:auth.fullName"), cell: (r) => <span className="font-semibold">{r.full_name}</span> },
                { key: "email", header: t("common:auth.email"), cell: (r) => r.email },
                { key: "home", header: t("properties:tenants.unit"), cell: (r) => <Link className="font-semibold text-teal-600 underline" to={`/landlord/units/${r.unit}?tab=tenant`}>{r.property_name} — {r.unit_name}</Link> },
                { key: "expires", header: t("properties:invite.expires"), cell: (r) => formatDate(r.expires_at) },
              ]} />
            )}
          </QueryState>
        )}
      </Tabs>
      <PickUnitDialog open={pickOpen} onOpenChange={setPickOpen} onPick={(u) => { setPickOpen(false); setInviteUnit(u); }} />
      {inviteUnit && <InviteTenantDialog unit={inviteUnit} open={!!inviteUnit} onOpenChange={(o) => !o && setInviteUnit(null)} />}
    </>
  );
}
