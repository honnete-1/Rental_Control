import { useTranslation } from "react-i18next";

import type { Condition, InspectionItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field, Textarea } from "./ui/form";

const CONDITIONS: Condition[] = ["good", "needs_attention", "damaged", "not_checked"];
const SELECTED: Record<Condition, string> = {
  good: "border-success-700 bg-success-50 text-success-700",
  needs_attention: "border-warning-700 bg-warning-50 text-warning-700",
  damaged: "border-danger-700 bg-danger-50 text-danger-700",
  not_checked: "border-slate-500 bg-slate-100 text-slate-700",
};

/** One room's checklist: for each part, choose Good / Needs attention / Damaged / Not checked. */
export function InspectionChecklist({ items, onChange }: { items: InspectionItem[]; onChange: (id: number, patch: Partial<InspectionItem>) => void }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-5">
      {items.map((item) => (
        <li key={item.id} className="rounded-2xl border border-line bg-surface p-4">
          <fieldset>
            <legend className="mb-3 text-lg font-bold">{t(`inspections:elements.${item.element}`)}</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CONDITIONS.map((c) => (
                <label key={c} className={cn("flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-2 text-center font-semibold", item.condition === c ? SELECTED[c] : "border-line")}>
                  <input type="radio" className="size-5 accent-teal-600" name={`cond-${item.id}`} value={c} checked={item.condition === c} onChange={() => onChange(item.id, { condition: c })} />
                  {t(`inspections:conditions.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
          {(item.condition === "damaged" || item.condition === "needs_attention" || item.notes) && (
            <Field label={t("inspections:wizard.describeProblem")} optional className="mt-3">
              <Textarea className="min-h-20" value={item.notes} onChange={(e) => onChange(item.id, { notes: e.target.value })} placeholder={t("inspections:wizard.notesExample")} />
            </Field>
          )}
        </li>
      ))}
    </ul>
  );
}
