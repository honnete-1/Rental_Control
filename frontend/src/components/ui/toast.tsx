import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<{ show: (message: string, tone?: Toast["tone"]) => void }>({ show: () => undefined });

/** Clear confirmation after an action. Announced politely to screen readers; stays 6 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);
  const show = useCallback(
    (message: string, tone: Toast["tone"] = "success") => {
      const id = Date.now() + Math.random();
      setToasts((all) => [...all.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-center gap-2 md:bottom-6" aria-live="polite" role="status">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border-2 p-4 shadow-lg ${
              toast.tone === "success" ? "border-success-700 bg-success-50 text-success-700" : "border-danger-700 bg-danger-50 text-danger-700"
            }`}
          >
            {toast.tone === "success" ? <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" /> : <AlertTriangle className="size-6 shrink-0" aria-hidden="true" />}
            <p className="flex-1 font-semibold">{toast.message}</p>
            <button type="button" onClick={() => dismiss(toast.id)} className="-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg" aria-label={t("common:actions.close")}>
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
