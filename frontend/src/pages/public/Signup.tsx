import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";

import { homePathFor, useAuth } from "@/auth/AuthContext";
import { Banner } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { post } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import type { User } from "@/lib/types";
import { AuthCard } from "./Login";

export default function SignupPage() {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const schema = z
    .object({
      full_name: z.string().trim().min(2, t("common:validation.nameRequired")),
      email: z.string().trim().min(1, t("common:validation.required")).email(t("common:validation.email")),
      phone: z.string().trim().optional(),
      role: z.enum(["landlord", "manager"]),
      password: z.string().min(8, t("common:validation.passwordLength")),
      password2: z.string(),
    })
    .refine((v) => v.password === v.password2, { path: ["password2"], message: t("common:validation.passwordsMatch") });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { full_name: "", email: "", phone: "", role: "landlord", password: "", password2: "" } });
  const errors = form.formState.errors;

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const onSubmit = form.handleSubmit(async ({ password2: _ignored, ...values }) => {
    setError(null);
    try {
      const me = await post<User>("/api/auth/signup/", { ...values, language: i18n.language.slice(0, 2) });
      setUser(me);
      navigate(me.role === "landlord" ? "/landlord/welcome" : "/landlord", { replace: true });
    } catch (e) {
      if (!applyFieldErrors(t, e, form.setError, ["full_name", "email", "phone", "password", "role"])) setError(errorMessage(t, e));
    }
  });

  return (
    <AuthCard>
      <PageHeader title={t("common:auth.signUpTitle")} subtitle={t("common:auth.signUpSubtitle")} />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("common:auth.fullName")} error={errors.full_name?.message}>
          <Input autoComplete="name" {...form.register("full_name")} />
        </Field>
        <Field label={t("common:auth.email")} error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field label={t("common:auth.phone")} optional hint={t("common:auth.phoneHint")} error={errors.phone?.message}>
          <Input type="tel" autoComplete="tel" inputMode="tel" {...form.register("phone")} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="font-semibold text-navy-800 dark:text-slate-100">{t("common:auth.iAm")}</legend>
          {(["landlord", "manager"] as const).map((role) => (
            <label key={role} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-3 has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50 dark:has-[:checked]:bg-navy-700">
              <input type="radio" value={role} className="mt-1 size-5 accent-teal-600" {...form.register("role")} />
              <span>
                <span className="block font-semibold">{t(`common:roles.${role}`)}</span>
                <span className="block text-sm text-muted">{t(`common:auth.roleHint.${role}`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label={t("common:auth.password")} hint={t("common:auth.passwordHint")} error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field label={t("common:auth.passwordAgain")} error={errors.password2?.message}>
          <Input type="password" autoComplete="new-password" {...form.register("password2")} />
        </Field>
        <Button type="submit" size="lg" full loading={form.formState.isSubmitting}>
          {t("common:auth.createAccount")}
        </Button>
        <p className="text-center">
          {t("common:auth.haveAccount")}{" "}
          <Link to="/login" className="font-semibold text-teal-600 underline">{t("common:auth.signIn")}</Link>
        </p>
        <p className="text-center text-sm text-muted">
          <Link to="/privacy" className="underline">{t("common:privacy.title")}</Link>
        </p>
      </form>
    </AuthCard>
  );
}
