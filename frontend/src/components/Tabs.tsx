import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Accessible tabs (arrow keys move between tabs). The selected tab is kept in the URL by the caller. */
export function Tabs({ tabs, value, onChange, label, children }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void; label: string; children: ReactNode }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].id);
      refs.current[next]?.focus();
    }
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-6 flex gap-1 overflow-x-auto border-b-2 border-line">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            id={`tab-${tab.id}`}
            aria-selected={value === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-0.5 min-h-12 whitespace-nowrap border-b-4 px-4 font-semibold",
              value === tab.id ? "border-teal-600 text-teal-700 dark:text-white" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${value}`} aria-labelledby={`tab-${value}`} tabIndex={0} className="focus:outline-none">
        {children}
      </div>
    </div>
  );
}
