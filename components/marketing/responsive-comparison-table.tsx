"use client";

import type { ReactNode } from "react";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import { Icon } from "@/components/shared/icon";
import { MarketingTableFrame } from "@/components/marketing/marketing-table-frame";

export type ComparisonColumn = {
  key: string;
  header: ReactNode;
  featured?: boolean;
};

export type ComparisonRow = {
  label: string;
  values: (string | boolean)[];
};

export type ComparisonSection = {
  title?: string;
  rows: ComparisonRow[];
};

export type ResponsiveComparisonTableProps = {
  header?: ReactNode;
  columns: ComparisonColumn[];
  sections: ComparisonSection[];
};

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return (
      <Icon
        className={`size-5 mx-auto ${value ? "text-primary dark:text-primary" : "text-muted-foreground dark:text-muted-foreground"}`}
        icon={value ? Check : X}
      />
    );
  }

  return <span className="text-[11px] break-words hyphens-auto md:text-x-sm">{value}</span>;
}

export function ResponsiveComparisonTable({ header, columns, sections }: ResponsiveComparisonTableProps) {
  const [pinned, setPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const stickyHeaderEdge = pinned ? "border-b border-border/60 shadow-[0_10px_20px_-12px_rgb(0_0_0_/_0.55)]" : "";
  const totalColumns = columns.length + 1;

  return (
    <MarketingTableFrame>
      <div ref={sentinelRef} aria-hidden className="absolute left-0 top-0 size-px" />

      <table className="w-full border-separate border-spacing-0 text-left">
        <thead className="sticky! top-[var(--table-sticky-top,4rem)] z-[27]">
          <tr>
            <th
              className={`min-w-[150px] bg-card px-3 py-5 align-middle text-base font-semibold break-words hyphens-auto md:text-x-xl lg:px-6 ${stickyHeaderEdge}`}
              scope="col"
            >
              {header}
            </th>

            {columns.map((column) => (
              <th
                key={column.key}
                className={`min-w-[130px] bg-card px-1 py-5 text-center align-middle text-xs font-semibold break-words hyphens-auto md:text-x-lg lg:px-4 ${column.featured ? "text-primary dark:text-primary" : ""} ${stickyHeaderEdge}`}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sections.map((section, sectionIndex) => (
            <Fragment key={sectionIndex}>
              {section.title ? (
                <tr>
                  <th
                    className="border-t border-border/50 bg-muted/20 px-2 py-3 text-left text-base font-semibold lg:px-6 dark:bg-muted/40"
                    colSpan={totalColumns}
                    scope="colgroup"
                  >
                    {section.title}
                  </th>
                </tr>
              ) : null}

              {section.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th
                    className="min-w-[150px] border-t border-border/50 px-2 py-3 text-left text-xs font-normal text-subdued break-words hyphens-auto md:text-x-sm lg:px-6"
                    scope="row"
                  >
                    {row.label}
                  </th>

                  {row.values.map((value, valueIndex) => (
                    <td
                      key={valueIndex}
                      className="min-w-[130px] border-t border-border/50 px-1 py-3 text-center align-middle lg:px-4"
                    >
                      <CellValue value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </MarketingTableFrame>
  );
}
