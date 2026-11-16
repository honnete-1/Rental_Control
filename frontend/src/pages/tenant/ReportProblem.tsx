import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow, CheckCircle2, DoorOpen, Droplets, HelpCircle, PaintRoller, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Banner, EmptyState, LoadingSkeleton } from "@/components/feedback";
import { GuidedFormStepper } from "@/components/GuidedFormStepper";
import { PageHeader } from "@/components/PageHeader";
import { PhotoUploader } from "@/components/PhotoUploader";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { api, get, toFormData } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { MaintenanceRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: { key: string; icon: LucideIcon }[] = [
  { key: "plumbing", icon: Droplets },
  { key: "electricity", icon: Zap },
  { key: "doors_windows", icon: DoorOpen },
  { key: "walls_ceiling", icon: PaintRoller },
  { key: "appliances", icon: AppWindow },
  { key: "other", icon: HelpCircle },
];

/** Four simple steps. The tenant's home is known already, so they never type an address. */
export default function ReportProblemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const home = useQuery({ queryKey: ["my-home"], queryFn: () => get<{ tenancy: unknown; unit?: { name: string }; property?: { name: string } }>("/api/my-home/") });
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<MaintenanceRequest | null>(null);
  const steps = [t("maintenance:report.step1"), t("maintenance:report.step2"), t("maintenance:report.step3"), t("maintenance:report.step4")];

  if (home.isPending) return <LoadingSkeleton />;
  if (!home.data?.tenancy) return <EmptyState icon={HelpCircle} title={t("common:tenant.noHomeTitle")} text={t("common:tenant.noHomeText")} />;

  if (created) {
    return (
      <Card className="mx-auto max-w-xl space-y-5 p-6 text-center">
        <CheckCircle2 className="mx-auto size-16 text-success-700" aria-hidden="true" />
        <h1 className="text-2xl font-bold" tabIndex={-1} ref={(el) => el?.focus()}>{t("maintenance:report.successTitle", { reference: created.reference })}</h1>
        <p className="text-lg">{t("maintenance:report.successText")}</p>
        <p className="rounded-xl bg-canvas p-4">{t("maintenance:report.referenceLabel")} <strong className="text-xl">{created.reference}</strong></p>
        <div className="flex flex-col gap-3">
          <ButtonLink to={`/tenant/requests/${created.id}`} size="lg">{t("maintenance:report.seeProgress")}</ButtonLink>
          <ButtonLink to="/tenant" variant="secondary">{t("common:tenant.backHome")}</ButtonLink>
        </div>
      </Card>
    );
  }

  const next = async () => {
    setError(null);
    setFieldError(null);
    if (step === 0 && !category) return setFieldError(t("maintenance:report.chooseCategory"));
    if (step === 1 && description.trim().length < 5) return setFieldError(t("maintenance:report.describeRequired"));
    if (step < 3) return setStep(step + 1);
    setSaving(true);
    try {
      const req = await api<MaintenanceRequest>("/api/maintenance/", {
        method: "POST",
        body: toFormData({ category, description: description.trim(), location_in_home: location, priority: urgent ? "urgent" : "normal", photos }),
      });
      qc.invalidateQueries({ queryKey: ["tenant-dashboard"] });
      qc.invalidateQueries({ queryKey: ["tenant-requests"] });
      setCreated(req);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t("common:nav.reportProblem")} subtitle={t("maintenance:report.forHome", { home: `${home.data.property?.name} — ${home.data.unit?.name}` })} />
      <Card className="p-5">
        <GuidedFormStepper steps={steps} current={step} onBack={() => setStep(step - 1)} onNext={next} onCancel={() => navigate("/tenant")} nextLoading={saving} nextLabel={step === 3 ? t("maintenance:report.submit") : undefined}>
          {error && <Banner tone="danger">{error}</Banner>}
          {step === 0 && (
            <fieldset>
              <legend className="sr-only">{t("maintenance:report.categoryLabel")}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CATEGORY_ICONS.map(({ key, icon: Icon }) => (
                  <label key={key} className={cn("flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center font-semibold", category === key ? "border-teal-600 bg-teal-50 text-teal-700 dark:bg-navy-700 dark:text-white" : "border-line bg-surface")}>
                    <input type="radio" name="category" value={key} checked={category === key} onChange={() => setCategory(key)} className="sr-only" />
                    <Icon className="size-9" aria-hidden="true" />
                    {t(`maintenance:categories.${key}`)}
                  </label>
                ))}
              </div>
              {fieldError && <p className="mt-3 font-medium text-danger-700" role="alert">{fieldError}</p>}
            </fieldset>
          )}
          {step === 1 && (
            <>
              <Field label={t("maintenance:report.describeLabel")} hint={t("maintenance:report.describeExample")} error={fieldError ?? undefined}>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={2000} />
              </Field>
              <Field label={t("maintenance:report.whereLabel")} optional hint={t("maintenance:report.whereExample")}>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
              <Checkbox label={t("maintenance:report.urgentLabel")} hint={t("maintenance:report.urgentHint")} checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            </>
          )}
          {step === 2 && (
            <>
              <p>{t("maintenance:report.photosHelp")}</p>
              <PhotoUploader files={photos} onChange={setPhotos} max={6} onError={(m) => setError(m)} />
              {photos.length === 0 && <p className="text-sm text-muted">{t("maintenance:report.photosOptional")}</p>}
            </>
          )}
          {step === 3 && (
            <dl className="divide-y divide-line rounded-xl border border-line">
              {[
                [t("maintenance:report.categoryLabel"), t(`maintenance:categories.${category}`), 0],
                [t("maintenance:report.describeLabel"), description, 1],
                [t("maintenance:report.whereLabel"), location || "—", 1],
                [t("maintenance:report.urgentShort"), urgent ? t("common:yes") : t("common:no"), 1],
                [t("maintenance:report.photosLabel"), t("common:photos.selected", { count: photos.length }), 2],
              ].map(([k, v, s]) => (
                <div key={String(k)} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd className="flex items-start gap-3 font-semibold sm:text-right"><span className="whitespace-pre-line">{v}</span><Button variant="ghost" size="sm" onClick={() => setStep(Number(s))}>{t("common:actions.change")}</Button></dd>
                </div>
              ))}
            </dl>
          )}
        </GuidedFormStepper>
      </Card>
    </>
  );
}
