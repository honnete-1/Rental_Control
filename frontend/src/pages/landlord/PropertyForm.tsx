import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Banner, QueryState } from "@/components/feedback";
import { GuidedFormStepper } from "@/components/GuidedFormStepper";
import { PageHeader } from "@/components/PageHeader";
import { PhotoUploader } from "@/components/PhotoUploader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { api, get, toFormData } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import type { Property } from "@/lib/types";

export const PROPERTY_TYPES = ["house", "apartment_building", "compound", "commercial", "other"];
const DISTRICTS = ["Gasabo", "Kicukiro", "Nyarugenge", "Bugesera", "Kamonyi", "Musanze", "Rubavu", "Huye", "Muhanga", "Rwamagana", "Other"];

function useSchema() {
  const { t } = useTranslation();
  return z.object({
    name: z.string().trim().min(2, t("properties:form.nameRequired")).max(120),
    property_type: z.string(),
    address: z.string().trim().max(255).optional(),
    district: z.string().optional(),
    city: z.string().trim().max(80).optional(),
    description: z.string().optional(),
    notes: z.string().optional(),
  });
}
type Values = z.infer<ReturnType<typeof useSchema>>;

export default function PropertyFormPage() {
  const { id } = useParams();
  const query = useQuery({ queryKey: ["property", id], queryFn: () => get<Property>(`/api/properties/${id}/`), enabled: !!id });
  if (!id) return <PropertyWizard />;
  return <QueryState query={query}>{(p) => <PropertyEdit property={p} />}</QueryState>;
}

function PropertyFields({ step, form, photo, setPhoto, removePhoto, setRemovePhoto, existingPhoto }: {
  step: number | "all";
  form: ReturnType<typeof useForm<Values>>;
  photo: File[];
  setPhoto: (f: File[]) => void;
  removePhoto?: boolean;
  setRemovePhoto?: (v: boolean) => void;
  existingPhoto?: string | null;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const e = form.formState.errors;
  const show = (n: number) => step === "all" || step === n;
  return (
    <>
      {show(0) && (
        <>
          <Field label={t("properties:form.name")} hint={t("properties:form.nameHint")} error={e.name?.message}>
            <Input {...form.register("name")} autoFocus={step === 0} />
          </Field>
          <Field label={t("properties:form.type")}>
            <Select {...form.register("property_type")}>
              {PROPERTY_TYPES.map((p) => <option key={p} value={p}>{t(`properties:propertyTypes.${p}`)}</option>)}
            </Select>
          </Field>
        </>
      )}
      {show(1) && (
        <>
          <Field label={t("properties:form.district")} optional>
            <Select {...form.register("district")}>
              <option value="">{t("common:form.choose")}</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d === "Other" ? t("common:form.other") : d}</option>)}
            </Select>
          </Field>
          <Field label={t("properties:form.city")} optional>
            <Input {...form.register("city")} />
          </Field>
          <Field label={t("properties:form.address")} optional hint={t("properties:form.addressHint")}>
            <Input {...form.register("address")} />
          </Field>
        </>
      )}
      {show(2) && (
        <>
          {existingPhoto && !removePhoto && photo.length === 0 && (
            <div className="space-y-2">
              <img src={existingPhoto} alt={t("properties:form.currentPhoto")} className="max-h-60 rounded-xl" />
              <Checkbox label={t("properties:form.removePhoto")} checked={!!removePhoto} onChange={(ev) => setRemovePhoto?.(ev.target.checked)} />
            </div>
          )}
          <PhotoUploader files={photo} onChange={setPhoto} max={1} label={t("properties:form.photo")} onError={(m) => toast.show(m, "error")} />
          <Field label={t("properties:form.description")} optional hint={t("properties:form.descriptionHint")}>
            <Textarea {...form.register("description")} />
          </Field>
          <Field label={t("properties:form.notes")} optional hint={t("properties:form.notesHint")}>
            <Textarea {...form.register("notes")} />
          </Field>
        </>
      )}
    </>
  );
}

function PropertyWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const schema = useSchema();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", property_type: "house", city: "Kigali", district: "", address: "", description: "", notes: "" } });
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const steps = [t("properties:wizard.step1"), t("properties:wizard.step2"), t("properties:wizard.step3"), t("properties:wizard.step4")];
  const v = form.watch();

  const next = async () => {
    if (step === 0 && !(await form.trigger(["name"]))) return;
    if (step < 3) return setStep(step + 1);
    setSaving(true);
    setError(null);
    try {
      const created = await api<Property>("/api/properties/", { method: "POST", body: toFormData({ ...form.getValues(), photo: photo[0] }) });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.show(t("properties:form.created", { name: created.name }));
      navigate(`/landlord/properties/${created.id}?addUnit=1`);
    } catch (e) {
      if (applyFieldErrors(t, e, form.setError, ["name"])) setStep(0);
      else setError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("properties:addProperty")} crumbs={[{ label: t("common:nav.overview"), to: "/landlord" }, { label: t("common:nav.properties"), to: "/landlord/properties" }, { label: t("properties:addProperty") }]} />
      <Card className="p-6">
        <GuidedFormStepper steps={steps} current={step} onBack={() => setStep(step - 1)} onNext={next} onCancel={() => navigate("/landlord/properties")} nextLoading={saving} nextLabel={step === 3 ? t("properties:wizard.save") : undefined}>
          {error && <Banner tone="danger">{error}</Banner>}
          <form onSubmit={(e) => { e.preventDefault(); next(); }} className="space-y-5">
            {step < 3 ? (
              <PropertyFields step={step} form={form} photo={photo} setPhoto={setPhoto} />
            ) : (
              <dl className="divide-y divide-line rounded-xl border border-line">
                {[
                  [t("properties:form.name"), v.name],
                  [t("properties:form.type"), t(`properties:propertyTypes.${v.property_type}`)],
                  [t("properties:form.district"), v.district || "—"],
                  [t("properties:form.city"), v.city || "—"],
                  [t("properties:form.address"), v.address || "—"],
                  [t("properties:form.photo"), photo.length ? t("properties:wizard.photoAdded") : t("properties:wizard.noPhoto")],
                ].map(([k, val]) => (
                  <div key={k} className="flex flex-wrap justify-between gap-2 p-3"><dt className="text-muted">{k}</dt><dd className="font-semibold">{val}</dd></div>
                ))}
              </dl>
            )}
            <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
          </form>
        </GuidedFormStepper>
      </Card>
    </>
  );
}

function PropertyEdit({ property }: { property: Property }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const schema = useSchema();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: property.name, property_type: property.property_type, address: property.address, district: property.district, city: property.city, description: property.description, notes: property.notes } });
  const [photo, setPhoto] = useState<File[]>([]);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (photo.length) setRemovePhoto(false);
  }, [photo]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api(`/api/properties/${property.id}/`, { method: "PATCH", body: toFormData({ ...values, photo: photo[0], remove_photo: removePhoto ? "true" : undefined }) });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["property", String(property.id)] });
      toast.show(t("common:states.saved"));
      navigate(`/landlord/properties/${property.id}`);
    } catch (e) {
      if (!applyFieldErrors(t, e, form.setError, ["name"])) setError(errorMessage(t, e));
    }
  });

  return (
    <>
      <PageHeader title={t("properties:editProperty")} crumbs={[{ label: t("common:nav.properties"), to: "/landlord/properties" }, { label: property.name, to: `/landlord/properties/${property.id}` }, { label: t("common:actions.edit") }]} />
      <Card className="mx-auto max-w-2xl p-6">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Banner tone="danger">{error}</Banner>}
          <PropertyFields step="all" form={form} photo={photo} setPhoto={setPhoto} existingPhoto={property.photo} removePhoto={removePhoto} setRemovePhoto={setRemovePhoto} />
          <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => navigate(-1)}>{t("common:actions.cancel")}</Button>
            <Button type="submit" size="lg" loading={form.formState.isSubmitting}>{t("common:actions.saveChanges")}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
