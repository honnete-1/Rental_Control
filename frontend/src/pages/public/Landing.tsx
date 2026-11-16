import { Building2, Camera, ClipboardCheck, HandCoins, Languages, Wrench } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { ButtonLink } from "@/components/ui/button";

export default function LandingPage() {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `Rental_Control — ${t("common:landing.tagline")}`;
  }, [t]);
  const features = [
    { icon: Building2, key: "properties" },
    { icon: ClipboardCheck, key: "passport" },
    { icon: Wrench, key: "repairs" },
    { icon: Camera, key: "photos" },
    { icon: HandCoins, key: "money" },
    { icon: Languages, key: "languages" },
  ];
  return (
    <>
      <section className="bg-navy-800 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-2 md:py-20">
          <div className="space-y-6">
            <p className="inline-block rounded-full bg-teal-600 px-3 py-1 text-sm font-semibold">{t("common:landing.badge")}</p>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-5xl">{t("common:landing.title")}</h1>
            <p className="text-lg text-slate-200">{t("common:landing.subtitle")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/signup" size="lg">{t("common:landing.ctaLandlord")}</ButtonLink>
              <ButtonLink to="/login" size="lg" variant="secondary" className="border-white bg-transparent text-white hover:bg-navy-700">
                {t("common:auth.signIn")}
              </ButtonLink>
            </div>
            <p className="text-slate-300">{t("common:landing.tenantNote")}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 text-ink shadow-xl" aria-hidden="true">
            <p className="text-sm font-semibold text-muted">{t("common:dashboard.needsAttention")}</p>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border-l-4 border-danger-700 bg-danger-50 p-3">
                <p className="font-bold text-danger-700">{t("common:landing.exampleUrgent")}</p>
                <p className="text-sm text-muted">Kibagabaga Residence · A1</p>
              </div>
              <div className="rounded-xl border-l-4 border-warning-700 bg-warning-50 p-3">
                <p className="font-bold text-warning-700">{t("common:landing.exampleRent")}</p>
                <p className="text-sm text-muted">Remera · {t("common:landing.exampleExample")}</p>
              </div>
              <div className="rounded-xl border-l-4 border-success-700 bg-success-50 p-3">
                <p className="font-bold text-success-700">{t("common:landing.exampleDone")}</p>
                <p className="text-sm text-muted">RWF 45,000</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold md:text-3xl">{t("common:landing.featuresTitle")}</h2>
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, key }) => (
            <li key={key} className="rounded-2xl border border-line bg-surface p-6">
              <span className="inline-flex size-12 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-bold">{t(`common:landing.features.${key}.title`)}</h3>
              <p className="mt-1 text-muted">{t(`common:landing.features.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
