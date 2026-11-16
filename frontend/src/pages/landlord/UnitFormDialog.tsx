import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Banner } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { patch, post } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import type { Unit } from "@/lib/types";

export const UNIT_TYPES = ["apartment", "house", "room", "studio", "shop", "office", "other"];

const optionalInt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).nullable());

export function UnitFormDialog({ open, onOpenChange, propertyId, unit, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; propertyId: number; unit?: Unit; onSaved?: (u: Unit) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    name: z.string().trim().min(1, t("properties:unitForm.nameRequired")).max(60),
    unit_type: z.string(),
    bedrooms: optionalInt,
    bathrooms: optionalInt,
    monthly_rent: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(String(v).replace(/[\s,]/g, ""))), z.number({ invalid_type_error: t("common:validation.wholeNumber") }).int(t("common:validation.wholeNumber")).min(0).nullable()),
    notes: z.string().optional(),
  });
  type Values = z.input<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { name: unit?.name ?? "", unit_type: unit?.unit_type ?? "apartment", bedrooms: unit?.bedrooms ?? "", bathrooms: unit?.bathrooms ?? "", monthly_rent: unit?.monthly_rent ?? "", notes: unit?.notes ?? "" } as Values,
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const saved = unit ? await patch<Unit>(`/api/units/${unit.id}/`, values as Record<string, unknown>) : await post<Unit>("/api/units/", { ...(values as Record<string, unknown>), property: propertyId });
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["unit"] });
      qc.invalidateQueries({ queryKey: ["property"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.show(unit ? t("common:states.saved") : t("properties:unitForm.created", { name: saved.name }));
      form.reset();
      onOpenChange(false);
      onSaved?.(saved);
    } catch (err) {
      if (!applyFieldErrors(t, err, form.setError, ["name", "monthly_rent", "bedrooms", "bathrooms"])) setError(errorMessage(t, err));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={unit ? t("properties:unitForm.editTitle") : t("properties:unitForm.addTitle")} description={unit ? undefined : t("properties:unitForm.help")}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("properties:unitForm.name")} hint={t("properties:unitForm.nameHint")} error={e.name?.message}>
          <Input {...form.register("name")} />
        </Field>
        <Field label={t("properties:unitForm.type")}>
          <Select {...form.register("unit_type")}>
            {UNIT_TYPES.map((u) => <option key={u} value={u}>{t(`properties:unitTypes.${u}`)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("properties:unitForm.bedrooms")} optional error={e.bedrooms?.message as string | undefined}>
            <Input type="number" min={0} inputMode="numeric" {...form.register("bedrooms")} />
          </Field>
          <Field label={t("properties:unitForm.bathrooms")} optional error={e.bathrooms?.message as string | undefined}>
            <Input type="number" min={0} inputMode="numeric" {...form.register("bathrooms")} />
          </Field>
        </div>
        <Field label={t("properties:unitForm.rent")} optional hint={t("properties:unitForm.rentHint")} error={e.monthly_rent?.message as string | undefined}>
          <Input inputMode="numeric" {...form.register("monthly_rent")} />
        </Field>
        <Field label={t("properties:unitForm.notes")} optional>
          <Textarea {...form.register("notes")} />
        </Field>
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common:actions.cancel")}</Button>
          <Button type="submit" loading={form.formState.isSubmitting}>{unit ? t("common:actions.saveChanges") : t("properties:unitForm.save")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
