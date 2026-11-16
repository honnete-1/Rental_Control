import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Accessible modal (focus trap, Escape to close, labelled title) built on Radix. */
export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  const { t } = useTranslation();
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-navy-900/60" />
        <RadixDialog.Content
          className={cn(
            "fixed inset-x-3 top-[5vh] z-50 mx-auto max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl bg-surface p-6 shadow-xl focus:outline-none",
            className,
          )}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <RadixDialog.Title className="text-xl font-bold text-navy-800 dark:text-white">{title}</RadixDialog.Title>
            <RadixDialog.Close className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-navy-50" aria-label={t("common:actions.close")}>
              <X className="size-6" aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {description && <RadixDialog.Description className="mb-4 text-muted">{description}</RadixDialog.Description>}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
