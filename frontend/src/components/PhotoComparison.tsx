import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatDate } from "@/lib/format";
import type { PassportPhoto } from "@/lib/types";
import { Field, Select } from "./ui/form";

function photoLabel(t: (k: string, o?: Record<string, unknown>) => string, p: PassportPhoto) {
  const kind = p.source === "inspection" ? t(`inspections:types.${p.inspection_type}`) : `${t("maintenance:request")} ${p.reference ?? ""}`;
  return `${formatDate(p.date)} — ${kind}${p.area ? ` — ${p.area}` : ""}`;
}

/** Side-by-side view of an earlier and a later photo. It records evidence only; it does not decide who caused damage. */
export function PhotoComparison({ photos }: { photos: PassportPhoto[] }) {
  const { t } = useTranslation();
  const areas = useMemo(() => Array.from(new Set(photos.map((p) => p.area).filter(Boolean))), [photos]);
  const [area, setArea] = useState<string>(areas[0] ?? "");
  const inArea = useMemo(() => [...photos].filter((p) => !area || p.area === area).sort((a, b) => a.date.localeCompare(b.date)), [photos, area]);
  const [beforeId, setBeforeId] = useState<string>("");
  const [afterId, setAfterId] = useState<string>("");
  const before = inArea.find((p) => p.id === beforeId) ?? inArea[0];
  const after = inArea.find((p) => p.id === afterId) ?? inArea[inArea.length - 1];

  if (photos.length < 2) {
    return <p className="text-muted">{t("inspections:compare.needTwo")}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {areas.length > 0 && (
          <Field label={t("inspections:compare.room")}>
            <Select value={area} onChange={(e) => { setArea(e.target.value); setBeforeId(""); setAfterId(""); }}>
              <option value="">{t("inspections:compare.allRooms")}</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t("inspections:compare.earlier")}>
          <Select value={before?.id ?? ""} onChange={(e) => setBeforeId(e.target.value)}>
            {inArea.map((p) => <option key={p.id} value={p.id}>{photoLabel(t, p)}</option>)}
          </Select>
        </Field>
        <Field label={t("inspections:compare.later")}>
          <Select value={after?.id ?? ""} onChange={(e) => setAfterId(e.target.value)}>
            {inArea.map((p) => <option key={p.id} value={p.id}>{photoLabel(t, p)}</option>)}
          </Select>
        </Field>
      </div>
      {before && after && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[{ p: before, label: t("inspections:compare.earlier") }, { p: after, label: t("inspections:compare.later") }].map(({ p, label }) => (
            <figure key={label} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <img src={p.url} alt={`${label}: ${photoLabel(t, p)}`} className="aspect-[4/3] w-full object-cover" />
              <figcaption className="p-3 text-sm">
                <span className="font-bold">{label}</span> · {photoLabel(t, p)}
                {p.caption && <span className="block text-muted">{p.caption}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <p className="text-sm text-muted">{t("inspections:compare.disclaimer")}</p>
    </div>
  );
}
