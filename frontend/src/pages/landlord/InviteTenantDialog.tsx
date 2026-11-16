import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Banner } from "@/components/feedback";
import { GuidedFormStepper } from "@/components/GuidedFormStepper";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { post } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import type { Invitation, Unit } from "@/lib/types";

export function InviteLinkBox({ link, name }: { link: string; name: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const message = t("properties:invite.shareMessage", { name, link });
  return (
    <div className="space-y-3">
      <Field label={t("properties:invite.linkLabel")} hint={t("properties:invite.linkHint")}>
        <Input readOnly value={link} onFocus={(e) => e.target.select()} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* clipboard may be blocked */ } }}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("properties:invite.copied") : t("properties:invite.copy")}
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-success-700 px-4 font-semibold text-success-700 hover:bg-success-50">
          <MessageCircle className="size-5" aria-hidden="true" />
          {t("properties:invite.whatsapp")}
        </a>
      </div>
    </div>
  );
}

/** Three short steps: who, rent and dates, then check and create the invitation link. */
export function InviteTenantDialog({ unit, open, onOpenChange }: { unit: Unit; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Invitation | null>(null);
  const schema = z.object({
    full_name: z.string().trim().min(2, t("common:validation.nameRequired")),
    email: z.string().trim().min(1, t("common:validation.required")).email(t("common:validation.email")),
    phone: z.string().optional(),
    start_date: z.string().min(1, t("common:validation.required")),
    monthly_rent: z.string().regex(/^\d*$/, t("common:validation.wholeNumber")).optional(),
    rent_due_day: z.coerce.number().int().min(1, t("properties:invite.dueDayRange")).max(28, t("properties:invite.dueDayRange")),
  });
  type Values = z.input<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: "", email: "", phone: "", start_date: todayISO(), monthly_rent: unit.monthly_rent ? String(unit.monthly_rent) : "", rent_due_day: 5 } });
  const v = form.watch();
  const e = form.formState.errors;
  const steps = [t("properties:invite.step1"), t("properties:invite.step2"), t("properties:invite.step3")];

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setStep(0);
      setResult(null);
      form.reset();
    }
  };

  const next = async () => {
    if (step === 0 && !(await form.trigger(["full_name", "email"]))) return;
    if (step === 1 && !(await form.trigger(["start_date", "monthly_rent", "rent_due_day"]))) return;
    if (step < 2) return setStep(step + 1);
    setError(null);
    try {
      const values = form.getValues();
      const inv = await post<Invitation>(`/api/units/${unit.id}/invite/`, { ...values, monthly_rent: values.monthly_rent ? Number(values.monthly_rent) : undefined });
      setResult(inv);
      qc.invalidateQueries({ queryKey: ["unit", String(unit.id)] });
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch (err) {
      if (applyFieldErrors(t, err, form.setError, ["full_name", "email", "phone"])) setStep(0);
      else if (applyFieldErrors(t, err, form.setError, ["start_date", "lease_end_date", "monthly_rent", "rent_due_day"])) setStep(1);
      else setError(errorMessage(t, err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close} title={t("properties:invite.title", { unit: unit.name })} className="max-w-xl">
      {result?.invite_link ? (
        <div className="space-y-4">
          <Banner tone="success" title={t("properties:invite.createdTitle")}>{t("properties:invite.createdText", { name: result.full_name, email: result.email })}</Banner>
          <InviteLinkBox link={result.invite_link} name={result.full_name} />
          <div className="flex justify-end"><Button onClick={() => close(false)}>{t("common:actions.done")}</Button></div>
        </div>
      ) : (
        <GuidedFormStepper steps={steps} current={step} onBack={() => setStep(step - 1)} onNext={next} onCancel={() => close(false)} nextLoading={form.formState.isSubmitting} nextLabel={step === 2 ? t("properties:invite.create") : undefined}>
          {error && <Banner tone="danger">{error}</Banner>}
          {step === 0 && (
            <>
              <Field label={t("properties:invite.name")} error={e.full_name?.message}><Input autoComplete="off" {...form.register("full_name")} /></Field>
              <Field label={t("properties:invite.email")} hint={t("properties:invite.emailHint")} error={e.email?.message}><Input type="email" autoComplete="off" {...form.register("email")} /></Field>
              <Field label={t("common:auth.phone")} optional><Input type="tel" {...form.register("phone")} /></Field>
            </>
          )}
          {step === 1 && (
            <>
              <Field label={t("properties:invite.startDate")} error={e.start_date?.message}><Input type="date" {...form.register("start_date")} /></Field>
              <Field label={t("properties:invite.rent")} optional hint={t("properties:invite.rentHint")} error={e.monthly_rent?.message}><Input inputMode="numeric" {...form.register("monthly_rent")} /></Field>
              <Field label={t("properties:invite.dueDay")} hint={t("properties:invite.dueDayHint")} error={e.rent_due_day?.message}><Input type="number" min={1} max={28} inputMode="numeric" {...form.register("rent_due_day")} /></Field>
            </>
          )}
          {step === 2 && (
            <dl className="divide-y divide-line rounded-xl border border-line">
              {[
                [t("properties:invite.name"), v.full_name],
                [t("properties:invite.email"), v.email],
                [t("properties:invite.startDate"), formatDate(v.start_date)],
                [t("properties:invite.rent"), v.monthly_rent ? formatMoney(Number(v.monthly_rent)) : "—"],
                [t("properties:invite.dueDay"), String(v.rent_due_day)],
              ].map(([k, val]) => <div key={k} className="flex flex-wrap justify-between gap-2 p-3"><dt className="text-muted">{k}</dt><dd className="font-semibold">{val}</dd></div>)}
            </dl>
          )}
        </GuidedFormStepper>
      )}
    </Dialog>
  );
}
