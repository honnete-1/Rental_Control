import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "@/locales/en/common.json";
import enProperties from "@/locales/en/properties.json";
import enMaintenance from "@/locales/en/maintenance.json";
import enInspections from "@/locales/en/inspections.json";
import enFinances from "@/locales/en/finances.json";
import rwCommon from "@/locales/rw/common.json";
import rwProperties from "@/locales/rw/properties.json";
import rwMaintenance from "@/locales/rw/maintenance.json";
import rwInspections from "@/locales/rw/inspections.json";
import rwFinances from "@/locales/rw/finances.json";
import frCommon from "@/locales/fr/common.json";
import frProperties from "@/locales/fr/properties.json";
import frMaintenance from "@/locales/fr/maintenance.json";
import frInspections from "@/locales/fr/inspections.json";
import frFinances from "@/locales/fr/finances.json";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "rw", label: "Kinyarwanda" },
  { code: "fr", label: "Français" },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const NAMESPACES = ["common", "properties", "maintenance", "inspections", "finances"] as const;
const STORAGE_KEY = "rc-language";

export const resources = {
  en: { common: enCommon, properties: enProperties, maintenance: enMaintenance, inspections: enInspections, finances: enFinances },
  rw: { common: rwCommon, properties: rwProperties, maintenance: rwMaintenance, inspections: rwInspections, finances: rwFinances },
  fr: { common: frCommon, properties: frProperties, maintenance: frMaintenance, inspections: frInspections, finances: frFinances },
};

function storedLanguage(): LanguageCode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "en" || value === "rw" || value === "fr") return value;
  } catch {
    /* storage may be unavailable */
  }
  return "en";
}

export function rememberLanguage(code: LanguageCode) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage(),
  fallbackLng: "en", // untranslated or flagged strings fall back to English
  supportedLngs: ["en", "rw", "fr"],
  ns: [...NAMESPACES],
  defaultNS: "common",
  interpolation: { escapeValue: false },
  returnNull: false,
});

function syncHtml(lng: string) {
  document.documentElement.lang = lng;
}
syncHtml(i18n.language);
i18n.on("languageChanged", syncHtml);

export default i18n;
