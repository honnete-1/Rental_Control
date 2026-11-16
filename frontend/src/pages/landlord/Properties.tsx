import { Building2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/AuthContext";
import { PropertyCard } from "@/components/cards";
import { EmptyState, QueryState } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { useProperties } from "@/lib/queries";

export default function PropertiesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);
  const query = useProperties(debounced);
  const canAdd = user?.role === "landlord";

  return (
    <>
      <PageHeader
        title={t("common:nav.properties")}
        subtitle={t("properties:list.subtitle")}
        crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.properties") }]}
        actions={canAdd && <ButtonLink to="/landlord/properties/new" size="lg"><Plus aria-hidden="true" />{t("properties:addProperty")}</ButtonLink>}
      />
      <div className="relative mb-6 max-w-md">
        <label htmlFor="property-search" className="sr-only">{t("properties:list.search")}</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <Input id="property-search" type="search" className="pl-10" placeholder={t("properties:list.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <QueryState query={query}>
        {(data) =>
          data.results.length === 0 ? (
            debounced ? (
              <EmptyState icon={Search} title={t("common:search.noResults")} />
            ) : (
              <EmptyState icon={Building2} title={t("properties:list.emptyTitle")} text={canAdd ? t("properties:list.emptyText") : t("common:dashboard.emptyManager")}
                action={canAdd && <ButtonLink to="/landlord/properties/new" size="lg"><Plus aria-hidden="true" />{t("properties:addProperty")}</ButtonLink>} />
            )
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.results.map((p) => <li key={p.id} className="flex"><PropertyCard property={p} /></li>)}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
