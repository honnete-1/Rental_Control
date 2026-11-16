import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  danger?: boolean;
}

/** Asked before any destructive or important action. The safe choice is first and focused. */
export function ConfirmationDialog({ open, onOpenChange, title, message, confirmLabel, onConfirm, loading, danger = true }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      <div className="text-base">{message}</div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => onOpenChange(false)} autoFocus>
          {t("common:actions.noGoBack")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
