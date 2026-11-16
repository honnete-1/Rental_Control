import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { Button } from "./ui/button";

interface Props {
  steps: string[];
  current: number; // 0-based
  title?: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onCancel?: () => void;
  nextLabel?: string;
  nextLoading?: boolean;
  nextDisabled?: boolean;
  nextType?: "button" | "submit";
}

/** Step-by-step wrapper showing "Step 2 of 4", with clear Back, Next and Cancel. */
export function GuidedFormStepper({ steps, current, title, children, onBack, onNext, onCancel, nextLabel, nextLoading, nextDisabled, nextType = "button" }: Props) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // Move focus to the new step's heading so screen reader and keyboard users know where they are.
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [current]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="font-semibold text-teal-600">{t("common:stepper.stepOf", { current: current + 1, total: steps.length })}</p>
      <ol className="mt-2 flex gap-1.5" aria-label={t("common:stepper.progress")}>
        {steps.map((label, i) => (
          <li key={label} className="flex-1" aria-current={i === current ? "step" : undefined}>
            <span className={cn("block h-2 rounded-full", i <= current ? "bg-teal-600" : "bg-slate-300")} aria-hidden="true" />
            <span className="sr-only">
              {label}
              {i < current ? ` — ${t("common:stepper.done")}` : ""}
            </span>
          </li>
        ))}
      </ol>
      <h2 ref={headingRef} tabIndex={-1} className="mt-5 text-2xl font-bold focus:outline-none">
        {title ?? steps[current]}
      </h2>
      <div className="mt-5 space-y-5">{children}</div>
      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t("common:actions.cancel")}
          </Button>
        )}
        <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row">
          {current > 0 && onBack && (
            <Button variant="secondary" onClick={onBack}>
              <ArrowLeft aria-hidden="true" />
              {t("common:actions.back")}
            </Button>
          )}
          <Button type={nextType} onClick={nextType === "button" ? onNext : undefined} loading={nextLoading} disabled={nextDisabled} size="lg">
            {nextLabel ?? t("common:actions.next")}
            {current === steps.length - 1 ? <Check aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
