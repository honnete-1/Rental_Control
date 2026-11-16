import type { TFunction } from "i18next";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError } from "./api";

/** A friendly, translated sentence for any error coming from the API. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "validation_error") return t("common:errors.validation_error");
    return t(`common:errors.${error.code}`, { defaultValue: error.message || t("common:errors.unknown") });
  }
  return t("common:errors.unknown");
}

/** Puts server-side field errors next to the matching form fields (inputs are kept). */
export function applyFieldErrors<T extends FieldValues>(t: TFunction, error: unknown, setError: UseFormSetError<T>, fields: string[]) {
  if (!(error instanceof ApiError) || !error.fields) return false;
  let applied = false;
  Object.entries(error.fields).forEach(([field, problems]) => {
    if (!fields.includes(field) || !Array.isArray(problems) || !problems[0]) return;
    const p = problems[0];
    setError(field as Path<T>, { type: "server", message: t(`common:validation.${p.code}`, { defaultValue: p.message }) });
    applied = true;
  });
  return applied;
}
