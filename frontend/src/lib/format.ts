import i18n from "@/i18n";

/** Business timezone. Timestamps come from the API in UTC and are shown in Kigali time. */
export const TIMEZONE = "Africa/Kigali";

const LOCALES: Record<string, string[]> = {
  en: ["en-RW", "en-GB", "en"],
  fr: ["fr-RW", "fr-FR", "fr"],
  rw: [], // always use our own Kinyarwanda month names, so every browser shows the same format
};

function lang() {
  return (i18n.language || "en").slice(0, 2);
}

/** The best Intl locale for the current language, or null when the browser has no data for it (e.g. Kinyarwanda). */
function nativeLocale(): string | null {
  const candidates = LOCALES[lang()] ?? LOCALES.en;
  return Intl.DateTimeFormat.supportedLocalesOf(candidates)[0] ?? null;
}

function numberLocale() {
  // Digit grouping is the same for Kinyarwanda and English, so fall back to en-RW for numbers.
  return nativeLocale() ?? "en-RW";
}

/** Whole Rwandan francs, e.g. "RWF 45,000". Amounts are integers from the API. */
export function formatMoney(amount: number | null | undefined, currency = "RWF") {
  if (amount === null || amount === undefined) return "—";
  const n = new Intl.NumberFormat(numberLocale(), { maximumFractionDigits: 0 }).format(amount);
  return `${currency} ${n}`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat(numberLocale()).format(n);
}

function toDate(value: string | Date) {
  if (value instanceof Date) return value;
  // Plain dates (YYYY-MM-DD) are calendar days, not instants: read them as noon UTC to avoid shifting days.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

/** Calendar parts of a moment, in Kigali time. */
function kigaliParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE, year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: Number(get("month")), day: Number(get("day")), time: `${get("hour")}:${get("minute")}` };
}

function monthName(month: number) {
  return i18n.t(`common:dates.months.${month}`);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = toDate(value);
  const loc = nativeLocale();
  if (loc) return new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric", timeZone: TIMEZONE }).format(d);
  const p = kigaliParts(d);
  return `${p.day} ${monthName(p.month)} ${p.year}`;
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = toDate(value);
  const loc = nativeLocale();
  if (loc) {
    return new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TIMEZONE }).format(d);
  }
  const p = kigaliParts(d);
  return `${p.day} ${monthName(p.month)} ${p.year}, ${p.time}`;
}

export function formatMonth(value: string | Date) {
  const d = toDate(value);
  const loc = nativeLocale();
  if (loc) return new Intl.DateTimeFormat(loc, { month: "long", year: "numeric", timeZone: TIMEZONE }).format(d);
  const p = kigaliParts(d);
  return `${monthName(p.month)} ${p.year}`;
}

/** Today's date in Kigali, as YYYY-MM-DD (for date inputs). */
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function firstOfMonthISO() {
  return `${todayISO().slice(0, 8)}01`;
}

/** "5 minutes ago", using translated phrases so every language is covered. */
export function relativeTime(value: string) {
  const seconds = (Date.now() - toDate(value).getTime()) / 1000;
  if (seconds < 60) return i18n.t("common:dates.justNow");
  if (seconds < 3600) return i18n.t("common:dates.minutesAgo", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return i18n.t("common:dates.hoursAgo", { count: Math.floor(seconds / 3600) });
  if (seconds < 86400 * 30) return i18n.t("common:dates.daysAgo", { count: Math.floor(seconds / 86400) });
  return formatDate(value);
}
