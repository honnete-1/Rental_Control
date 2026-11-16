import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { homePathFor, useAuth } from "@/auth/AuthContext";
import { Banner } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { post } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import type { User } from "@/lib/types";

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="p-6 sm:p-8">{children}</Card>
    </div>
  );
}

/** Only allow returning to a path inside this app. */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export default function LoginPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    email: z.string().trim().min(1, t("common:validation.required")).email(t("common:validation.email")),
    password: z.string().min(1, t("common:validation.required")),
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (user) return <Navigate to={safeNext(params.get("next")) ?? homePathFor(user)} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const me = await post<User>("/api/auth/login/", values);
      if (me.role === "admin") {
        window.location.assign("/admin/");
        return;
      }
      setUser(me);
      navigate(safeNext(params.get("next")) ?? homePathFor(me), { replace: true });
    } catch (e) {
      setError(errorMessage(t, e));
    }
  });

  return (
    <AuthCard>
      <PageHeader title={t("common:auth.signInTitle")} subtitle={t("common:auth.signInSubtitle")} />
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label={t("common:auth.email")} error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field label={t("common:auth.password")} error={form.formState.errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...form.register("password")} />
        </Field>
        <Button type="submit" size="lg" full loading={form.formState.isSubmitting}>
          {t("common:auth.signIn")}
        </Button>
        <div className="flex flex-col gap-2 text-center">
          <Link to="/forgot-password" className="inline-flex min-h-11 items-center justify-center font-semibold text-teal-600 underline">
            {t("common:auth.forgotPassword")}
          </Link>
          <p>
            {t("common:auth.noAccount")}{" "}
            <Link to="/signup" className="font-semibold text-teal-600 underline">{t("common:auth.signUp")}</Link>
          </p>
          <p className="text-sm text-muted">{t("common:auth.tenantHint")}</p>
        </div>
      </form>
    </AuthCard>
  );
}
