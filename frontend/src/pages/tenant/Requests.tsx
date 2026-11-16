import { useQuery } from "@tanstack/react-query";
import { ListChecks, PlusCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { MaintenanceRequestCard } from "@/components/cards";
import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Tabs } from "@/components/Tabs";
import { ButtonLink } from "@/components/ui/button";
import { get, qs, type Paginated } from "@/lib/api";
import type { MaintenanceRequest } from "@/lib/types";

export default function TenantRequestsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("open");
  const query = useQuery({
    queryKey: ["tenant-requests", tab],
    queryFn: () => get<Paginated<MaintenanceRequest>>(`/api/maintenance/${qs(tab === "open" ? { open: "true" } : { status: "resolved,closed" })}`),
  });
  return (
    <>
      <PageHeader title={t("common:nav.myRequests")} actions={<ButtonLink to="/tenant/report"><PlusCircle aria-hidden="true" />{t("common:nav.reportProblem")}</ButtonLink>} />
      <Tabs label={t("common:nav.myRequests")} value={tab} onChange={setTab} tabs={[{ id: "open", label: t("common:tenant.inProgressTab") }, { id: "done", label: t("common:tenant.doneTab") }]}>
        <QueryState query={query}>
          {(data) => data.results.length === 0 ? (
            <EmptyState icon={ListChecks} title={tab === "open" ? t("common:tenant.noActive") : t("common:tenant.noDone")} action={tab === "open" && <ButtonLink to="/tenant/report">{t("common:nav.reportProblem")}</ButtonLink>} />
          ) : (
            <ul className="space-y-3">{data.results.map((r) => <li key={r.id}><MaintenanceRequestCard request={r} to={`/tenant/requests/${r.id}`} /></li>)}</ul>
          )}
        </QueryState>
      </Tabs>
    </>
  );
}
