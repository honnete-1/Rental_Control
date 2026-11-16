import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";

import { Banner } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError, post } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { AuthCard } from "./Login";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const { uid, token } = useParams();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = z
    .object({ new_password: z.string().min(8, t("common:validation.passwordLength")), password2: z.string() })
    .refine((v) => v.new_password === v.password2, { path: ["password2"], message: t("common:validation.passwordsMatch") });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { new_password: "", password2: "" } });
  const onSubmit = form.handleSubmit(async ({ new_password }) => {
    setError(null);
    try {
      await post("/api/auth/password-reset/confirm/", { uid, token, new_password });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.fields.token) setError(t("common:validation.invalid_reset_link"));
      else if (e instanceof ApiError && e.fields.new_password) form.setError("new_password", { message: e.fields.new_password[0].message });
      else setError(errorMessage(t, e));
    }
  });
  return (
    <AuthCard>
      <PageHeader title={t("common:auth.resetTitle")} />
      {done ? (
        <div className="space-y-5">
          <Banner tone="success" title={t("common:auth.resetDoneTitle")}>{t("common:auth.resetDoneText")}</Banner>
          <ButtonLink to="/login" full size="lg">{t("common:auth.signIn")}</ButtonLink>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Banner tone="danger">{error} <Link to="/forgot-password" className="underline">{t("common:auth.requestNewLink")}</Link></Banner>}
          <Field label={t("common:auth.newPassword")} hint={t("common:auth.passwordHint")} error={form.formState.errors.new_password?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("new_password")} />
          </Field>
          <Field label={t("common:auth.passwordAgain")} error={form.formState.errors.password2?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("password2")} />
          </Field>
          <Button type="submit" size="lg" full loading={form.formState.isSubmitting}>{t("common:auth.saveNewPassword")}</Button>
        </form>
      )}
    </AuthCard>
  );
}
