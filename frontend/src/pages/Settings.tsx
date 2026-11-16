import { zodResolver } from "@hookform/resolvers/zod";
import { Moon, Sun, Type } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { useAuth } from "@/auth/AuthContext";
import { Banner } from "@/components/feedback";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { patch, post } from "@/lib/api";
import { applyFieldErrors, errorMessage } from "@/lib/errors";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

function ChoiceButtons<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon: typeof Sun }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-3 font-semibold", value === o.value ? "border-teal-600 bg-teal-50 text-teal-700 dark:bg-navy-700 dark:text-white" : "border-line")}>
          <o.icon className="size-5" aria-hidden="true" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, setUser, changeTextSize, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"light" | "dark">(() => (document.documentElement.classList.contains("dark") ? "dark" : "light"));
  const [profileError, setProfileError] = useState<string | null>(null);

  const profileSchema = z.object({ full_name: z.string().trim().min(2, t("common:validation.nameRequired")), phone: z.string().trim().optional() });
  const profile = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema), values: { full_name: user?.full_name ?? "", phone: user?.phone ?? "" } });

  const pwSchema = z
    .object({ current_password: z.string().min(1, t("common:validation.required")), new_password: z.string().min(8, t("common:validation.passwordLength")), password2: z.string() })
    .refine((v) => v.new_password === v.password2, { path: ["password2"], message: t("common:validation.passwordsMatch") });
  const pw = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema), defaultValues: { current_password: "", new_password: "", password2: "" } });

  const setThemeAndSave = (value: "light" | "dark") => {
    setTheme(value);
    document.documentElement.classList.toggle("dark", value === "dark");
    try {
      localStorage.setItem("rc-theme", value);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <PageHeader title={user?.role === "tenant" ? t("common:nav.profile") : t("common:nav.settings")} subtitle={t("common:settings.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5">
          <CardTitle>{t("common:settings.display")}</CardTitle>
          <LanguageSwitcher />
          <div className="space-y-2">
            <p className="font-semibold">{t("common:settings.textSize")}</p>
            <ChoiceButtons label={t("common:settings.textSize")} value={user?.text_size ?? "normal"} onChange={(v) => changeTextSize(v)}
              options={[{ value: "normal", label: t("common:settings.textNormal"), icon: Type }, { value: "large", label: t("common:settings.textLarge"), icon: Type }]} />
          </div>
          <div className="space-y-2">
            <p className="font-semibold">{t("common:settings.theme")}</p>
            <ChoiceButtons label={t("common:settings.theme")} value={theme} onChange={setThemeAndSave}
              options={[{ value: "light", label: t("common:settings.light"), icon: Sun }, { value: "dark", label: t("common:settings.dark"), icon: Moon }]} />
          </div>
        </Card>

        <Card>
          <CardTitle>{t("common:settings.profile")}</CardTitle>
          <form className="mt-4 space-y-5" noValidate onSubmit={profile.handleSubmit(async (values) => {
            setProfileError(null);
            try {
              setUser(await patch<User>("/api/auth/me/", values));
              toast.show(t("common:settings.profileSaved"));
            } catch (e) {
              if (!applyFieldErrors(t, e, profile.setError, ["full_name", "phone"])) setProfileError(errorMessage(t, e));
            }
          })}>
            {profileError && <Banner tone="danger">{profileError}</Banner>}
            <Field label={t("common:auth.email")} hint={t("common:settings.emailFixed")}>
              <Input value={user?.email ?? ""} readOnly disabled />
            </Field>
            <Field label={t("common:auth.fullName")} error={profile.formState.errors.full_name?.message}>
              <Input autoComplete="name" {...profile.register("full_name")} />
            </Field>
            <Field label={t("common:auth.phone")} optional>
              <Input type="tel" autoComplete="tel" {...profile.register("phone")} />
            </Field>
            <Button type="submit" loading={profile.formState.isSubmitting}>{t("common:actions.saveChanges")}</Button>
          </form>
        </Card>

        <Card>
          <CardTitle>{t("common:settings.password")}</CardTitle>
          <form className="mt-4 space-y-5" noValidate onSubmit={pw.handleSubmit(async ({ current_password, new_password }) => {
            try {
              await post("/api/auth/change-password/", { current_password, new_password });
              pw.reset();
              toast.show(t("common:settings.passwordSaved"));
            } catch (e) {
              if (!applyFieldErrors(t, e, pw.setError, ["current_password", "new_password"])) toast.show(errorMessage(t, e), "error");
            }
          })}>
            <Field label={t("common:auth.currentPassword")} error={pw.formState.errors.current_password?.message}>
              <Input type="password" autoComplete="current-password" {...pw.register("current_password")} />
            </Field>
            <Field label={t("common:auth.newPassword")} hint={t("common:auth.passwordHint")} error={pw.formState.errors.new_password?.message}>
              <Input type="password" autoComplete="new-password" {...pw.register("new_password")} />
            </Field>
            <Field label={t("common:auth.passwordAgain")} error={pw.formState.errors.password2?.message}>
              <Input type="password" autoComplete="new-password" {...pw.register("password2")} />
            </Field>
            <Button type="submit" variant="secondary" loading={pw.formState.isSubmitting}>{t("common:settings.changePassword")}</Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <CardTitle>{t("common:settings.account")}</CardTitle>
          <p className="text-muted">{t("common:settings.signedInAs", { email: user?.email, role: t(`common:roles.${user?.role}`) })}</p>
          <Button variant="secondary" onClick={async () => { await logout(); navigate("/"); }}>{t("common:auth.signOut")}</Button>
        </Card>
      </div>
    </>
  );
}
