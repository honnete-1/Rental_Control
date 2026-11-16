import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Home } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "@/auth/AuthContext";
import { Banner, ErrorState, LoadingSkeleton } from "@/components/feedback";
import { PageHeader } from "@/components/PageHeader";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { get, post } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";
import { AuthCard } from "./Login";

interface InvitationInfo {
  status: "pending" | "accepted" | "expired" | "cancelled";
  full_name: string;
  email: string;
  property_name: string;
  unit_name: string;
  landlord_name: string;
  start_date: string;
  account_exists: boolean;
}

/** Tenants join only through a secure invitation link from their landlord. */
export default function JoinPage() {
  const { t, i18n } = useTranslation();
  const { token = "" } = useParams();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const info = useQuery({ queryKey: ["invitation", token], queryFn: () => get<InvitationInfo>(`/api/auth/invitations/${token}/`), retry: false });
  const schema = z
    .object({
      full_name: z.string().trim().min(2, t("common:validation.nameRequired")),
      phone: z.string().optional(),
      password: z.string().min(8, t("common:validation.passwordLength")),
      password2: z.string(),
    })
    .refine((v) => v.password === v.password2, { path: ["password2"], message: t("common:validation.passwordsMatch") });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), values: { full_name: info.data?.full_name ?? "", phone: "", password: "", password2: "" } });

  const accept = async (body: Record<string, unknown>) => {
    setError(null);
    try {
      const me = await post<User>(`/api/auth/invitations/${token}/accept/`, { ...body, language: i18n.language.slice(0, 2) });
      setUser(me);
      navigate("/tenant?welcome=1", { replace: true });
    } catch (e) {
      if (!applyFieldErrors(t, e, form.setError, ["full_name", "password", "phone"])) setError(errorMessage(t, e));
    }
  };

  if (info.isPending) return <AuthCard><LoadingSkeleton /></AuthCard>;
  if (info.isError) return <AuthCard><PageHeader title={t("common:join.title")} /><ErrorState error={info.error} /></AuthCard>;
  const inv = info.data;

  return (
    <AuthCard>
      <PageHeader title={t("common:join.title")} />
      <div className="mb-6 flex items-start gap-3 rounded-xl bg-teal-50 p-4 text-navy-800">
        <Home className="mt-1 size-6 shrink-0 text-teal-600" aria-hidden="true" />
        <p>{t("common:join.intro", { landlord: inv.landlord_name, property: inv.property_name, unit: inv.unit_name, date: formatDate(inv.start_date) })}</p>
      </div>
      {inv.status !== "pending" ? (
        <Banner tone="warning" title={t(`common:join.status.${inv.status}`)}>{t("common:join.askLandlord")}</Banner>
      ) : inv.account_exists ? (
        <div className="space-y-4">
          {error && <Banner tone="danger">{error}</Banner>}
          {user ? (
            user.email === inv.email ? (
              <Button size="lg" full onClick={() => accept({})}>{t("common:join.acceptButton")}</Button>
            ) : (
              <Banner tone="warning">{t("common:join.wrongAccount", { email: inv.email })}</Banner>
            )
          ) : (
            <>
              <p>{t("common:join.signInFirst", { email: inv.email })}</p>
              <ButtonLink to={`/login?next=${encodeURIComponent(`/join/${token}`)}`} size="lg" full>{t("common:auth.signIn")}</ButtonLink>
            </>
          )}
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(({ password2: _p, ...v }) => accept(v))} className="space-y-5" noValidate>
          {error && <Banner tone="danger">{error}</Banner>}
          <p className="text-muted">{t("common:join.createAccountFor", { email: inv.email })}</p>
          <Field label={t("common:auth.fullName")} error={form.formState.errors.full_name?.message}>
            <Input autoComplete="name" {...form.register("full_name")} />
          </Field>
          <Field label={t("common:auth.phone")} optional error={form.formState.errors.phone?.message}>
            <Input type="tel" autoComplete="tel" {...form.register("phone")} />
          </Field>
          <Field label={t("common:auth.password")} hint={t("common:auth.passwordHint")} error={form.formState.errors.password?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field label={t("common:auth.passwordAgain")} error={form.formState.errors.password2?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("password2")} />
          </Field>
          <Button type="submit" size="lg" full loading={form.formState.isSubmitting}>{t("common:join.acceptButton")}</Button>
          <p className="text-center text-sm text-muted"><Link to="/privacy" className="underline">{t("common:privacy.title")}</Link></p>
        </form>
      )}
    </AuthCard>
  );
}
