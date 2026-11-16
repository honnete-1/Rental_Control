import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { Banner, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { get } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Inspection } from "@/lib/types";
import { InspectionView } from "../landlord/InspectionDetail";

export default function TenantInspectionPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["tenant-inspection", id], queryFn: () => get<Inspection>(`/api/inspections/${id}/`) });
  return (
    <QueryState query={query}>
      {(i) => (
        <>
          <PageHeader title={`${t(`inspections:types.${i.inspection_type}`)} · ${formatDate(i.inspection_date)}`} crumbs={[{ label: t("common:nav.myHome"), to: "/tenant" }, { label: t("common:tenant.conditionRecords") }]} />
          <Banner className="mb-6">{t("common:tenant.inspectionNote")}</Banner>
          <InspectionView inspection={i} />
        </>
      )}
    </QueryState>
  );
}
