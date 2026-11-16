import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Link2, LogOut, Pencil, Trash2, UserPlus, Wrench } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Banner, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { OccupancyBadge } from "@/components/StatusBadge";
import { Tabs } from "@/components/Tabs";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { del, get, post } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import type { Invitation, Unit } from "@/lib/types";
import { InviteLinkBox, InviteTenantDialog } from "./InviteTenantDialog";
import { RequestList } from "./Maintenance";
import { DigitalPassport } from "./Passport";
import { UnitFormDialog } from "./UnitFormDialog";

function TenantPanel({ unit }: { unit: Unit }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [moveOutOpen, setMoveOutOpen] = useState(false);
  const [moveOutDate, setMoveOutDate] = useState(todayISO());
  const [newLink, setNewLink] = useState<Invitation | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["unit", String(unit.id)] });
    qc.invalidateQueries({ queryKey: ["units"] });
    qc.invalidateQueries({ queryKey: ["passport", unit.id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const moveOut = useMutation({
    mutationFn: () => post(`/api/units/${unit.id}/move-out/`, { moved_out_on: moveOutDate }),
    onSuccess: () => { setMoveOutOpen(false); refresh(); toast.show(t("properties:tenants.movedOut")); },
    onError: (e) => toast.show(errorMessage(t, e), "error"),
  });
  const cancelInvite = useMutation({
    mutationFn: (id: number) => post(`/api/invitations/${id}/cancel/`),
    onSuccess: () => { setConfirmCancel(false); refresh(); toast.show(t("properties:invite.cancelled")); },
  });
  const regenerate = useMutation({
    mutationFn: (id: number) => post<Invitation>(`/api/invitations/${id}/new-link/`),
    onSuccess: (inv) => setNewLink(inv),
  });
  const tenancy = unit.current_tenancy;
  const invitation = unit.pending_invitation;

  if (tenancy) {
    return (
      <Card className="space-y-4">
        <CardTitle>{t("properties:tenants.current")}</CardTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          {[
            [t("common:auth.fullName"), tenancy.tenant.full_name],
            [t("common:auth.phone"), tenancy.tenant.phone || "—"],
            [t("common:auth.email"), tenancy.tenant.email],
            [t("properties:tenants.since"), formatDate(tenancy.start_date)],
            [t("finances:rent.monthlyRent"), tenancy.monthly_rent ? formatMoney(tenancy.monthly_rent) : "—"],
            [t("finances:rent.dueDay"), t("finances:rent.dueDayValue", { day: tenancy.rent_due_day })],
          ].map(([k, v]) => <div key={k}><dt className="text-sm text-muted">{k}</dt><dd className="font-semibold break-words">{v}</dd></div>)}
        </dl>
        <div className="flex flex-col gap-3 sm:flex-row">
          {tenancy.tenant.phone && <a href={`tel:${tenancy.tenant.phone}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-navy-800 px-4 font-semibold">{t("properties:tenants.call")}</a>}
          <ButtonLink to={`/landlord/rent/${tenancy.id}`} variant="secondary"><HandCoins aria-hidden="true" />{t("finances:rent.viewRent")}</ButtonLink>
          <Button variant="secondary" onClick={() => setMoveOutOpen(true)}><LogOut aria-hidden="true" />{t("properties:tenants.recordMoveOut")}</Button>
        </div>
        <Dialog open={moveOutOpen} onOpenChange={setMoveOutOpen} title={t("properties:tenants.moveOutTitle", { name: tenancy.tenant.full_name })} description={t("properties:tenants.moveOutText")}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); moveOut.mutate(); }}>
            <Field label={t("properties:tenants.moveOutDate")}><Input type="date" required value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} /></Field>
            <Banner tone="info">{t("properties:tenants.moveOutTip")}</Banner>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setMoveOutOpen(false)}>{t("common:actions.noGoBack")}</Button>
              <Button variant="danger" type="submit" loading={moveOut.isPending}>{t("properties:tenants.confirmMoveOut")}</Button>
            </div>
          </form>
        </Dialog>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <CardTitle>{t("properties:tenants.noneTitle")}</CardTitle>
      {invitation ? (
        <>
          <Banner tone="info" title={t("properties:invite.pendingTitle")}>
            {t("properties:invite.pendingText", { name: invitation.full_name, email: invitation.email, date: formatDate(invitation.expires_at) })}
          </Banner>
          {newLink?.invite_link ? <InviteLinkBox link={newLink.invite_link} name={newLink.full_name} /> : (
            <p className="text-sm text-muted">{t("properties:invite.linkLostHint")}</p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => regenerate.mutate(invitation.id)} loading={regenerate.isPending}><Link2 aria-hidden="true" />{t("properties:invite.newLink")}</Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(true)}><Trash2 aria-hidden="true" />{t("properties:invite.cancel")}</Button>
          </div>
          <ConfirmationDialog open={confirmCancel} onOpenChange={setConfirmCancel} title={t("properties:invite.cancelConfirmTitle")} message={t("properties:invite.cancelConfirmText", { name: invitation.full_name })} confirmLabel={t("properties:invite.cancel")} onConfirm={() => cancelInvite.mutate(invitation.id)} loading={cancelInvite.isPending} />
        </>
      ) : (
        <>
          <p className="text-muted">{t("properties:tenants.noneText")}</p>
          <Button size="lg" onClick={() => setInviteOpen(true)}><UserPlus aria-hidden="true" />{t("properties:tenants.invite")}</Button>
        </>
      )}
      <InviteTenantDialog unit={unit} open={inviteOpen} onOpenChange={setInviteOpen} />
    </Card>
  );
}

export default function UnitDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "passport";
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useQuery({ queryKey: ["unit", id], queryFn: () => get<Unit>(`/api/units/${id}/`) });
  const remove = useMutation({
    mutationFn: () => del(`/api/units/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["property"] });
      toast.show(t("properties:unit.deleted"));
      navigate(`/landlord/properties/${query.data?.property}?tab=units`);
    },
    onError: (e) => { setConfirmDelete(false); toast.show(errorMessage(t, e), "error"); },
  });

  return (
    <QueryState query={query}>
      {(u) => (
        <>
          <PageHeader
            title={`${u.property_name} — ${u.name}`}
            subtitle={<OccupancyBadge occupancy={u.occupancy} />}
            crumbs={[{ label: t("common:nav.properties"), to: "/landlord/properties" }, { label: u.property_name, to: `/landlord/properties/${u.property}?tab=units` }, { label: u.name }]}
            actions={<Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil aria-hidden="true" />{t("properties:unit.edit")}</Button>}
          />
          {params.get("created") === "1" && !u.current_tenancy && !u.pending_invitation && (
            <Banner tone="success" className="mb-6" title={t("properties:unit.createdNextTitle")}>
              {t("properties:unit.createdNextText")}{" "}
              <button type="button" className="font-semibold underline" onClick={() => setParams({ tab: "tenant" })}>{t("properties:tenants.invite")}</button>
            </Banner>
          )}
          <Tabs label={t("properties:unit.sections")} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })}
            tabs={[{ id: "passport", label: t("properties:passport.title") }, { id: "tenant", label: t("properties:unit.tenantTab") }, { id: "maintenance", label: t("common:nav.maintenance") }, { id: "details", label: t("properties:unit.detailsTab") }]}>
            {tab === "passport" && <DigitalPassport unitId={u.id} />}
            {tab === "tenant" && <TenantPanel unit={u} />}
            {tab === "maintenance" && (
              <div className="space-y-4">
                <div className="flex justify-end"><ButtonLink to={`/landlord/maintenance?report=1&unit=${u.id}`} variant="secondary"><Wrench aria-hidden="true" />{t("maintenance:staffReport")}</ButtonLink></div>
                <RequestList filters={{ unit: u.id }} />
              </div>
            )}
            {tab === "details" && (
              <Card className="space-y-4">
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    [t("properties:unitForm.type"), t(`properties:unitTypes.${u.unit_type}`)],
                    [t("properties:unitForm.bedrooms"), u.bedrooms ?? "—"],
                    [t("properties:unitForm.bathrooms"), u.bathrooms ?? "—"],
                    [t("properties:unitForm.rent"), u.monthly_rent ? formatMoney(u.monthly_rent) : "—"],
                  ].map(([k, v]) => <div key={String(k)}><dt className="text-sm text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
                </dl>
                {u.notes && <p className="whitespace-pre-line">{u.notes}</p>}
                <div className="border-t border-line pt-4">
                  <p className="text-sm text-muted">{t("properties:unit.deleteText")}</p>
                  <Button variant="danger" className="mt-2" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden="true" />{t("properties:unit.delete")}</Button>
                </div>
              </Card>
            )}
          </Tabs>
          <UnitFormDialog open={editOpen} onOpenChange={setEditOpen} propertyId={u.property} unit={u} />
          <ConfirmationDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={t("properties:unit.deleteConfirmTitle", { name: u.name })} message={t("properties:unit.deleteConfirmText")} confirmLabel={t("properties:unit.delete")} onConfirm={() => remove.mutate()} loading={remove.isPending} />
        </>
      )}
    </QueryState>
  );
}
