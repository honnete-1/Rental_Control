import { Languages } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/AuthContext";
import { LANGUAGES, type LanguageCode } from "@/i18n";
import { cn } from "@/lib/utils";

/** Always-visible language choice. Changes all text at once, without signing out. */
export function LanguageSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const { changeLanguage } = useAuth();
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className={cn("flex items-center gap-1.5 font-semibold", compact && "sr-only")}>
        <Languages className="size-5" aria-hidden="true" />
        {t("common:language.label")}
      </label>
      <select
        id={id}
        value={i18n.language.slice(0, 2)}
        onChange={(e) => changeLanguage(e.target.value as LanguageCode)}
        className="min-h-11 rounded-xl border-2 border-line bg-surface px-3 font-semibold text-navy-800 focus:border-teal-600 dark:bg-navy-900 dark:text-slate-100"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
