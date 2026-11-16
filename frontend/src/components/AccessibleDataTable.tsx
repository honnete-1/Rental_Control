import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

/**
 * A real <table> with a caption and column headers on wide screens; becomes a
 * stacked list of labelled cards on phones so nothing has to scroll sideways.
 */
export function AccessibleDataTable<T>({ caption, columns, rows, rowKey, footer }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; footer?: ReactNode }) {
  return (
    <div>
      <table className="hidden w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-line bg-surface md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`border-b border-line bg-canvas px-4 py-3 text-sm font-bold text-navy-800 dark:text-slate-100 ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-canvas">
              {columns.map((c) => (
                <td key={c.key} className={`border-b border-line px-4 py-3 align-middle ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr>
              <td colSpan={columns.length} className="bg-canvas px-4 py-3 font-bold">{footer}</td>
            </tr>
          </tfoot>
        )}
      </table>
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-2xl border border-line bg-surface p-4">
            <dl className="space-y-2">
              {columns.map((c) => (
                <div key={c.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <dt className="text-sm text-muted">{c.header}</dt>
                  <dd className="text-right font-medium">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
        {footer && <li className="rounded-2xl bg-canvas p-4 font-bold">{footer}</li>}
      </ul>
    </div>
  );
}
