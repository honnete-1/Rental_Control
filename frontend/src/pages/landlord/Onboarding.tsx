import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, DoorOpen, LayoutDashboard, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { ME_KEY, useAuth } from "@/auth/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { patch } from "@/lib/api";

/** Short welcome: four plain steps, then straight to adding the first property. */
export default function OnboardingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const finish = useMutation({
    mutationFn: () => patch("/api/auth/me/", { onboarding_completed: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
  const steps = [
    { icon: Building2, key: "property" },
    { icon: DoorOpen, key: "unit" },
    { icon: UserPlus, key: "tenant" },
    { icon: LayoutDashboard, key: "dashboard" },
  ];
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("common:onboarding.title", { name: user?.full_name?.split(" ")[0] })} subtitle={t("common:onboarding.subtitle")} />
      <Card>
        <ol className="space-y-5">
          {steps.map(({ icon: Icon, key }, i) => (
            <li key={key} className="flex gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="font-bold">{i + 1}. {t(`common:onboarding.steps.${key}.title`)}</p>
                <p className="text-muted">{t(`common:onboarding.steps.${key}.text`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink to="/landlord/properties/new" size="lg" onClick={() => finish.mutate()}>{t("common:onboarding.start")}</ButtonLink>
          <Button variant="ghost" onClick={async () => { await finish.mutateAsync(); navigate("/landlord"); }}>{t("common:onboarding.skip")}</Button>
        </div>
      </Card>
    </div>
  );
}
