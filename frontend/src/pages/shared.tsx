import { Compass, HelpCircle, Mail, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { homePathFor, useAuth } from "@/auth/AuthContext";
import { NotificationList } from "@/components/NotificationPanel";
import { PageHeader } from "@/components/PageHeader";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const HELP_TOPICS = ["addProperty", "inviteTenant", "reportProblem", "trackRepair", "inspection", "rent", "language", "textSize"] as const;

export function HelpPage({ inApp }: { inApp?: boolean }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const topics = user?.role === "tenant" ? (["reportProblem", "trackRepair", "language", "textSize"] as const) : HELP_TOPICS;
  return (
    <div className={inApp ? "" : "mx-auto max-w-3xl px-4 py-10"}>
      <PageHeader title={t("common:help.title")} subtitle={t("common:help.subtitle")} />
      <div className="space-y-3">
        {topics.map((key) => (
          <details key={key} className="group rounded-2xl border border-line bg-surface p-0 open:border-teal-600">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 text-lg font-semibold">
              <HelpCircle className="size-6 shrink-0 text-teal-600" aria-hidden="true" />
              {t(`common:help.topics.${key}.q`)}
            </summary>
            <div className="whitespace-pre-line px-5 pb-5 text-base">{t(`common:help.topics.${key}.a`)}</div>
          </details>
        ))}
      </div>
      <Card className="mt-8">
        <h2 className="text-xl font-bold">{t("common:help.contactTitle")}</h2>
        <p className="mt-2 text-muted">{t("common:help.contactText")}</p>
        <ul className="mt-4 space-y-2">
          <li className="flex items-center gap-2"><Phone className="size-5 text-teal-600" aria-hidden="true" />{t("common:help.contactPhone")}</li>
          <li className="flex items-center gap-2"><Mail className="size-5 text-teal-600" aria-hidden="true" />{t("common:help.contactEmail")}</li>
        </ul>
      </Card>
    </div>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();
  const sections = ["what", "why", "who", "photos", "rights", "storage"] as const;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title={t("common:privacy.title")} subtitle={t("common:privacy.subtitle")} />
      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s}>
            <h2 className="text-xl font-bold">{t(`common:privacy.sections.${s}.title`)}</h2>
            <p className="mt-2 whitespace-pre-line">{t(`common:privacy.sections.${s}.text`)}</p>
          </section>
        ))}
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <Compass className="mx-auto size-16 text-teal-600" aria-hidden="true" />
      <PageHeader title={t("common:notFound.title")} />
      <p className="text-muted">{t("common:notFound.text")}</p>
      <ButtonLink to={homePathFor(user)} className="mt-6" size="lg">{t("common:notFound.goHome")}</ButtonLink>
    </div>
  );
}

export function NotificationsPage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t("common:nav.notifications")} subtitle={t("common:notifications.subtitle")} />
      <NotificationList />
    </>
  );
}
