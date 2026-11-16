import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { z } from "zod";

import { Banner } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { post } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { AuthCard } from "./Login";

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({ email: z.string().trim().min(1, t("common:validation.required")).email(t("common:validation.email")) });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await post("/api/auth/password-reset/", values);
      setSent(true);
    } catch (e) {
      setError(errorMessage(t, e));
    }
  });
  return (
    <AuthCard>
      <PageHeader title={t("common:auth.forgotTitle")} subtitle={t("common:auth.forgotSubtitle")} />
      {sent ? (
        <Banner tone="success" title={t("common:auth.resetSentTitle")}>{t("common:auth.resetSentText")}</Banner>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Banner tone="danger">{error}</Banner>}
          <Field label={t("common:auth.email")} error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" {...form.register("email")} />
          </Field>
          <Button type="submit" size="lg" full loading={form.formState.isSubmitting}>{t("common:auth.sendResetLink")}</Button>
        </form>
      )}
      <p className="mt-6 text-center">
        <Link to="/login" className="font-semibold text-teal-600 underline">{t("common:auth.backToSignIn")}</Link>
      </p>
    </AuthCard>
  );
}
