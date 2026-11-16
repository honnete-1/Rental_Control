import { AlertCircle } from "lucide-react";
import { cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

const control =
  "block w-full min-h-12 rounded-xl border-2 border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-slate-500 focus:border-teal-600 focus:outline-none aria-[invalid=true]:border-danger-700 dark:bg-navy-900";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(control, "min-h-28", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(control, "pr-8", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const child = isValidElement(children)
    ? cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block font-semibold text-navy-800 dark:text-slate-100">
        {label}
        {optional && <span className="ml-2 text-sm font-normal text-muted">({t("common:form.optional")})</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {child}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger-700" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-1 size-6 shrink-0 accent-teal-600" {...props} />
      <label htmlFor={id} className="min-h-11 cursor-pointer">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </label>
    </div>
  );
}
