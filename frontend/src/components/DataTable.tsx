import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode } from "react";
import { cn } from "../lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Accessor returning the value for the row. */
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  className?: string;
}

export type SortDir = "asc" | "desc" | null;

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  sortKey?: string | null;
  sortDir?: SortDir;
  onSortChange?: (key: string, dir: SortDir) => void;
  /** Lines per row on mobile (compact cards). */
  mobileCard?: boolean;
  emptyState?: ReactNode;
  loading?: boolean;
  /** When provided, a 3-dots menu rendered per row. */
  rowActions?: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sortKey,
  sortDir,
  onSortChange,
  mobileCard = true,
  emptyState,
  loading,
  rowActions,
}: DataTableProps<T>) {
  if (loading) return <SkeletonRows n={5} />;
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  function handleSort(col: DataTableColumn<T>) {
    if (!col.sortable || !onSortChange) return;
    if (sortKey !== col.key) {
      onSortChange(col.key, "asc");
    } else if (sortDir === "asc") {
      onSortChange(col.key, "desc");
    } else {
      onSortChange(col.key, null);
    }
  }

  return (
    <>
      {/* DESKTOP / TABLET */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-left font-medium border-b border-[var(--color-border)] text-[var(--color-text-muted)]",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.sortable && "cursor-pointer select-none hover:text-[var(--color-text-primary)]",
                    c.className,
                  )}
                  onClick={() => handleSort(c)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortable && sortKey === c.key && (
                      sortDir === "desc"
                        ? <ChevronDown className="w-3 h-3" />
                        : sortDir === "asc"
                          ? <ChevronUp className="w-3 h-3" />
                          : null
                    )}
                  </span>
                </th>
              ))}
              {rowActions && <th scope="col" className="px-2 py-2 w-10 border-b border-[var(--color-border)]" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg-muted)]/40 transition">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 py-2 align-middle",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                {rowActions && <td className="px-2 py-1 align-middle text-right">{rowActions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE: compact cards */}
      {mobileCard && (
        <ul className="sm:hidden space-y-2">
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-3"
            >
              {columns.map((c, idx) => (
                <div
                  key={c.key}
                  className={cn(
                    "flex justify-between gap-2 py-1",
                    idx === 0 ? "border-b border-[var(--color-border)] pb-2 mb-1 font-semibold" : "text-sm",
                  )}
                >
                  <span className="text-[var(--color-text-muted)] text-xs">{c.header}</span>
                  <span className="text-right">{c.cell(row)}</span>
                </div>
              ))}
              {rowActions && <div className="pt-2 border-t border-[var(--color-border)] mt-2">{rowActions(row)}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded-lg bg-[var(--color-bg-muted)] animate-pulse"
        />
      ))}
    </div>
  );
}
